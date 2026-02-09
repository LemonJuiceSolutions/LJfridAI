import pandas as pd
import numpy as np
import plotly.graph_objects as go
from plotly.subplots import make_subplots
from pandas.api.types import is_datetime64_any_dtype

# =========================================================
# CONFIG
# =========================================================
TEMPLATE = "emerald"
TITLE = "<b>CAPACITY (MINDAY) + GANTT PRODUZIONE</b>"

CAP_HEIGHT_PX = 190
PX_PER_TASK   = 32
GAP_PX        = 70
LEFT_MARGIN   = 120

BAR_HEIGHT = 0.80
TEXT_SIZE  = 11

TODAY_COLOR     = "gray"
CONTRACT_COLOR  = "#cc66cc"
TRASLATE_COLOR  = "#ff00ff"

MAX_STACK_ITEMS = 40

# curve HR2 -> minuti
HR2_MULTIPLIER_TO_MIN = 60
HR2_DASH = "4px,2px"

oggi = pd.Timestamp.today().normalize()
x_min = oggi - pd.Timedelta(days=15)
x_max = oggi + pd.DateOffset(months=3)

# =========================================================
# TRANSCODIFICA HR2 -> PRODFIL (LINEA, REPARTO_INTERNO)
# =========================================================
HR2_TO_PRODFIL = {
    "Produzione Linea 1": ("QUID", "Mihaela"),
    "Produzione Linea 2": ("QUID", "Florentina"),
    "Produzione Linea Formazione": ("QUID", "Ons"),
    "Produzione Montorio": ("QUID", "Montorio"),
    "Produzione Padova": ("QUID", "Padova"),
}

# =========================================================
# HELPERS
# =========================================================
def pick_col(df_, candidates):
    for c in candidates:
        if c in df_.columns:
            return c
    return None

def shorten(s, max_len=35):
    s = "" if pd.isna(s) else str(s).strip()
    return s if len(s) <= max_len else s[:max_len-1] + "…"

def luminance_from_hex(hex_color: str) -> float:
    h = str(hex_color).lstrip("#")
    r = int(h[0:2], 16) / 255.0
    g = int(h[2:4], 16) / 255.0
    b = int(h[4:6], 16) / 255.0
    return 0.2126*r + 0.7152*g + 0.0722*b

def build_label(commessa, articolo):
    c = shorten(commessa, 28)
    a = shorten(articolo, 34)
    return f"{c} · {a}" if a else c

def comm_label_cap(row):
    c   = shorten(row["COMMESSA"], 24)
    a   = shorten(row["ARTICOLO"], 24)
    cli = shorten(row["CLIENTE"], 18)
    base  = c if c else a
    extra = " · ".join([x for x in [cli, a] if x])
    return f"{base} ({extra})" if extra else base

def to_dt(series: pd.Series) -> pd.Series:
    """
    Parsing robusto (fix inversione giorno/mese):
    - se datetime -> ok
    - se stringa ISO 'YYYY-MM-DD' o 'YYYY-MM-DD HH:MM:SS' -> parse ISO (NON dayfirst)
    - altrimenti -> parse italiano dayfirst=True
    Ritorna sempre normalizzato (00:00:00).
    """
    if series is None:
        return pd.Series(dtype="datetime64[ns]")

    s = series
    if is_datetime64_any_dtype(s):
        return pd.to_datetime(s, errors="coerce").dt.normalize()

    s_str = s.astype("string").str.strip()

    iso_mask = s_str.str.match(
        r"^\d{4}-\d{2}-\d{2}(\s+\d{2}:\d{2}:\d{2})?$",
        na=False
    )

    out = pd.Series(pd.NaT, index=s_str.index, dtype="datetime64[ns]")

    if iso_mask.any():
        out.loc[iso_mask] = pd.to_datetime(
            s_str.loc[iso_mask],
            format="%Y-%m-%d %H:%M:%S",
            errors="coerce"
        )
        miss = out.loc[iso_mask].isna()
        if miss.any():
            idx = out.loc[iso_mask].index[miss]
            out.loc[idx] = pd.to_datetime(
                s_str.loc[idx],
                format="%Y-%m-%d",
                errors="coerce"
            )

    non_iso = ~iso_mask
    if non_iso.any():
        out.loc[non_iso] = pd.to_datetime(
            s_str.loc[non_iso],
            dayfirst=True,
            errors="coerce"
        )

    return out.dt.normalize()

# =========================================================
# 0) SORGENTI
# =========================================================
df_cap_src = PRODFIL2.copy()   # capacity stacked (MINDAY)
df_gan_src = PRODFIL.copy()    # gantt
df_hr2_src = HR2.copy()        # curve

for _df in (df_cap_src, df_gan_src, df_hr2_src):
    _df.columns = (
        _df.columns.astype(str)
        .str.strip()
        .str.replace(r"\s+", " ", regex=True)
    )

# =========================================================
# 1) HR2 -> curve (blu/violet/verde) aggregate e mappate
# =========================================================
hr2 = df_hr2_src.copy()

if "DATA" not in hr2.columns:
    raise Exception("HR2: manca colonna 'DATA'.")

col_rep_hr2 = pick_col(hr2, ["REPARTO", "Reparto"])
if not col_rep_hr2:
    raise Exception("HR2: manca colonna 'REPARTO'.")

need_cols = ["CAPACITA", "ORE_LAVORATE", "CAPACITA_NETTA", "ORE_LAVORATE_NET", "CAPACITA_NETTA_NET"]
missing = [c for c in need_cols if c not in hr2.columns]
if missing:
    raise Exception(f"HR2: mancano colonne {missing}.")

hr2["GIORNO"] = to_dt(hr2["DATA"])
hr2["HR2_REPARTO"] = hr2[col_rep_hr2].fillna("").astype(str).str.strip()

for c in need_cols:
    hr2[c] = pd.to_numeric(hr2[c], errors="coerce").fillna(0) * HR2_MULTIPLIER_TO_MIN

hr2["HYBRID_WORK"] = np.where(hr2["GIORNO"] >= oggi, hr2["CAPACITA_NETTA"], hr2["ORE_LAVORATE"])
hr2["HYBRID_NET"]  = np.where(hr2["GIORNO"] >= oggi, hr2["CAPACITA_NETTA_NET"], hr2["ORE_LAVORATE_NET"])

hr2_day = (
    hr2.dropna(subset=["GIORNO"])
       .groupby(["HR2_REPARTO","GIORNO"], as_index=False)[["CAPACITA","HYBRID_WORK","HYBRID_NET"]]
       .sum()
)

hr2_day["LINEA"] = hr2_day["HR2_REPARTO"].map(lambda x: HR2_TO_PRODFIL.get(x, (None, None))[0])
hr2_day["REPARTO_INTERNO"] = hr2_day["HR2_REPARTO"].map(lambda x: HR2_TO_PRODFIL.get(x, (None, None))[1])

hr2_day_mapped = hr2_day.dropna(subset=["LINEA","REPARTO_INTERNO"]).copy()
hr2_day_mapped["LINEA"] = hr2_day_mapped["LINEA"].astype(str)
hr2_day_mapped["REPARTO_INTERNO"] = hr2_day_mapped["REPARTO_INTERNO"].astype(str)

hr2_day_mapped = hr2_day_mapped[(hr2_day_mapped["GIORNO"] >= x_min) & (hr2_day_mapped["GIORNO"] <= x_max)].copy()

# =========================================================
# 2) CAPACITY (PRODFIL2 -> df_day) minuti/giorno per linea+reparto (stack)
# =========================================================
cap = df_cap_src.copy()

col_linea_c   = pick_col(cap, ["LineaFornitore", "LINEA", "Linea", "LINEA/FORNITORE"])
col_rep_c     = pick_col(cap, ["Reparto Interno", "REPARTO INTERNO", "REPARTO_INTERNO"])
col_comm_c    = pick_col(cap, ["Commessa", "COMMESSA"])
col_cliente_c = pick_col(cap, ["CLIENTE OLD", "Cliente Corretto", "CLIENTE", "Cliente", "Cliente OLD"])
col_art_c     = pick_col(cap, ["ARTICOLO OLD", "Descr Articolo Corretto", "Articolo", "ARTICOLO"])
col_start_c   = pick_col(cap, ["Inizio Confezionamento", "INIZIO CONFEZIONAMENTO"])
col_end1_c    = pick_col(cap, ["Fine Produzione", "FINE PRODUZIONE", "Consegna Stimata", "CONSEGNA STIMATA"])
col_end2_c    = pick_col(cap, ["Consegna da Contratto", "CONSEGNA DA CONTRATTO"])
col_minday    = pick_col(cap, ["MINDAY", "MinDay", "MIN_DAY", "MinutiGiorno", "MINUTI_GIORNO"])

if not col_minday:
    raise Exception("PRODFIL2: manca la colonna MINDAY (minuti/giorno).")

cap["LINEA"] = cap[col_linea_c] if col_linea_c else "N/D"
cap["REPARTO_INTERNO"] = cap[col_rep_c] if col_rep_c else "N/D"
cap["COMMESSA"] = cap[col_comm_c] if col_comm_c else ""
cap["CLIENTE"]  = cap[col_cliente_c] if col_cliente_c else ""
cap["ARTICOLO"] = cap[col_art_c] if col_art_c else ""

cap["LINEA"] = cap["LINEA"].fillna("N/D").astype(str)
cap["REPARTO_INTERNO"] = cap["REPARTO_INTERNO"].fillna("N/D").astype(str)
cap["COMMESSA"] = cap["COMMESSA"].fillna("").astype(str)
cap["CLIENTE"]  = cap["CLIENTE"].fillna("").astype(str)
cap["ARTICOLO"] = cap["ARTICOLO"].fillna("").astype(str)

cap["START"] = to_dt(cap[col_start_c]) if col_start_c else pd.NaT
end1c = to_dt(cap[col_end1_c]) if col_end1_c else pd.NaT
end2c = to_dt(cap[col_end2_c]) if col_end2_c else pd.NaT
cap["END"] = end1c.where(pd.notna(end1c), end2c)

cap["MINDAY"] = pd.to_numeric(cap[col_minday], errors="coerce").fillna(0)

cap = cap[
    cap["START"].notna() &
    cap["END"].notna() &
    (cap["END"] >= cap["START"]) &
    (cap["MINDAY"] > 0)
].copy()

cap["COMM_LABEL"] = cap.apply(comm_label_cap, axis=1).fillna("").astype(str)

parts = []
for (linea, rep), dgrp in cap.groupby(["LINEA", "REPARTO_INTERNO"], dropna=False):
    for _, r in dgrp.iterrows():
        s = r["START"]
        e = r["END"]
        days = pd.bdate_range(s, e, freq="B")
        if len(days) == 0:
            continue
        days = days[(days >= x_min) & (days <= x_max)]
        if len(days) == 0:
            continue
        parts.append(pd.DataFrame({
            "LINEA": linea,
            "REPARTO_INTERNO": rep,
            "DATE": days,
            "COMM_LABEL": r["COMM_LABEL"],
            "MINDAY": float(r["MINDAY"]),
        }))

df_day = pd.concat(parts, ignore_index=True) if parts else pd.DataFrame(
    columns=["LINEA","REPARTO_INTERNO","DATE","COMM_LABEL","MINDAY"]
)

if not df_day.empty:
    df_day = (
        df_day.groupby(["LINEA","REPARTO_INTERNO","DATE","COMM_LABEL"], as_index=False)["MINDAY"]
        .sum()
    )

# =========================================================
# 3) GANTT (PRODFIL -> gan)  ✅ START/END da colonne, senza inversione giorno/mese
# =========================================================
gan = df_gan_src.copy()

col_linea_g   = pick_col(gan, ["LineaFornitore", "LINEA", "Linea", "LINEA/FORNITORE"])
col_rep_g     = pick_col(gan, ["Reparto Interno", "REPARTO INTERNO", "REPARTO_INTERNO"])
col_comm_g    = pick_col(gan, ["Commessa", "COMMESSA"])
col_cliente_g = pick_col(gan, ["CLIENTE OLD", "Cliente Corretto", "CLIENTE", "Cliente", "Cliente OLD"])
col_art_g     = pick_col(gan, ["ARTICOLO OLD", "Descr Articolo Corretto", "Articolo", "ARTICOLO"])
col_start_g   = pick_col(gan, ["Inizio Confezionamento", "INIZIO CONFEZIONAMENTO"])
col_end1_g    = pick_col(gan, ["Fine Produzione", "FINE PRODUZIONE", "Consegna Stimata", "CONSEGNA STIMATA"])
col_end2_g    = pick_col(gan, ["Consegna da Contratto", "CONSEGNA DA CONTRATTO"])

gan["LINEA"] = gan[col_linea_g] if col_linea_g else "N/D"
gan["REPARTO_INTERNO"] = gan[col_rep_g] if col_rep_g else "N/D"
gan["COMMESSA"] = gan[col_comm_g] if col_comm_g else ""
gan["CLIENTE"]  = gan[col_cliente_g] if col_cliente_g else ""
gan["ARTICOLO"] = gan[col_art_g] if col_art_g else ""

gan["LINEA"] = gan["LINEA"].fillna("N/D").astype(str)
gan["REPARTO_INTERNO"] = gan["REPARTO_INTERNO"].fillna("N/D").astype(str)
gan["COMMESSA"] = gan["COMMESSA"].fillna("").astype(str)
gan["CLIENTE"]  = gan["CLIENTE"].fillna("").astype(str)
gan["ARTICOLO"] = gan["ARTICOLO"].fillna("").astype(str)

gan["START"] = to_dt(gan[col_start_g]) if col_start_g else pd.NaT
end1g = to_dt(gan[col_end1_g]) if col_end1_g else pd.NaT
end2g = to_dt(gan[col_end2_g]) if col_end2_g else pd.NaT
gan["END"] = end1g.where(pd.notna(end1g), end2g)
gan["CONTRATTO"] = end2g

gan = gan[gan["START"].notna() & gan["END"].notna() & (gan["END"] >= gan["START"])].copy()

# ⚠️ Se NON vuoi mai spostare le barre, lascia TRASLATE_PAST = False
TRASLATE_PAST = True
if TRASLATE_PAST:
    durata = gan["END"] - gan["START"]
    mask_past = gan["END"].notna() & (gan["END"] < oggi)
    gan.loc[mask_past, "END"] = oggi
    gan.loc[mask_past, "START"] = oggi - durata.loc[mask_past]
    gan["IS_TRASLATA"] = False
    gan.loc[mask_past, "IS_TRASLATA"] = True
else:
    gan["IS_TRASLATA"] = False

delta_days = (gan["CONTRATTO"] - gan["END"]).dt.days
conditions = [
    gan["IS_TRASLATA"],
    gan["CONTRATTO"].isna() | gan["END"].isna(),
    delta_days >= 5,
    delta_days >= 0
]
choices = [TRASLATE_COLOR, "#d9d9d9", "#b8d9b8", "#ffd8aa"]
gan["COLOR"] = np.select(conditions, choices, default="#f2b6b6")

gan["TEXT_COLOR"] = np.where(
    gan["COLOR"].map(luminance_from_hex) > 0.72,
    "black",
    "white"
)

# =========================================================
# 4) GRUPPI
# =========================================================
groups_set = set()
if not df_day.empty:
    groups_set |= set(df_day[["LINEA","REPARTO_INTERNO"]].itertuples(index=False, name=None))
if not gan.empty:
    groups_set |= set(gan[["LINEA","REPARTO_INTERNO"]].itertuples(index=False, name=None))

groups_list = sorted(
    [(str(a) if a is not None else "N/D", str(b) if b is not None else "N/D") for a,b in groups_set],
    key=lambda x: (x[0], x[1])
)
num_groups = len(groups_list)
if num_groups == 0:
    raise Exception("Nessun gruppo valido da plottare.")

cap_by = {k: v for k, v in df_day.groupby(["LINEA","REPARTO_INTERNO"], dropna=False)} if not df_day.empty else {}
gan_by = {k: v for k, v in gan.groupby(["LINEA","REPARTO_INTERNO"], dropna=False)} if not gan.empty else {}
hr2_by = {k: v for k, v in hr2_day_mapped.groupby(["LINEA","REPARTO_INTERNO"], dropna=False)} if not hr2_day_mapped.empty else {}

# =========================================================
# 5) SUBPLOTS: 2 righe per gruppo
# =========================================================
row_heights_px = []
titles = []

for (linea, rep) in groups_list:
    row_heights_px.append(CAP_HEIGHT_PX)
    titles.append(f"<b>Linea:</b> {linea} &nbsp;&nbsp; | &nbsp;&nbsp; <b>Reparto:</b> {rep}")
    n_tasks = len(gan_by.get((linea, rep), []))
    row_heights_px.append(max(PX_PER_TASK, n_tasks * PX_PER_TASK))
    titles.append("")

final_height = max(750, int(sum(row_heights_px) + GAP_PX * (num_groups - 1)))
vertical_spacing = min(0.12, GAP_PX / final_height) if num_groups > 1 else 0.04
row_heights = (np.array(row_heights_px) / np.sum(row_heights_px)).tolist()

fig = make_subplots(
    rows=2*num_groups, cols=1,
    row_heights=row_heights,
    vertical_spacing=vertical_spacing,
    subplot_titles=titles,
    shared_xaxes=False
)

# =========================================================
# 6) DISEGNO
# =========================================================
for i, (linea, rep) in enumerate(groups_list):
    r_cap = 2*i + 1
    r_gan = 2*i + 2

    # ---------- CAPACITY STACKED
    dcap = cap_by.get((linea, rep), None)
    if dcap is not None and len(dcap) > 0:
        pivot = dcap.pivot_table(
            index="DATE", columns="COMM_LABEL", values="MINDAY",
            aggfunc="sum", fill_value=0
        ).sort_index()

        comm_order = pivot.sum(axis=0).sort_values(ascending=False).index.tolist()
        pivot = pivot[comm_order]

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
                go.Bar(x=x_list, y=y_list, name=str(comm), showlegend=False),
                row=r_cap, col=1
            )

    # ---------- CURVE HR2 (mappate)
    dhr = hr2_by.get((linea, rep), None)
    if dhr is not None and len(dhr) > 0:
        dhr = dhr.sort_values("GIORNO")

        fig.add_trace(
            go.Scatter(
                x=dhr["GIORNO"], y=dhr["CAPACITA"],
                mode="lines",
                line=dict(color="rgb(37, 99, 235)", width=2),
                line_shape="spline",
                showlegend=False
            ),
            row=r_cap, col=1
        )
        fig.add_trace(
            go.Scatter(
                x=dhr["GIORNO"], y=dhr["HYBRID_WORK"],
                mode="lines",
                line=dict(color="violet", width=2, dash=HR2_DASH),
                line_shape="spline",
                showlegend=False
            ),
            row=r_cap, col=1
        )
        fig.add_trace(
            go.Scatter(
                x=dhr["GIORNO"], y=dhr["HYBRID_NET"],
                mode="lines",
                line=dict(color="#10b981", width=2, dash=HR2_DASH),
                line_shape="spline",
                showlegend=False
            ),
            row=r_cap, col=1
        )

    fig.update_xaxes(
        range=[x_min, x_max],
        type="date",
        tickformat="%d-%m-%Y",
        showline=True, linecolor="black", mirror=True,
        row=r_cap, col=1
    )
    fig.update_yaxes(
        title_text="min/giorno",
        showline=True, linecolor="black", mirror=True,
        row=r_cap, col=1
    )
    fig.add_vline(x=oggi, line_width=1, line_color=TODAY_COLOR, row=r_cap, col=1)

    # ---------- GANTT
    dgan = gan_by.get((linea, rep), None)
    if dgan is not None and len(dgan) > 0:
        d = dgan.sort_values("START").reset_index(drop=True).copy()
        n = len(d)
        y_idx = np.arange(n)

        duration_ms = (d["END"] - d["START"]) / np.timedelta64(1, "ms")
        duration_ms = duration_ms.astype("float64")

        fig.add_trace(
            go.Bar(
                base=d["START"],
                x=duration_ms,
                y=y_idx,
                orientation="h",
                marker=dict(color=d["COLOR"], line=dict(width=0)),
                width=BAR_HEIGHT,
                hoverinfo="skip",
                showlegend=False
            ),
            row=r_gan, col=1
        )

        # start label prima della barra
        start_txt = d["START"].dt.strftime("%d-%m-%Y").tolist()
        fig.add_trace(
            go.Scatter(
                x=d["START"],
                y=y_idx,
                mode="text",
                text=start_txt,
                textposition="middle left",
                textfont=dict(size=10, color="black"),
                hoverinfo="skip",
                showlegend=False,
                cliponaxis=False
            ),
            row=r_gan, col=1
        )

        # end label dopo la barra
        end_txt = d["END"].dt.strftime("%d-%m-%Y").tolist()
        fig.add_trace(
            go.Scatter(
                x=d["END"],
                y=y_idx,
                mode="text",
                text=end_txt,
                textposition="middle right",
                textfont=dict(size=10, color="black"),
                hoverinfo="skip",
                showlegend=False,
                cliponaxis=False
            ),
            row=r_gan, col=1
        )

        # contratto: linea verticale
        mask_c = d["CONTRATTO"].notna()
        if mask_c.any():
            c_vals = d.loc[mask_c, "CONTRATTO"].to_numpy(dtype="datetime64[ns]")
            y_c = y_idx[mask_c.to_numpy()]
            N = len(c_vals)

            x_line = np.empty(N*3, dtype="datetime64[ns]")
            y_line = np.empty(N*3, dtype=float)

            x_line[0::3] = c_vals
            x_line[1::3] = c_vals
            x_line[2::3] = np.datetime64("NaT")

            y_line[0::3] = y_c - BAR_HEIGHT/2
            y_line[1::3] = y_c + BAR_HEIGHT/2
            y_line[2::3] = np.nan

            fig.add_trace(
                go.Scatter(
                    x=x_line, y=y_line,
                    mode="lines",
                    line=dict(color=CONTRACT_COLOR, width=2),
                    hoverinfo="skip",
                    showlegend=False
                ),
                row=r_gan, col=1
            )

        # label commessa/articolo al centro barra
        labels = [build_label(c, a) for c, a in zip(d["COMMESSA"].fillna(""), d["ARTICOLO"].fillna(""))]
        mid_x = d["START"] + (d["END"] - d["START"]) / 2

        fig.add_trace(
            go.Scatter(
                x=mid_x,
                y=y_idx,
                mode="text",
                text=labels,
                textposition="middle center",
                textfont=dict(size=TEXT_SIZE, color=d["TEXT_COLOR"]),
                hoverinfo="skip",
                showlegend=False,
                cliponaxis=True
            ),
            row=r_gan, col=1
        )

        ticktext = [shorten(x, 30) for x in d["CLIENTE"].fillna("").astype(str)]
        fig.update_yaxes(
            range=[n - 0.5, -0.5],
            tickmode="array",
            tickvals=y_idx.tolist(),
            ticktext=ticktext,
            tickfont=dict(size=11, color="#3366cc"),
            showline=True, linecolor="black", mirror=True,
            row=r_gan, col=1
        )
    else:
        fig.update_yaxes(
            range=[0.5, -0.5],
            showline=True, linecolor="black", mirror=True,
            row=r_gan, col=1
        )

    fig.update_xaxes(
        range=[x_min, x_max],
        type="date",
        tickformat="%d-%m-%Y",
        showline=True, linecolor="black", mirror=True,
        row=r_gan, col=1
    )
    fig.add_vline(x=oggi, line_width=1, line_color=TODAY_COLOR, row=r_gan, col=1)

# =========================================================
# 7) LAYOUT FINALE
# =========================================================
fig.update_layout(
    template=TEMPLATE,
    height=final_height,
    title=dict(text=TITLE, x=0.5, y=0.99, xanchor="center", yanchor="top", font=dict(size=22)),
    margin=dict(l=LEFT_MARGIN, r=40, t=220, b=50),
    barmode="stack",
    bargap=0.18,
    hovermode="x unified",
    showlegend=False,
    legend=dict(visible=False),
    uirevision="const"
)

fig.update_annotations(font=dict(size=16, color="black"))
fig