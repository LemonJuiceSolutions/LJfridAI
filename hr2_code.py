import pandas as pd
import numpy as np
import plotly.graph_objects as go
from plotly.subplots import make_subplots

# =========================================================
# CONFIG (subplot come il tuo Gantt, ma stacked minuti/giorno)
# =========================================================
TEMPLATE = "emerald"
TITLE = "<b>CARICO GIORNALIERO (MINDAY) - Linea / Reparto</b>"

PX_PER_GROUP = 240        # altezza per subplot (LINEA+REPARTO)
GAP_PX = 70
LEFT_MARGIN = 320

TODAY_COLOR = "gray"
TEXT_SIZE = 11

MAX_STACK_ITEMS = 40      # se troppe commesse nel gruppo -> raggruppa in "ALTRO (somma)"

# =========================================================
# 0) DATI - sorgente
# =========================================================
df = PRODFIL2.copy()
df_g = df.copy()

# normalizza nomi colonne
df_g.columns = (
    df_g.columns.astype(str)
    .str.strip()
    .str.replace(r"\s+", " ", regex=True)
)

def pick_col(df_, candidates):
    for c in candidates:
        if c in df_.columns:
            return c
    return None

# =========================================================
# 1) MAPPING COLONNE
# =========================================================
col_linea   = pick_col(df_g, ["LineaFornitore", "LINEA", "Linea", "LINEA/FORNITORE"])
col_rep     = pick_col(df_g, ["Reparto Interno", "REPARTO INTERNO", "REPARTO_INTERNO"])
col_comm    = pick_col(df_g, ["Commessa", "COMMESSA"])
col_cliente = pick_col(df_g, ["CLIENTE OLD", "Cliente Corretto", "CLIENTE", "Cliente", "Cliente OLD"])
col_art     = pick_col(df_g, ["ARTICOLO OLD", "Descr Articolo Corretto", "Articolo", "ARTICOLO"])

col_start   = pick_col(df_g, ["Inizio Confezionamento", "INIZIO CONFEZIONAMENTO"])
col_end1    = pick_col(df_g, ["Fine Produzione", "FINE PRODUZIONE", "Consegna Stimata", "CONSEGNA STIMATA"])
col_end2    = pick_col(df_g, ["Consegna da Contratto", "CONSEGNA DA CONTRATTO"])

col_minday  = pick_col(df_g, ["MINDAY", "MinDay", "MIN_DAY", "MinutiGiorno", "MINUTI_GIORNO"])

if not col_minday:
    raise Exception("Manca la colonna MINDAY (minuti/giorno lavorativo).")

df_g["LINEA"] = df_g[col_linea] if col_linea else "N/D"
df_g["REPARTO_INTERNO"] = df_g[col_rep] if col_rep else "N/D"
df_g["COMMESSA"] = df_g[col_comm] if col_comm else ""
df_g["CLIENTE"] = df_g[col_cliente] if col_cliente else ""
df_g["ARTICOLO"] = df_g[col_art] if col_art else ""

df_g["START"] = pd.to_datetime(df_g[col_start], dayfirst=True, errors="coerce") if col_start else pd.NaT
end1 = pd.to_datetime(df_g[col_end1], dayfirst=True, errors="coerce") if col_end1 else pd.NaT
end2 = pd.to_datetime(df_g[col_end2], dayfirst=True, errors="coerce") if col_end2 else pd.NaT
df_g["END"] = end1.where(pd.notna(end1), end2)

df_g["MINDAY"] = pd.to_numeric(df_g[col_minday], errors="coerce").fillna(0)

# =========================================================
# 2) FILTRI VALIDITÀ
# =========================================================
df_g[["LINEA", "REPARTO_INTERNO"]] = df_g[["LINEA", "REPARTO_INTERNO"]].fillna("N/D").astype(str)
df_g["COMMESSA"] = df_g["COMMESSA"].fillna("").astype(str)
df_g["CLIENTE"] = df_g["CLIENTE"].fillna("").astype(str)
df_g["ARTICOLO"] = df_g["ARTICOLO"].fillna("").astype(str)

df_g = df_g[
    df_g["START"].notna() &
    df_g["END"].notna() &
    (df_g["END"] >= df_g["START"]) &
    (df_g["MINDAY"] > 0)
].copy()

df_g = df_g[~(
    (df_g["CLIENTE"].str.strip() == "") &
    (df_g["COMMESSA"].str.strip() == "") &
    (df_g["ARTICOLO"].str.strip() == "")
)].copy()

if df_g.empty:
    raise Exception("Nessuna riga valida (START/END/MINDAY).")

oggi = pd.Timestamp.today().normalize()

def shorten(s, max_len=35):
    s = "" if pd.isna(s) else str(s).strip()
    return s if len(s) <= max_len else s[:max_len-1] + "…"

def comm_label(row):
    c = shorten(row["COMMESSA"], 24)
    a = shorten(row["ARTICOLO"], 24)
    cli = shorten(row["CLIENTE"], 18)
    base = c if c else a
    extra = " · ".join([x for x in [cli, a] if x])
    return f"{base} ({extra})" if extra else base

df_g["COMM_LABEL"] = df_g.apply(comm_label, axis=1)

# =========================================================
# 3) ESPANSIONE su giorni lavorativi (lun-ven) + aggregazione
#    Ogni commessa contribuisce MINDAY per ogni giorno lavorativo in START..END
# =========================================================
parts = []
for (linea, rep), dgrp in df_g.groupby(["LINEA", "REPARTO_INTERNO"], dropna=False):
    for _, r in dgrp.iterrows():
        s = r["START"].normalize()
        e = r["END"].normalize()

        # giorni lavorativi lun-ven
        days = pd.bdate_range(s, e, freq="B")
        if len(days) == 0:
            continue

        parts.append(pd.DataFrame({
            "LINEA": linea,
            "REPARTO_INTERNO": rep,
            "DATE": days,
            "COMM_LABEL": r["COMM_LABEL"],
            "MINDAY": float(r["MINDAY"]),
        }))

if not parts:
    raise Exception("Dopo l'espansione non ci sono giorni lavorativi da plottare.")

df_day = pd.concat(parts, ignore_index=True)

# somma eventuali duplicati
df_day = (
    df_day.groupby(["LINEA", "REPARTO_INTERNO", "DATE", "COMM_LABEL"], as_index=False)["MINDAY"]
    .sum()
)

# =========================================================
# 4) GRUPPI + ALTEZZE (come Gantt: subplot per LINEA+REPARTO)
# =========================================================
groups = list(df_day.groupby(["LINEA", "REPARTO_INTERNO"], dropna=False))
num_groups = len(groups)

rows_data = []
row_heights_px = []

for (linea, reparto), d in groups:
    row_heights_px.append(PX_PER_GROUP)
    rows_data.append(((linea, reparto), d.sort_values("DATE").copy()))

final_height = max(650, int(sum(row_heights_px) + GAP_PX * (num_groups - 1)))
vertical_spacing = min(0.12, GAP_PX / final_height) if num_groups > 1 else 0.03

titles = [
    f"<b>Linea:</b> {linea} &nbsp;&nbsp; | &nbsp;&nbsp; <b>Reparto:</b> {rep}"
    for (linea, rep), _ in rows_data
]

row_heights = (np.array(row_heights_px) / np.sum(row_heights_px)).tolist()

fig = make_subplots(
    rows=num_groups, cols=1,
    row_heights=row_heights,
    vertical_spacing=vertical_spacing,
    subplot_titles=titles
)

# range X globale
x_min = df_day["DATE"].min() - pd.Timedelta(days=3)
x_max = df_day["DATE"].max() + pd.Timedelta(days=3)

# =========================================================
# 5) DISEGNO: stacked bar per giorno (NO ndarray -> SOLO liste)
# =========================================================
for r_idx, ((linea, reparto), d) in enumerate(rows_data, start=1):
    pivot = d.pivot_table(
        index="DATE", columns="COMM_LABEL", values="MINDAY",
        aggfunc="sum", fill_value=0
    ).sort_index()

    # ordina commesse per totale
    comm_order = pivot.sum(axis=0).sort_values(ascending=False).index.tolist()
    pivot = pivot[comm_order]

    # raggruppa "ALTRO" se troppe commesse
    if len(comm_order) > MAX_STACK_ITEMS:
        keep = comm_order[:MAX_STACK_ITEMS]
        other = comm_order[MAX_STACK_ITEMS:]
        pivot_other = pivot[other].sum(axis=1)
        pivot = pivot[keep].copy()
        pivot["ALTRO (somma)"] = pivot_other

    x_list = pivot.index.to_list()

    for comm in pivot.columns:
        y_list = pivot[comm].to_list()
        if all(v == 0 for v in y_list):
            continue

        fig.add_trace(
            go.Bar(
                x=x_list,
                y=y_list,
                name=str(comm),
                customdata=[str(comm)] * len(x_list),
                hovertemplate=(
                    f"<b>Linea:</b> {linea}"
                    f"<br><b>Reparto:</b> {reparto}"
                    "<br><b>Commessa:</b> %{customdata}"
                    "<br><b>Data:</b> %{x|%d-%m-%Y}"
                    "<br><b>Minuti:</b> %{y:.0f}<extra></extra>"
                ),
                showlegend=(r_idx == 1)
            ),
            row=r_idx, col=1
        )

    fig.update_xaxes(
        range=[x_min, x_max],
        type="date",
        tickformat="%d-%m-%Y",
        showline=True, linecolor="black", mirror=True,
        row=r_idx, col=1
    )
    fig.update_yaxes(
        title_text="min/giorno",
        showline=True, linecolor="black", mirror=True,
        row=r_idx, col=1
    )

    # linea oggi
    fig.add_vline(x=oggi, line_width=1, line_color=TODAY_COLOR, row=r_idx, col=1)

# =========================================================
# 6) LAYOUT FINALE
# =========================================================
fig.update_layout(
    template=TEMPLATE,
    height=final_height,
    title=dict(
        text=TITLE,
        x=0.5, y=0.99,
        xanchor="center", yanchor="top",
        font=dict(size=22)
    ),
    margin=dict(l=LEFT_MARGIN, r=40, t=110, b=50),
    barmode="stack",
    bargap=0.18,
    hovermode="x unified",
    legend=dict(
        orientation="h",
        yanchor="bottom",
        y=1.02,
        xanchor="left",
        x=0.0,
        font=dict(size=11)
    ),
    uirevision="const"
)

fig.update_annotations(font=dict(size=16, color="black"))
fig