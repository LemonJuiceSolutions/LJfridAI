import pandas as pd
import numpy as np
import plotly.graph_objects as go
from plotly.subplots import make_subplots

# =========================================================
# INPUT (PIPELINE - IN MEMORIA)
# Tabelle disponibili: Budget, Prodotto, Fatturato
# =========================================================
df_budget   = Budget.copy()
df_prodotto = Prodotto.copy()
df_fatt     = Fatturato.copy()

# =========================================================
# CONFIG
# =========================================================
YEAR = 2026

TEMPLATE = "plotly_white"
TITLE = "<b>BUDGET vs FATTURATO vs PRODOTTO (2026)</b>"

COLOR_BUDGET = "rgb(37, 99, 235)"     # blu
COLOR_FATT   = "rgb(139, 92, 246)"    # viola
COLOR_PROD   = "rgb(34, 197, 94)"     # verde

# aree molto tenui
AREA_OPACITY_MONTH = 0.10
AREA_OPACITY_CUM   = 0.08

# fallback se Budget pipeline è (0,0) senza colonne
BUDGET_ANNUALE_FALLBACK = 0.0   # es: 6700000.0
PESI_MESI_FALLBACK = [1,1,1,1,1,1,1,0.5,1,1,1,0.5]  # tot=11

# =========================================================
# HELPERS
# =========================================================
def safe_num(s):
    return pd.to_numeric(s, errors="coerce").fillna(0.0)

def month_calendar(year: int) -> pd.DataFrame:
    ms = pd.date_range(f"{year}-01-01", f"{year}-12-01", freq="MS")
    cal = pd.DataFrame({"MeseData": ms})
    cal["Anno"] = year
    cal["Mese"] = cal["MeseData"].dt.month
    cal["NomeMese"] = cal["MeseData"].dt.strftime("%b")
    return cal

def ensure_monthdate_from_anno_mese(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    if "MeseData" in df.columns:
        df["MeseData"] = pd.to_datetime(df["MeseData"], errors="coerce").dt.to_period("M").dt.to_timestamp()
    else:
        df["MeseData"] = pd.to_datetime(
            dict(
                year=pd.to_numeric(df["Anno"], errors="coerce").astype("Int64"),
                month=pd.to_numeric(df["Mese"], errors="coerce").astype("Int64"),
                day=1
            ),
            errors="coerce"
        )
    return df

def add_total_label(fig, x, y, text, color, row, col):
    fig.add_trace(
        go.Scatter(
            x=[x],
            y=[y],
            mode="text",
            text=[text],
            textposition="middle right",
            textfont=dict(color=color, size=12),
            showlegend=False,
            hoverinfo="skip"
        ),
        row=row, col=col
    )

# =========================================================
# 0) CALENDARIO 12 MESI
# =========================================================
cal = month_calendar(YEAR)

# =========================================================
# 1) BUDGET (se DF è (0,0) -> fallback)
# =========================================================
if df_budget is None or df_budget.shape[1] == 0:
    pesi = np.array(PESI_MESI_FALLBACK, dtype=float)
    peso_tot = pesi.sum() if pesi.sum() != 0 else 1.0
    quota = (BUDGET_ANNUALE_FALLBACK / peso_tot) * pesi
    budget_m = cal[["MeseData"]].copy()
    budget_m["BudgetMensile"] = quota
else:
    df_budget = df_budget.copy()
    df_budget.columns = [str(c).strip().replace("\u00a0", " ") for c in df_budget.columns]

    need = {"Anno", "Mese", "BudgetMensile"}
    if not need.issubset(set(df_budget.columns)):
        raise RuntimeError(f"Budget: colonne non matchano: {list(df_budget.columns)}")

    df_budget = ensure_monthdate_from_anno_mese(df_budget)
    df_budget = df_budget[pd.to_numeric(df_budget["Anno"], errors="coerce") == YEAR].copy()
    df_budget["BudgetMensile"] = safe_num(df_budget["BudgetMensile"])

    budget_m = df_budget.groupby("MeseData", as_index=False)["BudgetMensile"].sum().sort_values("MeseData")

# =========================================================
# 2) FATTURATO (mensile)
# =========================================================
df_fatt = df_fatt.copy()
df_fatt.columns = [str(c).strip().replace("\u00a0", " ") for c in df_fatt.columns]

need = {"Anno", "Mese", "RicavoStimatoTot"}
if not need.issubset(set(df_fatt.columns)):
    raise RuntimeError(f"Fatturato: colonne non matchano: {list(df_fatt.columns)}")

df_fatt = ensure_monthdate_from_anno_mese(df_fatt)
df_fatt = df_fatt[pd.to_numeric(df_fatt["Anno"], errors="coerce") == YEAR].copy()
df_fatt["RicavoStimatoTot"] = safe_num(df_fatt["RicavoStimatoTot"])

fatt_m = (
    df_fatt.groupby("MeseData", as_index=False)["RicavoStimatoTot"]
    .sum()
    .rename(columns={"RicavoStimatoTot": "FatturatoTot"})
    .sort_values("MeseData")
)

# =========================================================
# 3) PRODOTTO (mensile + contributi stacked)
# =========================================================
df_prodotto = df_prodotto.copy()
df_prodotto.columns = [str(c).strip().replace("\u00a0", " ") for c in df_prodotto.columns]

need = {"Anno", "Mese", "LineaFornitore", "RepartoInterno", "RicavoStimatoTot"}
if not need.issubset(set(df_prodotto.columns)):
    raise RuntimeError(f"Prodotto: colonne non matchano: {list(df_prodotto.columns)}")

df_prodotto = ensure_monthdate_from_anno_mese(df_prodotto)
df_prodotto = df_prodotto[pd.to_numeric(df_prodotto["Anno"], errors="coerce") == YEAR].copy()
df_prodotto["RicavoStimatoTot"] = safe_num(df_prodotto["RicavoStimatoTot"])

df_prodotto["KeyLR"] = (
    df_prodotto["LineaFornitore"].astype(str).str.strip()
    + " | "
    + df_prodotto["RepartoInterno"].astype(str).str.strip()
)

prod_by_lr = (
    df_prodotto.groupby(["MeseData", "KeyLR"], as_index=False)["RicavoStimatoTot"]
    .sum()
)

prod_m = (
    prod_by_lr.groupby("MeseData", as_index=False)["RicavoStimatoTot"]
    .sum()
    .rename(columns={"RicavoStimatoTot": "ProdottoTot"})
    .sort_values("MeseData")
)

# =========================================================
# 4) ALLINEO A 12 MESI
# =========================================================
series = (
    cal[["MeseData", "Mese", "NomeMese"]]
    .merge(budget_m, on="MeseData", how="left")
    .merge(fatt_m,   on="MeseData", how="left")
    .merge(prod_m,   on="MeseData", how="left")
)

series["BudgetMensile"] = series["BudgetMensile"].fillna(0.0)
series["FatturatoTot"]  = series["FatturatoTot"].fillna(0.0)
series["ProdottoTot"]   = series["ProdottoTot"].fillna(0.0)

pivot_lr = (
    prod_by_lr.pivot_table(index="MeseData", columns="KeyLR", values="RicavoStimatoTot", aggfunc="sum")
    .reindex(series["MeseData"])
    .fillna(0.0)
)

lr_order = pivot_lr.sum(axis=0).sort_values(ascending=False).index.tolist()

# =========================================================
# 5) CUMULATI
# =========================================================
series_cum = series.copy()
series_cum["BudgetCum"]    = series_cum["BudgetMensile"].cumsum()
series_cum["FatturatoCum"] = series_cum["FatturatoTot"].cumsum()
series_cum["ProdottoCum"]  = series_cum["ProdottoTot"].cumsum()

pivot_lr_cum = pivot_lr[lr_order].cumsum(axis=0)

# Totali annui (mensile) e finali cumulati
tot_budget = float(series["BudgetMensile"].sum())
tot_fatt   = float(series["FatturatoTot"].sum())
tot_prod   = float(series["ProdottoTot"].sum())

# =========================================================
# 6) PLOT (2 SUBPLOTS) - AREE TENUI + TOTALI SULLE LINEE
# =========================================================
fig = make_subplots(
    rows=2, cols=1,
    shared_xaxes=True,
    vertical_spacing=0.10,
    subplot_titles=(
        "Valori mensili (aree = contributi per Linea/Reparto)",
        "Cumulato (2026)"
    )
)

# --- ROW 1: AREE STACKED (molto tenui) ---
for k in lr_order:
    fig.add_trace(
        go.Scatter(
            x=series["MeseData"],
            y=pivot_lr[k],
            mode="lines",
            name=k,
            stackgroup="prod_month",
            opacity=AREA_OPACITY_MONTH,
            line=dict(width=0.4),
            hovertemplate="%{x|%b %Y}<br>%{y:,.0f}<extra>" + k + "</extra>",
            showlegend=True
        ),
        row=1, col=1
    )

# --- ROW 1: CURVE PRINCIPALI ---
fig.add_trace(
    go.Scatter(
        x=series["MeseData"], y=series["ProdottoTot"],
        mode="lines+markers",
        name="Prodotto",
        line=dict(color=COLOR_PROD, width=3),
        marker=dict(size=7),
        hovertemplate="%{x|%b %Y}<br>Prodotto: %{y:,.0f}<extra></extra>"
    ),
    row=1, col=1
)

fig.add_trace(
    go.Scatter(
        x=series["MeseData"], y=series["FatturatoTot"],
        mode="lines+markers",
        name="Fatturato",
        line=dict(color=COLOR_FATT, width=3),
        marker=dict(size=7),
        hovertemplate="%{x|%b %Y}<br>Fatturato: %{y:,.0f}<extra></extra>"
    ),
    row=1, col=1
)

fig.add_trace(
    go.Scatter(
        x=series["MeseData"], y=series["BudgetMensile"],
        mode="lines+markers",
        name="Budget",
        line=dict(color=COLOR_BUDGET, width=3),
        marker=dict(size=7),
        hovertemplate="%{x|%b %Y}<br>Budget: %{y:,.0f}<extra></extra>"
    ),
    row=1, col=1
)

# --- ETICHETTE TOTALI SULLE LINEE (ROW 1) ---
x_last = series["MeseData"].iloc[-1]
add_total_label(fig, x_last, series["ProdottoTot"].iloc[-1],  f"Tot {tot_prod:,.0f}",   COLOR_PROD,   row=1, col=1)
add_total_label(fig, x_last, series["FatturatoTot"].iloc[-1], f"Tot {tot_fatt:,.0f}",   COLOR_FATT,   row=1, col=1)
add_total_label(fig, x_last, series["BudgetMensile"].iloc[-1],f"Tot {tot_budget:,.0f}", COLOR_BUDGET, row=1, col=1)

# --- ROW 2: AREE CUMULATE (ancora più soft) ---
for k in lr_order:
    fig.add_trace(
        go.Scatter(
            x=series_cum["MeseData"],
            y=pivot_lr_cum[k],
            mode="lines",
            stackgroup="prod_cum",
            opacity=AREA_OPACITY_CUM,
            line=dict(width=0.4),
            showlegend=False
        ),
        row=2, col=1
    )

# --- ROW 2: CURVE CUMULATE ---
fig.add_trace(
    go.Scatter(
        x=series_cum["MeseData"], y=series_cum["ProdottoCum"],
        mode="lines+markers",
        name="Prodotto (cum)",
        line=dict(color=COLOR_PROD, width=3),
        marker=dict(size=7)
    ),
    row=2, col=1
)

fig.add_trace(
    go.Scatter(
        x=series_cum["MeseData"], y=series_cum["FatturatoCum"],
        mode="lines+markers",
        name="Fatturato (cum)",
        line=dict(color=COLOR_FATT, width=3),
        marker=dict(size=7)
    ),
    row=2, col=1
)

fig.add_trace(
    go.Scatter(
        x=series_cum["MeseData"], y=series_cum["BudgetCum"],
        mode="lines+markers",
        name="Budget (cum)",
        line=dict(color=COLOR_BUDGET, width=3),
        marker=dict(size=7)
    ),
    row=2, col=1
)

# --- ETICHETTE TOTALI (ROW 2) = ultimo valore cumulato ---
x_last_c = series_cum["MeseData"].iloc[-1]
add_total_label(fig, x_last_c, series_cum["ProdottoCum"].iloc[-1],  f"{series_cum['ProdottoCum'].iloc[-1]:,.0f}",  COLOR_PROD,   row=2, col=1)
add_total_label(fig, x_last_c, series_cum["FatturatoCum"].iloc[-1], f"{series_cum['FatturatoCum'].iloc[-1]:,.0f}", COLOR_FATT,   row=2, col=1)
add_total_label(fig, x_last_c, series_cum["BudgetCum"].iloc[-1],    f"{series_cum['BudgetCum'].iloc[-1]:,.0f}",    COLOR_BUDGET, row=2, col=1)

# =========================================================
# 7) LAYOUT
# =========================================================
fig.update_layout(
    template=TEMPLATE,
    title=TITLE,
    height=940,
    margin=dict(l=60, r=120, t=90, b=85),  # r più largo per far spazio ai testi a destra
    hovermode="x unified",
    legend=dict(
        orientation="h",
        yanchor="bottom",
        y=-0.20,
        xanchor="left",
        x=0.0,
        font=dict(size=10)
    )
)

fig.update_xaxes(dtick="M1", tickformat="%b", row=1, col=1)
fig.update_xaxes(dtick="M1", tickformat="%b", row=2, col=1)

fig.update_yaxes(title_text="Valore mensile", row=1, col=1)
fig.update_yaxes(title_text="Valore cumulato", row=2, col=1)

# =========================================================
# 7) OUTPUT JSON (invece di fig.show())
# =========================================================
import json
# fig.to_json() restituisce una stringa JSON con { "data": [...], "layout": [...] }
# React leggerà questo output e lo renderizzerà.
print(fig.to_json())