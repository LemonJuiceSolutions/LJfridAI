import pandas as pd
import numpy as np
import plotly.graph_objects as go
from plotly.subplots import make_subplots
from pandas.api.types import is_datetime64_any_dtype

# =========================================================
# CONFIG
# =========================================================
TEMPLATE = "emerald"
TITLE = "<b>SOMME MENSILI (minuti) · HR2 (blu/viola/verde) + CARICO COMMESSE (arancione)</b>"

LEFT_MARGIN = 120
CHART_HEIGHT_PX = 260
TABLE_HEIGHT_PX = 175
GAP_PX = 45

HR2_MULTIPLIER_TO_MIN = 60

oggi = pd.Timestamp.today().normalize()
x_min = oggi - pd.Timedelta(days=15)
x_max = oggi + pd.DateOffset(months=3)

# colori fissi (uguali per tutti i reparti)
COL_BLUE   = "rgb(37, 99, 235)"   # capacità
COL_VIOLET = "violet"            # hybrid work
COL_GREEN  = "#10b981"           # hybrid net
COL_ORANGE = "#f59e0b"           # carico commesse
COL_ALERT  = "#ef4444"           # alert

# "smussatura" stile React (se supportata dalla tua versione Plotly)
BAR_CORNER_RADIUS = 8

# distanza tra le barre
BARGAP = 0.40       # tra mesi
BARGROUPGAP = 0.22  # tra barre nello stesso mese

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

def to_dt(series: pd.Series) -> pd.Series:
    if series is None:
        return pd.Series(dtype="datetime64[ns]")
    s = series
    if is_datetime64_any_dtype(s):
        return pd.to_datetime(s, errors="coerce").dt.normalize()

    s_str = s.astype("string").str.strip()
    iso_mask = s_str.str.match(r"^\d{4}-\d{2}-\d{2}(\s+\d{2}:\d{2}:\d{2})?$", na=False)

    out = pd.Series(pd.NaT, index=s_str.index, dtype="datetime64[ns]")

    if iso_mask.any():
        out.loc[iso_mask] = pd.to_datetime(s_str.loc[iso_mask], format="%Y-%m-%d %H:%M:%S", errors="coerce")
        miss = out.loc[iso_mask].isna()
        if miss.any():
            idx = out.loc[iso_mask].index[miss]
            out.loc[idx] = pd.to_datetime(s_str.loc[idx], format="%Y-%m-%d", errors="coerce")

    non_iso = ~iso_mask
    if non_iso.any():
        out.loc[non_iso] = pd.to_datetime(s_str.loc[non_iso], dayfirst=True, errors="coerce")

    return out.dt.normalize()

def fmt_int(x):
    try:
        return f"{int(round(float(x))):,}".replace(",", ".")
    except Exception:
        return "0"

def hex_to_rgb01(h):
    h = str(h).lstrip("#")
    return (int(h[0:2], 16)/255.0, int(h[2:4], 16)/255.0, int(h[4:6], 16)/255.0)

def rgb01_to_hex(rgb):
    r,g,b = rgb
    return "#{:02x}{:02x}{:02x}".format(int(round(r*255)), int(round(g*255)), int(round(b*255)))

def blend_with_white(hex_color, t):
    # t=0 -> base, t=1 -> bianco
    r,g,b = hex_to_rgb01(hex_color)
    r2 = r*(1-t) + 1.0*t
    g2 = g*(1-t) + 1.0*t
    b2 = b*(1-t) + 1.0*t
    return rgb01_to_hex((r2,g2,b2))

def luminance(hex_color):
    r,g,b = hex_to_rgb01(hex_color)
    return 0.2126*r + 0.7152*g + 0.0722*b

# =========================================================
# 0) SORGENTI
# =========================================================
df_cap_src = PRODFIL2.copy()   # carico commesse (MINDAY)
df_hr2_src = HR2.copy()        # curve

for _df in (df_cap_src, df_hr2_src):
    _df.columns = (
        _df.columns.astype(str)
        .str.strip()
        .str.replace(r"\s+", " ", regex=True)
    )

# =========================================================
# 1) HR2 -> minuti/giorno e mapping linea+reparto
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

hr2_day = hr2_day.dropna(subset=["LINEA","REPARTO_INTERNO"]).copy()
hr2_day["LINEA"] = hr2_day["LINEA"].astype(str)
hr2_day["REPARTO_INTERNO"] = hr2_day["REPARTO_INTERNO"].astype(str)
hr2_day = hr2_day[(hr2_day["GIORNO"] >= x_min) & (hr2_day["GIORNO"] <= x_max)].copy()

# =========================================================
# 2) CARICO COMMESSE (MINDAY) -> espansione giornaliera -> somma mensile
# =========================================================
cap = df_cap_src.copy()

col_linea_c   = pick_col(cap, ["LineaFornitore", "LINEA", "Linea", "LINEA/FORNITORE"])
col_rep_c     = pick_col(cap, ["Reparto Interno", "REPARTO INTERNO", "REPARTO_INTERNO"])
col_start_c   = pick_col(cap, ["Inizio Confezionamento", "INIZIO CONFEZIONAMENTO"])
col_end1_c    = pick_col(cap, ["Fine Produzione", "FINE PRODUZIONE", "Consegna Stimata", "CONSEGNA STIMATA"])
col_end2_c    = pick_col(cap, ["Consegna da Contratto", "CONSEGNA DA CONTRATTO"])
col_minday    = pick_col(cap, ["MINDAY", "MinDay", "MIN_DAY", "MinutiGiorno", "MINUTI_GIORNO"])

if not col_minday:
    raise Exception("PRODFIL2: manca la colonna MINDAY (minuti/giorno).")

cap["LINEA"] = cap[col_linea_c] if col_linea_c else "N/D"
cap["REPARTO_INTERNO"] = cap[col_rep_c] if col_rep_c else "N/D"
cap["LINEA"] = cap["LINEA"].fillna("N/D").astype(str)
cap["REPARTO_INTERNO"] = cap["REPARTO_INTERNO"].fillna("N/D").astype(str)

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

parts = []
for (linea, rep), dgrp in cap.groupby(["LINEA", "REPARTO_INTERNO"], dropna=False):
    for _, r in dgrp.iterrows():
        s, e = r["START"], r["END"]
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
            "LOAD_MIN": float(r["MINDAY"]),
        }))

df_load_day = pd.concat(parts, ignore_index=True) if parts else pd.DataFrame(
    columns=["LINEA","REPARTO_INTERNO","DATE","LOAD_MIN"]
)

if not df_load_day.empty:
    df_load_day = (
        df_load_day.groupby(["LINEA","REPARTO_INTERNO","DATE"], as_index=False)["LOAD_MIN"].sum()
    )

# =========================================================
# 3) AGGREGAZIONE MENSILE + GRID COMPLETO
# =========================================================
months = pd.date_range(x_min.normalize().replace(day=1), x_max.normalize().replace(day=1), freq="MS")

hr2_day["MONTH"] = hr2_day["GIORNO"].values.astype("datetime64[M]")
hr2_m = (
    hr2_day.groupby(["LINEA","REPARTO_INTERNO","MONTH"], as_index=False)[["CAPACITA","HYBRID_WORK","HYBRID_NET"]]
           .sum()
           .rename(columns={"CAPACITA":"BLUE_MIN", "HYBRID_WORK":"VIOLET_MIN", "HYBRID_NET":"GREEN_MIN"})
)

if not df_load_day.empty:
    df_load_day["MONTH"] = df_load_day["DATE"].values.astype("datetime64[M]")
    load_m = (
        df_load_day.groupby(["LINEA","REPARTO_INTERNO","MONTH"], as_index=False)[["LOAD_MIN"]]
                  .sum()
    )
else:
    load_m = pd.DataFrame(columns=["LINEA","REPARTO_INTERNO","MONTH","LOAD_MIN"])

df_m = hr2_m.merge(load_m, on=["LINEA","REPARTO_INTERNO","MONTH"], how="outer")
df_m[["BLUE_MIN","VIOLET_MIN","GREEN_MIN","LOAD_MIN"]] = df_m[["BLUE_MIN","VIOLET_MIN","GREEN_MIN","LOAD_MIN"]].fillna(0)

groups_set = set(df_m[["LINEA","REPARTO_INTERNO"]].itertuples(index=False, name=None))
groups_list = sorted([(str(a), str(b)) for a,b in groups_set], key=lambda x: (x[0], x[1]))
if len(groups_list) == 0:
    raise Exception("Nessun gruppo valido da plottare (HR2/LOAD).")

full_rows = []
for linea, rep in groups_list:
    tmp = pd.DataFrame({"MONTH": months})
    tmp["LINEA"] = linea
    tmp["REPARTO_INTERNO"] = rep
    full_rows.append(tmp)
full_grid = pd.concat(full_rows, ignore_index=True)

df_m = full_grid.merge(df_m, on=["LINEA","REPARTO_INTERNO","MONTH"], how="left").fillna(0)

# =========================================================
# 3B) OVERRIDE: LINEA FLERO -> GREEN_MIN = 58.000 min/mese, agosto metà
# =========================================================
MASK_FLERO = df_m["LINEA"].astype(str).str.upper() == "FLERO"
if MASK_FLERO.any():
    df_m.loc[MASK_FLERO, "GREEN_MIN"] = 58_000
    is_aug = df_m["MONTH"].dt.month == 8
    df_m.loc[MASK_FLERO & is_aug, "GREEN_MIN"] = 29_000

# =========================================================
# 0bis) PRIMO GRAFICO: TUTTE LE LINEE "QUID*" (aggregate)
#      Somma per MONTH su tutte le linee che iniziano per "QUID"
# =========================================================
df_all_quid = df_m[df_m["LINEA"].astype(str).str.upper().str.startswith("QUID")].copy()

if df_all_quid.empty:
    print("Nessun dato per linee che iniziano per 'QUID'.")
else:
    agg_quid = (
        df_all_quid.groupby("MONTH", as_index=False)[["BLUE_MIN","VIOLET_MIN","GREEN_MIN","LOAD_MIN"]]
                   .sum()
                   .sort_values("MONTH")
    )

    x = agg_quid["MONTH"]

    fig_all_quid = go.Figure()

    def add_bar(fig_, y, name, color):
        fig_.add_trace(
            go.Bar(
                x=x,
                y=y,
                name=name,
                marker_color=color,
                text=[fmt_int(v) for v in y],
                textposition="inside",
                textangle=90,
                textfont=dict(color="white", size=12),
                insidetextanchor="middle",
                cliponaxis=True,
                hovertemplate="%{x|%m-%Y}<br>%{y:.0f} min<extra></extra>",
            )
        )

    add_bar(fig_all_quid, agg_quid["BLUE_MIN"],   "Capacità HR2 (Blu)", COL_BLUE)
    add_bar(fig_all_quid, agg_quid["VIOLET_MIN"], "Hybrid Work (Viola)", COL_VIOLET)
    add_bar(fig_all_quid, agg_quid["GREEN_MIN"],  "Hybrid Net (Verde)", COL_GREEN)
    add_bar(fig_all_quid, agg_quid["LOAD_MIN"],   "Carico commesse (Arancione)", COL_ORANGE)

    # alert: solo se GREEN > 0 e LOAD > GREEN
    alert_mask = (agg_quid["GREEN_MIN"] > 0) & (agg_quid["LOAD_MIN"] > agg_quid["GREEN_MIN"])
    if alert_mask.any():
        y_alert = np.maximum(agg_quid["LOAD_MIN"].to_numpy(), agg_quid["GREEN_MIN"].to_numpy()) * 1.05
        fig_all_quid.add_trace(
            go.Scatter(
                x=agg_quid.loc[alert_mask, "MONTH"],
                y=pd.Series(y_alert, index=agg_quid.index).loc[alert_mask],
                mode="text",
                text=["⚠"] * int(alert_mask.sum()),
                textfont=dict(size=18, color=COL_ALERT),
                hoverinfo="skip",
                showlegend=False,
                cliponaxis=False
            )
        )

    fig_all_quid.update_layout(
        template=TEMPLATE,
        title=dict(
            text="<b>AGGREGATO · Tutte le linee QUID*</b>",
            x=0.5, y=0.98, xanchor="center", yanchor="top", font=dict(size=20)
        ),
        height=520,
        margin=dict(l=LEFT_MARGIN, r=40, t=120, b=60),
        barmode="group",
        bargap=BARGAP,
        bargroupgap=BARGROUPGAP,
        hovermode="x unified",
        legend=dict(orientation="h", yanchor="top", y=-0.18, xanchor="left", x=0),
        barcornerradius=BAR_CORNER_RADIUS,
        uirevision="const",
    )

    fig_all_quid.update_xaxes(
        range=[months.min(), months.max() + pd.offsets.MonthEnd(1)],
        type="date",
        dtick="M1",
        tickformat="%m-%Y",
        showline=True, linecolor="black", mirror=True,
    )
    fig_all_quid.update_yaxes(
        title_text="minuti / mese",
        showline=True, linecolor="black", mirror=True,
    )

    fig_all_quid.show()

# =========================================================
# 4) FIG 1: per ogni gruppo -> (grafico) + (tabella sotto)
#    + ALERT: solo dove GREEN_MIN > 0 e LOAD_MIN > GREEN_MIN
# =========================================================
num_groups = len(groups_list)

row_heights_px = []
titles = []
for (linea, rep) in groups_list:
    row_heights_px += [CHART_HEIGHT_PX, TABLE_HEIGHT_PX]
    titles += [f"<b>Linea:</b> {linea} &nbsp;&nbsp; | &nbsp;&nbsp; <b>Reparto:</b> {rep}", ""]

final_height = max(700, int(sum(row_heights_px) + GAP_PX * (num_groups - 1)))
vertical_spacing = min(0.12, GAP_PX / final_height) if num_groups > 1 else 0.06
row_heights = (np.array(row_heights_px) / np.sum(row_heights_px)).tolist()

fig = make_subplots(
    rows=2*num_groups, cols=1,
    row_heights=row_heights,
    vertical_spacing=vertical_spacing,
    subplot_titles=titles,
    shared_xaxes=False,
    specs=[[{"type":"xy"}],[{"type":"table"}]] * num_groups
)

def bar_kwargs(series, color, name, showlegend):
    return dict(
        y=series,
        name=name,
        marker_color=color,
        text=[fmt_int(v) for v in series],
        textposition="inside",
        textangle=90,
        textfont=dict(color="white", size=12),
        insidetextanchor="middle",
        cliponaxis=True,
        showlegend=showlegend,
        hovertemplate="%{x|%m-%Y}<br>%{y:.0f} min<extra></extra>",
    )

for i, (linea, rep) in enumerate(groups_list):
    r_chart = 2*i + 1
    r_table = 2*i + 2

    d = df_m[(df_m["LINEA"] == linea) & (df_m["REPARTO_INTERNO"] == rep)].copy().sort_values("MONTH")
    x = d["MONTH"]

    fig.add_trace(go.Bar(x=x, **bar_kwargs(d["BLUE_MIN"],   COL_BLUE,   "Capacità HR2 (Blu)", i==0)),   row=r_chart, col=1)
    fig.add_trace(go.Bar(x=x, **bar_kwargs(d["VIOLET_MIN"], COL_VIOLET, "Hybrid Work (Viola)", i==0)),  row=r_chart, col=1)
    fig.add_trace(go.Bar(x=x, **bar_kwargs(d["GREEN_MIN"],  COL_GREEN,  "Hybrid Net (Verde)", i==0)),   row=r_chart, col=1)
    fig.add_trace(go.Bar(x=x, **bar_kwargs(d["LOAD_MIN"],   COL_ORANGE, "Carico commesse (Arancione)", i==0)), row=r_chart, col=1)

    alert_mask = (d["GREEN_MIN"] > 0) & (d["LOAD_MIN"] > d["GREEN_MIN"])
    if alert_mask.any():
        y_alert = np.maximum(d["LOAD_MIN"].to_numpy(), d["GREEN_MIN"].to_numpy()) * 1.05
        fig.add_trace(
            go.Scatter(
                x=d.loc[alert_mask, "MONTH"],
                y=pd.Series(y_alert, index=d.index).loc[alert_mask],
                mode="text",
                text=["⚠"] * int(alert_mask.sum()),
                textfont=dict(size=18, color=COL_ALERT),
                hoverinfo="skip",
                showlegend=False,
                cliponaxis=False
            ),
            row=r_chart, col=1
        )

    fig.update_xaxes(
        range=[months.min(), months.max() + pd.offsets.MonthEnd(1)],
        type="date",
        dtick="M1",
        tickformat="%m-%Y",
        showline=True, linecolor="black", mirror=True,
        row=r_chart, col=1
    )
    fig.update_yaxes(
        title_text="minuti / mese",
        showline=True, linecolor="black", mirror=True,
        row=r_chart, col=1
    )

    # TABLE
    month_txt = [pd.to_datetime(m).strftime("%m-%Y") for m in d["MONTH"]]
    table_header = ["Significato"] + month_txt
    table_rows = [
        ["Capacità HR2 (Blu)"]          + [fmt_int(v) for v in d["BLUE_MIN"]],
        ["Hybrid Work (Viola)"]         + [fmt_int(v) for v in d["VIOLET_MIN"]],
        ["Hybrid Net (Verde)"]          + [fmt_int(v) for v in d["GREEN_MIN"]],
        ["Carico commesse (Arancione)"] + [fmt_int(v) for v in d["LOAD_MIN"]],
    ]

    fig.add_trace(
        go.Table(
            header=dict(values=table_header, align="left",
                        font=dict(size=12, color="white"), fill_color="black"),
            cells=dict(values=list(map(list, zip(*table_rows))),
                       align="left", font=dict(size=12), height=26)
        ),
        row=r_table, col=1
    )

fig.update_layout(
    template=TEMPLATE,
    height=final_height,
    title=dict(text=TITLE, x=0.5, y=0.99, xanchor="center", yanchor="top", font=dict(size=20)),
    margin=dict(l=LEFT_MARGIN, r=40, t=170, b=50),
    barmode="group",
    bargap=BARGAP,
    bargroupgap=BARGROUPGAP,
    hovermode="x unified",
    legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="left", x=0),
    uniformtext_minsize=10,
    uniformtext_mode="hide",
    uirevision="const",
    barcornerradius=BAR_CORNER_RADIUS,
)
fig.update_annotations(font=dict(size=15, color="black"))
fig.show()

# =========================================================
# 5) FIG 2: AGGREGATO LINEA = "QUID"
#    Barre impilate per REPARTO (carico commesse), gradazioni arancione
#    + valori scritti per ogni reparto
# =========================================================
df_q = df_m[df_m["LINEA"].astype(str).str.upper() == "QUID"].copy()

if df_q.empty:
    print("Nessun dato per LINEA = QUID nel range selezionato.")
else:
    pv = (df_q.pivot_table(index="MONTH", columns="REPARTO_INTERNO", values="LOAD_MIN",
                           aggfunc="sum", fill_value=0)
              .sort_index())

    rep_order = pv.sum(axis=0).sort_values(ascending=False).index.tolist()
    pv = pv[rep_order]

    n_rep = len(rep_order)
    t_vals = np.linspace(0.00, 0.55, max(n_rep, 1))
    rep_colors = {rep: blend_with_white(COL_ORANGE, float(t_vals[i])) for i, rep in enumerate(rep_order)}

    fig_quid = go.Figure()
    x = pv.index.to_list()

    for rep in rep_order:
        y = pv[rep].to_list()
        col = rep_colors[rep]
        txt_color = "black" if luminance(col) > 0.72 else "white"
        texts = [fmt_int(v) if float(v) > 0 else "" for v in y]

        fig_quid.add_trace(
            go.Bar(
                x=x,
                y=y,
                name=str(rep),
                marker_color=col,
                text=texts,
                textposition="inside",
                textangle=90,
                textfont=dict(color=txt_color, size=11),
                insidetextanchor="middle",
                cliponaxis=True,
                hovertemplate="%{x|%m-%Y}<br>%{y:.0f} min<extra></extra>",
            )
        )

    fig_quid.update_layout(
        template=TEMPLATE,
        title=dict(
            text="<b>QUID · Carico commesse (minuti/mese) · Impilato per reparto</b>",
            x=0.5, y=0.98, xanchor="center", yanchor="top", font=dict(size=20)
        ),
        height=520,
        margin=dict(l=LEFT_MARGIN, r=40, t=120, b=60),
        barmode="stack",
        bargap=0.25,
        hovermode="x unified",
        legend=dict(orientation="h", yanchor="top", y=-0.20, xanchor="left", x=0),
        barcornerradius=BAR_CORNER_RADIUS,
        uirevision="const",
    )

    fig_quid.update_xaxes(
        range=[months.min(), months.max() + pd.offsets.MonthEnd(1)],
        type="date",
        dtick="M1",
        tickformat="%m-%Y",
        showline=True, linecolor="black", mirror=True,
    )
    fig_quid.update_yaxes(
        title_text="minuti / mese (carico commesse)",
        showline=True, linecolor="black", mirror=True,
    )

    fig_quid.show()