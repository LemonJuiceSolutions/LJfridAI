
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import matplotlib.dates as mdates

# =========================================================
# 1. SETUP & DATA RETRIEVAL
# =========================================================

# Check if SharePointSQL exists in the environment (it's passed by the app backend)
if 'SharePointSQL' not in globals():
    # Fallback: check other potential names or use empty
    print("⚠️ 'SharePointSQL' non trovato. Controllo se 'data' o 'df' sono disponibili...")
    if 'data' in globals() and isinstance(data, pd.DataFrame):
        df = data.copy()
        print("Usato 'data' come sorgente.")
    elif 'df' in globals() and isinstance(df, pd.DataFrame):
        df = df.copy()
        print("Usato 'df' come sorgente.")
    else:
        print("❌ Nessun DataFrame trovato. Uso DataFrame vuoto.")
        df = pd.DataFrame() 
else:
    df = SharePointSQL.copy()

print(f"Dataset in uso: {type(df)}")
if hasattr(df, 'shape'):
    print(f"Dimensioni INIZIALI: {df.shape}")
    print(f"Colonne Disponibili INIZIALI: {list(df.columns)}")
    print("Prime 3 righe (Raw):")
    print(df.head(3))

if df.empty:
    print("⚠️ Il dataset è vuoto. Il grafico sarà vuoto.")
    fig, ax = plt.subplots(figsize=(10, 2))
    ax.text(0.5, 0.5, "Nessun Dato Disponibile (DF Vuoto)", ha='center', va='center')
    plt.tight_layout()
else:
    # =========================================================
    # 2. COLUMN MAPPING 
    # =========================================================
    
    def find_col(df, candidates):
        # Case-insensitive, space-insensitive matching
        # Also handles "Table.Column" header format just in case
        cols_norm = {c.lower().replace(' ', '').replace('_', '').replace('/', '').split('.')[-1]: c for c in df.columns}
        for cand in candidates:
            cand_norm = cand.lower().replace(' ', '').replace('_', '').replace('/', '')
            if cand_norm in cols_norm:
                return cols_norm[cand_norm]
        return None

    # Priority mapping
    col_reparto = find_col(df, ["Reparto Interno", "Reparto", "Area"])
    col_linea   = find_col(df, ["Linea/Fornitore", "Linea", "Fornitore", "Macchina"])
    col_comm    = find_col(df, ["Commessa", "Job", "Commessa HR"])
    
    # Start Date priorities
    col_start   = find_col(df, ["Inizio Confezionamento", "Inizio CQ-Stiro-Pack", "Inizio", "Start", "DataInizio"])
    
    # End Date priorities
    col_end     = find_col(df, ["Consegna Stimata", "Consegna da Contratto", "Fine", "End", "Consegna", "DataFine"])

    print("\n--- MAPPATURA COLONNE ---")
    print(f"Reparto: '{col_reparto}'")
    print(f"Linea:   '{col_linea}'")
    print(f"Comm.:   '{col_comm}'")
    print(f"Inizio:  '{col_start}'")
    print(f"Fine:    '{col_end}'")

    if not col_start:
        print("❌ ERRORE: Nessuna colonna 'Inizio' valida trovata. Impossibile generare Gantt.")
        # Fallback chart
        fig, ax = plt.subplots(figsize=(10, 4))
        ax.text(0.5, 0.5, f"Colonna Data Inizio Mancante.\nColonne trovate: {', '.join(df.columns)}", ha='center', va='center', wrap=True)
    else:
        # =========================================================
        # 3. DATA PREPARATION & DEBUGGING DATES
        # =========================================================
        
        # Fill NAs for grouping
        df['__Reparto'] = df[col_reparto].astype(str).fillna('Generale') if col_reparto else 'Generale'
        df['__Linea']   = df[col_linea].astype(str).fillna('N/D') if col_linea else 'N/D'
        df['__Comm']    = df[col_comm].astype(str).fillna('') if col_comm else ''
        
        # Label
        df['__RowLabel'] = df['__Linea'] + " " + df['__Comm']
        
        print("\n--- DEBUG DATE PARSING ---")
        print(f"Campione raw '{col_start}': {df[col_start].head(3).tolist()}")
        
        # Date Conversion - Try multiple strategies for mixed formats
        # 1. Standard Parser
        df['__Start'] = pd.to_datetime(df[col_start], errors='coerce', dayfirst=True)
        
        # 2. Check failed conversions
        failed_starts = df[df[col_start].notna() & df['__Start'].isna()]
        if len(failed_starts) > 0:
            print(f"⚠️ {len(failed_starts)} date di inizio non parseggiate correttamente via Pandas standard.")
            print(f"Esempi falliti: {failed_starts[col_start].head(3).tolist()}")
            
            # Additional strategy: Excel Serial Code (if string looks like integer)
            # Or handle Italian textual months? 
            # For now, coerce is best effort.
            
        
        if col_end:
            df['__End'] = pd.to_datetime(df[col_end], errors='coerce', dayfirst=True)
            # Fallback for missing end: Start + 7 days
            mask_missing_end = df['__End'].isna() & df['__Start'].notna()
            df.loc[mask_missing_end, '__End'] = df.loc[mask_missing_end, '__Start'] + pd.Timedelta(days=7)
        else:
             df['__End'] = df['__Start'] + pd.Timedelta(days=7)

        print(f"Date Inizio valide: {df['__Start'].notna().sum()}/{len(df)}")

        # Filter Valid
        df_clean = df.dropna(subset=['__Start', '__End']).copy()
        
        # Check invalid durations
        invalid_dur = df_clean[df_clean['__End'] < df_clean['__Start']]
        if len(invalid_dur) > 0:
             print(f"⚠️ {len(invalid_dur)} righe con Fine < Inizio rimosse.")
             df_clean = df_clean[df_clean['__End'] >= df_clean['__Start']]
        
        # Filter logic: Restrict to last 12 months? Or all valid dates?
        # Let's keep all for now to ensure we see SOMETHING.

        if len(df_clean) == 0:
            print("❌ Nessuna riga valida dopo il filtraggio date.")
            fig, ax = plt.subplots(figsize=(10, 4))
            ax.text(0.5, 0.5, "Nessun Dato Valido (Date non valide o Tutte nulle)", ha='center')
            
            # Expose raw df as result for inspection
            result = df
        else:
            print(f"✅ Righe valide per il grafico: {len(df_clean)}")
            
            # Sort
            df_clean = df_clean.sort_values(by=['__Reparto', '__Linea', '__Start'])
            
            # =========================================================
            # 4. PLOTTING
            # =========================================================
            
            reparti = df_clean['__Reparto'].unique()
            if len(reparti) > 20:
                print(f"⚠️ Troppi reparti ({len(reparti)}). Mostro solo i primi 10.")
                reparti = reparti[:10]
            
            fig_height = max(5, len(reparti) * 4)
            fig, axes = plt.subplots(nrows=len(reparti), ncols=1, figsize=(16, fig_height), sharex=True)
            if len(reparti) == 1: axes = [axes]
            
            colors = plt.rcParams['axes.prop_cycle'].by_key()['color']
            
            for i, rep in enumerate(reparti):
                ax = axes[i]
                sub_df = df_clean[df_clean['__Reparto'] == rep].copy()
                
                # Y-Axis Mapping
                row_labels = sub_df['__RowLabel'].unique()
                if len(row_labels) > 50:
                    sub_df = sub_df.iloc[:50]
                    row_labels = sub_df['__RowLabel'].unique()
                
                label_map = {lbl: idx for idx, lbl in enumerate(row_labels)}
                
                for _, row in sub_df.iterrows():
                    if row['__RowLabel'] not in label_map: continue
                    
                    start_num = mdates.date2num(row['__Start'])
                    end_num = mdates.date2num(row['__End'])
                    width = end_num - start_num
                    y = label_map[row['__RowLabel']]
                    
                    c_idx = abs(hash(str(row['__Linea']))) % len(colors)
                    
                    ax.barh(y, width, left=start_num, height=0.6, 
                            color=colors[c_idx], edgecolor='black', linewidth=0.5, alpha=0.8)
                    
                    if width > 5:
                        ax.text(start_num + width/2, y, str(row['__Comm']), 
                                ha='center', va='center', fontsize=7, color='white', fontweight='bold')

                ax.set_yticks(range(len(row_labels)))
                ax.set_yticklabels(row_labels, fontsize=8)
                ax.set_title(f"Reparto: {rep} ({len(sub_df)} items)", fontsize=11, fontweight='bold')
                ax.grid(True, axis='x', linestyle=':', alpha=0.6)
                
                ax.xaxis.set_major_locator(mdates.AutoDateLocator())
                ax.xaxis.set_major_formatter(mdates.DateFormatter('%d-%b'))

            plt.xticks(rotation=30, ha='right')
            plt.tight_layout()
            
            # EXPOSE DATA FOR TABLE VIEW
            result = df_clean[['__Reparto', '__Linea', '__Comm', '__Start', '__End', '__RowLabel']]
            print("✅ Grafico Generato e Dati esportati in variable 'result'.")

# Ensure the last line evaluates to the DataFrame for the "Table" view
result
