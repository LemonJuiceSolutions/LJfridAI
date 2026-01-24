"""
Script di debug per testare la catena di nodi:
EstrazioneSharePoint -> SharePointSQL -> Gantt

Questo script simula l'esecuzione sequenziale per identificare dove si perdono i dati.
"""

import pandas as pd
import sys
import os

print("=" * 60)
print("DEBUG: Catena Nodi SharePoint -> Gantt")
print("=" * 60)

# -----------------------------
# STEP 1: EstrazioneSharePoint
# -----------------------------
print("\n[STEP 1] Simulazione EstrazioneSharePoint")
print("-" * 60)

try:
    # Simula l'estrazione usando il file di preview
    file_path = '/Users/manuelezanoni/Desktop/VisualStudio/LikeAiSaid/preview_data-2.xlsx'
    print(f"Caricamento dati da: {file_path}")
    
    df_estrazione = pd.read_excel(file_path)
    print(f"✅ Dati caricati: {df_estrazione.shape[0]} righe, {df_estrazione.shape[1]} colonne")
    print(f"Colonne: {list(df_estrazione.columns[:10])}...")  # Prime 10 colonne
    
    # Converti tutto a stringa come fa lo script vero
    print("\nConversione a stringhe (come sharepoint_robust_extraction.py)...")
    for col in df_estrazione.columns:
        df_estrazione[col] = df_estrazione[col].astype(str)
    
    print(f"✅ Conversione completata")
    print(f"Esempio prima riga:")
    print(df_estrazione.head(1).to_dict('records')[0])
    
except Exception as e:
    print(f"❌ ERRORE in Step 1: {e}")
    sys.exit(1)

# -----------------------------
# STEP 2: SharePointSQL
# -----------------------------
print("\n[STEP 2] Simulazione SharePointSQL")
print("-" * 60)

try:
    # In questo step, normalmente eseguiresti una query SQL
    # Per semplicità, assumiamo che la query sia "SELECT * FROM EstrazioneSharePoint"
    # che restituirebbe tutti i dati
    
    # Simula la creazione della temp table e query
    print("Query simulata: SELECT * FROM EstrazioneSharePoint")
    df_sql = df_estrazione.copy()
    
    print(f"✅ Query eseguita: {df_sql.shape[0]} righe restituite")
    print(f"Colonne risultato: {list(df_sql.columns[:10])}...")
    
    # Verifica che ci siano le colonne necessarie per Gantt
    required_cols = ['Reparto Interno', 'Linea/Fornitore', 'Commessa', 
                     'Inizio Confezionamento', 'Consegna Stimata']
    missing_cols = [c for c in required_cols if c not in df_sql.columns]
    
    if missing_cols:
        print(f"⚠️ ATTENZIONE: Colonne mancanti per Gantt: {missing_cols}")
    else:
        print(f"✅ Tutte le colonne richieste per Gantt sono presenti")
    
except Exception as e:
    print(f"❌ ERRORE in Step 2: {e}")
    sys.exit(1)

# -----------------------------
# STEP 3: Gantt (Python)
# -----------------------------
print("\n[STEP 3] Simulazione Nodo Gantt")
print("-" * 60)

try:
    # Simula il nodo Python che riceve SharePointSQL
    print("Preparazione ambiente per script Gantt...")
    
    # Inietta nella globals come farebbe il backend
    globals()['SharePointSQL'] = df_sql
    
    print(f"✅ SharePointSQL iniettato: {df_sql.shape}")
    
    # Esegui lo script Gantt
    print("\nEsecuzione script Gantt...")
    gantt_script_path = '/Users/manuelezanoni/Desktop/VisualStudio/LikeAiSaid/scripts/generate_gantt.py'
    
    with open(gantt_script_path, 'r') as f:
        gantt_code = f.read()
    
    # Esegui il codice
    exec(gantt_code)
    
    # Verifica che 'result' sia stato creato
    if 'result' in globals():
        result_df = globals()['result']
        print(f"\n✅ Script Gantt completato")
        print(f"✅ Variabile 'result' creata: {result_df.shape}")
        print(f"\nPrime 5 righe del result:")
        print(result_df.head())
    else:
        print(f"\n❌ ERRORE: Lo script non ha creato la variabile 'result'")
    
except Exception as e:
    print(f"❌ ERRORE in Step 3: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

print("\n" + "=" * 60)
print("DEBUG COMPLETATO")
print("=" * 60)
