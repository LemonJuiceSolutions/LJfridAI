"""
Analisi KPI - Settore Farmaceutico Italiano
=============================================
Script per l'analisi del file rating_farmaceutico_finale.xlsx
Genera KPI significativi e visualizzazioni in output HTML + Excel.
"""

import pandas as pd
import numpy as np
import warnings
import os
import sys
import json
import base64
import subprocess
import shutil
import threading
from datetime import datetime

warnings.filterwarnings("ignore")

# ── CONFIG ──────────────────────────────────────────────────────────────────
INPUT_FILE = "public/documents/rating_farmaceutico_finale.xlsx"
OUTPUT_DIR = "output_kpi"
LOGO_FILE = "Logo.png"
os.makedirs(OUTPUT_DIR, exist_ok=True)

# ── LOGO BASE64 ────────────────────────────────────────────────────────────
logo_b64 = ""
if os.path.exists(LOGO_FILE):
    with open(LOGO_FILE, "rb") as f:
        logo_b64 = base64.b64encode(f.read()).decode("utf-8")
    print(f"  Logo caricato: {LOGO_FILE} ({os.path.getsize(LOGO_FILE):,} bytes)")


# ── 1. CARICAMENTO E PULIZIA DATI ──────────────────────────────────────────
print("=" * 60)
print("  ANALISI KPI - SETTORE FARMACEUTICO")
print("=" * 60)
print(f"\n[1/7] Caricamento dati da {INPUT_FILE}...")

df = pd.read_excel(INPUT_FILE, sheet_name="Dati aziende", dtype=str)
print(f"  Righe caricate: {len(df):,}")
print(f"  Colonne: {len(df.columns)}")

# Colonne numeriche da convertire
FINANCIAL_COLS = [
    "fixed_assets", "intangible_fixed_assets", "tangible_fixed_assets",
    "other_fixed_assets", "current_assets", "stock", "debtors",
    "other_current_assets", "cash_e_cash_equivalent", "total_assets",
    "shareholders_funds", "capital", "other_shareholders_funds",
    "non_current_liabilities", "long_term_debt", "other_non_current_liabilities",
    "provisions", "current_liabilities", "loans", "creditors",
    "other_current_liabilities", "total_shareh_funds_e_liab",
    "working_capital", "net_current_assets", "enterprise_value",
    "number_of_employees", "operating_revenue_turnover", "sales",
    "costs_of_goods_sold", "gross_profit", "other_operating_expenses",
    "operating_pel_ebit", "financial_revenue", "financial_expenses",
    "financial_pel", "pel_before_tax", "taxation", "pel_after_tax",
    "pel_for_period_net_income", "export_revenue", "material_costs",
    "costs_of_employees", "depreciation_e_amortization", "interest_paid",
    "cash_flow", "added_value", "ebitda",
]

RATIO_COLS = [
    "roe_using_pel_before_tax_x100", "roce_using_pel_before_tax_x100",
    "roa_using_pel_before_tax_x100", "roe_using_net_income_x100",
    "roce_using_net_income_x100", "roa_using_net_income_x100",
    "profit_margin_x100", "gross_margin_x100", "ebitda_margin_x100",
    "ebit_margin_x100", "cash_flow_operating_revenue_x100",
    "current_ratio", "liquidity_ratio", "solvency_ratio_asset_based_x100",
    "solvency_ratio_liability_based_x100", "gearing_x100",
    "profit_per_employee", "operating_revenue_per_employee",
    "costs_of_employees_operating_revenue_x100", "average_cost_of_employee",
    "shareholders_funds_per_employee", "total_assets_per_employee",
    "probability_of_default_x100",
    "collection_period_days", "credit_period_days",
    "net_assets_turnover", "interest_cover", "stock_turnover",
]

ALL_NUMERIC = FINANCIAL_COLS + RATIO_COLS

for col in ALL_NUMERIC:
    if col in df.columns:
        df[col] = df[col].replace("(null)", np.nan)
        df[col] = pd.to_numeric(df[col], errors="coerce")

df["closing_date"] = pd.to_numeric(df["closing_date"], errors="coerce")
df["anno"] = (df["closing_date"] // 10000).astype("Int64")
df["probability_of_default_x100"] = pd.to_numeric(
    df["probability_of_default_x100"], errors="coerce"
)

# ATECO short code (first 2 digits)
df["ateco_code"] = df["primary_code_s_in_this_classification"].astype(str).str[:4]
df["ateco_desc"] = df["primary_code_in_national_industry_classification_text_description"]

# Macro-area Nord/Centro/Sud
MACRO_MAP = {
    "ITC": "Nord",
    "ITH": "Nord",
    "ITI": "Centro",
    "ITF": "Sud e Isole",
    "ITG": "Sud e Isole",
}
df["nuts1_code"] = df["nuts1"].str[:3]
df["macro_area"] = df["nuts1_code"].map(MACRO_MAP)

# Region name from NUTS2
df["regione"] = df["nuts2"].str.split(" - ", n=1).str[1].fillna(df["nuts2"])

print(f"  Aziende uniche: {df['ID'].nunique():,}")
print(f"  Anni coperti: {sorted(df['anno'].dropna().unique().tolist())}")


# ── 2. FILTRO: ULTIMO BILANCIO PER AZIENDA ─────────────────────────────────
print("\n[2/7] Selezione ultimo bilancio per azienda...")
df_sorted = df.sort_values(["ID", "closing_date"], ascending=[True, False])
df_last = df_sorted.drop_duplicates(subset="ID", keep="first").copy()
print(f"  Record selezionati (ultimo bilancio): {len(df_last):,}")


# ── FUNZIONI HELPER ─────────────────────────────────────────────────────────
def safe_stats(series, name=""):
    s = series.dropna()
    if len(s) == 0:
        return {"count": 0, "mean": np.nan, "median": np.nan, "std": np.nan,
                "q25": np.nan, "q75": np.nan, "min": np.nan, "max": np.nan}
    return {
        "count": len(s), "mean": s.mean(), "median": s.median(),
        "std": s.std(), "q25": s.quantile(0.25), "q75": s.quantile(0.75),
        "min": s.min(), "max": s.max(),
    }


def pct(n, total):
    return f"{n / total * 100:.1f}%" if total > 0 else "N/A"


def fmt_eur(val):
    if pd.isna(val):
        return "N/A"
    return f"{val:,.0f}"


# ── 3. CALCOLO KPI ─────────────────────────────────────────────────────────
print("\n[3/7] Calcolo KPI...")

results = {}

# ─── KPI 1: PANORAMICA GENERALE ────────────────────────────────────────────
n_total = len(df_last)
n_active = (df_last["status"] == "Active").sum()
n_dissolved = df_last["status"].str.contains("Dissolved", na=False).sum()
n_insolvency = df_last["status"].isin(
    ["In liquidation", "Bankruptcy", "Active (insolvency proceedings)",
     "Active (default of payment)", "Dissolved (bankruptcy)"]
).sum()

results["1. Panoramica Generale"] = pd.DataFrame([
    {"KPI": "Totale aziende nel dataset", "Valore": f"{n_total:,}"},
    {"KPI": "Aziende attive", "Valore": f"{n_active:,} ({pct(n_active, n_total)})"},
    {"KPI": "Aziende dissolte/cessate", "Valore": f"{n_dissolved:,} ({pct(n_dissolved, n_total)})"},
    {"KPI": "Aziende in crisi (liquidazione/fallimento)", "Valore": f"{n_insolvency:,} ({pct(n_insolvency, n_total)})"},
    {"KPI": "Record totali (multi-anno)", "Valore": f"{len(df):,}"},
    {"KPI": "Media bilanci per azienda", "Valore": f"{len(df) / n_total:.1f}"},
])

# ─── KPI 2: DISTRIBUZIONE RATING ───────────────────────────────────────────
rating_order = list("ABCDEFGHILMNOPQR")
rating_dist = df_last["implied_rating"].value_counts()
rating_df = pd.DataFrame({
    "Rating": rating_order,
    "N. Aziende": [rating_dist.get(r, 0) for r in rating_order],
    "% sul Totale": [pct(rating_dist.get(r, 0), n_total) for r in rating_order],
})
rating_df = rating_df[rating_df["N. Aziende"] > 0]

rating_map = {r: i + 1 for i, r in enumerate(rating_order)}
df_last["rating_num"] = df_last["implied_rating"].map(rating_map)
avg_rating_num = df_last["rating_num"].mean()
avg_rating_letter = rating_order[int(round(avg_rating_num)) - 1] if not np.isnan(avg_rating_num) else "N/A"

inv_grade = df_last["implied_rating"].isin(list("ABCDEFGH")).sum()
spec_grade = df_last["implied_rating"].isin(list("ILMNOPQR")).sum()

rating_summary = pd.DataFrame([
    {"KPI": "Rating medio (numerico)", "Valore": f"{avg_rating_num:.1f}"},
    {"KPI": "Rating medio (lettera)", "Valore": avg_rating_letter},
    {"KPI": "Investment Grade (A-H)", "Valore": f"{inv_grade:,} ({pct(inv_grade, n_total)})"},
    {"KPI": "Speculative Grade (I-R)", "Valore": f"{spec_grade:,} ({pct(spec_grade, n_total)})"},
])

results["2. Distribuzione Rating"] = rating_df
results["2b. Rating Summary"] = rating_summary

# ─── KPI 3: PROBABILITÀ DI DEFAULT ─────────────────────────────────────────
pd_stats = safe_stats(df_last["probability_of_default_x100"])
pd_by_rating = (
    df_last.groupby("implied_rating")["probability_of_default_x100"]
    .agg(["mean", "median", "count"])
    .reindex(rating_order)
    .dropna(subset=["count"])
    .reset_index()
)
pd_by_rating.columns = ["Rating", "PD Media (%)", "PD Mediana (%)", "N. Aziende"]
pd_by_rating["PD Media (%)"] = pd_by_rating["PD Media (%)"].round(2)
pd_by_rating["PD Mediana (%)"] = pd_by_rating["PD Mediana (%)"].round(2)

low_risk = (df_last["probability_of_default_x100"] < 1).sum()
med_risk = ((df_last["probability_of_default_x100"] >= 1) & (df_last["probability_of_default_x100"] < 5)).sum()
high_risk = (df_last["probability_of_default_x100"] >= 5).sum()
pd_valid = df_last["probability_of_default_x100"].notna().sum()

pd_summary = pd.DataFrame([
    {"KPI": "PD media (%)", "Valore": f"{pd_stats['mean']:.2f}"},
    {"KPI": "PD mediana (%)", "Valore": f"{pd_stats['median']:.2f}"},
    {"KPI": "Rischio basso (PD < 1%)", "Valore": f"{low_risk:,} ({pct(low_risk, pd_valid)})"},
    {"KPI": "Rischio medio (1% <= PD < 5%)", "Valore": f"{med_risk:,} ({pct(med_risk, pd_valid)})"},
    {"KPI": "Rischio alto (PD >= 5%)", "Valore": f"{high_risk:,} ({pct(high_risk, pd_valid)})"},
])

results["3. Probabilita di Default"] = pd_summary
results["3b. PD per Rating"] = pd_by_rating

# ─── KPI 4: DIMENSIONE AZIENDALE ───────────────────────────────────────────
rev_stats = safe_stats(df_last["operating_revenue_turnover"])
emp_stats = safe_stats(df_last["number_of_employees"])

rev = df_last["operating_revenue_turnover"]
micro = ((rev > 0) & (rev <= 2_000_000)).sum()
small = ((rev > 2_000_000) & (rev <= 10_000_000)).sum()
medium = ((rev > 10_000_000) & (rev <= 50_000_000)).sum()
large = (rev > 50_000_000).sum()
rev_valid = rev.notna().sum()

size_df = pd.DataFrame([
    {"KPI": "Fatturato medio (EUR)", "Valore": f"{rev_stats['mean']:,.0f}" if not np.isnan(rev_stats['mean']) else "N/A"},
    {"KPI": "Fatturato mediano (EUR)", "Valore": f"{rev_stats['median']:,.0f}" if not np.isnan(rev_stats['median']) else "N/A"},
    {"KPI": "Aziende con dati fatturato", "Valore": f"{rev_valid:,} ({pct(rev_valid, n_total)})"},
    {"KPI": "Micro (<=2M EUR)", "Valore": f"{micro:,} ({pct(micro, rev_valid)})"},
    {"KPI": "Piccole (2-10M EUR)", "Valore": f"{small:,} ({pct(small, rev_valid)})"},
    {"KPI": "Medie (10-50M EUR)", "Valore": f"{medium:,} ({pct(medium, rev_valid)})"},
    {"KPI": "Grandi (>50M EUR)", "Valore": f"{large:,} ({pct(large, rev_valid)})"},
    {"KPI": "N. medio dipendenti", "Valore": f"{emp_stats['mean']:,.0f}" if not np.isnan(emp_stats['mean']) else "N/A"},
    {"KPI": "N. mediano dipendenti", "Valore": f"{emp_stats['median']:,.0f}" if not np.isnan(emp_stats['median']) else "N/A"},
])
results["4. Dimensione Aziendale"] = size_df

# ─── KPI 5: REDDITIVITÀ ────────────────────────────────────────────────────
profitability_metrics = {
    "ROE (ante imposte, %)": "roe_using_pel_before_tax_x100",
    "ROA (ante imposte, %)": "roa_using_pel_before_tax_x100",
    "ROCE (ante imposte, %)": "roce_using_pel_before_tax_x100",
    "Margine di profitto (%)": "profit_margin_x100",
    "Margine lordo (%)": "gross_margin_x100",
    "EBITDA Margin (%)": "ebitda_margin_x100",
    "EBIT Margin (%)": "ebit_margin_x100",
}

profit_rows = []
for label, col in profitability_metrics.items():
    s = safe_stats(df_last[col])
    profit_rows.append({
        "KPI": label,
        "Media": f"{s['mean']:.1f}" if not np.isnan(s['mean']) else "N/A",
        "Mediana": f"{s['median']:.1f}" if not np.isnan(s['median']) else "N/A",
        "Q25": f"{s['q25']:.1f}" if s['count'] > 0 else "N/A",
        "Q75": f"{s['q75']:.1f}" if s['count'] > 0 else "N/A",
        "N. Aziende": f"{s['count']:,}",
    })
results["5. Redditivita"] = pd.DataFrame(profit_rows)

in_profit = (df_last["pel_for_period_net_income"] > 0).sum()
in_loss = (df_last["pel_for_period_net_income"] < 0).sum()
breakeven = (df_last["pel_for_period_net_income"] == 0).sum()
pnl_valid = df_last["pel_for_period_net_income"].notna().sum()

results["5b. Utile Perdita"] = pd.DataFrame([
    {"KPI": "Aziende in utile", "Valore": f"{in_profit:,} ({pct(in_profit, pnl_valid)})"},
    {"KPI": "Aziende in perdita", "Valore": f"{in_loss:,} ({pct(in_loss, pnl_valid)})"},
    {"KPI": "Aziende in pareggio", "Valore": f"{breakeven:,} ({pct(breakeven, pnl_valid)})"},
    {"KPI": "Utile netto medio (EUR)", "Valore": f"{df_last['pel_for_period_net_income'].mean():,.0f}" if pnl_valid > 0 else "N/A"},
    {"KPI": "Utile netto mediano (EUR)", "Valore": f"{df_last['pel_for_period_net_income'].median():,.0f}" if pnl_valid > 0 else "N/A"},
])

# ─── KPI 6: SOLIDITÀ PATRIMONIALE E LIQUIDITÀ ──────────────────────────────
solidity_metrics = {
    "Current Ratio": "current_ratio",
    "Liquidity Ratio": "liquidity_ratio",
    "Solvency Ratio (asset-based, %)": "solvency_ratio_asset_based_x100",
    "Gearing (%)": "gearing_x100",
    "Giorni incasso crediti": "collection_period_days",
    "Giorni pagamento debiti": "credit_period_days",
}

solidity_rows = []
for label, col in solidity_metrics.items():
    s = safe_stats(df_last[col])
    solidity_rows.append({
        "KPI": label,
        "Media": f"{s['mean']:.1f}" if not np.isnan(s['mean']) else "N/A",
        "Mediana": f"{s['median']:.1f}" if not np.isnan(s['median']) else "N/A",
        "Q25": f"{s['q25']:.1f}" if s['count'] > 0 else "N/A",
        "Q75": f"{s['q75']:.1f}" if s['count'] > 0 else "N/A",
        "N. Aziende": f"{s['count']:,}",
    })
results["6. Solidita e Liquidita"] = pd.DataFrame(solidity_rows)

# ─── KPI 7: ANALISI GEOGRAFICA ─────────────────────────────────────────────
geo = (
    df_last.groupby("nuts2")
    .agg(
        n_aziende=("ID", "count"),
        fatturato_medio=("operating_revenue_turnover", "mean"),
        fatturato_mediano=("operating_revenue_turnover", "median"),
        pd_media=("probability_of_default_x100", "mean"),
        dipendenti_medi=("number_of_employees", "mean"),
        roe_medio=("roe_using_pel_before_tax_x100", "mean"),
    )
    .sort_values("n_aziende", ascending=False)
    .reset_index()
)
geo.columns = [
    "Regione (NUTS2)", "N. Aziende", "Fatturato Medio (EUR)",
    "Fatturato Mediano (EUR)", "PD Media (%)", "Dipendenti Medi", "ROE Medio (%)"
]
for c in ["Fatturato Medio (EUR)", "Fatturato Mediano (EUR)"]:
    geo[c] = geo[c].apply(lambda x: f"{x:,.0f}" if pd.notna(x) else "N/A")
for c in ["PD Media (%)", "ROE Medio (%)"]:
    geo[c] = geo[c].apply(lambda x: f"{x:.2f}" if pd.notna(x) else "N/A")
geo["Dipendenti Medi"] = geo["Dipendenti Medi"].apply(lambda x: f"{x:.0f}" if pd.notna(x) else "N/A")
results["7. Analisi Geografica"] = geo

# ─── KPI 7b: RISCHIO CREDITO PER REGIONE ──────────────────────────────────
risk_by_region = (
    df_last.groupby("regione")
    .agg(
        n_aziende=("ID", "count"),
        pd_media=("probability_of_default_x100", "mean"),
        pd_mediana=("probability_of_default_x100", "median"),
        inv_grade=("implied_rating", lambda x: x.isin(list("ABCDEFGH")).sum()),
        spec_grade=("implied_rating", lambda x: x.isin(list("ILMNOPQR")).sum()),
        high_risk=("probability_of_default_x100", lambda x: (x >= 5).sum()),
    )
    .sort_values("n_aziende", ascending=False)
    .reset_index()
)
risk_by_region["% Inv. Grade"] = (risk_by_region["inv_grade"] / risk_by_region["n_aziende"] * 100).round(1)
risk_by_region["% Rischio Alto"] = (risk_by_region["high_risk"] / risk_by_region["n_aziende"] * 100).round(1)
risk_by_region["pd_media"] = risk_by_region["pd_media"].round(2)
risk_by_region["pd_mediana"] = risk_by_region["pd_mediana"].round(2)
risk_by_region.columns = ["Regione", "N. Aziende", "PD Media (%)", "PD Mediana (%)",
                           "N. Inv. Grade", "N. Spec. Grade", "N. Rischio Alto",
                           "% Inv. Grade", "% Rischio Alto"]
results["7b. Rischio per Regione"] = risk_by_region

# ─── KPI 7c: FATTURATO NORD VS SUD ────────────────────────────────────────
macro_stats = (
    df_last.groupby("macro_area")
    .agg(
        n_aziende=("ID", "count"),
        fatturato_medio=("operating_revenue_turnover", "mean"),
        fatturato_mediano=("operating_revenue_turnover", "median"),
        ebitda_medio=("ebitda", "mean"),
        pd_media=("probability_of_default_x100", "mean"),
        roe_medio=("roe_using_pel_before_tax_x100", "mean"),
        dipendenti_medi=("number_of_employees", "mean"),
        inv_grade=("implied_rating", lambda x: x.isin(list("ABCDEFGH")).sum()),
    )
    .reset_index()
)
macro_stats["% Inv. Grade"] = (macro_stats["inv_grade"] / macro_stats["n_aziende"] * 100).round(1)
for c in ["fatturato_medio", "fatturato_mediano", "ebitda_medio"]:
    macro_stats[c] = macro_stats[c].apply(lambda x: f"{x:,.0f}" if pd.notna(x) else "N/A")
for c in ["pd_media", "roe_medio"]:
    macro_stats[c] = macro_stats[c].apply(lambda x: f"{x:.2f}" if pd.notna(x) else "N/A")
macro_stats["dipendenti_medi"] = macro_stats["dipendenti_medi"].apply(lambda x: f"{x:.0f}" if pd.notna(x) else "N/A")
macro_stats.columns = ["Macro Area", "N. Aziende", "Fatturato Medio (EUR)", "Fatturato Mediano (EUR)",
                        "EBITDA Medio (EUR)", "PD Media (%)", "ROE Medio (%)", "Dipendenti Medi",
                        "N. Inv. Grade", "% Inv. Grade"]
results["7c. Nord vs Sud"] = macro_stats

# ─── KPI 8: ANALISI PER FORMA GIURIDICA ────────────────────────────────────
legal = (
    df_last.groupby("standardised_legal_form")
    .agg(
        n_aziende=("ID", "count"),
        fatturato_medio=("operating_revenue_turnover", "mean"),
        pd_media=("probability_of_default_x100", "mean"),
        roe_medio=("roe_using_pel_before_tax_x100", "mean"),
        ebitda_medio=("ebitda", "mean"),
    )
    .sort_values("n_aziende", ascending=False)
    .reset_index()
)
legal.columns = ["Forma Giuridica", "N. Aziende", "Fatturato Medio (EUR)",
                  "PD Media (%)", "ROE Medio (%)", "EBITDA Medio (EUR)"]
for c in ["Fatturato Medio (EUR)", "EBITDA Medio (EUR)"]:
    legal[c] = legal[c].apply(lambda x: f"{x:,.0f}" if pd.notna(x) else "N/A")
for c in ["PD Media (%)", "ROE Medio (%)"]:
    legal[c] = legal[c].apply(lambda x: f"{x:.2f}" if pd.notna(x) else "N/A")
results["8. Per Forma Giuridica"] = legal

# ─── KPI 9: ANALISI PER CODICE ATECO ──────────────────────────────────────
ateco_analysis = (
    df_last.groupby(["ateco_code", "ateco_desc"])
    .agg(
        n_aziende=("ID", "count"),
        fatturato_medio=("operating_revenue_turnover", "mean"),
        fatturato_mediano=("operating_revenue_turnover", "median"),
        pd_media=("probability_of_default_x100", "mean"),
        roe_medio=("roe_using_pel_before_tax_x100", "mean"),
        ebitda_medio=("ebitda", "mean"),
        dipendenti_medi=("number_of_employees", "mean"),
        inv_grade=("implied_rating", lambda x: x.isin(list("ABCDEFGH")).sum()),
    )
    .sort_values("n_aziende", ascending=False)
    .reset_index()
)
ateco_analysis["% Inv. Grade"] = (ateco_analysis["inv_grade"] / ateco_analysis["n_aziende"] * 100).round(1)
for c in ["fatturato_medio", "fatturato_mediano", "ebitda_medio"]:
    ateco_analysis[c] = ateco_analysis[c].apply(lambda x: f"{x:,.0f}" if pd.notna(x) else "N/A")
for c in ["pd_media", "roe_medio"]:
    ateco_analysis[c] = ateco_analysis[c].apply(lambda x: f"{x:.2f}" if pd.notna(x) else "N/A")
ateco_analysis["dipendenti_medi"] = ateco_analysis["dipendenti_medi"].apply(lambda x: f"{x:.0f}" if pd.notna(x) else "N/A")
ateco_analysis.columns = ["Codice ATECO", "Descrizione", "N. Aziende", "Fatturato Medio (EUR)",
                           "Fatturato Mediano (EUR)", "PD Media (%)", "ROE Medio (%)",
                           "EBITDA Medio (EUR)", "Dipendenti Medi", "N. Inv. Grade", "% Inv. Grade"]
results["9. Per Codice ATECO"] = ateco_analysis

# ─── KPI 9b: FATTURATO PER CODICE ATECO ──────────────────────────────────
ateco_rev_raw = (
    df_last.groupby(["ateco_code", "ateco_desc"])
    .agg(
        n_aziende=("ID", "count"),
        fatturato_totale=("operating_revenue_turnover", "sum"),
        fatturato_medio=("operating_revenue_turnover", "mean"),
        fatturato_mediano=("operating_revenue_turnover", "median"),
    )
    .sort_values("fatturato_totale", ascending=False)
    .reset_index()
)
ateco_rev_raw["quota_fatturato"] = (ateco_rev_raw["fatturato_totale"] / ateco_rev_raw["fatturato_totale"].sum() * 100).round(1)
for c in ["fatturato_totale", "fatturato_medio", "fatturato_mediano"]:
    ateco_rev_raw[c] = ateco_rev_raw[c].apply(lambda x: f"{x:,.0f}" if pd.notna(x) else "N/A")
ateco_rev_raw.columns = ["Codice ATECO", "Descrizione", "N. Aziende", "Fatturato Totale (EUR)",
                          "Fatturato Medio (EUR)", "Fatturato Mediano (EUR)", "Quota Fatturato (%)"]
results["9b. Fatturato per ATECO"] = ateco_rev_raw

# ─── KPI 10: RISCHIO CREDITO ARTICOLATO ────────────────────────────────────
# PD per fascia dimensionale
def classify_size(rev_val):
    if pd.isna(rev_val) or rev_val <= 0:
        return "Senza dati"
    elif rev_val <= 2_000_000:
        return "Micro (<=2M)"
    elif rev_val <= 10_000_000:
        return "Piccola (2-10M)"
    elif rev_val <= 50_000_000:
        return "Media (10-50M)"
    else:
        return "Grande (>50M)"

df_last["size_class"] = df_last["operating_revenue_turnover"].apply(classify_size)

risk_by_size = (
    df_last.groupby("size_class")
    .agg(
        n_aziende=("ID", "count"),
        pd_media=("probability_of_default_x100", "mean"),
        pd_mediana=("probability_of_default_x100", "median"),
        inv_grade=("implied_rating", lambda x: x.isin(list("ABCDEFGH")).sum()),
        high_risk=("probability_of_default_x100", lambda x: (x >= 5).sum()),
        fatturato_medio=("operating_revenue_turnover", "mean"),
    )
    .reset_index()
)
risk_by_size["% Inv. Grade"] = (risk_by_size["inv_grade"] / risk_by_size["n_aziende"] * 100).round(1)
risk_by_size["% Rischio Alto"] = (risk_by_size["high_risk"] / risk_by_size["n_aziende"] * 100).round(1)
risk_by_size["pd_media"] = risk_by_size["pd_media"].round(2)
risk_by_size["pd_mediana"] = risk_by_size["pd_mediana"].round(2)
risk_by_size["fatturato_medio"] = risk_by_size["fatturato_medio"].apply(lambda x: f"{x:,.0f}" if pd.notna(x) else "N/A")
risk_by_size.columns = ["Fascia Dimensionale", "N. Aziende", "PD Media (%)", "PD Mediana (%)",
                         "N. Inv. Grade", "N. Rischio Alto", "Fatturato Medio (EUR)",
                         "% Inv. Grade", "% Rischio Alto"]
results["10. Rischio per Dimensione"] = risk_by_size

# PD per macro-area
risk_by_macro = (
    df_last.groupby("macro_area")
    .agg(
        n_aziende=("ID", "count"),
        pd_media=("probability_of_default_x100", "mean"),
        pd_mediana=("probability_of_default_x100", "median"),
        low_risk=("probability_of_default_x100", lambda x: (x < 1).sum()),
        med_risk=("probability_of_default_x100", lambda x: ((x >= 1) & (x < 5)).sum()),
        high_risk=("probability_of_default_x100", lambda x: (x >= 5).sum()),
    )
    .reset_index()
)
risk_by_macro["pd_media"] = risk_by_macro["pd_media"].round(2)
risk_by_macro["pd_mediana"] = risk_by_macro["pd_mediana"].round(2)
risk_by_macro["% Basso"] = (risk_by_macro["low_risk"] / risk_by_macro["n_aziende"] * 100).round(1)
risk_by_macro["% Medio"] = (risk_by_macro["med_risk"] / risk_by_macro["n_aziende"] * 100).round(1)
risk_by_macro["% Alto"] = (risk_by_macro["high_risk"] / risk_by_macro["n_aziende"] * 100).round(1)
results["10b. Rischio per Macro Area"] = risk_by_macro

# PD per ATECO
risk_by_ateco = (
    df_last.groupby(["ateco_code", "ateco_desc"])
    .agg(
        n_aziende=("ID", "count"),
        pd_media=("probability_of_default_x100", "mean"),
        pd_mediana=("probability_of_default_x100", "median"),
        high_risk=("probability_of_default_x100", lambda x: (x >= 5).sum()),
    )
    .sort_values("n_aziende", ascending=False)
    .reset_index()
)
risk_by_ateco["pd_media"] = risk_by_ateco["pd_media"].round(2)
risk_by_ateco["pd_mediana"] = risk_by_ateco["pd_mediana"].round(2)
risk_by_ateco["% Rischio Alto"] = (risk_by_ateco["high_risk"] / risk_by_ateco["n_aziende"] * 100).round(1)
risk_by_ateco.columns = ["Codice ATECO", "Descrizione", "N. Aziende", "PD Media (%)",
                          "PD Mediana (%)", "N. Rischio Alto", "% Rischio Alto"]
results["10c. Rischio per ATECO"] = risk_by_ateco

# Rating cross per dimensione
rating_by_size = pd.crosstab(
    df_last["size_class"],
    df_last["implied_rating"].apply(lambda x: "Inv. Grade (A-H)" if x in list("ABCDEFGH") else "Spec. Grade (I-R)" if pd.notna(x) else "N/A"),
    margins=True
)
results["10d. Rating per Dimensione"] = rating_by_size.reset_index()

# ─── KPI 11: TREND TEMPORALE ─────────────────────────────────────────────
df_active = df[df["status"] == "Active"].copy()
trend = (
    df_active.groupby("anno")
    .agg(
        n_bilanci=("ID", "count"),
        n_aziende=("ID", "nunique"),
        fatturato_medio=("operating_revenue_turnover", "mean"),
        ebitda_medio=("ebitda", "mean"),
        roe_medio=("roe_using_pel_before_tax_x100", "mean"),
        pd_media=("probability_of_default_x100", "mean"),
        current_ratio_medio=("current_ratio", "mean"),
    )
    .dropna(subset=["n_bilanci"])
    .reset_index()
)
trend.columns = ["Anno", "N. Bilanci", "N. Aziende", "Fatturato Medio (EUR)",
                  "EBITDA Medio (EUR)", "ROE Medio (%)", "PD Media (%)", "Current Ratio Medio"]
for c in ["Fatturato Medio (EUR)", "EBITDA Medio (EUR)"]:
    trend[c] = trend[c].apply(lambda x: f"{x:,.0f}" if pd.notna(x) else "N/A")
for c in ["ROE Medio (%)", "PD Media (%)", "Current Ratio Medio"]:
    trend[c] = trend[c].apply(lambda x: f"{x:.2f}" if pd.notna(x) else "N/A")
results["11. Trend Temporale"] = trend

# ─── KPI 12: TOP E BOTTOM PERFORMERS ───────────────────────────────────────
df_ranked = df_last[
    df_last["operating_revenue_turnover"].notna() &
    (df_last["operating_revenue_turnover"] > 0) &
    df_last["ebitda"].notna()
].copy()

top_rev = (
    df_ranked.nlargest(20, "operating_revenue_turnover")
    [["name", "nuts2", "implied_rating", "operating_revenue_turnover",
      "ebitda", "number_of_employees", "probability_of_default_x100"]]
    .copy()
)
top_rev.columns = ["Azienda", "Regione", "Rating", "Fatturato (EUR)", "EBITDA (EUR)",
                    "Dipendenti", "PD (%)"]
top_rev["Fatturato (EUR)"] = top_rev["Fatturato (EUR)"].apply(lambda x: f"{x:,.0f}")
top_rev["EBITDA (EUR)"] = top_rev["EBITDA (EUR)"].apply(lambda x: f"{x:,.0f}" if pd.notna(x) else "N/A")
top_rev["Dipendenti"] = top_rev["Dipendenti"].apply(lambda x: f"{x:,.0f}" if pd.notna(x) else "N/A")
top_rev["PD (%)"] = top_rev["PD (%)"].apply(lambda x: f"{x:.2f}" if pd.notna(x) else "N/A")
results["12. Top 20 per Fatturato"] = top_rev.reset_index(drop=True)

top_risk = (
    df_last[df_last["probability_of_default_x100"].notna()]
    .nlargest(20, "probability_of_default_x100")
    [["name", "nuts2", "implied_rating", "operating_revenue_turnover",
      "probability_of_default_x100", "status"]]
    .copy()
)
top_risk.columns = ["Azienda", "Regione", "Rating", "Fatturato (EUR)", "PD (%)", "Stato"]
top_risk["Fatturato (EUR)"] = top_risk["Fatturato (EUR)"].apply(
    lambda x: f"{x:,.0f}" if pd.notna(x) else "N/A"
)
top_risk["PD (%)"] = top_risk["PD (%)"].apply(lambda x: f"{x:.2f}")
results["12b. Top 20 Rischio Alto"] = top_risk.reset_index(drop=True)

# ─── BUSINESS RULES ENGINE: CHECK DATI ANOMALI ───────────────────────────
print("  Calcolo Business Rules Engine (check dati anomali)...")

bre_rules = []

# R1: Active + PD >= 10%
_r1 = df_last[(df_last["status"] == "Active") & (df_last["probability_of_default_x100"] >= 10)]
bre_rules.append({"id": "R1", "name": "Aziende attive con PD >= 10%", "severity": "CRITICO",
    "desc": "Aziende attive con probabilit\u00e0 di default molto elevata, da monitorare con urgenza",
    "count": len(_r1), "df": _r1})

# R2: Patrimonio netto negativo
_r2 = df_last[df_last["shareholders_funds"].notna() & (df_last["shareholders_funds"] < 0)]
bre_rules.append({"id": "R2", "name": "Patrimonio netto negativo", "severity": "CRITICO",
    "desc": "Aziende con patrimonio netto negativo, possibile stato di insolvenza tecnica",
    "count": len(_r2), "df": _r2})

# R3: Revenue > 50M ma rating speculativo
_r3 = df_last[(df_last["operating_revenue_turnover"] > 50_000_000) & (df_last["implied_rating"].isin(list("ILMNOPQR")))]
bre_rules.append({"id": "R3", "name": "Fatturato >50M ma rating speculativo", "severity": "ALTO",
    "desc": "Grandi aziende con rating speculativo: possibile disallineamento dimensione/rischio",
    "count": len(_r3), "df": _r3})

# R4: Revenue > 0 ma dipendenti 0 o NaN
_r4 = df_last[(df_last["operating_revenue_turnover"] > 0) & ((df_last["number_of_employees"].isna()) | (df_last["number_of_employees"] == 0))]
bre_rules.append({"id": "R4", "name": "Fatturato >0 ma dipendenti 0/N.D.", "severity": "MEDIO",
    "desc": "Possibile dato mancante o anomalia nella dichiarazione dei dipendenti",
    "count": len(_r4), "df": _r4})

# R5: Current ratio < 0.5
_r5 = df_last[df_last["current_ratio"].notna() & (df_last["current_ratio"] < 0.5) & (df_last["current_ratio"] > 0)]
bre_rules.append({"id": "R5", "name": "Current ratio < 0.5", "severity": "ALTO",
    "desc": "Grave squilibrio di liquidit\u00e0: passivit\u00e0 correnti superano il doppio delle attivit\u00e0 correnti",
    "count": len(_r5), "df": _r5})

# R6: ROE anomalo
_r6 = df_last[df_last["roe_using_pel_before_tax_x100"].notna() & ((df_last["roe_using_pel_before_tax_x100"] > 500) | (df_last["roe_using_pel_before_tax_x100"] < -500))]
bre_rules.append({"id": "R6", "name": "ROE anomalo (>500% o <-500%)", "severity": "MEDIO",
    "desc": "Valori di ROE estremi che possono indicare patrimonio netto molto basso o distorsioni contabili",
    "count": len(_r6), "df": _r6})

# R7: EBITDA negativo con fatturato > 10M
_r7 = df_last[(df_last["ebitda"].notna()) & (df_last["ebitda"] < 0) & (df_last["operating_revenue_turnover"] > 10_000_000)]
bre_rules.append({"id": "R7", "name": "EBITDA negativo con fatturato >10M", "severity": "ALTO",
    "desc": "Aziende di dimensione significativa che non generano marginalit\u00e0 operativa",
    "count": len(_r7), "df": _r7})

# R8: Gearing > 500%
_r8 = df_last[df_last["gearing_x100"].notna() & (df_last["gearing_x100"] > 500)]
bre_rules.append({"id": "R8", "name": "Gearing >500% (leva estrema)", "severity": "CRITICO",
    "desc": "Livello di indebitamento estremo rispetto al patrimonio netto",
    "count": len(_r8), "df": _r8})

bre_summary = pd.DataFrame([{
    "ID": r["id"], "Regola": r["name"], "Severit\u00e0": r["severity"],
    "Descrizione": r["desc"], "N. Aziende Flaggate": r["count"]
} for r in bre_rules])
results["BRE. Business Rules"] = bre_summary

total_flags = sum(r["count"] for r in bre_rules)
critical_flags = sum(r["count"] for r in bre_rules if r["severity"] == "CRITICO")
alto_flags = sum(r["count"] for r in bre_rules if r["severity"] == "ALTO")
print(f"  Business Rules: {total_flags:,} segnalazioni ({critical_flags:,} critiche, {alto_flags:,} alte)")

# Flag "dati buoni": aziende NON flaggate da regole critiche/alte
_flagged_ids = set()
for r in bre_rules:
    if r["severity"] in ("CRITICO", "ALTO"):
        _flagged_ids.update(r["df"]["ID"].tolist())
df_last["_bre_clean"] = ~df_last["ID"].isin(_flagged_ids)
_n_clean = df_last["_bre_clean"].sum()
print(f"  Dati 'buoni' (no flag critici/alti): {_n_clean:,} / {n_total:,} ({_n_clean/n_total*100:.1f}%)")


# ── 4. EXPORT EXCEL ─────────────────────────────────────────────────────────
print("\n[4/7] Esportazione Excel...")
excel_path = os.path.join(OUTPUT_DIR, "kpi_farmaceutico.xlsx")
with pd.ExcelWriter(excel_path, engine="openpyxl") as writer:
    for sheet_name, data in results.items():
        safe_name = sheet_name.replace("/", "-")[:31]
        data.to_excel(writer, sheet_name=safe_name, index=False)
print(f"  Salvato: {excel_path}")


# ════════════════════════════════════════════════════════════════════════════
# ── 4b. MODELLO MICROECONOMETRICO COMPORTAMENTALE ─────────────────────────
# ════════════════════════════════════════════════════════════════════════════
print("\n[4b/7] Modello Microeconometrico Comportamentale...")

try:
    from linearmodels.panel import PanelOLS, FirstDifferenceOLS
    from statsmodels.regression.quantile_regression import QuantReg
    from lifelines import CoxPHFitter
    import statsmodels.api as sm
    ECON_AVAILABLE = True
except ImportError:
    ECON_AVAILABLE = False
    print("  ATTENZIONE: pacchetti econometrici non installati, sezione saltata")

econ_models = {}
econ_elasticities = []
econ_scenarios = []
econ_did = {}
econ_survival = {}
econ_quantile = {}

if ECON_AVAILABLE:
    # ── Costruzione panel ──
    print("  Costruzione panel...")
    df_panel = df[df["status"] == "Active"].copy()
    df_panel = df_panel.dropna(subset=["anno", "ID"])
    df_panel["anno"] = df_panel["anno"].astype(int)
    df_panel = df_panel.sort_values(["ID", "anno", "closing_date"], ascending=[True, True, False])
    df_panel = df_panel.drop_duplicates(subset=["ID", "anno"], keep="first")
    obs_per_firm = df_panel.groupby("ID").size()
    firms_2plus = obs_per_firm[obs_per_firm >= 2].index
    df_panel = df_panel[df_panel["ID"].isin(firms_2plus)].copy()
    df_panel = df_panel.sort_values(["ID", "anno"])

    n_panel_obs = len(df_panel)
    n_panel_firms = df_panel["ID"].nunique()
    print(f"  Panel: {n_panel_obs:,} obs, {n_panel_firms:,} imprese")

    # ── Variabili derivate ──
    g = df_panel.groupby("ID")
    df_panel["fixed_assets_lag"] = g["fixed_assets"].shift(1)
    df_panel["inv_rate"] = (df_panel["fixed_assets"] - df_panel["fixed_assets_lag"]) / df_panel["fixed_assets_lag"].abs().replace(0, np.nan)
    df_panel["ln_employees"] = np.log(df_panel["number_of_employees"].replace(0, np.nan))
    df_panel["ln_employees_lag"] = g["ln_employees"].shift(1)
    df_panel["emp_growth"] = df_panel["ln_employees"] - df_panel["ln_employees_lag"]
    df_panel["ln_revenue"] = np.log(df_panel["operating_revenue_turnover"].clip(lower=1))
    df_panel["ln_revenue_lag"] = g["ln_revenue"].shift(1)
    df_panel["output_growth"] = df_panel["ln_revenue"] - df_panel["ln_revenue_lag"]
    df_panel["cf_ratio"] = df_panel["cash_flow"] / df_panel["total_assets"].replace(0, np.nan)
    df_panel["leverage"] = df_panel["gearing_x100"]
    df_panel["eff_tax_rate"] = df_panel["taxation"].abs() / df_panel["pel_before_tax"].abs().replace(0, np.nan)
    df_panel["eff_tax_rate"] = df_panel["eff_tax_rate"].clip(0, 1)
    df_panel["eff_tax_rate_lag"] = g["eff_tax_rate"].shift(1)
    df_panel["tax_shock"] = df_panel["eff_tax_rate"] - df_panel["eff_tax_rate_lag"]
    df_panel["total_debt"] = df_panel["long_term_debt"].fillna(0) + df_panel["loans"].fillna(0)
    df_panel["user_cost_capital"] = df_panel["interest_paid"].abs() / df_panel["total_debt"].replace(0, np.nan)
    df_panel["user_cost_capital"] = df_panel["user_cost_capital"].clip(0, 1)
    df_panel["wage_cost"] = df_panel["costs_of_employees"] / df_panel["number_of_employees"].replace(0, np.nan)
    df_panel["ln_rd"] = np.log(df_panel["intangible_fixed_assets"].clip(lower=1))
    df_panel["ln_va"] = np.log(df_panel["added_value"].clip(lower=1))
    df_panel["profitability"] = df_panel["ebitda_margin_x100"]
    df_panel["demand"] = df_panel["output_growth"]
    df_panel["is_large"] = (df_panel["operating_revenue_turnover"] > 10_000_000).astype(int)
    df_panel["is_micro"] = (df_panel["operating_revenue_turnover"] <= 2_000_000).astype(int)
    df_panel["post_2020"] = (df_panel["anno"] >= 2020).astype(int)
    df_panel["post_2022"] = (df_panel["anno"] >= 2022).astype(int)
    df_panel["is_group"] = df_panel["standardised_legal_form"].isin(["Public limited company", "Public limited companies"]).astype(int)
    df_panel["is_nord"] = (df_panel["macro_area"] == "Nord").astype(int)
    df_panel["is_sud"] = (df_panel["macro_area"] == "Sud e Isole").astype(int)
    df_panel["ln_ebit"] = np.log(df_panel["operating_pel_ebit"].clip(lower=1))
    df_panel["ln_wage"] = np.log(df_panel["wage_cost"].clip(lower=1))

    # Winsorize
    def winsorize_col(s, lo=0.01, hi=0.99):
        valid = s.dropna()
        if len(valid) < 100:
            return s
        return s.clip(valid.quantile(lo), valid.quantile(hi))
    for c in ["inv_rate", "emp_growth", "output_growth", "cf_ratio", "leverage", "tax_shock", "user_cost_capital", "profitability"]:
        df_panel[c] = winsorize_col(df_panel[c])

    df_pidx = df_panel.set_index(["ID", "anno"])

    # ── Stima FE Panel Models ──
    print("  Stima modelli Fixed Effects...")
    def run_fe(dep, indeps, data, name):
        try:
            sub = data[[dep] + indeps].dropna()
            if len(sub) < 100 or sub.index.get_level_values(0).nunique() < 30:
                return None
            mod = PanelOLS(sub[dep], sub[indeps], entity_effects=True, time_effects=True, drop_absorbed=True, check_rank=False)
            res = mod.fit(cov_type="clustered", cluster_entity=True)
            print(f"    [{name}] N={len(sub):,}, R²={res.rsquared:.4f}")
            return {"name": name, "n_obs": int(res.nobs), "n_ent": int(sub.index.get_level_values(0).nunique()),
                    "r2": float(res.rsquared),
                    "coefs": {v: {"b": float(res.params[v]), "se": float(res.std_errors[v]),
                                   "t": float(res.tstats[v]), "p": float(res.pvalues[v])} for v in indeps if v in res.params.index}}
        except Exception as e:
            print(f"    [{name}] ERRORE: {e}")
            return None

    m1 = run_fe("inv_rate", ["tax_shock", "user_cost_capital", "demand", "cf_ratio", "leverage"], df_pidx, "M1: Investimento (I/K)")
    if m1: econ_models["M1"] = m1
    m2 = run_fe("emp_growth", ["tax_shock", "output_growth", "profitability", "is_large"], df_pidx, "M2: Occupazione (ΔlnL)")
    if m2: econ_models["M2"] = m2
    m3 = run_fe("ln_rd", ["eff_tax_rate", "profitability", "is_group", "is_large"], df_pidx, "M3: R&D (ln intangibili)")
    if m3: econ_models["M3"] = m3
    m4 = run_fe("ln_ebit", ["ln_employees", "ln_rd", "is_large", "is_nord", "is_sud"], df_pidx, "M4: EBIT/Produttività")
    if m4: econ_models["M4"] = m4
    m5 = run_fe("ln_va", ["ln_employees", "profitability", "cf_ratio"], df_pidx, "M5: Valore Aggiunto")
    if m5: econ_models["M5"] = m5
    m6 = run_fe("ln_wage", ["profitability", "is_large", "ln_revenue", "is_nord", "is_sud"], df_pidx, "M6: Salari (ln W/L)")
    if m6: econ_models["M6"] = m6

    # ── Quantile Regressions ──
    print("  Quantile Regressions...")
    def run_qr(dep, indeps, data, name, quantiles=[0.10, 0.25, 0.50, 0.75, 0.90]):
        try:
            sub = data[[dep] + indeps].dropna()
            if len(sub) < 200:
                return None
            y = sub[dep].values
            X = sm.add_constant(sub[indeps].values)
            vnames = ["const"] + indeps
            qres = {}
            for q in quantiles:
                r = QuantReg(y, X).fit(q=q, max_iter=500)
                qres[f"q{int(q*100)}"] = {vnames[i]: {"b": float(r.params[i]), "p": float(r.pvalues[i])} for i in range(len(vnames))}
            print(f"    [{name}] N={len(sub):,}")
            return {"name": name, "n": len(sub), "qr": qres}
        except Exception as e:
            print(f"    [{name}] ERRORE: {e}")
            return None

    qr1 = run_qr("inv_rate", ["tax_shock", "demand", "cf_ratio", "leverage"], df_panel, "QR: Investimento")
    if qr1: econ_quantile["QR1"] = qr1
    qr2 = run_qr("emp_growth", ["output_growth", "profitability", "is_large"], df_panel, "QR: Occupazione")
    if qr2: econ_quantile["QR2"] = qr2

    # ── Difference-in-Differences ──
    print("  Difference-in-Differences...")
    def run_did(dep, treat, post, controls, data, name):
        try:
            data = data.copy()
            data["did_int"] = data[treat] * data[post]
            allv = [dep, treat, post, "did_int"] + controls
            sub = data[allv].dropna()
            if len(sub) < 200:
                return None
            y = sub[dep]
            X = sm.add_constant(sub[[treat, post, "did_int"] + controls])
            r = sm.OLS(y, X).fit(cov_type="HC1")
            did_b = float(r.params["did_int"])
            did_p = float(r.pvalues["did_int"])
            print(f"    [{name}] DiD={did_b:.4f} (p={did_p:.4f})")
            return {"name": name, "n": len(sub), "did_b": did_b, "did_se": float(r.bse["did_int"]),
                    "did_t": float(r.tvalues["did_int"]), "did_p": did_p, "r2": float(r.rsquared)}
        except Exception as e:
            print(f"    [{name}] ERRORE: {e}")
            return None

    d1 = run_did("output_growth", "is_micro", "post_2020", ["leverage", "cf_ratio"], df_panel, "COVID su fatturato (micro vs grandi)")
    if d1: econ_did["D1"] = d1
    d2 = run_did("emp_growth", "is_micro", "post_2020", ["output_growth"], df_panel, "COVID su occupazione")
    if d2: econ_did["D2"] = d2
    d3 = run_did("profitability", "is_sud", "post_2022", ["is_large", "leverage"], df_panel, "Crisi energetica su EBITDA (Sud vs Nord)")
    if d3: econ_did["D3"] = d3

    # ── Survival Model ──
    print("  Survival model (Cox PH)...")
    try:
        df_surv = df.copy()
        df_surv["anno_n"] = pd.to_numeric(df_surv["anno"], errors="coerce")
        exit_st = ["Dissolved", "Dissolved (bankruptcy)", "Dissolved (liquidation)", "Dissolved (merger or take-over)", "Bankruptcy", "In liquidation"]
        df_surv["is_exit"] = df_surv["status"].isin(exit_st).astype(int)
        df_surv_last = df_surv.sort_values(["ID", "anno_n"]).drop_duplicates(subset="ID", keep="last")
        df_surv_first = df_surv.sort_values(["ID", "anno_n"]).drop_duplicates(subset="ID", keep="first")
        surv_d = pd.DataFrame({"ID": df_surv_last["ID"].values, "event": df_surv_last["is_exit"].values,
            "duration": (df_surv_last["anno_n"].values - df_surv_first.set_index("ID").loc[df_surv_last["ID"].values, "anno_n"].values).astype(float)})
        for c in ["operating_revenue_turnover", "probability_of_default_x100", "gearing_x100", "ebitda_margin_x100"]:
            surv_d[c] = pd.to_numeric(df_surv_last[c].values, errors="coerce")
        surv_d["macro_nord"] = (df_surv_last["macro_area"].values == "Nord").astype(int)
        surv_d["is_large_s"] = (surv_d["operating_revenue_turnover"] > 10_000_000).astype(int)
        surv_d = surv_d[surv_d["duration"] > 0].dropna(subset=["duration", "event", "probability_of_default_x100"])
        surv_d["ln_rev"] = np.log(surv_d["operating_revenue_turnover"].clip(lower=1))
        for c in ["gearing_x100", "ebitda_margin_x100"]:
            q1, q99 = surv_d[c].quantile(0.01), surv_d[c].quantile(0.99)
            surv_d[c] = surv_d[c].clip(q1, q99)
        cox_vars = ["ln_rev", "probability_of_default_x100", "gearing_x100", "ebitda_margin_x100", "macro_nord", "is_large_s"]
        cox_d = surv_d[["duration", "event"] + cox_vars].dropna()
        if len(cox_d) >= 100:
            cph = CoxPHFitter()
            cph.fit(cox_d, duration_col="duration", event_col="event", show_progress=False)
            econ_survival = {"n": len(cox_d), "events": int(cox_d["event"].sum()), "c_idx": float(cph.concordance_index_),
                "coefs": {v: {"b": float(cph.params_[v]), "hr": float(np.exp(cph.params_[v])),
                              "se": float(cph.standard_errors_[v]), "p": float(cph.summary["p"][v])} for v in cox_vars}}
            print(f"    Cox PH: N={len(cox_d):,}, events={int(cox_d['event'].sum())}, C={cph.concordance_index_:.3f}")
    except Exception as e:
        print(f"    Survival ERRORE: {e}")

    # ── Estrazione elasticità ──
    print("  Estrazione elasticità...")
    def add_elas(mk, var, label, interp):
        if mk in econ_models and var in econ_models[mk]["coefs"]:
            c = econ_models[mk]["coefs"][var]
            sig = "***" if c["p"] < 0.01 else "**" if c["p"] < 0.05 else "*" if c["p"] < 0.1 else ""
            econ_elasticities.append({"model": econ_models[mk]["name"], "var": var, "label": label,
                "b": c["b"], "se": c["se"], "t": c["t"], "p": c["p"], "sig": sig, "interp": interp})
            return c["b"]
        return None

    _e = {}
    _e["inv_tax"] = add_elas("M1", "tax_shock", "Investimento ← shock fiscale", "Δ(I/K) per 1pp di pressione fiscale")
    _e["inv_demand"] = add_elas("M1", "demand", "Investimento ← domanda", "Δ(I/K) per 1pp di crescita fatturato")
    _e["inv_cf"] = add_elas("M1", "cf_ratio", "Investimento ← cash flow", "Sensibilità dell'investimento alla liquidità")
    _e["inv_ucc"] = add_elas("M1", "user_cost_capital", "Investimento ← costo capitale", "Δ(I/K) per 1pp di costo del debito")
    _e["emp_output"] = add_elas("M2", "output_growth", "Occupazione ← crescita output", "ΔlnL per 1pp di crescita fatturato")
    _e["emp_tax"] = add_elas("M2", "tax_shock", "Occupazione ← shock fiscale", "Effetto fiscale sull'occupazione")
    _e["rd_tax"] = add_elas("M3", "eff_tax_rate", "R&D ← pressione fiscale", "Δln(intangibili) per 1pp di tax rate")
    _e["rd_profit"] = add_elas("M3", "profitability", "R&D ← profittabilità", "Addizionalità dei margini su innovazione")
    _e["ebit_emp"] = add_elas("M4", "ln_employees", "EBIT ← occupazione", "Contributo del lavoro alla produttività")
    _e["ebit_rd"] = add_elas("M4", "ln_rd", "EBIT ← R&D", "Contributo innovazione alla produttività")
    _e["va_emp"] = add_elas("M5", "ln_employees", "VA ← occupazione", "Elasticità lavoro-valore aggiunto")
    _e["va_profit"] = add_elas("M5", "profitability", "VA ← profittabilità", "Legame margini-valore aggiunto")
    _e["wage_profit"] = add_elas("M6", "profitability", "Salari ← profittabilità", "Rent sharing (trasmissione profitti a salari)")
    _e["wage_size"] = add_elas("M6", "is_large", "Salari ← dimensione", "Premio salariale grandi imprese")
    print(f"  Elasticità estratte: {len(econ_elasticities)}")

    # ── Default elasticità per scenari ──
    E = {k: (v if v is not None else d) for k, d, v in [
        ("inv_tax", -0.15, _e.get("inv_tax")), ("inv_demand", 0.20, _e.get("inv_demand")),
        ("inv_cf", 0.10, _e.get("inv_cf")), ("emp_output", 0.30, _e.get("emp_output")),
        ("rd_tax", -0.20, _e.get("rd_tax")), ("rd_profit", 0.15, _e.get("rd_profit")),
        ("va_emp", 0.60, _e.get("va_emp")), ("va_profit", 0.10, _e.get("va_profit")),
        ("wage_profit", 0.02, _e.get("wage_profit")),
    ]}

    # ── Scenario Simulation Engine ──
    print("  Simulazione scenari micro-to-macro...")

    def run_scenario(name, desc, apply_fn):
        df_s = df_last.copy()
        apply_fn(df_s)
        agg = {"name": name, "desc": desc, "n": int(n_total)}
        for m, c in [("d_va", "delta_va"), ("d_emp", "delta_emp"), ("d_inv", "delta_inv"),
                      ("d_rd", "delta_rd"), ("d_wage", "delta_wage"), ("cost", "fiscal_cost"),
                      ("tax_new", "tax_new"), ("contrib", "contrib_new"), ("iva", "iva_new")]:
            agg[m] = float(df_s[c].sum()) if c in df_s.columns else 0.0
        agg["saldo_fp"] = agg["tax_new"] + agg["contrib"] + agg["iva"] - agg["cost"]
        # By macro
        agg["by_macro"] = df_s.groupby("macro_area").agg(d_va=("delta_va", "sum"), d_emp=("delta_emp", "sum"),
            n=("ID", "count")).reset_index().to_dict("records") if "delta_va" in df_s.columns else []
        # By size
        agg["by_size"] = df_s.groupby("size_class").agg(d_va=("delta_va", "sum"), d_emp=("delta_emp", "sum"),
            n=("ID", "count")).reset_index().to_dict("records") if "delta_va" in df_s.columns else []
        return agg

    def sc_rd_credit(df_s):
        has = df_s["intangible_fixed_assets"].notna() & (df_s["intangible_fixed_assets"] > 0)
        tax_relief = 0.10
        d_rd = E["rd_tax"] * (-tax_relief)
        df_s["delta_rd"] = 0.0; df_s.loc[has, "delta_rd"] = df_s.loc[has, "intangible_fixed_assets"] * d_rd
        df_s["delta_emp"] = 0.0; df_s.loc[has, "delta_emp"] = df_s.loc[has, "number_of_employees"].fillna(0) * abs(d_rd) * E["emp_output"] * 0.3
        df_s["delta_va"] = 0.0; df_s.loc[has, "delta_va"] = df_s.loc[has, "added_value"].fillna(0) * abs(d_rd) * E["va_profit"]
        df_s["delta_inv"] = 0.0; df_s.loc[has, "delta_inv"] = df_s.loc[has, "fixed_assets"].fillna(0) * abs(d_rd) * 0.5
        df_s["delta_wage"] = df_s["delta_emp"] * df_s["average_cost_of_employee"].fillna(30000)
        df_s["fiscal_cost"] = 0.0; df_s.loc[has, "fiscal_cost"] = df_s.loc[has, "intangible_fixed_assets"] * tax_relief
        df_s["tax_new"] = df_s["delta_va"] * 0.24
        df_s["contrib_new"] = df_s["delta_wage"] * 0.33
        df_s["iva_new"] = df_s["delta_va"] * 0.10

    def sc_cuneo(df_s):
        has = df_s["number_of_employees"].notna() & (df_s["number_of_employees"] > 0)
        cut = 0.05
        df_s["delta_rd"] = 0.0
        df_s["fiscal_cost"] = 0.0; df_s.loc[has, "fiscal_cost"] = df_s.loc[has, "costs_of_employees"].fillna(0) * cut
        df_s["delta_emp"] = 0.0; df_s.loc[has, "delta_emp"] = df_s.loc[has, "number_of_employees"] * cut * abs(E["emp_output"]) * 0.5
        df_s["delta_va"] = df_s["delta_emp"] * df_s["operating_revenue_per_employee"].fillna(50000) * 0.3
        df_s["delta_inv"] = df_s["fiscal_cost"] * abs(E["inv_cf"]) * 0.3
        df_s["delta_wage"] = df_s["delta_emp"] * df_s["average_cost_of_employee"].fillna(30000)
        df_s["tax_new"] = df_s["delta_va"] * 0.24
        df_s["contrib_new"] = df_s["delta_emp"] * df_s["average_cost_of_employee"].fillna(30000) * 0.33
        df_s["iva_new"] = df_s["delta_va"] * 0.08

    def sc_domanda(df_s):
        shock = 0.20; share = 0.4
        df_s["delta_rd"] = df_s["intangible_fixed_assets"].fillna(0) * shock * share * abs(E["rd_profit"]) * 0.3
        df_s["delta_inv"] = df_s["fixed_assets"].fillna(0) * shock * share * abs(E["inv_demand"])
        df_s["delta_emp"] = df_s["number_of_employees"].fillna(0) * shock * share * E["emp_output"] * 0.5
        df_s["delta_va"] = df_s["operating_revenue_turnover"].fillna(0) * shock * share * 0.35
        df_s["fiscal_cost"] = df_s["operating_revenue_turnover"].fillna(0) * shock * share
        df_s["delta_wage"] = df_s["delta_emp"] * df_s["average_cost_of_employee"].fillna(30000)
        df_s["tax_new"] = df_s["delta_va"] * 0.24
        df_s["contrib_new"] = df_s["delta_wage"] * 0.33
        df_s["iva_new"] = df_s["delta_va"] * 0.10

    def sc_energy(df_s):
        en_pct = 0.08; shock = 0.30
        cost_inc = df_s["other_operating_expenses"].fillna(0) * en_pct * shock
        df_s["delta_va"] = -cost_inc * 0.7
        df_s["delta_inv"] = -df_s["fixed_assets"].fillna(0) * shock * en_pct * abs(E["inv_cf"])
        df_s["delta_emp"] = -df_s["number_of_employees"].fillna(0) * shock * en_pct * E["emp_output"] * 0.3
        df_s["delta_rd"] = -df_s["intangible_fixed_assets"].fillna(0) * shock * en_pct * 0.2
        df_s["delta_wage"] = df_s["delta_emp"] * df_s["average_cost_of_employee"].fillna(30000)
        df_s["fiscal_cost"] = 0.0
        df_s["tax_new"] = df_s["delta_va"] * 0.24
        df_s["contrib_new"] = df_s["delta_wage"] * 0.33
        df_s["iva_new"] = df_s["delta_va"] * 0.10

    _sc_firm_cols = []  # per salvare colonne scenario in df_last
    for sc_idx, (sc_name, sc_desc, sc_fn) in enumerate([
        ("Credito R&D +10pp", "+10pp credito d'imposta su R&D e intangibili", sc_rd_credit),
        ("Cuneo fiscale -5pp", "-5pp di cuneo fiscale sul costo del lavoro", sc_cuneo),
        ("Domanda pubblica +20%", "+20% domanda pubblica farmaceutica (SSN)", sc_domanda),
        ("Shock energetico +30%", "+30% costo energia (scenario avverso)", sc_energy),
    ]):
        sc_res = run_scenario(sc_name, sc_desc, sc_fn)
        econ_scenarios.append(sc_res)
        # Salva delta per-impresa in df_last per filtri dinamici
        df_s = df_last.copy()
        sc_fn(df_s)
        for col_name in ["delta_va", "delta_emp", "delta_inv", "fiscal_cost", "tax_new", "contrib_new", "iva_new"]:
            target = f"_sc{sc_idx}_{col_name}"
            df_last[target] = df_s[col_name].fillna(0).values if col_name in df_s.columns else 0.0
            _sc_firm_cols.append(target)
        print(f"    {sc_name}: ΔVA={sc_res['d_va']/1e6:+,.1f}M, ΔEmp={sc_res['d_emp']:+,.0f}, Saldo FP={sc_res['saldo_fp']/1e6:+,.1f}M")

    print(f"  Modello completato: {len(econ_models)} modelli, {len(econ_elasticities)} elasticità, {len(econ_scenarios)} scenari")
else:
    n_panel_obs = 0
    n_panel_firms = 0

# ── 4c. DRILL-DOWN DATA PER SEZIONI ECONOMETRICHE ────────────────────────
dd_econ_fe = {}
dd_econ_elas = {}
dd_econ_qr = {}
dd_econ_did = {}
dd_econ_surv = {}
dd_econ_sc = {}

if ECON_AVAILABLE and len(econ_models) > 0:
    print("  Preparazione drill-down econometrico...")
    dep_vars = {"M1": "inv_rate", "M2": "emp_growth", "M3": "ln_rd",
                "M4": "ln_ebit", "M5": "ln_va", "M6": "ln_wage"}
    dep_labels = {"M1": "Tasso Investimento", "M2": "Crescita Occupazione",
                  "M3": "ln(R&D)", "M4": "ln(EBIT)", "M5": "ln(VA)", "M6": "ln(Salari)"}

    # Lookup ATECO codes nel panel
    _panel_ateco_map = df_panel.groupby("ateco_code")["ateco_desc"].first().to_dict()
    _panel_ateco_codes = sorted(_panel_ateco_map.keys())

    # Panel FE drill-down: per modello → ATECO → macro area → regione
    for mk in dep_vars:
        if mk not in econ_models or not econ_models[mk]:
            continue
        dv = dep_vars[mk]
        sub_all = df_panel[df_panel[dv].notna()].copy()
        if len(sub_all) == 0:
            continue
        # L0: ATECO
        ateco_agg_fe = sub_all.groupby("ateco_code").agg(
            n_imp=("ID", "nunique"), dep_mean=(dv, "mean"),
            dep_std=(dv, "std"), rev_mean=("operating_revenue_turnover", "mean")
        ).sort_values("n_imp", ascending=False).reset_index()
        l0_rows = []
        l1_next = {}
        for _, ar in ateco_agg_fe.iterrows():
            ac = str(ar["ateco_code"])
            adesc = str(_panel_ateco_map.get(ac, ""))[:40]
            l0_rows.append({"k": ac, "c": [ac, adesc, f'{int(ar["n_imp"]):,}',
                            f'{ar["dep_mean"]:.4f}', f'EUR {ar["rev_mean"]:,.0f}']})
            # L1: macro area dentro ATECO
            sub = sub_all[sub_all["ateco_code"] == ac]
            macro_agg = sub.groupby("macro_area").agg(
                n_imp=("ID", "nunique"), dep_mean=(dv, "mean"),
                rev_mean=("operating_revenue_turnover", "mean")
            ).sort_values("n_imp", ascending=False).reset_index()
            l1_rows_inner = []
            l2_next = {}
            for _, rr in macro_agg.iterrows():
                ma = str(rr["macro_area"])
                l1_rows_inner.append({"k": ma, "c": [ma, f'{int(rr["n_imp"]):,}',
                                f'{rr["dep_mean"]:.4f}', f'EUR {rr["rev_mean"]:,.0f}']})
                reg_agg = sub[sub["macro_area"] == ma].groupby("regione").agg(
                    n_imp=("ID", "nunique"), dep_mean=(dv, "mean"),
                    rev_mean=("operating_revenue_turnover", "mean")
                ).sort_values("n_imp", ascending=False).head(10).reset_index()
                l2_next[ma] = {
                    "h": ["Regione", "N. Imprese", f"Media {dep_labels[mk]}", "Fatturato Medio"],
                    "r": [{"c": [str(r2["regione"]), f'{int(r2["n_imp"]):,}',
                                 f'{r2["dep_mean"]:.4f}', f'EUR {r2["rev_mean"]:,.0f}']}
                          for _, r2 in reg_agg.iterrows()]
                }
            l1_next[ac] = {
                "h": ["Macro Area", "N. Imprese", f"Media {dep_labels[mk]}", "Fatturato Medio"],
                "r": l1_rows_inner, "next": l2_next
            }
        dd_econ_fe[mk] = {
            "h": ["Codice ATECO", "Descrizione", "N. Imprese", f"Media {dep_labels[mk]}", "Fatturato Medio"],
            "r": l0_rows, "next": l1_next
        }

    # Elasticità drill-down: per elasticità → ATECO → classe dimensionale
    for i, e in enumerate(econ_elasticities):
        ekey = f"E{i}"
        for mk, ml in dep_vars.items():
            if mk in e.get("model", ""):
                dv = ml
                break
        else:
            dv = "inv_rate"
        sub_all = df_panel[df_panel[dv].notna()].copy()
        if len(sub_all) == 0:
            continue
        sub_all["size_label"] = sub_all["operating_revenue_turnover"].apply(
            lambda x: "Grande (>50M)" if x > 50e6 else "Media (10-50M)" if x > 10e6 else "Piccola (2-10M)" if x > 2e6 else "Micro (<2M)")
        ateco_agg_e = sub_all.groupby("ateco_code").agg(
            n_imp=("ID", "nunique"), dep_mean=(dv, "mean")
        ).sort_values("n_imp", ascending=False).reset_index()
        l0_rows = []
        l1_next = {}
        for _, ar in ateco_agg_e.iterrows():
            ac = str(ar["ateco_code"])
            adesc = str(_panel_ateco_map.get(ac, ""))[:40]
            l0_rows.append({"k": ac, "c": [ac, adesc, f'{int(ar["n_imp"]):,}', f'{ar["dep_mean"]:.4f}']})
            sub_at = sub_all[sub_all["ateco_code"] == ac]
            sz_agg = sub_at.groupby("size_label").agg(
                n_imp=("ID", "nunique"), dep_mean=(dv, "mean")
            ).reset_index()
            l1_next[ac] = {
                "h": ["Fascia Dimensionale", "N. Imprese", "Media Var. Dipendente"],
                "r": [{"c": [str(r2["size_label"]), f'{int(r2["n_imp"]):,}', f'{r2["dep_mean"]:.4f}']}
                      for _, r2 in sz_agg.iterrows()]
            }
        dd_econ_elas[ekey] = {
            "h": ["Codice ATECO", "Descrizione", "N. Imprese", "Media Var. Dip."],
            "r": l0_rows, "next": l1_next
        }

    # QR drill-down: invariato (non ha senso ATECO per coefficienti di regressione)
    for qi, (qk, qv) in enumerate(econ_quantile.items()):
        qkey = f"QR{qi}"
        qkeys_sorted = sorted(qv["qr"].keys())
        vlist = [v for v in qv["qr"][qkeys_sorted[0]].keys() if v != "const"]
        for tau_key in qkeys_sorted:
            tkey = f"{qkey}_{tau_key}"
            rows = []
            for var in vlist:
                c = qv["qr"][tau_key][var]
                sig = "***" if c["p"] < 0.01 else "**" if c["p"] < 0.05 else "*" if c["p"] < 0.1 else ""
                rows.append({"c": [var, f'{c["b"]:.6f}', f'{c["p"]:.4f}', sig]})
            dd_econ_qr[tkey] = {
                "h": ["Variabile", "Coefficiente", "p-value", "Sig."],
                "r": rows
            }

    # DiD drill-down: per shock → ATECO → macro area
    for dk, dv_did in econ_did.items():
        sub_all = df_panel.copy()
        ateco_agg_did = sub_all.groupby("ateco_code").agg(
            n_imp=("ID", "nunique"),
            rev_mean=("operating_revenue_turnover", "mean"),
            emp_mean=("number_of_employees", "mean")
        ).sort_values("n_imp", ascending=False).reset_index()
        l0_rows = []
        l1_next = {}
        for _, ar in ateco_agg_did.iterrows():
            ac = str(ar["ateco_code"])
            adesc = str(_panel_ateco_map.get(ac, ""))[:40]
            l0_rows.append({"k": ac, "c": [ac, adesc, f'{int(ar["n_imp"]):,}',
                            f'EUR {ar["rev_mean"]:,.0f}', f'{ar["emp_mean"]:.1f}']})
            sub_at = sub_all[sub_all["ateco_code"] == ac]
            macro_agg = sub_at.groupby("macro_area").agg(
                n_imp=("ID", "nunique"),
                rev_mean=("operating_revenue_turnover", "mean"),
                emp_mean=("number_of_employees", "mean")
            ).sort_values("n_imp", ascending=False).reset_index()
            l1_next[ac] = {
                "h": ["Macro Area", "N. Imprese", "Fatturato Medio", "Dipendenti Medi"],
                "r": [{"c": [str(r2["macro_area"]), f'{int(r2["n_imp"]):,}',
                             f'EUR {r2["rev_mean"]:,.0f}', f'{r2["emp_mean"]:.1f}']}
                      for _, r2 in macro_agg.iterrows()]
            }
        dd_econ_did[dk] = {
            "h": ["Codice ATECO", "Descrizione", "N. Imprese", "Fatturato Medio", "Dipendenti Medi"],
            "r": l0_rows, "next": l1_next
        }

    # Survival drill-down: ATECO → terzile di rischio PD
    if econ_survival:
        surv_sub = df_last.copy()
        _pd_vals = surv_sub["probability_of_default_x100"].dropna()
        if len(_pd_vals) > 0:
            q33 = _pd_vals.quantile(0.33)
            q66 = _pd_vals.quantile(0.66)
            surv_sub["risk_tier"] = surv_sub["probability_of_default_x100"].apply(
                lambda x: "Basso (<{:.1f}%)".format(q33) if pd.notna(x) and x <= q33
                else "Medio ({:.1f}-{:.1f}%)".format(q33, q66) if pd.notna(x) and x <= q66
                else "Alto (>{:.1f}%)".format(q66) if pd.notna(x) else "N/A")
            _surv_ateco_map = surv_sub.groupby("ateco_code")["ateco_desc"].first().to_dict()
            ateco_agg_surv = surv_sub[surv_sub["risk_tier"] != "N/A"].groupby("ateco_code").agg(
                n_imp=("ID", "nunique"),
                pd_mean=("probability_of_default_x100", "mean"),
                rev_mean=("operating_revenue_turnover", "mean"),
                exit_rate=("status", lambda x: (x != "Active").mean() * 100)
            ).sort_values("n_imp", ascending=False).reset_index()
            l0_rows = []
            l1_next = {}
            for _, ar in ateco_agg_surv.iterrows():
                ac = str(ar["ateco_code"])
                adesc = str(_surv_ateco_map.get(ac, ""))[:40]
                l0_rows.append({"k": ac, "c": [ac, adesc, f'{int(ar["n_imp"]):,}',
                                f'{ar["pd_mean"]:.2f}%', f'{ar["exit_rate"]:.1f}%']})
                sub_at = surv_sub[(surv_sub["ateco_code"] == ac) & (surv_sub["risk_tier"] != "N/A")]
                tier_agg = sub_at.groupby("risk_tier").agg(
                    n_imp=("ID", "nunique"),
                    pd_mean=("probability_of_default_x100", "mean"),
                    rev_mean=("operating_revenue_turnover", "mean"),
                    exit_rate=("status", lambda x: (x != "Active").mean() * 100)
                ).reset_index()
                l1_next[ac] = {
                    "h": ["Terzile Rischio", "N. Imprese", "PD Media (%)", "Fatturato Medio", "Tasso Exit (%)"],
                    "r": [{"c": [str(r2["risk_tier"]), f'{int(r2["n_imp"]):,}',
                                 f'{r2["pd_mean"]:.2f}', f'EUR {r2["rev_mean"]:,.0f}',
                                 f'{r2["exit_rate"]:.1f}%']}
                          for _, r2 in tier_agg.iterrows()]
                }
            dd_econ_surv["cox"] = {
                "h": ["Codice ATECO", "Descrizione", "N. Imprese", "PD Media (%)", "Tasso Exit (%)"],
                "r": l0_rows, "next": l1_next
            }

    # Scenario drill-down: per scenario → ATECO → macro area → size class
    for si, sc in enumerate(econ_scenarios):
        skey = f"SC{si}"
        if sc.get("by_macro"):
            # L0: ATECO summary (usa dati aggregati da df_last per questo)
            _sc_ateco_agg = df_last.groupby("ateco_code").agg(
                n_imp=("ID", "nunique"),
                rev_mean=("operating_revenue_turnover", "mean")
            ).sort_values("n_imp", ascending=False).reset_index()
            _sc_ateco_map = df_last.groupby("ateco_code")["ateco_desc"].first().to_dict()
            l0_rows = []
            l1_next = {}
            for _, ar in _sc_ateco_agg.iterrows():
                ac = str(ar["ateco_code"])
                adesc = str(_sc_ateco_map.get(ac, ""))[:40]
                l0_rows.append({"k": ac, "c": [ac, adesc, f'{int(ar["n_imp"]):,}',
                                f'EUR {ar["rev_mean"]:,.0f}']})
                # L1: macro area (stessi dati globali dello scenario, non per-ATECO)
                l1_rows_inner = []
                l2_next = {}
                for bm in sc["by_macro"]:
                    ma = str(bm.get("macro_area", "N/A"))
                    l1_rows_inner.append({"k": ma, "c": [ma, f'{int(bm.get("n", 0)):,}',
                                    f'EUR {bm.get("d_va", 0)/1e6:+,.1f} Mln',
                                    f'{bm.get("d_emp", 0):+,.0f}']})
                if sc.get("by_size"):
                    for bm in sc["by_macro"]:
                        ma = str(bm.get("macro_area", "N/A"))
                        l2_next[ma] = {
                            "h": ["Classe Dimensionale", "N. Imprese", "\u0394VA (Mln EUR)", "\u0394Emp"],
                            "r": [{"c": [str(bs.get("size_class", "N/A")), f'{int(bs.get("n", 0)):,}',
                                         f'EUR {bs.get("d_va", 0)/1e6:+,.1f} Mln',
                                         f'{bs.get("d_emp", 0):+,.0f}']}
                                  for bs in sc["by_size"]]
                        }
                l1_next[ac] = {
                    "h": ["Macro Area", "N. Imprese", "\u0394 Valore Aggiunto", "\u0394 Occupazione"],
                    "r": l1_rows_inner,
                    "next": l2_next if l2_next else {}
                }
            dd_econ_sc[skey] = {
                "h": ["Codice ATECO", "Descrizione", "N. Imprese", "Fatturato Medio"],
                "r": l0_rows, "next": l1_next
            }

    _n_dd_econ = sum(len(d) for d in [dd_econ_fe, dd_econ_elas, dd_econ_qr, dd_econ_did, dd_econ_surv, dd_econ_sc])
    print(f"  Drill-down econometrico: {_n_dd_econ} nodi preparati")


# ── 5. PREPARAZIONE DATI GRAFICI + DRILL-DOWN ─────────────────────────────
print("\n[5/7] Preparazione dati per grafici e drill-down...")

rating_chart_labels = rating_df["Rating"].tolist()
rating_chart_values = rating_df["N. Aziende"].tolist()

pd_chart_labels = pd_by_rating["Rating"].tolist()
pd_chart_values = pd_by_rating["PD Media (%)"].tolist()

geo_raw = (
    df_last.groupby("nuts2")
    .agg(n_aziende=("ID", "count"), pd_media=("probability_of_default_x100", "mean"))
    .sort_values("n_aziende", ascending=False)
    .head(10)
    .reset_index()
)
geo_chart_labels = [r.split(" - ")[-1] if " - " in r else r for r in geo_raw["nuts2"].tolist()]
geo_chart_aziende = geo_raw["n_aziende"].tolist()
geo_chart_pd = [round(x, 2) if pd.notna(x) else 0 for x in geo_raw["pd_media"].tolist()]

# Fatturato per macro-area (chart)
macro_rev_raw = (
    df_last.groupby("macro_area")
    .agg(
        fatturato_medio=("operating_revenue_turnover", "mean"),
        fatturato_mediano=("operating_revenue_turnover", "median"),
        pd_media=("probability_of_default_x100", "mean"),
    )
    .reset_index()
    .sort_values("fatturato_medio", ascending=False)
)
macro_chart_labels = macro_rev_raw["macro_area"].dropna().tolist()
macro_chart_fat_medio = [round(x, 0) for x in macro_rev_raw["fatturato_medio"].dropna().tolist()]
macro_chart_fat_mediano = [round(x, 0) for x in macro_rev_raw["fatturato_mediano"].dropna().tolist()]
macro_chart_pd = [round(x, 2) for x in macro_rev_raw["pd_media"].dropna().tolist()]

# ATECO top 8 per chart
ateco_chart_raw = (
    df_last.groupby("ateco_desc")
    .agg(n_aziende=("ID", "count"), fatturato_medio=("operating_revenue_turnover", "mean"),
         pd_media=("probability_of_default_x100", "mean"))
    .sort_values("n_aziende", ascending=False)
    .head(8)
    .reset_index()
)
ateco_chart_labels = [d[:40] + "..." if len(d) > 40 else d for d in ateco_chart_raw["ateco_desc"].tolist()]
ateco_chart_aziende = ateco_chart_raw["n_aziende"].tolist()
ateco_chart_fatturato = [round(x, 0) if pd.notna(x) else 0 for x in ateco_chart_raw["fatturato_medio"].tolist()]
ateco_chart_pd = [round(x, 2) if pd.notna(x) else 0 for x in ateco_chart_raw["pd_media"].tolist()]

# Risk by size chart
risk_size_raw = (
    df_last[df_last["size_class"] != "Senza dati"]
    .groupby("size_class")
    .agg(
        pd_media=("probability_of_default_x100", "mean"),
        n_aziende=("ID", "count"),
    )
    .reset_index()
)
size_order = ["Micro (<=2M)", "Piccola (2-10M)", "Media (10-50M)", "Grande (>50M)"]
risk_size_raw["size_class"] = pd.Categorical(risk_size_raw["size_class"], categories=size_order, ordered=True)
risk_size_raw = risk_size_raw.sort_values("size_class")
risk_size_chart_labels = risk_size_raw["size_class"].tolist()
risk_size_chart_pd = [round(x, 2) for x in risk_size_raw["pd_media"].tolist()]
risk_size_chart_n = risk_size_raw["n_aziende"].tolist()

# Trend chart (2015+)
df_active_trend = df[df["status"] == "Active"].copy()
trend_raw = (
    df_active_trend.groupby("anno")
    .agg(
        fatturato_medio=("operating_revenue_turnover", "mean"),
        ebitda_medio=("ebitda", "mean"),
        roe_medio=("roe_using_pel_before_tax_x100", "mean"),
        n_aziende=("ID", "nunique"),
    )
    .dropna()
    .reset_index()
)
trend_raw = trend_raw[trend_raw["anno"] >= 2015]
trend_chart_labels = [str(int(x)) for x in trend_raw["anno"].tolist()]
trend_chart_fatturato = [round(x, 0) for x in trend_raw["fatturato_medio"].tolist()]
trend_chart_ebitda = [round(x, 0) for x in trend_raw["ebitda_medio"].tolist()]
trend_chart_roe = [round(x, 1) for x in trend_raw["roe_medio"].tolist()]

# Donut data
status_labels = ["Attive", "Dissolte", "In crisi", "Altro"]
n_other_status = n_total - n_active - n_dissolved - n_insolvency
status_values = [int(n_active), int(n_dissolved), int(n_insolvency), int(n_other_status)]

size_labels = ["Micro (<=2M)", "Piccole (2-10M)", "Medie (10-50M)", "Grandi (>50M)"]
size_values = [int(micro), int(small), int(medium), int(large)]

profit_labels = ["In utile", "In perdita", "Pareggio"]
profit_values = [int(in_profit), int(in_loss), int(breakeven)]

risk_labels = ["Rischio basso (<1%)", "Rischio medio (1-5%)", "Rischio alto (>=5%)"]
risk_values = [int(low_risk), int(med_risk), int(high_risk)]

# Geo fatturato per regione chart (top 10 by revenue)
geo_rev_raw = (
    df_last.groupby("regione")
    .agg(fatturato_medio=("operating_revenue_turnover", "mean"))
    .sort_values("fatturato_medio", ascending=False)
    .head(10)
    .reset_index()
)
geo_rev_chart_labels = geo_rev_raw["regione"].tolist()
geo_rev_chart_values = [round(x, 0) for x in geo_rev_raw["fatturato_medio"].tolist()]

# Risk by region chart (PD top 10 most populated)
risk_reg_raw = (
    df_last.groupby("regione")
    .agg(n_aziende=("ID", "count"), pd_media=("probability_of_default_x100", "mean"))
    .sort_values("n_aziende", ascending=False)
    .head(10)
    .reset_index()
)
risk_reg_chart_labels = risk_reg_raw["regione"].tolist()
risk_reg_chart_pd = [round(x, 2) for x in risk_reg_raw["pd_media"].tolist()]

# ── Overview Sottosettori ATECO (pie + KPI) ──────────────────────────────
overview_ateco = (
    df_last.groupby(["ateco_code", "ateco_desc"])
    .agg(
        n_aziende=("ID", "count"),
        fatturato_totale=("operating_revenue_turnover", "sum"),
        fatturato_medio=("operating_revenue_turnover", "mean"),
        utile_medio=("pel_for_period_net_income", "mean"),
        utile_totale=("pel_for_period_net_income", "sum"),
        dipendenti_totali=("number_of_employees", "sum"),
        dipendenti_medi=("number_of_employees", "mean"),
        ebitda_medio=("ebitda", "mean"),
        ebitda_totale=("ebitda", "sum"),
    )
    .sort_values("n_aziende", ascending=False)
    .reset_index()
)
# Short label for pie chart (code + short desc)
overview_ateco["label_short"] = overview_ateco["ateco_code"] + " - " + overview_ateco["ateco_desc"].str[:35].fillna("")
# Pie chart: top 8 + "Altri" to keep it readable
OV_PIE_TOP = 8
ov_top = overview_ateco.head(OV_PIE_TOP).copy()
ov_others_n = overview_ateco.iloc[OV_PIE_TOP:]["n_aziende"].sum() if len(overview_ateco) > OV_PIE_TOP else 0
ov_pie_labels = ov_top["label_short"].tolist()
ov_pie_values = ov_top["n_aziende"].tolist()
if ov_others_n > 0:
    ov_pie_labels.append(f"Altri ({len(overview_ateco) - OV_PIE_TOP} sottosettori)")
    ov_pie_values.append(int(ov_others_n))

# Aggregate KPIs
ov_n_subsectors = len(overview_ateco)
ov_fatturato_totale = df_last["operating_revenue_turnover"].sum()
ov_utile_totale = df_last["pel_for_period_net_income"].sum()
ov_dipendenti_totali = df_last["number_of_employees"].sum()
ov_ebitda_totale = df_last["ebitda"].sum()
ov_top_subsector = overview_ateco.iloc[0]["ateco_desc"] if len(overview_ateco) > 0 else "N/A"
ov_top_subsector_n = int(overview_ateco.iloc[0]["n_aziende"]) if len(overview_ateco) > 0 else 0
ov_top_subsector_pct = ov_top_subsector_n / n_total * 100 if n_total > 0 else 0

# Helper: format large EUR values
def fmt_eur_short(val):
    if pd.isna(val) or val == 0:
        return "N/A"
    abs_val = abs(val)
    sign = "-" if val < 0 else ""
    if abs_val >= 1e9:
        return f"{sign}{abs_val/1e9:,.1f} Mld"
    elif abs_val >= 1e6:
        return f"{sign}{abs_val/1e6:,.1f} Mln"
    elif abs_val >= 1e3:
        return f"{sign}{abs_val/1e3:,.0f}K"
    return f"{sign}{abs_val:,.0f}"

ov_fatturato_fmt = fmt_eur_short(ov_fatturato_totale)
ov_utile_fmt = fmt_eur_short(ov_utile_totale)
ov_ebitda_fmt = fmt_eur_short(ov_ebitda_totale)
ov_dipendenti_fmt = f"{ov_dipendenti_totali:,.0f}"

# JSON for table rendering
ov_table_data = []
for _, row in overview_ateco.iterrows():
    ov_table_data.append({
        "codice": str(row["ateco_code"]),
        "descrizione": str(row["ateco_desc"])[:55] if pd.notna(row["ateco_desc"]) else str(row["ateco_code"]),
        "n_aziende": int(row["n_aziende"]),
        "pct_aziende": round(row["n_aziende"] / n_total * 100, 1) if n_total > 0 else 0,
        "fatturato_totale": round(float(row["fatturato_totale"]), 0) if pd.notna(row["fatturato_totale"]) else 0,
        "fatturato_medio": round(float(row["fatturato_medio"]), 0) if pd.notna(row["fatturato_medio"]) else 0,
        "utile_medio": round(float(row["utile_medio"]), 0) if pd.notna(row["utile_medio"]) else 0,
        "dipendenti_totali": round(float(row["dipendenti_totali"]), 0) if pd.notna(row["dipendenti_totali"]) else 0,
        "dipendenti_medi": round(float(row["dipendenti_medi"]), 1) if pd.notna(row["dipendenti_medi"]) else 0,
        "ebitda_medio": round(float(row["ebitda_medio"]), 0) if pd.notna(row["ebitda_medio"]) else 0,
    })


# ── 5a-bis. TABELLE ATECO-FIRST per sezioni con drill-down ───────────────
# Queste tabelle hanno Codice ATECO come prima colonna per il lookup DD_DATA
_ateco_base = (
    df_last.groupby(["ateco_code", "ateco_desc"])
    .agg(
        n=("ID", "count"),
        fat_m=("operating_revenue_turnover", "mean"),
        pd_m=("probability_of_default_x100", "mean"),
        emp_m=("number_of_employees", "mean"),
        inv=("implied_rating", lambda x: x.isin(list("ABCDEFGH")).sum()),
        high_risk_n=("probability_of_default_x100", lambda x: (x >= 5).sum()),
        in_profit_n=("pel_for_period_net_income", lambda x: (x > 0).sum()),
    )
    .sort_values("n", ascending=False)
    .reset_index()
)
_ateco_base["pct_inv"] = (_ateco_base["inv"] / _ateco_base["n"] * 100).round(1)
_ateco_base["pct_hr"] = (_ateco_base["high_risk_n"] / _ateco_base["n"] * 100).round(1)
_ateco_base["pct_profit"] = (_ateco_base["in_profit_n"] / _ateco_base["n"] * 100).round(1)

# Rating section: ATECO → drill-down rating per ATECO
ateco_for_rating = _ateco_base[["ateco_code", "ateco_desc", "n", "pct_inv", "pd_m"]].copy()
ateco_for_rating["pd_m"] = ateco_for_rating["pd_m"].apply(lambda x: f"{x:.2f}" if pd.notna(x) else "N/A")
ateco_for_rating.columns = ["Codice ATECO", "Descrizione", "N. Aziende", "% Inv. Grade", "PD Media (%)"]

# Size section: ATECO → drill-down dimensione per ATECO
ateco_for_size = _ateco_base[["ateco_code", "ateco_desc", "n", "fat_m", "emp_m"]].copy()
ateco_for_size["fat_m"] = ateco_for_size["fat_m"].apply(lambda x: f"{x:,.0f}" if pd.notna(x) else "N/A")
ateco_for_size["emp_m"] = ateco_for_size["emp_m"].apply(lambda x: f"{x:.0f}" if pd.notna(x) else "N/A")
ateco_for_size.columns = ["Codice ATECO", "Descrizione", "N. Aziende", "Fatturato Medio (EUR)", "Dipendenti Medi"]

# Geo section: ATECO → drill-down regione per ATECO
ateco_for_geo = _ateco_base[["ateco_code", "ateco_desc", "n", "fat_m", "pd_m"]].copy()
ateco_for_geo["fat_m"] = ateco_for_geo["fat_m"].apply(lambda x: f"{x:,.0f}" if pd.notna(x) else "N/A")
ateco_for_geo["pd_m"] = ateco_for_geo["pd_m"].apply(lambda x: f"{x:.2f}" if pd.notna(x) else "N/A")
ateco_for_geo.columns = ["Codice ATECO", "Descrizione", "N. Aziende", "Fatturato Medio (EUR)", "PD Media (%)"]

# Macro (Nord vs Sud) section: ATECO → drill-down macro area per ATECO
ateco_for_macro = _ateco_base[["ateco_code", "ateco_desc", "n", "fat_m", "pct_inv", "pd_m"]].copy()
ateco_for_macro["fat_m"] = ateco_for_macro["fat_m"].apply(lambda x: f"{x:,.0f}" if pd.notna(x) else "N/A")
ateco_for_macro["pd_m"] = ateco_for_macro["pd_m"].apply(lambda x: f"{x:.2f}" if pd.notna(x) else "N/A")
ateco_for_macro.columns = ["Codice ATECO", "Descrizione", "N. Aziende", "Fatturato Medio (EUR)", "% Inv.Grade", "PD Media (%)"]

# Risk section: ATECO → drill-down rischio per ATECO (= same as size)
ateco_for_risk = _ateco_base[["ateco_code", "ateco_desc", "n", "pd_m", "pct_hr", "pct_inv"]].copy()
ateco_for_risk["pd_m"] = ateco_for_risk["pd_m"].apply(lambda x: f"{x:.2f}" if pd.notna(x) else "N/A")
ateco_for_risk.columns = ["Codice ATECO", "Descrizione", "N. Aziende", "PD Media (%)", "% Rischio Alto", "% Inv.Grade"]

print("  Tabelle ATECO-first preparate")

# ── 5b. PREPARAZIONE DRILL-DOWN MULTILIVELLO ──────────────────────────────
print("  Preparazione drill-down multilivello...")

def company_row(r):
    """Crea dict standard per una riga azienda."""
    return {
        "az": str(r.get("name", ""))[:55],
        "reg": str(r.get("regione", "")),
        "rat": str(r.get("implied_rating", "")),
        "fat": fmt_eur(r.get("operating_revenue_turnover")),
        "ebitda": fmt_eur(r.get("ebitda")),
        "pd": f"{r['probability_of_default_x100']:.2f}" if pd.notna(r.get("probability_of_default_x100")) else "N/A",
        "dip": f"{r['number_of_employees']:,.0f}" if pd.notna(r.get("number_of_employees")) else "N/A",
        "status": str(r.get("status", "")),
        "ateco": str(r.get("ateco_desc", ""))[:40],
    }

# ── Helper: wrappa un DD_DATA con ATECO come primo livello ──
def _build_inner_dd(sub_df, build_func):
    """Costruisce il nodo dd per un subset dato."""
    return build_func(sub_df)

def _ateco_summary_row(code, desc, sub):
    """Riga summary ATECO per qualunque sezione."""
    n = len(sub)
    rev_m = sub["operating_revenue_turnover"].mean()
    pd_m = sub["probability_of_default_x100"].mean()
    ig = sub["implied_rating"].isin(list("ABCDEFGH")).sum()
    return {
        "n": n,
        "c": [str(code), str(desc)[:45], int(n), fmt_eur(rev_m),
              f"{pd_m:.2f}" if pd.notna(pd_m) else "N/A",
              f"{ig/n*100:.1f}%" if n > 0 else "0%"]
    }

_ateco_h0 = ["Codice ATECO", "Descrizione", "N. Aziende", "Fatt. Medio", "PD Media (%)", "% Inv.Grade"]

# Lookup ATECO code → desc
_ateco_map = df_last.groupby("ateco_code")["ateco_desc"].first().to_dict()
_ateco_codes_sorted = sorted(_ateco_map.keys())

# ── RATING: ATECO → Rating → Regione → Aziende ──
def _build_rating_dd(sub):
    """DD per rating dentro un subset."""
    inner = {}
    for rat in rating_order:
        sub_rat = sub[sub["implied_rating"] == rat]
        if len(sub_rat) == 0:
            continue
        reg_agg = (
            sub_rat.groupby("regione")
            .agg(n=("ID", "count"), fat=("operating_revenue_turnover", "mean"),
                 pd_m=("probability_of_default_x100", "mean"))
            .sort_values("n", ascending=False).head(10).reset_index()
        )
        l1_rows = []
        l2 = {}
        for _, rr in reg_agg.iterrows():
            regname = str(rr["regione"])
            l1_rows.append({"k": regname, "c": [regname, int(rr["n"]), fmt_eur(rr["fat"]),
                            f"{rr['pd_m']:.2f}" if pd.notna(rr["pd_m"]) else "N/A"]})
            sub2 = sub_rat[sub_rat["regione"] == regname].nlargest(6, "operating_revenue_turnover", keep="all")
            l2[regname] = {"h": ["Azienda","ATECO","Fatturato","EBITDA","PD (%)","Dip."],
                            "r": [{"c": [company_row(r)["az"], company_row(r)["ateco"],
                                         company_row(r)["fat"], company_row(r)["ebitda"],
                                         company_row(r)["pd"], company_row(r)["dip"]]}
                                  for _, r in sub2.iterrows()]}
        inner[rat] = {
            "h": ["Regione", "N. Aziende", "Fatturato Medio", "PD Media (%)"],
            "r": l1_rows, "next": l2
        }
    return inner

dd_rating = {}
for acode in _ateco_codes_sorted:
    sub_at = df_last[df_last["ateco_code"] == acode]
    if len(sub_at) == 0:
        continue
    sr = _ateco_summary_row(acode, _ateco_map.get(acode, ""), sub_at)
    # Dentro questo ATECO: rating breakdown
    rat_agg = (
        sub_at.groupby("implied_rating")
        .agg(n=("ID", "count"), fat=("operating_revenue_turnover", "mean"),
             pd_m=("probability_of_default_x100", "mean"))
        .reindex(rating_order).dropna(subset=["n"]).reset_index()
    )
    l1_rows = []
    l2 = {}
    for _, rr in rat_agg.iterrows():
        rat = str(rr["implied_rating"])
        l1_rows.append({"k": rat, "c": [rat, int(rr["n"]),
                        f"{rr['n']/len(sub_at)*100:.1f}%",
                        fmt_eur(rr["fat"]),
                        f"{rr['pd_m']:.2f}" if pd.notna(rr["pd_m"]) else "N/A"]})
        sub2 = sub_at[sub_at["implied_rating"] == rat].nlargest(6, "operating_revenue_turnover", keep="all")
        l2[rat] = {"h": ["Azienda","Regione","Fatturato","EBITDA","PD (%)","Dip."],
                    "r": [{"c": [company_row(r)["az"], company_row(r)["reg"],
                                 company_row(r)["fat"], company_row(r)["ebitda"],
                                 company_row(r)["pd"], company_row(r)["dip"]]}
                          for _, r in sub2.iterrows()]}
    dd_rating[acode] = {
        "h": ["Rating", "N. Aziende", "% nel ATECO", "Fatturato Medio", "PD Media (%)"],
        "r": l1_rows, "next": l2
    }

# ── GEO: ATECO → Regione → Aziende ──
dd_geo = {}
for acode in _ateco_codes_sorted:
    sub_at = df_last[df_last["ateco_code"] == acode]
    if len(sub_at) == 0:
        continue
    reg_agg = (
        sub_at.groupby("regione")
        .agg(n=("ID", "count"), fat=("operating_revenue_turnover", "mean"),
             pd_m=("probability_of_default_x100", "mean"))
        .sort_values("n", ascending=False).head(12).reset_index()
    )
    l1_rows = []
    l2 = {}
    for _, rr in reg_agg.iterrows():
        regname = str(rr["regione"])
        l1_rows.append({"k": regname, "c": [regname, int(rr["n"]), fmt_eur(rr["fat"]),
                        f"{rr['pd_m']:.2f}" if pd.notna(rr["pd_m"]) else "N/A"]})
        sub2 = sub_at[sub_at["regione"] == regname].nlargest(6, "operating_revenue_turnover", keep="all")
        l2[regname] = {"h": ["Azienda","Rating","Fatturato","EBITDA","PD (%)","Dip."],
                        "r": [{"c": [company_row(r)["az"], company_row(r)["rat"],
                                     company_row(r)["fat"], company_row(r)["ebitda"],
                                     company_row(r)["pd"], company_row(r)["dip"]]}
                              for _, r in sub2.iterrows()]}
    dd_geo[acode] = {
        "h": ["Regione", "N. Aziende", "Fatturato Medio", "PD Media (%)"],
        "r": l1_rows, "next": l2
    }

# ── ATECO → Regione → Aziende (invariato, è già per ATECO) ──
dd_ateco = {}
for code in _ateco_codes_sorted:
    sub_at = df_last[df_last["ateco_code"] == code]
    if len(sub_at) == 0:
        continue
    reg_agg = (
        sub_at.groupby("regione")
        .agg(n=("ID", "count"), fat=("operating_revenue_turnover", "mean"),
             pd_m=("probability_of_default_x100", "mean"),
             inv=("implied_rating", lambda x: x.isin(list("ABCDEFGH")).sum()))
        .sort_values("n", ascending=False).head(12).reset_index()
    )
    reg_agg["pct_inv"] = (reg_agg["inv"] / reg_agg["n"] * 100).round(1)
    l1_rows = []
    l2 = {}
    for _, rr in reg_agg.iterrows():
        regname = str(rr["regione"])
        l1_rows.append({"k": regname, "c": [regname, int(rr["n"]), fmt_eur(rr["fat"]),
                        f"{rr['pd_m']:.2f}" if pd.notna(rr["pd_m"]) else "N/A",
                        f"{rr['pct_inv']:.1f}%"]})
        sub2 = sub_at[sub_at["regione"] == regname].nlargest(8, "operating_revenue_turnover", keep="all")
        l2[regname] = {"h": ["Azienda","Rating","Fatturato","EBITDA","PD (%)","Stato"],
                        "r": [{"c": [company_row(r)["az"], company_row(r)["rat"],
                                     company_row(r)["fat"], company_row(r)["ebitda"],
                                     company_row(r)["pd"], company_row(r)["status"]]}
                              for _, r in sub2.iterrows()]}
    dd_ateco[code] = {
        "h": ["Regione", "N. Aziende", "Fatturato Medio", "PD Media (%)", "% Inv. Grade"],
        "r": l1_rows, "next": l2
    }

# ── MACRO: ATECO → Macro Area → Regione → Aziende ──
dd_macro = {}
for acode in _ateco_codes_sorted:
    sub_at = df_last[df_last["ateco_code"] == acode]
    if len(sub_at) == 0:
        continue
    ma_agg = (
        sub_at.groupby("macro_area")
        .agg(n=("ID", "count"), fat=("operating_revenue_turnover", "mean"),
             fat_med=("operating_revenue_turnover", "median"),
             pd_m=("probability_of_default_x100", "mean"),
             inv=("implied_rating", lambda x: x.isin(list("ABCDEFGH")).sum()))
        .sort_values("n", ascending=False).reset_index()
    )
    ma_agg["pct_inv"] = (ma_agg["inv"] / ma_agg["n"] * 100).round(1)
    l1_rows = []
    l2 = {}
    for _, rr in ma_agg.iterrows():
        ma_name = str(rr["macro_area"])
        l1_rows.append({"k": ma_name, "c": [ma_name, int(rr["n"]), fmt_eur(rr["fat"]),
                        fmt_eur(rr["fat_med"]),
                        f"{rr['pd_m']:.2f}" if pd.notna(rr["pd_m"]) else "N/A",
                        f"{rr['pct_inv']:.1f}%"]})
        # L2: Regioni dentro macro area per questo ATECO
        sub2 = sub_at[sub_at["macro_area"] == ma_name]
        reg_agg2 = (
            sub2.groupby("regione")
            .agg(n2=("ID", "count"), fat2=("operating_revenue_turnover", "mean"),
                 pd2=("probability_of_default_x100", "mean"))
            .sort_values("n2", ascending=False).head(8).reset_index()
        )
        l2_rows = []
        l3 = {}
        for _, ar in reg_agg2.iterrows():
            regname = str(ar["regione"])
            l2_rows.append({"k": regname, "c": [regname, int(ar["n2"]),
                            fmt_eur(ar["fat2"]),
                            f"{ar['pd2']:.2f}" if pd.notna(ar["pd2"]) else "N/A"]})
            sub3 = sub2[sub2["regione"] == regname].nlargest(6, "operating_revenue_turnover", keep="all")
            l3[regname] = {"h": ["Azienda","Rating","Fatturato","PD (%)","Dip."],
                       "r": [{"c": [company_row(r)["az"], company_row(r)["rat"],
                                    company_row(r)["fat"], company_row(r)["pd"],
                                    company_row(r)["dip"]]}
                             for _, r in sub3.iterrows()]}
        l2[ma_name] = {
            "h": ["Regione", "N. Aziende", "Fatturato Medio", "PD (%)"],
            "r": l2_rows, "next": l3
        }
    dd_macro[acode] = {
        "h": ["Macro Area", "N. Aziende", "Fatt. Medio", "Fatt. Mediano", "PD Media (%)", "% Inv. Grade"],
        "r": l1_rows, "next": l2
    }

# ── SIZE: ATECO → Fascia Dimensionale → Rating → Aziende ──
dd_size = {}
for acode in _ateco_codes_sorted:
    sub_at = df_last[df_last["ateco_code"] == acode]
    if len(sub_at) == 0:
        continue
    sz_agg = (
        sub_at.groupby("size_class")
        .agg(n=("ID", "count"), fat=("operating_revenue_turnover", "mean"),
             pd_m=("probability_of_default_x100", "mean"))
        .reindex(["Micro (<=2M)", "Piccola (2-10M)", "Media (10-50M)", "Grande (>50M)"])
        .dropna(subset=["n"]).reset_index()
    )
    l1_rows = []
    l2 = {}
    for _, rr in sz_agg.iterrows():
        sc = str(rr["size_class"])
        l1_rows.append({"k": sc, "c": [sc, int(rr["n"]),
                        f"{rr['n']/len(sub_at)*100:.1f}%", fmt_eur(rr["fat"]),
                        f"{rr['pd_m']:.2f}" if pd.notna(rr["pd_m"]) else "N/A"]})
        sub2 = sub_at[sub_at["size_class"] == sc].nlargest(6, "operating_revenue_turnover", keep="all")
        l2[sc] = {"h": ["Azienda","Rating","Regione","Fatturato","PD (%)","Dip."],
                   "r": [{"c": [company_row(r)["az"], company_row(r)["rat"], company_row(r)["reg"],
                                company_row(r)["fat"], company_row(r)["pd"], company_row(r)["dip"]]}
                         for _, r in sub2.iterrows()]}
    dd_size[acode] = {
        "h": ["Fascia Dimensionale", "N. Aziende", "% nel ATECO", "Fatturato Medio", "PD Media (%)"],
        "r": l1_rows, "next": l2
    }

# ── BRE drill-down (flagged companies per rule) ──
dd_bre = {}
for r in bre_rules:
    sub_bre = r["df"]
    if "operating_revenue_turnover" in sub_bre.columns and sub_bre["operating_revenue_turnover"].notna().any():
        sub_bre = sub_bre.nlargest(min(25, len(sub_bre)), "operating_revenue_turnover", keep="all")
    else:
        sub_bre = sub_bre.head(25)
    dd_bre[r["id"]] = {
        "h": ["Azienda", "Regione", "Rating", "Fatturato (EUR)", "PD (%)", "Stato"],
        "r": [{"c": [company_row(row)["az"], company_row(row)["reg"], company_row(row)["rat"],
                      company_row(row)["fat"], company_row(row)["pd"], company_row(row)["status"]]}
              for _, row in sub_bre.iterrows()]
    }

# Serialize
dd_json = {"rating": dd_rating, "geo": dd_geo, "ateco": dd_ateco, "macro": dd_macro, "size": dd_size, "bre": dd_bre,
           "econ_fe": dd_econ_fe, "econ_elas": dd_econ_elas, "econ_qr": dd_econ_qr,
           "econ_did": dd_econ_did, "econ_surv": dd_econ_surv, "econ_sc": dd_econ_sc}
dd_json_str = json.dumps(dd_json, ensure_ascii=False, default=str)


# ── 5c. PREPARAZIONE DATI FILTRI ─────────────────────────────────────────
print("  Preparazione dati filtri...")

def compute_filter_stats(sub):
    n = len(sub)
    if n == 0:
        return None
    n_act = int((sub["status"] == "Active").sum())
    rat_num = sub["rating_num"].mean()
    rat_letter = rating_order[int(round(rat_num)) - 1] if not np.isnan(rat_num) else "N/A"
    pd_m = sub["probability_of_default_x100"].mean()
    rev_med = sub["operating_revenue_turnover"].median()
    rev_m = sub["operating_revenue_turnover"].mean()
    emp_med = sub["number_of_employees"].median()
    emp_m = sub["number_of_employees"].mean()
    pnl_v = sub["pel_for_period_net_income"].notna().sum()
    in_p = int((sub["pel_for_period_net_income"] > 0).sum())
    inv_g = int(sub["implied_rating"].isin(list("ABCDEFGH")).sum())
    pd_v = sub["probability_of_default_x100"].notna().sum()
    hr = int((sub["probability_of_default_x100"] >= 5).sum())
    return {
        "n_total": int(n), "n_active": n_act,
        "rating_letter": rat_letter,
        "pd_mean": round(float(pd_m), 2) if not np.isnan(pd_m) else 0,
        "rev_median": round(float(rev_med), 0) if not np.isnan(rev_med) else 0,
        "rev_mean": round(float(rev_m), 0) if not np.isnan(rev_m) else 0,
        "emp_median": round(float(emp_med), 0) if not np.isnan(emp_med) else 0,
        "emp_mean": round(float(emp_m), 0) if not np.isnan(emp_m) else 0,
        "pct_profit": round(float(in_p / pnl_v * 100), 1) if pnl_v > 0 else 0,
        "pct_inv_grade": round(float(inv_g / n * 100), 1),
        "pct_high_risk": round(float(hr / pd_v * 100), 1) if pd_v > 0 else 0,
    }

filter_data = {
    "_all": {
        "n_total": int(n_total), "n_active": int(n_active),
        "rating_letter": avg_rating_letter,
        "pd_mean": round(pd_stats['mean'], 2) if not np.isnan(pd_stats['mean']) else 0,
        "rev_median": round(rev_stats['median'], 0) if not np.isnan(rev_stats['median']) else 0,
        "rev_mean": round(rev_stats['mean'], 0) if not np.isnan(rev_stats['mean']) else 0,
        "emp_median": round(emp_stats['median'], 0) if not np.isnan(emp_stats['median']) else 0,
        "emp_mean": round(emp_stats['mean'], 0) if not np.isnan(emp_stats['mean']) else 0,
        "pct_profit": round(float(in_profit) / float(pnl_valid) * 100, 1) if int(pnl_valid) > 0 else 0,
        "pct_inv_grade": round(float(inv_grade) / float(n_total) * 100, 1),
        "pct_high_risk": round(float(high_risk) / float(pd_valid) * 100, 1) if int(pd_valid) > 0 else 0,
    }
}

# Macro Area
filter_data["macro_area"] = {}
for ma in sorted(df_last["macro_area"].dropna().unique()):
    s = compute_filter_stats(df_last[df_last["macro_area"] == ma])
    if s: filter_data["macro_area"][ma] = s

# Rating group
filter_data["rating_group"] = {}
for lbl, ltrs in [("Investment Grade (A-H)", list("ABCDEFGH")), ("Speculative Grade (I-R)", list("ILMNOPQR"))]:
    s = compute_filter_stats(df_last[df_last["implied_rating"].isin(ltrs)])
    if s: filter_data["rating_group"][lbl] = s

# Size class
filter_data["size_class"] = {}
for sc in ["Micro (<=2M)", "Piccola (2-10M)", "Media (10-50M)", "Grande (>50M)"]:
    s = compute_filter_stats(df_last[df_last["size_class"] == sc])
    if s: filter_data["size_class"][sc] = s

# Status
filter_data["status"] = {}
_st_active = df_last[df_last["status"] == "Active"]
_st_dissolved = df_last[df_last["status"].str.contains("Dissolved", na=False)]
_st_crisis = df_last[df_last["status"].isin(["In liquidation", "Bankruptcy", "Active (insolvency proceedings)", "Active (default of payment)", "Dissolved (bankruptcy)"])]
for lbl, sub_f in [("Attive", _st_active), ("Dissolte", _st_dissolved), ("In crisi", _st_crisis)]:
    s = compute_filter_stats(sub_f)
    if s: filter_data["status"][lbl] = s

# Regione (top 15)
filter_data["regione"] = {}
for reg in df_last["regione"].value_counts().head(15).index.tolist():
    s = compute_filter_stats(df_last[df_last["regione"] == reg])
    if s: filter_data["regione"][reg] = s

filter_json_str = json.dumps(filter_data, ensure_ascii=False, default=str)
_n_filter_combos = sum(len(v) for k, v in filter_data.items() if k != "_all")
print(f"  Filtri preparati: {_n_filter_combos} combinazioni")

# ── 5d. FILTER_RAW: dati compatti per filtri AND ──────────────────────────────
print("  Preparazione dati raw per filtri AND...")

# Mappa status -> categoria dropdown
def _status_cat(st):
    if st == "Active":
        return "Attive"
    elif isinstance(st, str) and "Dissolved" in st:
        return "Dissolte"
    elif st in ("In liquidation", "Bankruptcy", "Active (insolvency proceedings)",
                "Active (default of payment)", "Dissolved (bankruptcy)"):
        return "In crisi"
    return ""

# Mappa rating -> gruppo dropdown
def _rating_grp(r):
    if r in list("ABCDEFGH"):
        return "IG"
    elif r in list("ILMNOPQR"):
        return "SG"
    return ""

# Costruisci lookup indicizzati per compattezza
_fr_macros = sorted(df_last["macro_area"].dropna().unique().tolist())
_fr_regioni = sorted(df_last["regione"].dropna().unique().tolist())
_fr_sizes = ["Micro (<=2M)", "Piccola (2-10M)", "Media (10-50M)", "Grande (>50M)", "Senza dati"]
_fr_status_cats = ["Attive", "Dissolte", "In crisi"]

# ATECO subsectors (code + desc)
_ateco_lookup = (
    df_last.groupby("ateco_code")["ateco_desc"]
    .first()
    .sort_index()
)
_fr_atecos = [f"{code} - {desc[:50]}" for code, desc in _ateco_lookup.items()]
_ateco_codes_list = _ateco_lookup.index.tolist()
_ateco_idx = {v: i for i, v in enumerate(_ateco_codes_list)}

_macro_idx = {v: i for i, v in enumerate(_fr_macros)}
_reg_idx = {v: i for i, v in enumerate(_fr_regioni)}
_size_idx = {v: i for i, v in enumerate(_fr_sizes)}
_stat_idx = {v: i for i, v in enumerate(_fr_status_cats)}

# Legal forms index
_fr_legal_forms = sorted(df_last["standardised_legal_form"].dropna().unique().tolist())
_legal_idx = {v: i for i, v in enumerate(_fr_legal_forms)}

# Costruisci array compatto
# Base [0-12]: macro_i, reg_i, size_i, stat_i, rg, rev, emp, pd, pnl, rn, ig, clean, ateco_i
# Scenari [13-40]: 4 scenari × 7 valori
# Extra [41-48]: name, legal_i, ebitda, roe, current_ratio, gearing, liquidity_ratio, solvency_ratio
_fr_rows = []
_fr_company_ids = []  # ID per match con trend
for _, row in df_last.iterrows():
    m_i = _macro_idx.get(row.get("macro_area"), -1)
    r_i = _reg_idx.get(row.get("regione"), -1)
    s_i = _size_idx.get(row.get("size_class"), -1)
    sc = _status_cat(row.get("status", ""))
    t_i = _stat_idx.get(sc, -1)
    rg = 0 if _rating_grp(row.get("implied_rating", "")) == "IG" else (1 if _rating_grp(row.get("implied_rating", "")) == "SG" else -1)
    rev = round(float(row["operating_revenue_turnover"]), 0) if pd.notna(row.get("operating_revenue_turnover")) else None
    emp = round(float(row["number_of_employees"]), 0) if pd.notna(row.get("number_of_employees")) else None
    _pd = round(float(row["probability_of_default_x100"]), 4) if pd.notna(row.get("probability_of_default_x100")) else None
    pnl = round(float(row["pel_for_period_net_income"]), 0) if pd.notna(row.get("pel_for_period_net_income")) else None
    rn = round(float(row["rating_num"]), 2) if pd.notna(row.get("rating_num")) else None
    ig = 1 if row.get("implied_rating") in list("ABCDEFGH") else 0
    clean = 1 if row.get("_bre_clean", False) else 0
    a_i = _ateco_idx.get(row.get("ateco_code"), -1)
    # Scenario per-firm data (indices 13-40): 4 scenari × 7 valori
    sc_vals = []
    for sc_idx in range(len(econ_scenarios)):
        for col_name in ["delta_va", "delta_emp", "delta_inv", "fiscal_cost", "tax_new", "contrib_new", "iva_new"]:
            target = f"_sc{sc_idx}_{col_name}"
            v = row.get(target, 0.0)
            sc_vals.append(round(float(v), 2) if pd.notna(v) else 0.0)
    # Extra fields (indices 41-48)
    _name = str(row.get("name", ""))[:50]
    _leg_i = _legal_idx.get(row.get("standardised_legal_form"), -1)
    _ebitda = round(float(row["ebitda"]), 0) if pd.notna(row.get("ebitda")) else None
    _roe = round(float(row["roe_using_pel_before_tax_x100"]), 2) if pd.notna(row.get("roe_using_pel_before_tax_x100")) else None
    _cr = round(float(row["current_ratio"]), 2) if pd.notna(row.get("current_ratio")) else None
    _gear = round(float(row["gearing_x100"]), 1) if pd.notna(row.get("gearing_x100")) else None
    _liq = round(float(row["liquidity_ratio"]), 2) if pd.notna(row.get("liquidity_ratio")) else None
    _solv = round(float(row["solvency_ratio_asset_based_x100"]), 1) if pd.notna(row.get("solvency_ratio_asset_based_x100")) else None
    _fr_rows.append([m_i, r_i, s_i, t_i, rg, rev, emp, _pd, pnl, rn, ig, clean, a_i] + sc_vals + [_name, _leg_i, _ebitda, _roe, _cr, _gear, _liq, _solv])
    _fr_company_ids.append(row.get("ID", ""))

# ── TREND DATA: multi-anno per filtri ──
print("  Costruzione FILTER_TREND...")
_company_id_to_idx = {cid: i for i, cid in enumerate(_fr_company_ids)}
_trend_rows = []  # [company_idx, anno, rev, ebitda, roe]
for _, row in df[df["status"] == "Active"].iterrows():
    cid = row.get("ID", "")
    cidx = _company_id_to_idx.get(cid, -1)
    if cidx < 0:
        continue
    anno = int(row["anno"]) if pd.notna(row.get("anno")) else 0
    if anno < 2015:
        continue
    t_rev = round(float(row["operating_revenue_turnover"]), 0) if pd.notna(row.get("operating_revenue_turnover")) else None
    t_ebitda = round(float(row["ebitda"]), 0) if pd.notna(row.get("ebitda")) else None
    t_roe = round(float(row["roe_using_pel_before_tax_x100"]), 2) if pd.notna(row.get("roe_using_pel_before_tax_x100")) else None
    _trend_rows.append([cidx, anno, t_rev, t_ebitda, t_roe])
print(f"  FILTER_TREND: {len(_trend_rows):,} righe")

filter_raw_obj = {
    "macros": _fr_macros,
    "regioni": _fr_regioni,
    "sizes": _fr_sizes,
    "status_cats": _fr_status_cats,
    "atecos": _fr_atecos,
    "ateco_codes": _ateco_codes_list,
    "legal_forms": _fr_legal_forms,
    "rows": _fr_rows,
    "scenarios": [{"name": sc["name"], "desc": sc["desc"]} for sc in econ_scenarios],
    "trend": _trend_rows,
}
filter_raw_str = json.dumps(filter_raw_obj, ensure_ascii=False, separators=(",", ":"))
print(f"  FILTER_RAW: {len(_fr_rows):,} righe, {len(filter_raw_str) / 1024 / 1024:.1f} MB")

# ── 5e. ANOMALY DETECTION ─────────────────────────────────────────────────────
print("  Rilevamento anomalie dati...")
anomalies = []

# 1. Anomalia anno: fatturato mediano per anno (ultimo 5 anni) — spike/drop
_years = sorted(df["anno"].dropna().unique().tolist())
if len(_years) >= 3:
    _rev_by_year = df.groupby("anno")["operating_revenue_turnover"].median().dropna()
    if len(_rev_by_year) >= 3:
        _last_yr = _rev_by_year.index.max()
        _prev_yrs = _rev_by_year[_rev_by_year.index < _last_yr]
        if len(_prev_yrs) >= 2:
            _prev_med = _prev_yrs.median()
            _last_val = _rev_by_year[_last_yr]
            if _prev_med > 0 and _last_val / _prev_med > 2.0:
                anomalies.append({
                    "type": "revenue_spike",
                    "severity": "high",
                    "title": f"Fatturato mediano {int(_last_yr)} anomalo",
                    "detail": f"Il fatturato mediano nel {int(_last_yr)} (\u20ac{_last_val:,.0f}) \u00e8 {_last_val/_prev_med:.1f}x rispetto alla mediana degli anni precedenti (\u20ac{_prev_med:,.0f}). Possibile effetto di selezione: le aziende con bilancio {int(_last_yr)} sono tipicamente le pi\u00f9 grandi/strutturate.",
                })
            elif _prev_med > 0 and _last_val / _prev_med < 0.5:
                anomalies.append({
                    "type": "revenue_drop",
                    "severity": "high",
                    "title": f"Fatturato mediano {int(_last_yr)} anomalo",
                    "detail": f"Il fatturato mediano nel {int(_last_yr)} (\u20ac{_last_val:,.0f}) \u00e8 solo il {_last_val/_prev_med*100:.0f}% rispetto agli anni precedenti (\u20ac{_prev_med:,.0f}).",
                })

# 2. Anomalia: dipendenti mediani molto bassi per aziende "Grandi"
_big = df_last[df_last["size_class"] == "Grande (>50M)"]
if len(_big) > 10:
    _big_emp_med = _big["number_of_employees"].median()
    _big_low_emp = (_big["number_of_employees"] < 5).sum()
    if _big_low_emp > 0:
        anomalies.append({
            "type": "emp_mismatch",
            "severity": "medium",
            "title": f"Grandi imprese con dati dipendenti anomali",
            "detail": f"{_big_low_emp} aziende con fatturato >50M hanno meno di 5 dipendenti dichiarati. Possibile dato mancante o holding senza personale diretto.",
        })

# 3. Anomalia: PD=0 per molte aziende (possibile dato mancante codificato come 0)
_pd_zero = (df_last["probability_of_default_x100"] == 0).sum()
_pd_all = df_last["probability_of_default_x100"].notna().sum()
if _pd_all > 0 and _pd_zero / _pd_all > 0.05:
    anomalies.append({
        "type": "pd_zero",
        "severity": "low",
        "title": "PD = 0% per molte aziende",
        "detail": f"{_pd_zero:,} aziende ({_pd_zero/_pd_all*100:.1f}%) hanno PD esattamente 0%. Potrebbe trattarsi di dati mancanti codificati come zero anzich\u00e9 di rischio nullo effettivo.",
    })

# 4. Anomalia: concentrazione geografica estrema
if "macro_area" in df_last.columns:
    _geo_pcts = df_last["macro_area"].value_counts(normalize=True)
    _top_geo = _geo_pcts.idxmax()
    if _geo_pcts.max() > 0.60:
        anomalies.append({
            "type": "geo_concentration",
            "severity": "low",
            "title": "Concentrazione geografica elevata",
            "detail": f"Il {_geo_pcts.max()*100:.0f}% delle aziende \u00e8 concentrato nell'area '{_top_geo}'. Le statistiche aggregate possono non essere rappresentative delle altre aree.",
        })

# 5. Anomalia: bilanci recenti molto pochi (survival bias)
if len(_years) >= 2:
    _last_yr_count = (df["anno"] == _years[-1]).sum()
    _prev_yr_count = (df["anno"] == _years[-2]).sum()
    if _prev_yr_count > 0 and _last_yr_count / _prev_yr_count < 0.3:
        anomalies.append({
            "type": "survival_bias",
            "severity": "medium",
            "title": f"Pochi bilanci {int(_years[-1])} disponibili",
            "detail": f"Solo {_last_yr_count:,} bilanci nel {int(_years[-1])} vs {_prev_yr_count:,} nel {int(_years[-2])}. Le statistiche dell'ultimo anno possono riflettere un campione non rappresentativo (survival bias).",
        })

anomalies_json_str = json.dumps(anomalies, ensure_ascii=False)
print(f"  Anomalie rilevate: {len(anomalies)}")


# ── 6. GENERAZIONE REPORT HTML PREMIUM ───────────────────────────────────────
print("\n[6/7] Generazione report HTML premium...")

def df_to_premium_table(dataframe, table_id="", dd_key="", dd_col=0):
    """
    dd_key: chiave nel dizionario DD_DATA JS (es. 'rating', 'geo', 'ateco', 'macro', 'size')
    dd_col: indice della colonna usata come chiave di lookup nel drill-down
    """
    tid = f' id="{table_id}"' if table_id else ""
    dk = f' data-dd="{dd_key}" data-dd-col="{dd_col}"' if dd_key else ""
    html = f'<table class="premium-table"{tid}{dk}>\n<thead><tr>'
    ncols = len(dataframe.columns)
    for col in dataframe.columns:
        html += f"<th>{col}</th>"
    html += "</tr></thead>\n<tbody>"
    for _, row in dataframe.iterrows():
        key_val = str(row.iloc[dd_col]) if dd_key else ""
        cls = ' class="dd-parent"' if dd_key else ""
        dv = f' data-key="{key_val}"' if dd_key else ""
        html += f"<tr{cls}{dv}>"
        for val in row:
            v = str(val) if pd.notna(val) else "N/A"
            html += f"<td>{v}</td>"
        html += "</tr>"
        if dd_key:
            html += f'<tr class="dd-row"><td colspan="{ncols}"><div class="dd-container" data-key="{key_val}" data-type="{dd_key}"></div></td></tr>'
    html += "</tbody></table>"
    return html

report_date = datetime.now().strftime("%d/%m/%Y alle %H:%M")

if logo_b64:
    logo_html = f'<img src="data:image/png;base64,{logo_b64}" alt="MEF - Ministero dell\'Economia e delle Finanze" style="height:60px;width:auto;border-radius:4px">'
else:
    logo_html = '<div class="logo-mef-fallback">MEF<small>Ministero dell\'Economia<br>e delle Finanze</small></div>'

# Build BRE rule cards HTML
_bre_cards_parts = []
for r in bre_rules:
    _bre_cards_parts.append(
        f'<div class="bre-rule-card">'
        f'<div class="bre-rule-header" onclick="this.closest(\'.bre-rule-card\').classList.toggle(\'open\')">'
        f'<div class="bre-rule-left">'
        f'<span class="bre-sev bre-sev-{r["severity"]}">{r["severity"]}</span>'
        f'<div><div class="bre-rule-name">{r["id"]}: {r["name"]}</div>'
        f'<div class="bre-rule-desc">{r["desc"]}</div></div></div>'
        f'<div style="display:flex;align-items:center;gap:12px">'
        f'<div class="bre-rule-count">{r["count"]:,}</div>'
        f'<div class="chevron"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg></div>'
        f'</div></div>'
        f'<div class="bre-rule-body"><div class="bre-rule-content">'
        f'<div class="dd-container" data-key="{r["id"]}" data-type="bre"></div>'
        f'</div></div></div>'
    )
_bre_cards_html = "\n".join(_bre_cards_parts)

# Build econometric model HTML blocks
def _econ_model_table(m):
    if not m:
        return '<p style="color:#888;font-style:italic">Modello non stimato (dati insufficienti)</p>'
    h = f'<div class="model-meta">N={m["n_obs"]:,} | Imprese={m["n_ent"]:,} | R\u00b2={m["r2"]:.4f}</div>'
    h += '<table class="premium-table"><thead><tr><th>Variabile</th><th>Coeff.</th><th>SE</th><th>t-stat</th><th>p-value</th><th>Sig.</th></tr></thead><tbody>'
    for v, c in m["coefs"].items():
        sig = "***" if c["p"] < 0.01 else "**" if c["p"] < 0.05 else "*" if c["p"] < 0.1 else ""
        sc = "color:#1B7A43;font-weight:900" if c["p"] < 0.01 else "color:#C17B1E;font-weight:700" if c["p"] < 0.05 else "color:#0066cc" if c["p"] < 0.1 else ""
        h += f'<tr><td><strong>{v}</strong></td><td>{c["b"]:.6f}</td><td>{c["se"]:.6f}</td><td>{c["t"]:.3f}</td><td>{c["p"]:.4f}</td><td style="{sc}">{sig}</td></tr>'
    h += '</tbody></table>'
    return h

_econ_models_html = ""
for mk, mlabel in [("M1", "M1: Investimento (I/K)"), ("M2", "M2: Occupazione (\u0394lnL)"),
                     ("M3", "M3: R&D (ln intangibili)"), ("M4", "M4: EBIT/Produttivit\u00e0"),
                     ("M5", "M5: Valore Aggiunto (lnVA)"), ("M6", "M6: Salari (ln W/L)")]:
    _econ_models_html += f'<h4 style="color:#003366;margin:16px 0 8px;font-size:14px">{mlabel}</h4>'
    _econ_models_html += _econ_model_table(econ_models.get(mk))
    if mk in dd_econ_fe:
        _econ_models_html += f'<div class="econ-dd-toggle" onclick="toggleEconDD(this)" style="cursor:pointer;color:#004d99;font-size:12px;margin:6px 0 12px;font-weight:600"><span style="margin-right:4px">\u25B6</span> Dettaglio Geografico</div>'
        _econ_models_html += f'<div class="dd-container econ-dd-hidden" data-key="{mk}" data-type="econ_fe"></div>'

# Elasticities table
_elas_html = ""
if econ_elasticities:
    _elas_html = '<table class="premium-table" data-dd="econ_elas" data-dd-col="0"><thead><tr><th>Modello</th><th>Label</th><th>Elasticit\u00e0</th><th>SE</th><th>p</th><th>Sig.</th><th>Interpretazione</th></tr></thead><tbody>'
    for ei, e in enumerate(econ_elasticities):
        ekey = f"E{ei}"
        sc = "color:#1B7A43;font-weight:900" if e["p"] < 0.01 else "color:#C17B1E;font-weight:700" if e["p"] < 0.05 else ""
        _elas_html += f'<tr class="dd-parent" data-key="{ekey}"><td>{e["model"][:25]}</td><td><strong>{e["label"]}</strong></td><td>{e["b"]:.6f}</td><td>{e["se"]:.6f}</td><td>{e["p"]:.4f}</td><td style="{sc}">{e["sig"]}</td><td style="font-size:11px;color:#5A6B8A">{e["interp"]}</td></tr>'
        _elas_html += f'<tr class="dd-row"><td colspan="7"><div class="dd-container" data-key="{ekey}" data-type="econ_elas"></div></td></tr>'
    _elas_html += '</tbody></table>'

# DiD HTML
_did_html = ""
for dk, dv in econ_did.items():
    sig = "***" if dv["did_p"] < 0.01 else "**" if dv["did_p"] < 0.05 else "*" if dv["did_p"] < 0.1 else "n.s."
    col = "#1B7A43" if dv["did_p"] < 0.05 else "#5A6B8A"
    _did_html += f'<div style="background:#FAFBFD;border:1px solid #D8DCE3;border-radius:4px;padding:14px 18px;margin-bottom:10px"><strong style="color:#003366">{dv["name"]}</strong><div style="display:flex;gap:24px;margin-top:8px;font-size:13px"><span>DiD(\u03b2\u2083)=<strong style="color:{col}">{dv["did_b"]:.4f} {sig}</strong></span><span>SE={dv["did_se"]:.4f}</span><span>t={dv["did_t"]:.3f}</span><span>p={dv["did_p"]:.4f}</span><span>N={dv["n"]:,}</span><span>R\u00b2={dv["r2"]:.4f}</span></div>'
    if dk in dd_econ_did:
        _did_html += f'<div class="econ-dd-toggle" onclick="toggleEconDD(this)" style="cursor:pointer;color:#004d99;font-size:11px;margin-top:8px;font-weight:600"><span style="margin-right:4px">\u25B6</span> Dettaglio per Macro Area</div>'
        _did_html += f'<div class="dd-container econ-dd-hidden" data-key="{dk}" data-type="econ_did"></div>'
    _did_html += '</div>'

# Survival HTML
_surv_html = ""
if econ_survival:
    s = econ_survival
    _surv_html = f'<div class="model-meta">N={s["n"]:,} | Exit events={s["events"]:,} | C-index={s["c_idx"]:.3f}</div>'
    _surv_html += '<table class="premium-table"><thead><tr><th>Variabile</th><th>Coeff.</th><th>Hazard Ratio</th><th>SE</th><th>p</th><th>Interpretazione</th></tr></thead><tbody>'
    _interp = {"ln_rev": "Aziende pi\u00f9 grandi \u2192 minor rischio exit", "probability_of_default_x100": "PD alta \u2192 maggior rischio exit",
               "gearing_x100": "Leva alta \u2192 maggior rischio exit", "ebitda_margin_x100": "Margini migliori \u2192 minor rischio exit",
               "macro_nord": "Nord \u2192 minor rischio exit", "is_large_s": "Grande dimensione \u2192 minor rischio exit"}
    for v, c in s["coefs"].items():
        hr_col = "#B91C1C" if c["hr"] > 1 else "#1B7A43"
        sig = "***" if c["p"] < 0.01 else "**" if c["p"] < 0.05 else "*" if c["p"] < 0.1 else ""
        _surv_html += f'<tr><td><strong>{v}</strong></td><td>{c["b"]:.4f}</td><td style="color:{hr_col};font-weight:700">{c["hr"]:.4f}</td><td>{c["se"]:.4f}</td><td>{c["p"]:.4f} {sig}</td><td style="font-size:11px;color:#5A6B8A">{_interp.get(v,"")}</td></tr>'
    _surv_html += '</tbody></table>'
    if dd_econ_surv:
        _surv_html += '<div class="econ-dd-toggle" onclick="toggleEconDD(this)" style="cursor:pointer;color:#004d99;font-size:12px;margin:8px 0;font-weight:600"><span style="margin-right:4px">\u25B6</span> Dettaglio per Terzile di Rischio</div>'
        _surv_html += '<div class="dd-container econ-dd-hidden" data-key="cox" data-type="econ_surv"></div>'

# Scenario cards HTML
def _fmt_sc(v):
    if abs(v) >= 1e9: return f"EUR {v/1e9:+,.2f} Mld"
    elif abs(v) >= 1e6: return f"EUR {v/1e6:+,.1f} Mln"
    elif abs(v) >= 1e3: return f"EUR {v/1e3:+,.0f} K"
    else: return f"EUR {v:+,.0f}"

_sc_cards_html = ""
for si, sc in enumerate(econ_scenarios):
    neg = sc["d_va"] < 0
    col = "#B91C1C" if neg else "#1B7A43"
    fp_col = "#1B7A43" if sc["saldo_fp"] >= 0 else "#B91C1C"
    _sc_cards_html += f'''<div style="background:#fff;border:1px solid #D8DCE3;border-left:5px solid {col};border-radius:4px;padding:20px;margin-bottom:16px;box-shadow:0 1px 3px rgba(0,30,60,0.06)">
<h4 style="color:{col};font-size:16px;margin-bottom:4px">{sc["name"]}</h4>
<p style="font-size:12px;color:#5A6B8A;margin-bottom:14px">{sc["desc"]}</p>
<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px">
<div style="background:#F8F9FC;border:1px solid #D8DCE3;border-radius:4px;padding:10px"><div style="font-size:10px;text-transform:uppercase;color:#5A6B8A;font-weight:600">\u0394 Valore Aggiunto</div><div style="font-size:18px;font-weight:900;color:{col}">{_fmt_sc(sc["d_va"])}</div></div>
<div style="background:#F8F9FC;border:1px solid #D8DCE3;border-radius:4px;padding:10px"><div style="font-size:10px;text-transform:uppercase;color:#5A6B8A;font-weight:600">\u0394 Occupazione</div><div style="font-size:18px;font-weight:900;color:#003366">{sc["d_emp"]:+,.0f} addetti</div></div>
<div style="background:#F8F9FC;border:1px solid #D8DCE3;border-radius:4px;padding:10px"><div style="font-size:10px;text-transform:uppercase;color:#5A6B8A;font-weight:600">\u0394 Investimento</div><div style="font-size:18px;font-weight:900;color:#003366">{_fmt_sc(sc["d_inv"])}</div></div>
</div>
<div style="background:#F4F5F7;border-radius:4px;padding:12px 16px;border:1px solid #D8DCE3">
<div style="display:flex;justify-content:space-between;font-size:13px;padding:3px 0"><span>Gettito diretto (IRES 24%)</span><span>{_fmt_sc(sc["tax_new"])}</span></div>
<div style="display:flex;justify-content:space-between;font-size:13px;padding:3px 0"><span>Gettito contributivo</span><span>{_fmt_sc(sc["contrib"])}</span></div>
<div style="display:flex;justify-content:space-between;font-size:13px;padding:3px 0"><span>Gettito IVA</span><span>{_fmt_sc(sc["iva"])}</span></div>
<div style="display:flex;justify-content:space-between;font-size:13px;padding:3px 0;color:#B91C1C"><span>Costo misura</span><span>{_fmt_sc(-abs(sc["cost"]))}</span></div>
<div style="display:flex;justify-content:space-between;font-size:15px;padding:8px 0 3px;border-top:2px solid #003366;margin-top:6px"><strong>SALDO NETTO FP</strong><strong style="color:{fp_col}">{_fmt_sc(sc["saldo_fp"])}</strong></div>
</div>
<div class="econ-dd-toggle" onclick="toggleEconDD(this)" style="cursor:pointer;color:#004d99;font-size:12px;margin-top:12px;font-weight:600"><span style="margin-right:4px">\u25B6</span> Dettaglio per Macro Area</div>
<div class="dd-container econ-dd-hidden" data-key="SC{si}" data-type="econ_sc"></div>
</div>'''

# Interpretazione per-scenario
_sc_interp_map = {
    "Credito R&D +10pp": {"tipo": "Incentivo supply-side", "canale": "Credito d'imposta &rarr; &uarr; R&amp;D &rarr; &uarr; produttivit&agrave; &rarr; &uarr; VA", "pa_impact": "Lo Stato rinuncia a gettito IRES immediato per stimolare innovazione; il ritorno avviene tramite maggiore VA e occupazione qualificata"},
    "Cuneo fiscale -5pp": {"tipo": "Incentivo costo-lavoro", "canale": "Riduzione contributi &rarr; &darr; costo lavoro &rarr; &uarr; assunzioni &rarr; &uarr; output", "pa_impact": "La PA sostiene il costo dei minori contributi; il ritorno avviene tramite nuova occupazione che genera IRPEF, IVA e contributi addizionali"},
    "Domanda pubblica +20%": {"tipo": "Stimolo demand-side", "canale": "Spesa SSN &uarr; &rarr; &uarr; fatturato pharma &rarr; &uarr; investimenti e occupazione", "pa_impact": "La PA aumenta la spesa farmaceutica pubblica (SSN/AIFA); l'effetto moltiplicatore genera gettito superiore al costo tramite VA addizionale"},
    "Shock energetico +30%": {"tipo": "Scenario avverso", "canale": "Costi energia &uarr; &rarr; &darr; margini &rarr; &darr; investimenti e occupazione", "pa_impact": "Shock esogeno negativo: la PA subisce una riduzione di gettito senza un intervento diretto. Evidenzia la vulnerabilit&agrave; del settore"},
}
_sc_interp_rows = ""
for sc in econ_scenarios:
    info = _sc_interp_map.get(sc["name"], {"tipo": "N/A", "canale": "N/A", "pa_impact": "N/A"})
    va_sign = "positivo" if sc["d_va"] >= 0 else "negativo"
    fp_sign = "autofinanziante" if sc["saldo_fp"] >= 0 else "con costo netto"
    _sc_interp_rows += f'''<tr>
<td style="font-weight:600;color:#003366">{sc["name"]}</td>
<td>{info["tipo"]}</td>
<td style="font-size:11px">{info["canale"]}</td>
<td style="font-weight:600;color:{'#1B7A43' if sc['d_va'] >= 0 else '#B91C1C'}">{_fmt_sc(sc['d_va'])}</td>
<td style="font-weight:700;color:{'#1B7A43' if sc['saldo_fp'] >= 0 else '#B91C1C'}">{_fmt_sc(sc['saldo_fp'])} ({fp_sign})</td>
<td style="font-size:11px">{info["pa_impact"]}</td>
</tr>'''

# Scenario chart data
_sc_labels = json.dumps([s["name"][:20] for s in econ_scenarios])
_sc_va = json.dumps([round(s["d_va"]/1e6, 1) for s in econ_scenarios])
_sc_emp = json.dumps([round(s["d_emp"], 0) for s in econ_scenarios])
_sc_saldo = json.dumps([round(s["saldo_fp"]/1e6, 1) for s in econ_scenarios])

# QR HTML
_qr_html = ""
for qi, (qk, qv) in enumerate(econ_quantile.items()):
    _qr_html += f'<h4 style="color:#003366;margin:14px 0 6px">{qv["name"]} (N={qv["n"]:,})</h4>'
    _qr_html += '<table class="premium-table"><thead><tr><th>Variabile</th>'
    qkeys = sorted(qv["qr"].keys())
    for qkey in qkeys:
        _qr_html += f'<th>\u03c4={qkey[1:]}</th>'
    _qr_html += '</tr></thead><tbody>'
    vlist = [v for v in qv["qr"][qkeys[0]].keys() if v != "const"]
    for var in vlist:
        _qr_html += f'<tr><td><strong>{var}</strong></td>'
        for qkey in qkeys:
            c = qv["qr"][qkey][var]
            sig = "***" if c["p"] < 0.01 else "**" if c["p"] < 0.05 else "*" if c["p"] < 0.1 else ""
            _qr_html += f'<td>{c["b"]:.4f}{sig}</td>'
        _qr_html += '</tr>'
    _qr_html += '</tbody></table>'
    # Add drill-down toggles for each quantile
    for qkey in qkeys:
        tkey = f"QR{qi}_{qkey}"
        if tkey in dd_econ_qr:
            _qr_html += f'<div class="econ-dd-toggle" onclick="toggleEconDD(this)" style="cursor:pointer;color:#004d99;font-size:11px;margin:4px 0;font-weight:600;display:inline-block;margin-right:16px"><span style="margin-right:4px">\u25B6</span> Dettaglio \u03c4={qkey[1:]}</div>'
            _qr_html += f'<div class="dd-container econ-dd-hidden" data-key="{tkey}" data-type="econ_qr"></div>'

html_content = f"""<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>MEF - Dashboard KPI Settore Farmaceutico</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Titillium+Web:wght@300;400;600;700;900&display=swap" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js"></script>
<style>
  :root {{
    --mef-blue-dark: #003366;
    --mef-blue: #004d99;
    --mef-blue-light: #0066cc;
    --mef-gold: #B5985A;
    --mef-gold-light: #D4B978;
    --mef-gold-pale: #F5EFE0;
    --mef-bg: #F4F5F7;
    --mef-white: #FFFFFF;
    --mef-text: #1B2A4A;
    --mef-text-light: #5A6B8A;
    --mef-border: #D8DCE3;
    --mef-success: #1B7A43;
    --mef-warning: #C17B1E;
    --mef-danger: #B91C1C;
    --mef-section-bg: #FAFBFD;
    --shadow-sm: 0 1px 3px rgba(0,30,60,0.06);
    --shadow-md: 0 4px 16px rgba(0,30,60,0.08);
    --shadow-lg: 0 8px 32px rgba(0,30,60,0.12);
    --radius: 4px;
    --radius-lg: 8px;
  }}

  *, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}
  html {{ scroll-behavior: smooth; }}
  body {{
    font-family: 'Titillium Web', 'Segoe UI', Roboto, sans-serif;
    background: var(--mef-bg);
    color: var(--mef-text);
    line-height: 1.65;
    font-size: 15px;
  }}

  /* ── HEADER (stile MEF istituzionale) ───────────────────────────── */
  .top-bar {{
    background: var(--mef-blue-dark);
    color: rgba(255,255,255,0.6);
    font-size: 11px;
    padding: 6px 0;
    letter-spacing: 0.3px;
  }}
  .top-bar-inner {{
    max-width: 1320px;
    margin: 0 auto;
    padding: 0 40px;
    display: flex;
    justify-content: space-between;
  }}
  .header {{
    background: var(--mef-white);
    border-bottom: 4px solid var(--mef-gold);
    position: sticky;
    top: 0;
    z-index: 1000;
    box-shadow: var(--shadow-md);
  }}
  .header-inner {{
    max-width: 1320px;
    margin: 0 auto;
    padding: 16px 40px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }}
  .header-left {{
    display: flex;
    align-items: center;
    gap: 24px;
  }}
  .logo-mef {{
    display: flex;
    align-items: center;
    gap: 16px;
  }}
  .logo-mef img {{
    height: 56px;
    width: auto;
  }}
  .logo-mef-fallback {{
    font-size: 28px;
    font-weight: 900;
    color: var(--mef-blue-dark);
    letter-spacing: -1px;
    line-height: 1;
  }}
  .logo-mef-fallback small {{
    display: block;
    font-size: 10px;
    font-weight: 400;
    color: var(--mef-text-light);
    letter-spacing: 0.5px;
    text-transform: uppercase;
    margin-top: 2px;
  }}
  .header-divider {{
    width: 1px;
    height: 48px;
    background: var(--mef-border);
  }}
  .header-title h1 {{
    font-size: 20px;
    font-weight: 700;
    color: var(--mef-blue-dark);
    letter-spacing: -0.3px;
    line-height: 1.2;
  }}
  .header-title p {{
    font-size: 13px;
    color: var(--mef-text-light);
    font-weight: 400;
    margin-top: 2px;
  }}
  .header-right {{
    text-align: right;
  }}
  .header-right .date {{
    font-size: 13px;
    font-weight: 600;
    color: var(--mef-blue-dark);
  }}
  .header-right .meta {{
    font-size: 11px;
    color: var(--mef-text-light);
    margin-top: 2px;
  }}

  /* ── NAVIGATION ───────────────────────────────────────────────────── */
  .nav-bar {{
    background: var(--mef-blue-dark);
  }}
  .nav-inner {{
    max-width: 1320px;
    margin: 0 auto;
    padding: 0 40px;
    display: flex;
    gap: 0;
    overflow-x: auto;
  }}
  .nav-inner::-webkit-scrollbar {{ height: 0; }}
  .nav-item {{
    padding: 13px 22px;
    color: rgba(255,255,255,0.65);
    text-decoration: none;
    font-size: 12.5px;
    font-weight: 600;
    white-space: nowrap;
    border-bottom: 3px solid transparent;
    transition: all 0.2s;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }}
  .nav-item:hover, .nav-item.active {{
    color: #fff;
    border-bottom-color: var(--mef-gold);
    background: rgba(255,255,255,0.06);
  }}

  /* ── MAIN LAYOUT ──────────────────────────────────────────────────── */
  .main {{
    max-width: 1320px;
    margin: 0 auto;
    padding: 32px 40px 60px;
  }}

  /* ── KPI HERO CARDS ───────────────────────────────────────────────── */
  .hero-grid {{
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 16px;
    margin-bottom: 32px;
  }}
  .hero-card {{
    background: var(--mef-white);
    border-radius: var(--radius);
    padding: 20px 22px;
    box-shadow: var(--shadow-sm);
    border: 1px solid var(--mef-border);
    border-top: 3px solid var(--mef-gold);
    transition: box-shadow 0.2s, transform 0.2s;
    position: relative;
  }}
  .hero-card:hover {{
    box-shadow: var(--shadow-md);
    transform: translateY(-2px);
  }}
  .hero-label {{
    font-size: 10.5px;
    color: var(--mef-text-light);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    margin-bottom: 6px;
  }}
  .hero-value {{
    font-size: 26px;
    font-weight: 900;
    color: var(--mef-blue-dark);
    line-height: 1.1;
    letter-spacing: -0.5px;
  }}
  .hero-sub {{
    font-size: 12px;
    color: var(--mef-text-light);
    margin-top: 6px;
  }}
  .hero-comment {{
    font-size: 11.5px;
    color: var(--mef-text-light);
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid var(--mef-border);
    line-height: 1.5;
    font-style: italic;
  }}

  /* ── ANOMALY ALERTS ─────────────────────────────────────────────── */
  .anomaly-bar {{
    margin: 0 auto 24px;
    max-width: 1400px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }}
  .anomaly-alert {{
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 12px 18px;
    border-radius: 8px;
    font-size: 13px;
    line-height: 1.5;
    cursor: pointer;
    transition: all .2s;
  }}
  .anomaly-alert:hover {{ filter: brightness(0.97); }}
  .anomaly-alert.severity-high {{
    background: #fef2f2;
    border-left: 4px solid #dc2626;
    color: #991b1b;
  }}
  .anomaly-alert.severity-medium {{
    background: #fffbeb;
    border-left: 4px solid #d97706;
    color: #92400e;
  }}
  .anomaly-alert.severity-low {{
    background: #eff6ff;
    border-left: 4px solid #2563eb;
    color: #1e40af;
  }}
  .anomaly-icon {{
    font-size: 18px;
    flex-shrink: 0;
    margin-top: 1px;
  }}
  .anomaly-body {{ flex: 1; }}
  .anomaly-title {{
    font-weight: 700;
    margin-bottom: 2px;
  }}
  .anomaly-detail {{
    font-size: 12px;
    opacity: 0;
    max-height: 0;
    overflow: hidden;
    transition: all .3s;
  }}
  .anomaly-alert.expanded .anomaly-detail {{
    opacity: 1;
    max-height: 200px;
    margin-top: 4px;
  }}

  /* ── SECTION / DRILLDOWN ──────────────────────────────────────────── */
  .section {{
    background: var(--mef-white);
    border-radius: var(--radius);
    margin-bottom: 20px;
    box-shadow: var(--shadow-sm);
    border: 1px solid var(--mef-border);
    overflow: hidden;
  }}
  .section-header {{
    padding: 18px 24px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: space-between;
    user-select: none;
    transition: background 0.15s;
    border-bottom: 1px solid transparent;
    border-left: 4px solid var(--mef-gold);
  }}
  .section-header:hover {{ background: var(--mef-section-bg); }}
  .section.open .section-header {{
    border-bottom-color: var(--mef-border);
    background: var(--mef-section-bg);
  }}
  .section-header h2 {{
    font-size: 16px;
    font-weight: 700;
    color: var(--mef-blue-dark);
    display: flex;
    align-items: center;
    gap: 12px;
  }}
  .section-header h2 .sec-num {{
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px; height: 28px;
    border-radius: 50%;
    background: var(--mef-blue-dark);
    color: white;
    font-size: 12px;
    font-weight: 700;
    flex-shrink: 0;
  }}
  .section-badge {{
    font-size: 11px;
    background: var(--mef-gold-pale);
    color: var(--mef-gold);
    padding: 3px 12px;
    border-radius: var(--radius);
    font-weight: 700;
    letter-spacing: 0.3px;
    text-transform: uppercase;
  }}
  .chevron {{
    width: 24px; height: 24px;
    display: flex; align-items: center; justify-content: center;
    transition: transform 0.3s;
    flex-shrink: 0;
    margin-left: 12px;
  }}
  .chevron svg {{ width: 14px; height: 14px; color: var(--mef-text-light); }}
  .section.open .chevron {{ transform: rotate(180deg); }}
  .section-body {{
    max-height: 0;
    overflow: hidden;
    transition: max-height 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  }}
  .section.open .section-body {{ max-height: 8000px; }}
  .section-content {{ padding: 24px; }}

  /* ── SECTION COMMENT ──────────────────────────────────────────────── */
  .section-comment {{
    background: linear-gradient(135deg, #F8F6F0 0%, var(--mef-gold-pale) 100%);
    border-left: 3px solid var(--mef-gold);
    padding: 14px 18px;
    margin-bottom: 20px;
    border-radius: 0 var(--radius) var(--radius) 0;
    font-size: 13px;
    color: var(--mef-text);
    line-height: 1.6;
  }}
  .section-comment strong {{
    color: var(--mef-blue-dark);
    font-weight: 700;
  }}

  /* ── SUB DRILLDOWN (nested) ───────────────────────────────────────── */
  .sub-drilldown {{
    border: 1px solid var(--mef-border);
    border-radius: var(--radius);
    margin-top: 16px;
    overflow: hidden;
  }}
  .sub-drilldown-header {{
    padding: 12px 18px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--mef-section-bg);
    font-size: 13px;
    font-weight: 600;
    color: var(--mef-blue-dark);
    transition: background 0.15s;
  }}
  .sub-drilldown-header:hover {{ background: #EEF1F6; }}
  .sub-drilldown.open .sub-drilldown-header {{ background: var(--mef-gold-pale); }}
  .sub-drilldown-body {{
    max-height: 0;
    overflow: hidden;
    transition: max-height 0.35s cubic-bezier(0.4, 0, 0.2, 1);
  }}
  .sub-drilldown.open .sub-drilldown-body {{ max-height: 5000px; }}
  .sub-drilldown-content {{ padding: 16px 18px; }}

  /* ── PREMIUM TABLES (compact) ─────────────────────────────────────── */
  .premium-table {{
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    border-radius: var(--radius);
    overflow: hidden;
    font-size: 12.5px;
    border: 1px solid var(--mef-border);
  }}
  .premium-table thead th {{
    background: var(--mef-blue-dark);
    color: white;
    padding: 6px 10px;
    text-align: left;
    font-weight: 600;
    font-size: 10.5px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    position: sticky;
    top: 0;
    line-height: 1.3;
  }}
  .premium-table tbody td {{
    padding: 5px 10px;
    border-bottom: 1px solid #EEF0F4;
    color: var(--mef-text);
    font-variant-numeric: tabular-nums;
    line-height: 1.3;
  }}
  .premium-table tbody tr {{ transition: background 0.15s; }}
  .premium-table tbody tr:hover {{ background: #F0F4FF; }}
  .premium-table tbody tr:nth-child(even):not(.dd-row) {{ background: #FAFBFD; }}
  .premium-table tbody tr:nth-child(even):not(.dd-row):hover {{ background: #F0F4FF; }}

  /* ── ROW DRILL-DOWN (Level 0: premium-table rows) ───────────────── */
  .premium-table tbody tr.dd-parent {{
    cursor: pointer;
  }}
  .premium-table tbody tr.dd-parent > td:first-child {{
    position: relative;
    padding-left: 22px;
  }}
  .premium-table tbody tr.dd-parent > td:first-child::before {{
    content: '\\25B6';
    position: absolute;
    left: 6px;
    top: 50%;
    transform: translateY(-50%);
    font-size: 8px;
    color: var(--mef-gold);
    transition: transform 0.2s;
  }}
  .premium-table tbody tr.dd-parent.dd-open > td:first-child::before {{
    transform: translateY(-50%) rotate(90deg);
  }}
  .premium-table tbody tr.dd-parent:hover {{ background: var(--mef-gold-pale) !important; }}
  .premium-table tbody tr.dd-row {{ display: none; }}
  .premium-table tbody tr.dd-row.dd-visible {{ display: table-row; }}
  .premium-table tbody tr.dd-row > td {{
    padding: 0;
    background: #F8F9FC;
    border-bottom: 1px solid var(--mef-border);
  }}
  .dd-inner {{
    padding: 10px 14px 10px 24px;
    animation: ddSlide 0.2s ease;
  }}
  @keyframes ddSlide {{
    from {{ opacity: 0; transform: translateY(-6px); }}
    to {{ opacity: 1; transform: translateY(0); }}
  }}

  /* ── Multi-level drill-down tables ──────────────────────────────── */
  .dd-tbl {{
    width: 100%;
    border-collapse: collapse;
    font-size: 11.5px;
    margin: 2px 0;
  }}
  .dd-tbl th {{
    background: var(--mef-blue-dark);
    color: white;
    padding: 4px 8px;
    text-align: left;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }}
  .dd-tbl td {{
    padding: 3px 8px;
    border-bottom: 1px solid #E0E3EA;
    color: var(--mef-text);
    line-height: 1.3;
    font-variant-numeric: tabular-nums;
  }}
  .dd-tbl tr:hover {{ background: #EDF0F8; }}
  .dd-tbl tr:nth-child(even):not(.mldd-child) {{ background: #F4F5F9; }}
  /* clickable rows with arrow */
  .dd-tbl tr.mldd {{
    cursor: pointer;
  }}
  .dd-tbl tr.mldd > td:first-child {{
    position: relative;
    padding-left: 18px;
  }}
  .dd-tbl tr.mldd > td:first-child::before {{
    content: '\\25B6';
    position: absolute;
    left: 4px;
    top: 50%;
    transform: translateY(-50%);
    font-size: 7px;
    color: var(--mef-gold);
    transition: transform 0.2s;
  }}
  .dd-tbl tr.mldd.dd-open > td:first-child::before {{
    transform: translateY(-50%) rotate(90deg);
  }}
  .dd-tbl tr.mldd:hover {{ background: var(--mef-gold-pale) !important; }}
  .dd-tbl tr.mldd-child > td {{
    padding: 0;
    border-bottom: 1px solid var(--mef-border);
  }}
  .mldd-wrap {{
    padding: 8px 10px 8px 20px;
    animation: ddSlide 0.15s ease;
  }}
  /* Level 2 nested tables */
  .dd-tbl-l2 th {{ background: #1B4D7A; }}
  .dd-tbl-l2 td {{ font-size: 11px; padding: 2px 7px; }}
  .dd-tbl-l2 tr:nth-child(even):not(.mldd-child) {{ background: #EEF0F6; }}
  /* Level 3 nested tables */
  .dd-tbl-l3 th {{ background: #3A6B8A; }}
  .dd-tbl-l3 td {{ font-size: 10.5px; padding: 2px 6px; color: #3A4A6A; }}
  .dd-tbl-l3 tr:nth-child(even) {{ background: #E8EBF2; }}

  /* ── CHART CONTAINERS ─────────────────────────────────────────────── */
  .chart-row {{
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
    margin-bottom: 20px;
  }}
  .chart-box {{
    background: var(--mef-section-bg);
    border-radius: var(--radius);
    padding: 18px;
    border: 1px solid var(--mef-border);
  }}
  .chart-box h3 {{
    font-size: 13px;
    font-weight: 700;
    color: var(--mef-blue-dark);
    margin-bottom: 14px;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--mef-border);
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }}
  .chart-box canvas {{ max-height: 300px; }}

  /* ── INDICATOR BADGES ───────────────────────────────────────────── */
  .badge-risk-low {{ background: #E8F5E9; color: var(--mef-success); padding: 2px 8px; border-radius: 3px; font-size: 11px; font-weight: 600; }}
  .badge-risk-med {{ background: #FFF3E0; color: var(--mef-warning); padding: 2px 8px; border-radius: 3px; font-size: 11px; font-weight: 600; }}
  .badge-risk-high {{ background: #FFEBEE; color: var(--mef-danger); padding: 2px 8px; border-radius: 3px; font-size: 11px; font-weight: 600; }}

  /* ── FOOTER ───────────────────────────────────────────────────────── */
  .footer {{
    background: var(--mef-blue-dark);
    color: white;
    padding: 28px 40px;
    margin-top: 40px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-radius: var(--radius);
    border-top: 3px solid var(--mef-gold);
  }}
  .footer-left {{ font-size: 13px; opacity: 0.9; }}
  .footer-left strong {{ color: var(--mef-gold-light); }}
  .footer-right {{ font-size: 11px; opacity: 0.5; }}

  /* ── RESPONSIVE ───────────────────────────────────────────────────── */
  @media (max-width: 900px) {{
    .header-inner {{ padding: 14px 20px; }}
    .main {{ padding: 20px; }}
    .hero-grid {{ grid-template-columns: repeat(2, 1fr); }}
    .chart-row {{ grid-template-columns: 1fr; }}
    .nav-inner {{ padding: 0 16px; }}
    .top-bar-inner {{ padding: 0 20px; }}
  }}
  @media (max-width: 500px) {{
    .hero-grid {{ grid-template-columns: 1fr; }}
  }}

  /* ── MODEL META ──────────────────────────────────────────────────── */
  .model-meta {{
    font-size: 12px; color: var(--mef-text-light); margin-bottom: 10px;
    padding: 8px 14px; background: #F8F9FC; border-radius: var(--radius);
    border: 1px solid var(--mef-border); font-weight: 600;
  }}
  .econ-dd-hidden {{
    display: none; margin-top: 6px; margin-bottom: 12px;
  }}
  .econ-dd-hidden.econ-dd-open {{
    display: block;
  }}
  .econ-dd-toggle:hover {{
    text-decoration: underline;
  }}
  .econ-dd-toggle.econ-dd-active span:first-child {{
    display: inline-block; transform: rotate(90deg); transition: transform 0.2s;
  }}

  /* ── CHATBOT SIDEBAR ──────────────────────────────────────────────── */
  .fab-bar {{
    position: fixed; bottom: 28px; right: 28px; z-index: 9999;
    display: flex; gap: 0; border-radius: 50px; overflow: hidden;
    box-shadow: 0 4px 20px rgba(0,30,60,0.3);
    transition: right 0.35s cubic-bezier(0.4,0,0.2,1);
  }}
  body.chatbot-active .fab-bar {{ right: 428px; }}
  .chatbot-toggle {{
    background: linear-gradient(135deg, var(--mef-blue-dark), var(--mef-blue));
    color: #fff; border: none;
    padding: 14px 24px; font-family: var(--font); font-size: 14px; font-weight: 700;
    cursor: pointer;
    display: flex; align-items: center; gap: 10px;
    transition: background 0.3s;
  }}
  .chatbot-toggle:hover {{ background: linear-gradient(135deg, #002244, var(--mef-blue-dark)); }}
  .chatbot-toggle svg {{ width: 20px; height: 20px; fill: #fff; }}

  .chatbot-sidebar {{
    position: fixed; top: 0; right: 0; width: 400px; height: 100vh;
    background: #fff; z-index: 10000;
    transform: translateX(100%); transition: transform 0.35s cubic-bezier(0.4,0,0.2,1);
    display: flex; flex-direction: column;
    box-shadow: -4px 0 30px rgba(0,30,60,0.15);
    font-family: var(--font);
  }}
  .chatbot-sidebar.open {{ transform: translateX(0); }}
  body.chatbot-active .main {{ margin-right: 400px; transition: margin-right 0.35s cubic-bezier(0.4,0,0.2,1); }}
  body.chatbot-active .nav-bar {{ right: 400px; transition: right 0.35s cubic-bezier(0.4,0,0.2,1); }}
  body.chatbot-active .header {{ margin-right: 400px; transition: margin-right 0.35s cubic-bezier(0.4,0,0.2,1); }}

  .chatbot-header {{
    background: linear-gradient(135deg, var(--mef-blue-dark) 0%, #001a33 100%);
    color: #fff; padding: 18px 20px;
    display: flex; justify-content: space-between; align-items: center;
    border-bottom: 3px solid var(--mef-gold);
  }}
  .chatbot-header-title {{ font-size: 16px; font-weight: 700; }}
  .chatbot-header-sub {{ font-size: 11px; color: var(--mef-gold); margin-top: 2px; }}
  .chatbot-close {{
    background: rgba(255,255,255,0.15); border: none; color: #fff;
    width: 32px; height: 32px; border-radius: 50%;
    font-size: 18px; cursor: pointer; display: flex; align-items: center; justify-content: center;
  }}
  .chatbot-close:hover {{ background: rgba(255,255,255,0.25); }}

  .chatbot-messages {{
    flex: 1; overflow-y: auto; padding: 16px;
    background: #F8F9FC;
  }}
  .chat-msg {{
    margin-bottom: 14px; display: flex;
  }}
  .chat-msg-user {{ justify-content: flex-end; }}
  .chat-msg-ai {{ justify-content: flex-start; }}
  .chat-bubble {{
    max-width: 85%; padding: 12px 16px; border-radius: 12px;
    font-size: 13px; line-height: 1.55; word-wrap: break-word;
  }}
  .chat-msg-user .chat-bubble {{
    background: linear-gradient(135deg, var(--mef-blue-dark), var(--mef-blue));
    color: #fff; border-bottom-right-radius: 4px;
  }}
  .chat-msg-ai .chat-bubble {{
    background: #fff; color: var(--mef-text);
    border: 1px solid var(--mef-border);
    border-bottom-left-radius: 4px;
    box-shadow: 0 1px 3px rgba(0,30,60,0.06);
  }}
  .chat-bubble strong {{ color: var(--mef-blue-dark); }}
  .chat-typing {{ color: var(--mef-text-light); font-style: italic; }}

  .chatbot-input {{
    padding: 14px; border-top: 1px solid var(--mef-border);
    background: #fff; display: flex; gap: 10px;
  }}
  .chatbot-input input {{
    flex: 1; padding: 10px 14px; border: 1px solid var(--mef-border);
    border-radius: 8px; font-family: var(--font); font-size: 13px;
    outline: none; transition: border 0.2s;
  }}
  .chatbot-input input:focus {{ border-color: var(--mef-blue); }}
  .chatbot-input button {{
    background: var(--mef-blue-dark); color: #fff; border: none;
    padding: 10px 18px; border-radius: 8px; font-family: var(--font);
    font-weight: 700; font-size: 13px; cursor: pointer;
    transition: background 0.2s;
  }}
  .chatbot-input button:hover {{ background: var(--mef-blue); }}

  .chatbot-welcome {{
    text-align: center; padding: 30px 20px; color: var(--mef-text-light);
  }}
  .chatbot-welcome h4 {{ color: var(--mef-blue-dark); margin-bottom: 8px; font-size: 15px; }}
  .chatbot-welcome p {{ font-size: 12px; line-height: 1.6; }}
  .chatbot-suggestions {{
    display: flex; flex-direction: column; gap: 6px; margin-top: 12px;
  }}
  .chatbot-suggestion {{
    background: #fff; border: 1px solid var(--mef-border); border-radius: 8px;
    padding: 8px 12px; font-size: 11px; color: var(--mef-blue-dark);
    cursor: pointer; text-align: left; transition: all 0.2s;
    line-height: 1.4;
  }}
  .chatbot-suggestion:hover {{ border-color: var(--mef-blue); background: #F0F4FA; }}
  .chatbot-suggestion .sc-tag {{
    display: inline-block; background: var(--mef-blue-dark); color: #fff;
    font-size: 9px; font-weight: 700; padding: 2px 6px; border-radius: 3px;
    margin-right: 6px; vertical-align: middle;
  }}
  .chatbot-suggestion .sc-tag-dash {{
    background: var(--mef-gold); color: #fff;
  }}
  .chatbot-section-title {{
    font-size: 10px; text-transform: uppercase; color: var(--mef-text-light);
    font-weight: 700; letter-spacing: 0.5px; margin: 14px 0 6px; padding-left: 2px;
  }}
  .chatbot-section-title:first-child {{ margin-top: 0; }}

  /* Transition defaults for sidebar push */
  .main {{ transition: margin-right 0.35s cubic-bezier(0.4,0,0.2,1); }}
  .header {{ transition: margin-right 0.35s cubic-bezier(0.4,0,0.2,1); }}

  /* Export PDF button */
  .export-pdf-btn {{
    background: linear-gradient(135deg, var(--mef-gold), #C9A84C);
    color: #fff; border: none; border-right: 1px solid rgba(255,255,255,0.3);
    padding: 14px 20px; font-family: var(--font); font-size: 14px; font-weight: 700;
    cursor: pointer;
    display: flex; align-items: center; gap: 8px;
    transition: background 0.3s;
  }}
  .export-pdf-btn:hover {{ background: linear-gradient(135deg, #C9A84C, #B5985A); }}
  .export-pdf-btn svg {{ width: 18px; height: 18px; fill: #fff; }}

  /* ── PRINT / PDF STYLES ───────────────────────────────────────────── */
  @media print {{
    body {{ background: #fff !important; font-size: 10pt; }}
    .header {{ position: relative !important; box-shadow: none !important; margin-right: 0 !important; page-break-after: avoid; }}
    .nav-bar, .filter-bar, .fab-bar, .chatbot-sidebar,
    .chevron, #filterActiveLabel {{ display: none !important; }}
    .main {{ padding: 0 !important; margin: 0 !important; }}
    .section {{ break-inside: avoid; page-break-inside: avoid; border: 1px solid #ccc !important; margin-bottom: 12pt !important; }}
    .section-body {{ max-height: none !important; overflow: visible !important; }}
    .section-content {{ padding: 12pt !important; }}
    .sub-drilldown-body {{ max-height: none !important; overflow: visible !important; }}
    .sub-drilldown-content {{ padding: 10pt !important; }}
    .hero-grid {{ page-break-after: always; }}
    .hero-card {{ box-shadow: none !important; border: 1px solid #ccc !important; }}
    .chart-box {{ page-break-inside: avoid; }}
    .premium-table {{ font-size: 9pt; }}
    .premium-table th {{ background: #003366 !important; color: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }}
    .section-header {{ background: #f5f5f5 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }}
    .sec-num {{ background: #003366 !important; color: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }}
    .bre-section {{ page-break-before: always; }}
    .bre-rule-body {{ display: block !important; max-height: none !important; }}
    .dd-row {{ display: none !important; }}
    .footer {{ page-break-before: always; border-top: 2px solid #003366; }}
    .econ-dd-hidden {{ display: none !important; }}
    a {{ color: #003366 !important; text-decoration: none !important; }}
    /* Intestazione di stampa */
    @page {{ margin: 15mm 12mm; size: A4; }}
  }}

  /* ── FILTER BAR ──────────────────────────────────────────────────── */
  .filter-bar {{
    background: linear-gradient(135deg, #F8F9FC 0%, #EEF1F8 100%);
    border-bottom: 1px solid var(--mef-border);
    padding: 10px 0;
  }}
  .filter-inner {{
    max-width: 1320px;
    margin: 0 auto;
    padding: 0 40px;
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }}
  .filter-label {{
    font-size: 11px;
    font-weight: 700;
    color: var(--mef-blue-dark);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    white-space: nowrap;
  }}
  .filter-select {{
    font-family: 'Titillium Web', sans-serif;
    font-size: 12px;
    padding: 5px 28px 5px 10px;
    border: 1px solid var(--mef-border);
    border-radius: var(--radius);
    background: var(--mef-white);
    color: var(--mef-text);
    cursor: pointer;
    appearance: none;
    -webkit-appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%235A6B8A'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 8px center;
    min-width: 130px;
    transition: border-color 0.2s, box-shadow 0.2s;
  }}
  .filter-select:hover {{ border-color: var(--mef-blue-light); }}
  .filter-select:focus {{ outline: none; border-color: var(--mef-gold); box-shadow: 0 0 0 2px rgba(181,152,90,0.2); }}
  .filter-reset {{
    font-family: 'Titillium Web', sans-serif;
    font-size: 11px;
    font-weight: 600;
    padding: 5px 14px;
    border: 1px solid var(--mef-border);
    border-radius: var(--radius);
    background: var(--mef-white);
    color: var(--mef-text-light);
    cursor: pointer;
    transition: all 0.2s;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }}
  .filter-reset:hover {{ background: var(--mef-danger); color: white; border-color: var(--mef-danger); }}
  .filter-active-label {{
    font-size: 11px;
    color: var(--mef-gold);
    font-weight: 700;
    padding: 3px 10px;
    background: rgba(181,152,90,0.12);
    border-radius: var(--radius);
    display: none;
  }}
  .filter-active-label.visible {{ display: inline-block; }}

  /* ── QUALITY TOGGLE ────────────────────────────────────────────── */
  .quality-toggle {{
    display: inline-flex;
    border-radius: 8px;
    overflow: hidden;
    border: 2px solid var(--mef-blue);
    margin-left: 4px;
  }}
  .qt-btn {{
    border: none;
    padding: 6px 14px;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    transition: all .2s;
    font-family: inherit;
    display: flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
  }}
  .qt-all {{
    background: transparent;
    color: var(--mef-blue);
  }}
  .qt-good {{
    background: transparent;
    color: #059669;
  }}
  .qt-all.active {{
    background: var(--mef-blue);
    color: white;
  }}
  .qt-good.active {{
    background: #059669;
    color: white;
  }}
  .qt-btn:hover {{ filter: brightness(1.1); }}
  .qt-pct {{
    font-size: 11px;
    opacity: 0.85;
    padding: 1px 5px;
    border-radius: 4px;
    background: rgba(255,255,255,0.25);
  }}

  /* ── ATECO KPI TABLE ───────────────────────────────────────────── */
  .ateco-kpi-section {{
    background: var(--mef-white);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    padding: 0;
    margin-bottom: 24px;
    overflow: hidden;
  }}
  .ateco-kpi-section .section-title {{
    padding: 16px 24px;
    margin: 0;
    font-size: 16px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
    background: linear-gradient(135deg, var(--mef-blue) 0%, #1e3a5f 100%);
    color: white;
  }}
  .ateco-kpi-section .section-arrow {{
    transition: transform .2s;
    font-size: 12px;
  }}
  .ateco-kpi-section.collapsed .section-arrow {{ transform: rotate(-90deg); }}
  .ateco-kpi-section.collapsed .section-body {{ display: none; }}
  .ateco-kpi-section .section-body {{ padding: 16px; }}

  .ateco-kpi-table {{
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }}
  .ateco-kpi-table th {{
    background: #f1f5f9;
    padding: 8px 10px;
    font-weight: 700;
    color: var(--mef-blue);
    border-bottom: 2px solid var(--mef-blue);
    text-align: center;
    white-space: nowrap;
    font-size: 11px;
  }}
  .ateco-kpi-table td {{
    padding: 7px 10px;
    border-bottom: 1px solid #e2e8f0;
    text-align: center;
  }}
  .ateco-kpi-table tbody tr:hover {{ background: #f8fafc; }}
  .ateco-kpi-table .ateco-row-selected {{
    background: rgba(181,152,90,0.12) !important;
    border-left: 3px solid var(--mef-gold);
  }}

  /* ── BRE (Business Rules Engine) ───────────────────────────────── */
  .bre-section {{
    background: var(--mef-white);
    border-radius: var(--radius);
    margin-bottom: 20px;
    box-shadow: var(--shadow-md);
    border: 2px solid var(--mef-danger);
    overflow: hidden;
  }}
  .bre-header {{
    padding: 18px 24px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: space-between;
    user-select: none;
    background: linear-gradient(135deg, #FFF5F5 0%, #FFEBEE 100%);
    border-bottom: 1px solid transparent;
    border-left: 4px solid var(--mef-danger);
    transition: background 0.15s;
  }}
  .bre-header:hover {{ background: #FFEBEE; }}
  .bre-section.open .bre-header {{
    border-bottom-color: var(--mef-border);
  }}
  .bre-header h2 {{
    font-size: 16px;
    font-weight: 700;
    color: var(--mef-danger);
    display: flex;
    align-items: center;
    gap: 12px;
  }}
  .bre-header h2 .bre-icon {{
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px; height: 32px;
    border-radius: 50%;
    background: var(--mef-danger);
    color: white;
    font-size: 16px;
    flex-shrink: 0;
  }}
  .bre-badges {{
    display: flex;
    gap: 8px;
    align-items: center;
  }}
  .bre-badge-critical {{
    font-size: 11px;
    background: var(--mef-danger);
    color: white;
    padding: 3px 12px;
    border-radius: var(--radius);
    font-weight: 700;
    letter-spacing: 0.3px;
    text-transform: uppercase;
  }}
  .bre-badge-count {{
    font-size: 11px;
    background: #FFF3E0;
    color: var(--mef-warning);
    padding: 3px 12px;
    border-radius: var(--radius);
    font-weight: 700;
  }}
  .bre-body {{
    max-height: 0;
    overflow: hidden;
    transition: max-height 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  }}
  .bre-section.open .bre-body {{ max-height: 8000px; }}
  .bre-content {{ padding: 24px; }}

  .bre-rule-card {{
    background: var(--mef-section-bg);
    border: 1px solid var(--mef-border);
    border-radius: var(--radius);
    margin-bottom: 10px;
    overflow: hidden;
    transition: box-shadow 0.2s;
  }}
  .bre-rule-card:hover {{ box-shadow: var(--shadow-sm); }}
  .bre-rule-header {{
    padding: 12px 18px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: space-between;
    transition: background 0.15s;
  }}
  .bre-rule-header:hover {{ background: #F0F4FF; }}
  .bre-rule-card.open .bre-rule-header {{ background: #F8F9FC; border-bottom: 1px solid var(--mef-border); }}
  .bre-rule-left {{
    display: flex;
    align-items: center;
    gap: 12px;
    flex: 1;
  }}
  .bre-sev {{
    font-size: 9px;
    font-weight: 800;
    padding: 2px 8px;
    border-radius: 3px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    white-space: nowrap;
  }}
  .bre-sev-CRITICO {{ background: #FFEBEE; color: var(--mef-danger); }}
  .bre-sev-ALTO {{ background: #FFF3E0; color: var(--mef-warning); }}
  .bre-sev-MEDIO {{ background: #E3F2FD; color: var(--mef-blue); }}
  .bre-rule-name {{
    font-size: 13px;
    font-weight: 600;
    color: var(--mef-text);
  }}
  .bre-rule-desc {{
    font-size: 11px;
    color: var(--mef-text-light);
    margin-top: 2px;
  }}
  .bre-rule-count {{
    font-size: 18px;
    font-weight: 900;
    color: var(--mef-blue-dark);
    white-space: nowrap;
    min-width: 60px;
    text-align: right;
  }}
  .bre-rule-body {{
    max-height: 0;
    overflow: hidden;
    transition: max-height 0.35s cubic-bezier(0.4, 0, 0.2, 1);
  }}
  .bre-rule-card.open .bre-rule-body {{ max-height: 5000px; }}
  .bre-rule-content {{ padding: 14px 18px; }}

  @media print {{
    .header {{ position: relative; }}
    .section-body {{ max-height: none !important; }}
    .bre-body {{ max-height: none !important; }}
    .bre-rule-body {{ max-height: none !important; }}
    .section {{ break-inside: avoid; }}
    .nav-bar, .top-bar, .filter-bar {{ display: none; }}
  }}
</style>
</head>
<body>

<!-- ══ TOP BAR ═══════════════════════════════════════════════════════ -->
<div class="top-bar">
  <div class="top-bar-inner">
    <span>Ministero dell'Economia e delle Finanze &mdash; Dipartimento del Tesoro</span>
    <span>Analisi Rischio Creditizio &bull; Settore Farmaceutico</span>
  </div>
</div>

<!-- ══ HEADER ════════════════════════════════════════════════════════ -->
<div class="header">
  <div class="header-inner">
    <div class="header-left">
      <div class="logo-mef">
        {logo_html}
      </div>
      <div class="header-divider"></div>
      <div class="header-title">
        <h1>Dashboard KPI &mdash; Settore Farmaceutico</h1>
        <p>Analisi del rischio creditizio e caratteristiche settoriali</p>
      </div>
    </div>
    <div class="header-right">
      <div class="date">{report_date}</div>
      <div class="meta">Fonte: rating_farmaceutico_finale.xlsx</div>
    </div>
  </div>
  <div class="nav-bar">
    <div class="nav-inner">
      <a class="nav-item active" href="#overview">Overview</a>
      <a class="nav-item" href="#econ-model">Modello Econometrico</a>
      <a class="nav-item" href="#econ-scenarios">Scenari Policy</a>
      <a class="nav-item" href="#bre">Check Dati</a>
      <a class="nav-item" href="#rating">Rating</a>
      <a class="nav-item" href="#default">Default</a>
      <a class="nav-item" href="#risk-detail">Rischio Articolato</a>
      <a class="nav-item" href="#size">Dimensioni</a>
      <a class="nav-item" href="#profitability">Redditivit&agrave;</a>
      <a class="nav-item" href="#solidity">Solidit&agrave;</a>
      <a class="nav-item" href="#geography">Geografia</a>
      <a class="nav-item" href="#nord-sud">Nord vs Sud</a>
      <a class="nav-item" href="#ateco">ATECO</a>
      <a class="nav-item" href="#legal">Forma Giuridica</a>
      <a class="nav-item" href="#trend">Trend</a>
      <a class="nav-item" href="#top">Top &amp; Bottom</a>
    </div>
  </div>
</div>

<!-- ══ FILTER BAR ══════════════════════════════════════════════════ -->
<div class="filter-bar">
  <div class="filter-inner">
    <span class="filter-label">Filtri:</span>
    <select class="filter-select" id="filterMacro" onchange="applyFilter()">
      <option value="">Macro Area</option>
      <option value="Centro">Centro</option>
      <option value="Nord">Nord</option>
      <option value="Sud e Isole">Sud e Isole</option>
    </select>
    <select class="filter-select" id="filterRating" onchange="applyFilter()">
      <option value="">Rating</option>
      <option value="Investment Grade (A-H)">Investment Grade (A-H)</option>
      <option value="Speculative Grade (I-R)">Speculative Grade (I-R)</option>
    </select>
    <select class="filter-select" id="filterSize" onchange="applyFilter()">
      <option value="">Fascia Dimensionale</option>
      <option value="Micro (<=2M)">Micro (&le;2M)</option>
      <option value="Piccola (2-10M)">Piccola (2-10M)</option>
      <option value="Media (10-50M)">Media (10-50M)</option>
      <option value="Grande (>50M)">Grande (&gt;50M)</option>
    </select>
    <select class="filter-select" id="filterStatus" onchange="applyFilter()">
      <option value="">Stato</option>
      <option value="Attive">Attive</option>
      <option value="Dissolte">Dissolte</option>
      <option value="In crisi">In crisi</option>
    </select>
    <select class="filter-select" id="filterRegione" onchange="applyFilter()">
      <option value="">Regione</option>
    </select>
    <select class="filter-select" id="filterAteco" onchange="applyFilter()" style="min-width:200px">
      <option value="">Sottosettore ATECO</option>
    </select>
    <div class="quality-toggle" id="qualityToggle">
      <button class="qt-btn qt-all active" onclick="setQuality('all')" title="Tutti i dati incluse anomalie BRE">
        Tutti i Dati
      </button>
      <button class="qt-btn qt-good" onclick="setQuality('good')" title="Solo dati senza flag BRE critici/alti ({_n_clean:,} aziende, {_n_clean/n_total*100:.1f}%)">
        &#9989; Dati Buoni <span class="qt-pct">{_n_clean/n_total*100:.1f}%</span>
      </button>
    </div>
    <input type="hidden" id="filterQuality" value="all">
    <button class="filter-reset" onclick="resetFilters()">Reset</button>
    <span class="filter-active-label" id="filterActiveLabel"></span>
  </div>
</div>

<div class="main">

<!-- ══ OVERVIEW SOTTOSETTORI ════════════════════════════════════════ -->
<div class="section open" id="overview" style="margin-top:12px;">
  <div class="section-header" onclick="this.parentElement.classList.toggle('open')">
    <h2><span class="sec-num">&#9881;</span>Frammentazione del Settore Farmaceutico per Sottosettori</h2>
    <div class="chevron"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg></div>
  </div>
  <div class="section-content">
    <div class="section-comment" style="font-size:13px;margin-bottom:18px;">
      Il settore farmaceutico italiano &egrave; composto da <strong>{ov_n_subsectors}</strong> sotto-settori ATECO.
      Il sotto-settore pi&ugrave; numeroso &egrave; <em>{ov_top_subsector[:55]}</em> con <strong>{ov_top_subsector_n:,}</strong> aziende ({ov_top_subsector_pct:.1f}% del totale).
    </div>

    <!-- KPI summary cards -->
    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:14px;margin-bottom:28px;">
      <div style="background:var(--mef-white);border-radius:var(--radius-lg);padding:16px 18px;box-shadow:var(--shadow-sm);border-left:4px solid var(--mef-blue);">
        <div style="font-size:10px;text-transform:uppercase;color:var(--mef-text-light);letter-spacing:.5px;margin-bottom:4px;">Sotto-Settori</div>
        <div style="font-size:26px;font-weight:700;color:var(--mef-blue-dark);">{ov_n_subsectors}</div>
        <div style="font-size:11px;color:var(--mef-text-light);margin-top:2px;">codici ATECO</div>
      </div>
      <div style="background:var(--mef-white);border-radius:var(--radius-lg);padding:16px 18px;box-shadow:var(--shadow-sm);border-left:4px solid var(--mef-gold);">
        <div style="font-size:10px;text-transform:uppercase;color:var(--mef-text-light);letter-spacing:.5px;margin-bottom:4px;">Fatturato Totale</div>
        <div style="font-size:26px;font-weight:700;color:var(--mef-blue-dark);">&euro;{ov_fatturato_fmt}</div>
        <div style="font-size:11px;color:var(--mef-text-light);margin-top:2px;">ricavi operativi</div>
      </div>
      <div style="background:var(--mef-white);border-radius:var(--radius-lg);padding:16px 18px;box-shadow:var(--shadow-sm);border-left:4px solid var(--mef-success);">
        <div style="font-size:10px;text-transform:uppercase;color:var(--mef-text-light);letter-spacing:.5px;margin-bottom:4px;">Utile Netto</div>
        <div style="font-size:26px;font-weight:700;color:var(--mef-blue-dark);">&euro;{ov_utile_fmt}</div>
        <div style="font-size:11px;color:var(--mef-text-light);margin-top:2px;">risultato netto aggregato</div>
      </div>
      <div style="background:var(--mef-white);border-radius:var(--radius-lg);padding:16px 18px;box-shadow:var(--shadow-sm);border-left:4px solid #457b9d;">
        <div style="font-size:10px;text-transform:uppercase;color:var(--mef-text-light);letter-spacing:.5px;margin-bottom:4px;">Personale</div>
        <div style="font-size:26px;font-weight:700;color:var(--mef-blue-dark);">{ov_dipendenti_fmt}</div>
        <div style="font-size:11px;color:var(--mef-text-light);margin-top:2px;">addetti totali</div>
      </div>
      <div style="background:var(--mef-white);border-radius:var(--radius-lg);padding:16px 18px;box-shadow:var(--shadow-sm);border-left:4px solid #2a9d8f;">
        <div style="font-size:10px;text-transform:uppercase;color:var(--mef-text-light);letter-spacing:.5px;margin-bottom:4px;">EBITDA</div>
        <div style="font-size:26px;font-weight:700;color:var(--mef-blue-dark);">&euro;{ov_ebitda_fmt}</div>
        <div style="font-size:11px;color:var(--mef-text-light);margin-top:2px;">margine operativo lordo</div>
      </div>
    </div>

    <!-- Pie chart centrata -->
    <div style="background:var(--mef-white);border-radius:var(--radius-lg);padding:24px;box-shadow:var(--shadow-sm);margin-bottom:24px;">
      <h3 style="font-size:15px;font-weight:600;color:var(--mef-blue-dark);margin-bottom:16px;text-align:center;">Distribuzione Aziende per Sotto-Settore ATECO</h3>
      <div style="max-width:520px;margin:0 auto;">
        <canvas id="chartOverviewAtecoPie"></canvas>
      </div>
    </div>

    <!-- Tabella full-width -->
    <div style="background:var(--mef-white);border-radius:var(--radius-lg);padding:20px;box-shadow:var(--shadow-sm);overflow-x:auto;">
      <h3 style="font-size:15px;font-weight:600;color:var(--mef-blue-dark);margin-bottom:12px;">KPI per Sotto-Settore</h3>
      <table class="premium-table" style="width:100%;font-size:12.5px;">
        <thead>
          <tr>
            <th style="text-align:left;min-width:55px;">Codice</th>
            <th style="text-align:left;min-width:200px;">Descrizione</th>
            <th style="text-align:right;">Aziende</th>
            <th style="text-align:right;">%</th>
            <th style="text-align:right;">Fatturato Tot.</th>
            <th style="text-align:right;">Fatt. Medio</th>
            <th style="text-align:right;">Utile Medio</th>
            <th style="text-align:right;">Dipendenti</th>
            <th style="text-align:right;">Dip. Medi</th>
            <th style="text-align:right;">EBITDA Medio</th>
          </tr>
        </thead>
        <tbody id="tbodyOverviewAteco"></tbody>
      </table>
    </div>
  </div>
</div>

<!-- ══ ANOMALY ALERTS ═══════════════════════════════════════════════ -->
<div class="anomaly-bar" id="anomalyBar"></div>

<!-- ══ ATECO KPI DASHBOARD ═════════════════════════════════════════ -->
<div class="section ateco-kpi-section" id="atecoKpiSection">
  <h2 class="section-title" onclick="this.parentElement.classList.toggle('collapsed')">
    <span class="section-arrow">&#9660;</span>
    KPI per Sottosettore ATECO
    <span style="font-size:12px;color:#64748b;font-weight:400;margin-left:12px">(si aggiorna con i filtri)</span>
  </h2>
  <div class="section-body">
    <div id="atecoKpiGrid"></div>
  </div>
</div>

<!-- ══ BUSINESS RULES ENGINE ═══════════════════════════════════════ -->
<div class="bre-section" id="bre">
  <div class="bre-header" onclick="this.closest('.bre-section').classList.toggle('open')">
    <h2><span class="bre-icon">&#9888;</span>Business Rules Engine &mdash; Check Dati</h2>
    <div class="bre-badges">
      <span class="bre-badge-critical">{critical_flags:,} critici</span>
      <span class="bre-badge-count">{total_flags:,} segnalazioni totali</span>
      <div class="chevron"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg></div>
    </div>
  </div>
  <div class="bre-body"><div class="bre-content">
    <div class="section-comment">
      <strong>Business Rules Engine:</strong> Questo modulo applica {len(bre_rules)} regole di controllo qualit&agrave; e coerenza sui dati delle {n_total:,} aziende del dataset. Le segnalazioni sono classificate per severit&agrave; (CRITICO, ALTO, MEDIO) e identificano anomalie, dati mancanti e situazioni di rischio che richiedono attenzione. Clicca su ciascuna regola per visualizzare le aziende flaggate.
    </div>
    {_bre_cards_html}
  </div></div>
</div>

<!-- ══ SEZ. 1: MODELLO ECONOMETRICO ═══════════════════════════════ -->
<div class="section" id="econ-model">
  <div class="section-header" onclick="toggleSection(this)">
    <h2><span class="sec-num">1</span>Modello Microeconometrico Comportamentale</h2>
    <div style="display:flex;align-items:center">
      <span class="section-badge">{len(econ_models)} modelli | {n_panel_firms:,} imprese</span>
      <div class="chevron"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg></div>
    </div>
  </div>
  <div class="section-body"><div class="section-content">
    <div class="section-comment">
      <strong>Metodologia:</strong> Panel Fixed Effects con effetti fissi d'impresa e anno, standard error clusterizzati. Il panel copre {n_panel_obs:,} osservazioni su {n_panel_firms:,} imprese attive con almeno 2 bilanci consecutivi. Le variabili sono winsorizzate al 1&deg;-99&deg; percentile. *** p&lt;0.01, ** p&lt;0.05, * p&lt;0.10.
    </div>

    <!-- Analisi qualitativa introduttiva -->
    <div style="background:linear-gradient(135deg,#f8f9fb 0%,#eef1f6 100%);border-radius:var(--radius-lg);padding:20px 24px;margin-bottom:20px;border-left:4px solid var(--mef-blue);">
      <h3 style="font-size:14px;font-weight:700;color:var(--mef-blue-dark);margin-bottom:10px;">Sintesi interpretativa del modello</h3>
      <p style="font-size:12.5px;line-height:1.7;color:var(--mef-text);margin-bottom:10px;">
        Il modello microeconometrico stima <strong>sei equazioni strutturali</strong> che coprono l'intera catena di trasmissione delle politiche pubbliche sul settore farmaceutico:
        policy fiscale &rarr; investimento/R&amp;D &rarr; occupazione &rarr; produttivit&agrave; &rarr; valore aggiunto &rarr; salari.
        Ogni equazione isola un <em>canale comportamentale</em> specifico, permettendo di quantificare come le imprese reagiscono a variazioni della pressione fiscale, della domanda pubblica o del costo del lavoro.
      </p>
      <p style="font-size:12.5px;line-height:1.7;color:var(--mef-text);margin-bottom:10px;">
        <strong>Stress test:</strong> L'analisi Difference-in-Differences (DiD) quantifica l'impatto <em>causale</em> di shock esogeni &mdash; la pandemia COVID-2020 e la crisi energetica 2022 &mdash; sulle diverse categorie d'impresa, distinguendo tra micro/PMI e grandi aziende. Il modello di sopravvivenza Cox PH stima il rischio di uscita dal mercato in funzione delle caratteristiche di bilancio.
      </p>
      <p style="font-size:12.5px;line-height:1.7;color:var(--mef-text);margin:0;">
        <strong>Collegamento alla Sezione 2:</strong> Le elasticit&agrave; estratte da questi modelli alimentano direttamente il <em>motore di simulazione micro-to-macro</em> della Sezione 2 (Scenari Policy), dove vengono tradotte in impatti aggregati su occupazione, valore aggiunto e finanza pubblica.
      </p>
    </div>

    <div class="sub-drilldown">
      <div class="sub-drilldown-header" onclick="toggleSub(this)">
        Panel Fixed Effects (6 equazioni strutturali)
        <div class="chevron"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg></div>
      </div>
      <div class="sub-drilldown-body"><div class="sub-drilldown-content">
        <div class="section-comment" style="font-size:12px;margin-bottom:14px;">
          <strong>Interpretazione qualitativa:</strong> Le sei equazioni M1-M6 modellano la catena causale completa. <strong>M1</strong> (Tasso di Investimento I/K): un coefficiente negativo su <em>tax_shock</em> indica che aumenti della pressione fiscale riducono gli investimenti delle imprese. <strong>M2</strong> (Crescita Occupazionale): la crescita dell'output &egrave; il principale driver dell'occupazione; la profittabilit&agrave; ha un effetto positivo aggiuntivo. <strong>M3</strong> (Investimento in R&amp;D): il tax rate effettivo e la profittabilit&agrave; guidano la spesa in innovazione e intangibili. <strong>M4</strong> (EBIT/Produttivit&agrave;): il capitale umano (dipendenti) e l'innovazione (R&amp;D) determinano la produttivit&agrave; aziendale. <strong>M5</strong> (Valore Aggiunto): l'occupazione e la profittabilit&agrave; sono i fattori primari nella creazione di valore. <strong>M6</strong> (Salari): la profittabilit&agrave; si trasmette ai salari tramite <em>rent sharing</em> &mdash; imprese pi&ugrave; profittevoli pagano salari superiori.
        </div>
        {_econ_models_html}
      </div></div>
    </div>
    <div class="sub-drilldown" style="margin-top:12px">
      <div class="sub-drilldown-header" onclick="toggleSub(this)">
        Tabella Elasticit&agrave; Stimate ({len(econ_elasticities)} coefficienti)
        <div class="chevron"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg></div>
      </div>
      <div class="sub-drilldown-body"><div class="sub-drilldown-content">
        <div class="section-comment" style="font-size:12px"><strong>Le elasticit&agrave;</strong> sono il cuore del motore di simulazione. Ogni coefficiente rappresenta la variazione attesa della variabile dipendente per una variazione unitaria del regressore, controllando per effetti fissi.</div>
        <div class="section-comment" style="font-size:12px;margin-top:8px;background:#f0f4f8;padding:10px 14px;border-radius:8px;">
          <strong>Esempio di lettura:</strong> E[inv_tax] = &minus;0.15 significa che un aumento di 1 punto percentuale della pressione fiscale riduce il tasso di investimento del 15%. Analogamente, E[emp_output] = 0.30 indica che un aumento dell'1% dell'output genera una crescita occupazionale dello 0.30%. Questi coefficienti vengono applicati impresa per impresa nella simulazione degli scenari di policy (Sezione 2).
        </div>
        {_elas_html}
      </div></div>
    </div>
    <div class="sub-drilldown" style="margin-top:12px">
      <div class="sub-drilldown-header" onclick="toggleSub(this)">
        Quantile Regressions (eterogeneit&agrave; PMI vs grandi)
        <div class="chevron"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg></div>
      </div>
      <div class="sub-drilldown-body"><div class="sub-drilldown-content">
        <div class="section-comment" style="font-size:12px">Le quantile regressions verificano se le elasticit&agrave; variano lungo la distribuzione (&tau;=0.10 coda bassa, &tau;=0.90 top firms).</div>
        <div class="section-comment" style="font-size:12px;margin-top:8px;background:#f0f4f8;padding:10px 14px;border-radius:8px;">
          <strong>Interpretazione:</strong> Le imprese pi&ugrave; piccole (quantili bassi, &tau; = 0.10&ndash;0.25) tendono ad essere pi&ugrave; sensibili agli shock fiscali e di domanda rispetto alle grandi imprese (quantili alti, &tau; = 0.75&ndash;0.90). Questo &egrave; coerente con il fatto che le PMI hanno minore capacit&agrave; di assorbimento degli shock e accesso limitato al credito. I coefficienti che cambiano significativamente tra quantili bassi e alti segnalano un'<em>eterogeneit&agrave; strutturale</em> nella risposta del settore, fondamentale per il disegno di politiche mirate.
        </div>
        {_qr_html}
      </div></div>
    </div>
    <div class="sub-drilldown" style="margin-top:12px">
      <div class="sub-drilldown-header" onclick="toggleSub(this)">
        Difference-in-Differences &mdash; Stress Test (shock COVID e energia)
        <div class="chevron"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg></div>
      </div>
      <div class="sub-drilldown-body"><div class="sub-drilldown-content">
        <div class="section-comment" style="font-size:12px">DiD per identificare effetti causali di shock esogeni. &beta;<sub>3</sub> (interazione treat&times;post) cattura l'effetto differenziale.</div>
        <div class="section-comment" style="font-size:12px;margin-top:8px;background:#fff3e0;padding:12px 14px;border-radius:8px;border-left:3px solid #C17B1E;">
          <strong>&#9888; Stress Test &mdash; Analisi degli shock esogeni:</strong><br>
          Lo <strong>shock COVID-2020</strong> ha colpito in modo differenziato le micro-imprese rispetto alle grandi: il coefficiente &beta;<sub>3</sub> (interazione <em>treat &times; post</em>) misura esattamente questa differenza. Se &beta;<sub>3</sub> &egrave; negativo e statisticamente significativo, le micro-imprese hanno subito una contrazione maggiore di fatturato e occupazione rispetto alle grandi. Questo evidenzia la <strong>fragilit&agrave; strutturale delle PMI farmaceutiche</strong> di fronte a shock di domanda.<br><br>
          La <strong>crisi energetica 2022</strong> testa la vulnerabilit&agrave; del settore a shock di costo: le imprese del Sud (pi&ugrave; energy-intensive e con margini inferiori) sono il gruppo di trattamento. Un &beta;<sub>3</sub> negativo conferma che lo shock energetico ha compresso l'EBITDA in modo asimmetrico, penalizzando maggiormente le aree gi&agrave; fragili.<br><br>
          <em>Implicazione di policy:</em> I risultati dello stress test suggeriscono che misure di supporto post-shock dovrebbero essere <strong>calibrate per dimensione e localizzazione geografica</strong> dell'impresa, piuttosto che applicate uniformemente.
        </div>
        {_did_html}
      </div></div>
    </div>
    <div class="sub-drilldown" style="margin-top:12px">
      <div class="sub-drilldown-header" onclick="toggleSub(this)">
        Modello di Sopravvivenza (Cox PH &mdash; Exit Risk)
        <div class="chevron"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg></div>
      </div>
      <div class="sub-drilldown-body"><div class="sub-drilldown-content">
        <div class="section-comment" style="font-size:12px">Hazard Ratio &gt; 1 = maggior rischio exit. HR &lt; 1 = effetto protettivo. C-index misura la capacit&agrave; predittiva.</div>
        <div class="section-comment" style="font-size:12px;margin-top:8px;background:#f0f4f8;padding:10px 14px;border-radius:8px;">
          <strong>Come leggere gli Hazard Ratio:</strong> Un HR di 1.8 per la probabilit&agrave; di default significa che un'impresa con PD elevata ha l'80% in pi&ugrave; di probabilit&agrave; di uscire dal mercato (liquidazione, fallimento) rispetto a un'impresa con PD bassa. Un HR &gt; 1 per il <em>gearing</em> (leverage) indica che la leva finanziaria eccessiva &egrave; un fattore di rischio critico. Al contrario, un HR &lt; 1 per il fatturato o il margine EBITDA indica un <strong>effetto protettivo</strong>: imprese pi&ugrave; grandi e pi&ugrave; profittevoli hanno tassi di sopravvivenza significativamente superiori. Il <em>C-index</em> (concordanza) misura la capacit&agrave; predittiva complessiva del modello: valori superiori a 0.70 indicano una buona discriminazione tra imprese a rischio e imprese stabili.
        </div>
        {_surv_html}
      </div></div>
    </div>
  </div></div>
</div>

<!-- ══ SEZ. 2: SCENARI MICRO-TO-MACRO ════════════════════════════ -->
<div class="section" id="econ-scenarios">
  <div class="section-header" onclick="toggleSection(this)">
    <h2><span class="sec-num">2</span>Micro-to-Macro Aggregation Engine &mdash; Scenari Policy</h2>
    <div style="display:flex;align-items:center">
      <span class="section-badge">{len(econ_scenarios)} scenari</span>
      <div class="chevron"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg></div>
    </div>
  </div>
  <div class="section-body"><div class="section-content">

    <!-- Pipeline Micro-to-Macro -->
    <div class="section-comment" style="margin-bottom:18px;">
      <strong>Come funziona il motore Micro-to-Macro:</strong> Il sistema traduce le elasticit&agrave; stimate nella Sezione 1 in impatti aggregati settoriali e fiscali, simulando la risposta comportamentale di ciascuna delle {n_total:,} imprese a uno shock di policy.
    </div>

    <!-- Flow diagram -->
    <div style="display:flex;align-items:center;justify-content:center;gap:0;margin-bottom:22px;flex-wrap:wrap;">
      <div style="background:#003366;color:#fff;padding:12px 16px;border-radius:10px;text-align:center;font-size:12px;font-weight:700;min-width:120px;">
        <div style="font-size:16px;margin-bottom:2px;">1</div>Shock di Policy<br><span style="font-weight:400;font-size:10px;opacity:.8">es. -5pp cuneo fiscale</span>
      </div>
      <div style="color:#B5985A;font-size:24px;padding:0 6px;">&rarr;</div>
      <div style="background:#004d99;color:#fff;padding:12px 16px;border-radius:10px;text-align:center;font-size:12px;font-weight:700;min-width:120px;">
        <div style="font-size:16px;margin-bottom:2px;">2</div>Elasticit&agrave; Stimate<br><span style="font-weight:400;font-size:10px;opacity:.8">da Panel FE (Sez. 1)</span>
      </div>
      <div style="color:#B5985A;font-size:24px;padding:0 6px;">&rarr;</div>
      <div style="background:#0066cc;color:#fff;padding:12px 16px;border-radius:10px;text-align:center;font-size:12px;font-weight:700;min-width:120px;">
        <div style="font-size:16px;margin-bottom:2px;">3</div>Risposta per Impresa<br><span style="font-weight:400;font-size:10px;opacity:.8">&Delta;Inv, &Delta;Emp, &Delta;R&amp;D, &Delta;VA</span>
      </div>
      <div style="color:#B5985A;font-size:24px;padding:0 6px;">&rarr;</div>
      <div style="background:#3399ff;color:#fff;padding:12px 16px;border-radius:10px;text-align:center;font-size:12px;font-weight:700;min-width:120px;">
        <div style="font-size:16px;margin-bottom:2px;">4</div>Aggregazione<br><span style="font-weight:400;font-size:10px;opacity:.8">per macro-area, dimensione</span>
      </div>
      <div style="color:#B5985A;font-size:24px;padding:0 6px;">&rarr;</div>
      <div style="background:#B5985A;color:#fff;padding:12px 16px;border-radius:10px;text-align:center;font-size:12px;font-weight:700;min-width:120px;">
        <div style="font-size:16px;margin-bottom:2px;">5</div>Saldo Finanza Pubblica<br><span style="font-weight:400;font-size:10px;opacity:.8">Gettito &minus; Costo Policy</span>
      </div>
    </div>

    <!-- Dettaglio pipeline -->
    <div style="background:linear-gradient(135deg,#f8f9fb 0%,#eef1f6 100%);border-radius:var(--radius-lg);padding:18px 22px;margin-bottom:20px;border-left:4px solid #B5985A;">
      <h3 style="font-size:14px;font-weight:700;color:var(--mef-blue-dark);margin-bottom:10px;">Impatto della Politica della PA sul settore</h3>
      <p style="font-size:12.5px;line-height:1.7;color:var(--mef-text);margin-bottom:8px;">
        Le politiche della Pubblica Amministrazione influenzano il settore farmaceutico attraverso tre canali principali:
        (i) <strong>leva fiscale</strong> &mdash; variazioni di IRES, crediti d'imposta e cuneo fiscale modificano i costi operativi delle imprese;
        (ii) <strong>domanda pubblica</strong> &mdash; la spesa SSN/AIFA determina direttamente il fatturato di una quota significativa del settore;
        (iii) <strong>regolazione</strong> &mdash; politiche sui prezzi dei farmaci rimborsabili e normative GMP incidono sui margini.
      </p>
      <p style="font-size:12.5px;line-height:1.7;color:var(--mef-text);margin:0;">
        Per ogni scenario, il modello calcola il <strong>saldo netto di finanza pubblica</strong> confrontando il costo diretto dell'intervento con il gettito indotto dalla risposta comportamentale delle imprese. Se il saldo &egrave; positivo, la misura si <em>autofinanzia</em>: il maggiore gettito generato dalla crescita economica supera il costo dell'intervento.
      </p>
    </div>

    <!-- Formula Saldo Netto -->
    <div style="background:#003366;color:#fff;border-radius:var(--radius-lg);padding:16px 22px;margin-bottom:22px;text-align:center;">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;opacity:.7;margin-bottom:6px;">Formula del Saldo Netto di Finanza Pubblica</div>
      <div style="font-size:15px;font-weight:700;font-family:monospace;letter-spacing:0.5px;">
        Saldo FP = IRES (24% &times; &Delta;VA) + Contributi (33% &times; &Delta;Salari) + IVA (8-10% &times; &Delta;VA) &minus; Costo Policy
      </div>
      <div style="font-size:11px;opacity:.7;margin-top:6px;">Saldo &gt; 0 = misura autofinanziante &nbsp;|&nbsp; Saldo &lt; 0 = costo netto per la PA</div>
    </div>

    <div class="chart-row">
      <div class="chart-box"><h3>&Delta; Valore Aggiunto per Scenario (Mln &euro;)</h3><canvas id="chartEconVA"></canvas></div>
      <div class="chart-box"><h3>Saldo Netto Finanza Pubblica (Mln &euro;)</h3><canvas id="chartEconFP"></canvas></div>
    </div>

    <!-- Tabella interpretativa scenari -->
    <div style="margin-bottom:22px;">
      <h3 style="font-size:14px;font-weight:700;color:var(--mef-blue-dark);margin-bottom:12px;">Quadro Sinottico degli Scenari</h3>
      <div style="overflow-x:auto;">
        <table class="kpi-table" style="font-size:11.5px;">
          <thead><tr>
            <th>Scenario</th><th>Tipo Policy</th><th>Canale di Trasmissione</th><th>&Delta; VA</th><th>Saldo FP</th><th>Impatto PA</th>
          </tr></thead>
          <tbody>{_sc_interp_rows}</tbody>
        </table>
      </div>
    </div>

    <div id="scenarioCardsContainer">{_sc_cards_html}</div>
  </div></div>
</div>

<!-- ══ SEZ. 3: PANORAMICA ═══════════════════════════════════════════ -->
<div class="section open" id="sec-overview">
  <div class="section-header" onclick="toggleSection(this)">
    <h2><span class="sec-num">3</span>Panoramica Generale</h2>
    <div style="display:flex;align-items:center">
      <span class="section-badge" id="badgePanoramica">{n_total:,} AZIENDE</span>
      <div class="chevron"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg></div>
    </div>
  </div>
  <div class="section-body"><div class="section-content">
    <div class="section-comment">
      <strong>Sintesi:</strong> Il settore farmaceutico italiano conta {n_total:,} imprese, di cui l'{pct(n_active, n_total)} risulta attivo. Il {pct(n_insolvency, n_total)} si trova in stato di crisi (liquidazione, fallimento o insolvenza). Il dataset copre {len(df):,} record multi-anno, con una media di {len(df) / n_total:.1f} bilanci per azienda, garantendo profondit&agrave; storica per l'analisi dei trend.
    </div>
    <div class="chart-row">
      <div class="chart-box"><h3>Stato Aziende</h3><canvas id="chartStatus"></canvas></div>
      <div class="chart-box"><h3>Distribuzione Dimensionale</h3><canvas id="chartSize"></canvas></div>
    </div>
    {df_to_premium_table(results["1. Panoramica Generale"])}
  </div></div>
</div>

<!-- ══ SEZ. 4: RATING ═══════════════════════════════════════════════ -->
<div class="section" id="rating">
  <div class="section-header" onclick="toggleSection(this)">
    <h2><span class="sec-num">4</span>Distribuzione Rating</h2>
    <div style="display:flex;align-items:center">
      <span class="section-badge" id="badgeRating">Rating {avg_rating_letter} | IG {pct(inv_grade, n_total)}</span>
      <div class="chevron"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg></div>
    </div>
  </div>
  <div class="section-body"><div class="section-content">
    <div class="section-comment">
      <strong>Analisi:</strong> La distribuzione del rating &egrave; fortemente concentrata nelle classi L e M, che insieme rappresentano oltre l'80% delle imprese. L'investment grade (A-H) copre appena il {pct(inv_grade, n_total)} del campione, con {inv_grade:,} aziende. Questo profilo riflette la natura frammentata del settore, dominato da micro-imprese con bilanci limitati.
    </div>
    <div class="chart-row">
      <div class="chart-box"><h3>Distribuzione Rating (A-R)</h3><canvas id="chartRating"></canvas></div>
      <div class="chart-box"><h3>Investment vs Speculative Grade</h3><canvas id="chartGrade"></canvas></div>
    </div>
    <div class="sub-drilldown">
      <div class="sub-drilldown-header" onclick="toggleSub(this)">
        Dettaglio per sottosettore ATECO (drill-down: Rating &rarr; Regione &rarr; Aziende)
        <div class="chevron"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg></div>
      </div>
      <div class="sub-drilldown-body"><div class="sub-drilldown-content">
        {df_to_premium_table(ateco_for_rating, dd_key="rating", dd_col=0)}
      </div></div>
    </div>
    <div class="sub-drilldown" style="margin-top:12px">
      <div class="sub-drilldown-header" onclick="toggleSub(this)">
        Riepilogo rating
        <div class="chevron"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg></div>
      </div>
      <div class="sub-drilldown-body"><div class="sub-drilldown-content">
        {df_to_premium_table(rating_summary)}
      </div></div>
    </div>
  </div></div>
</div>

<!-- ══ SEZ. 3: PROBABILITÀ DI DEFAULT ═══════════════════════════════ -->
<div class="section" id="default">
  <div class="section-header" onclick="toggleSection(this)">
    <h2><span class="sec-num">5</span>Probabilit&agrave; di Default</h2>
    <div style="display:flex;align-items:center">
      <span class="section-badge" id="badgeDefault">PD Media {pd_stats['mean']:.2f}%</span>
      <div class="chevron"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg></div>
    </div>
  </div>
  <div class="section-body"><div class="section-content">
    <div class="section-comment">
      <strong>Analisi:</strong> L'{pct(med_risk, pd_valid)} delle imprese si colloca nella fascia di rischio medio (PD 1-5%), confermando un profilo di rischio generalmente contenuto. La PD cresce esponenzialmente dalla classe I in poi: le aziende con rating Q e R presentano PD superiori al 12%, indicando un rischio di insolvenza significativo per la coda della distribuzione.
    </div>
    <div class="chart-row">
      <div class="chart-box"><h3>PD Media per Rating</h3><canvas id="chartPD"></canvas></div>
      <div class="chart-box"><h3>Fasce di Rischio</h3><canvas id="chartRisk"></canvas></div>
    </div>
    <div class="sub-drilldown">
      <div class="sub-drilldown-header" onclick="toggleSub(this)">
        Riepilogo PD
        <div class="chevron"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg></div>
      </div>
      <div class="sub-drilldown-body"><div class="sub-drilldown-content">
        {df_to_premium_table(pd_summary)}
      </div></div>
    </div>
    <div class="sub-drilldown" style="margin-top:12px">
      <div class="sub-drilldown-header" onclick="toggleSub(this)">
        Dettaglio PD per sottosettore ATECO (drill-down: Rating &rarr; Aziende)
        <div class="chevron"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg></div>
      </div>
      <div class="sub-drilldown-body"><div class="sub-drilldown-content">
        {df_to_premium_table(ateco_for_rating, dd_key="rating", dd_col=0)}
      </div></div>
    </div>
  </div></div>
</div>

<!-- ══ SEZ. 4: RISCHIO CREDITO ARTICOLATO ═══════════════════════════ -->
<div class="section" id="risk-detail">
  <div class="section-header" onclick="toggleSection(this)">
    <h2><span class="sec-num">6</span>Rischio Credito Articolato</h2>
    <div style="display:flex;align-items:center">
      <span class="section-badge">Multi-dimensione</span>
      <div class="chevron"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg></div>
    </div>
  </div>
  <div class="section-body"><div class="section-content">
    <div class="section-comment">
      <strong>Analisi multi-dimensionale del rischio:</strong> Il rischio creditizio viene analizzato lungo tre assi: dimensione aziendale, collocazione geografica e settore ATECO. L'obiettivo &egrave; identificare i cluster a maggior concentrazione di rischio per orientare le politiche di monitoraggio e vigilanza.
    </div>
    <div class="chart-row">
      <div class="chart-box"><h3>PD Media per Fascia Dimensionale</h3><canvas id="chartRiskSize"></canvas></div>
      <div class="chart-box"><h3>PD Media per Macro-Area</h3><canvas id="chartRiskMacro"></canvas></div>
    </div>
    <div class="sub-drilldown">
      <div class="sub-drilldown-header" onclick="toggleSub(this)">
        Rischio per sottosettore ATECO (drill-down: Dimensione &rarr; Aziende)
        <div class="chevron"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg></div>
      </div>
      <div class="sub-drilldown-body"><div class="sub-drilldown-content">
        {df_to_premium_table(ateco_for_risk, dd_key="size", dd_col=0)}
      </div></div>
    </div>
    <div class="sub-drilldown" style="margin-top:12px">
      <div class="sub-drilldown-header" onclick="toggleSub(this)">
        Rischio per macro-area geografica
        <div class="chevron"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg></div>
      </div>
      <div class="sub-drilldown-body"><div class="sub-drilldown-content">
        {df_to_premium_table(results["10b. Rischio per Macro Area"])}
      </div></div>
    </div>
    <div class="sub-drilldown" style="margin-top:12px">
      <div class="sub-drilldown-header" onclick="toggleSub(this)">
        Rischio per codice ATECO
        <div class="chevron"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg></div>
      </div>
      <div class="sub-drilldown-body"><div class="sub-drilldown-content">
        {df_to_premium_table(results["10c. Rischio per ATECO"], dd_key="ateco", dd_col=0)}
      </div></div>
    </div>
    <div class="sub-drilldown" style="margin-top:12px">
      <div class="sub-drilldown-header" onclick="toggleSub(this)">
        Rating per fascia dimensionale (crosstab)
        <div class="chevron"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg></div>
      </div>
      <div class="sub-drilldown-body"><div class="sub-drilldown-content">
        {df_to_premium_table(results["10d. Rating per Dimensione"])}
      </div></div>
    </div>
    <div class="sub-drilldown" style="margin-top:12px">
      <div class="sub-drilldown-header" onclick="toggleSub(this)">
        Rischio per regione (tutte le regioni)
        <div class="chevron"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg></div>
      </div>
      <div class="sub-drilldown-body"><div class="sub-drilldown-content">
        {df_to_premium_table(results["7b. Rischio per Regione"])}
      </div></div>
    </div>
  </div></div>
</div>

<!-- ══ SEZ. 5: DIMENSIONE ═══════════════════════════════════════════ -->
<div class="section" id="size">
  <div class="section-header" onclick="toggleSection(this)">
    <h2><span class="sec-num">7</span>Dimensione Aziendale</h2>
    <div style="display:flex;align-items:center">
      <span class="section-badge">{rev_valid:,} con dati</span>
      <div class="chevron"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg></div>
    </div>
  </div>
  <div class="section-body"><div class="section-content">
    <div class="section-comment">
      <strong>Analisi:</strong> L'{pct(micro, rev_valid)} delle aziende con dati di fatturato rientra nella categoria micro (fatturato &le; 2M&euro;). Le grandi imprese (>50M&euro;) sono appena {large:,} ({pct(large, rev_valid)}), ma generano una quota sproporzionata del fatturato settoriale complessivo. Il fatturato mediano di &euro;{rev_stats['median']:,.0f} vs una media di &euro;{rev_stats['mean']:,.0f} conferma l'asimmetria dimensionale.
    </div>
    {df_to_premium_table(size_df)}
  </div></div>
</div>

<!-- ══ SEZ. 6: REDDITIVITÀ ══════════════════════════════════════════ -->
<div class="section" id="profitability">
  <div class="section-header" onclick="toggleSection(this)">
    <h2><span class="sec-num">8</span>Redditivit&agrave;</h2>
    <div style="display:flex;align-items:center">
      <span class="section-badge" id="badgeProfitability">{pct(in_profit, pnl_valid)} in utile</span>
      <div class="chevron"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg></div>
    </div>
  </div>
  <div class="section-body"><div class="section-content">
    <div class="section-comment">
      <strong>Analisi:</strong> Il {pct(in_profit, pnl_valid)} delle imprese chiude in utile, ma l'utile netto mediano di &euro;{df_last['pel_for_period_net_income'].median():,.0f} rivela margini molto compressi. Il margine lordo medio del 70.6% &egrave; tipico del farmaceutico (alti costi di R&amp;D e regolamentazione), ma l'EBITDA margin scende all'10.2%, segnalando che i costi operativi assorbono gran parte del valore aggiunto.
    </div>
    <div class="chart-row">
      <div class="chart-box"><h3>Utile / Perdita</h3><canvas id="chartProfit"></canvas></div>
      <div class="chart-box" style="display:flex;flex-direction:column;justify-content:center;">
        {df_to_premium_table(results["5b. Utile Perdita"])}
      </div>
    </div>
    <div class="sub-drilldown">
      <div class="sub-drilldown-header" onclick="toggleSub(this)">
        Indicatori di redditivit&agrave; (dettaglio statistico)
        <div class="chevron"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg></div>
      </div>
      <div class="sub-drilldown-body"><div class="sub-drilldown-content">
        {df_to_premium_table(results["5. Redditivita"])}
      </div></div>
    </div>
  </div></div>
</div>

<!-- ══ SEZ. 7: SOLIDITÀ ═════════════════════════════════════════════ -->
<div class="section" id="solidity">
  <div class="section-header" onclick="toggleSection(this)">
    <h2><span class="sec-num">9</span>Solidit&agrave; Patrimoniale e Liquidit&agrave;</h2>
    <div style="display:flex;align-items:center">
      <div class="chevron"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg></div>
    </div>
  </div>
  <div class="section-body"><div class="section-content">
    <div class="section-comment">
      <strong>Analisi:</strong> Il current ratio mediano di 1.4 indica una copertura sufficiente delle passivit&agrave; correnti, ma il gearing medio del 77.4% (mediana 10.2%) mostra una dispersione elevata: alcune imprese sono fortemente indebitate. I giorni di incasso crediti e pagamento debiti presentano mediane prossime allo zero, tipiche delle micro-imprese con operativit&agrave; limitata.
    </div>
    <div id="solidityTableContainer">{df_to_premium_table(results["6. Solidita e Liquidita"])}</div>
  </div></div>
</div>

<!-- ══ SEZ. 8: GEOGRAFIA ════════════════════════════════════════════ -->
<div class="section" id="geography">
  <div class="section-header" onclick="toggleSection(this)">
    <h2><span class="sec-num">10</span>Analisi Geografica per Regione</h2>
    <div style="display:flex;align-items:center">
      <span class="section-badge">{len(geo)} regioni</span>
      <div class="chevron"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg></div>
    </div>
  </div>
  <div class="section-body"><div class="section-content">
    <div class="section-comment">
      <strong>Analisi:</strong> La Lombardia domina con {geo_chart_aziende[0]:,} aziende, seguita da Lazio e Veneto. Il fatturato medio varia significativamente: le regioni del Nord presentano valori medi superiori grazie alla presenza di grandi gruppi industriali. La PD media risulta relativamente omogenea (1.8-2.6%), ma con differenze significative nella quota di investment grade tra regioni.
    </div>
    <div class="chart-row">
      <div class="chart-box"><h3>Top 10 Regioni per N. Aziende</h3><canvas id="chartGeo"></canvas></div>
      <div class="chart-box"><h3>PD Media per Regione (Top 10)</h3><canvas id="chartGeoPD"></canvas></div>
    </div>
    <div class="chart-row">
      <div class="chart-box"><h3>Fatturato Medio per Regione (Top 10)</h3><canvas id="chartGeoRev"></canvas></div>
      <div class="chart-box"><h3>PD per Regione (Top 10 per popolazione)</h3><canvas id="chartRiskReg"></canvas></div>
    </div>
    <div class="sub-drilldown">
      <div class="sub-drilldown-header" onclick="toggleSub(this)">
        Tabella completa per regione
        <div class="chevron"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg></div>
      </div>
      <div class="sub-drilldown-body"><div class="sub-drilldown-content">
        {df_to_premium_table(ateco_for_geo, dd_key="geo", dd_col=0)}
      </div></div>
    </div>
    <div class="sub-drilldown" style="margin-top:12px">
      <div class="sub-drilldown-header" onclick="toggleSub(this)">
        Rischio creditizio per regione (investment grade, PD, rischio alto)
        <div class="chevron"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg></div>
      </div>
      <div class="sub-drilldown-body"><div class="sub-drilldown-content">
        {df_to_premium_table(results["7b. Rischio per Regione"])}
      </div></div>
    </div>
  </div></div>
</div>

<!-- ══ SEZ. 9: NORD VS SUD ══════════════════════════════════════════ -->
<div class="section" id="nord-sud">
  <div class="section-header" onclick="toggleSection(this)">
    <h2><span class="sec-num">11</span>Fatturato Nord vs Centro vs Sud</h2>
    <div style="display:flex;align-items:center">
      <span class="section-badge">3 macro-aree</span>
      <div class="chevron"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg></div>
    </div>
  </div>
  <div class="section-body"><div class="section-content">
    <div class="section-comment">
      <strong>Analisi:</strong> Il confronto Nord-Centro-Sud evidenzia differenze strutturali significative. Il Nord concentra le imprese con fatturato medio pi&ugrave; elevato e una maggiore quota di investment grade, beneficiando della vicinanza ai cluster industriali farmaceutici (Lombardia, Emilia-Romagna, Veneto). Il Sud e le Isole mostrano fatturati medi inferiori ma PD mediamente pi&ugrave; basse, riflettendo la prevalenza di attivit&agrave; di distribuzione a basso rischio.
    </div>
    <div class="chart-row">
      <div class="chart-box"><h3>Fatturato Medio per Macro-Area</h3><canvas id="chartMacroRev"></canvas></div>
      <div class="chart-box"><h3>PD Media per Macro-Area</h3><canvas id="chartMacroPD"></canvas></div>
    </div>
    {df_to_premium_table(ateco_for_macro, dd_key="macro", dd_col=0)}
  </div></div>
</div>

<!-- ══ SEZ. 10: ATECO ═══════════════════════════════════════════════ -->
<div class="section" id="ateco">
  <div class="section-header" onclick="toggleSection(this)">
    <h2><span class="sec-num">12</span>Analisi per Codice ATECO</h2>
    <div style="display:flex;align-items:center">
      <span class="section-badge">{len(ateco_analysis)} codici</span>
      <div class="chevron"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg></div>
    </div>
  </div>
  <div class="section-body"><div class="section-content">
    <div class="section-comment">
      <strong>Analisi settoriale:</strong> Il settore farmaceutico comprende sotto-settori eterogenei: dalla produzione di protesi dentali al commercio all'ingrosso di medicinali, dalle farmacie al dettaglio alla ricerca biotecnologica. Ogni codice ATECO presenta un profilo di rischio e performance distinto. I produttori farmaceutici (cod. 2120) mostrano i fatturati pi&ugrave; elevati ma anche una maggiore concentrazione di rischio.
    </div>
    <div class="chart-row">
      <div class="chart-box"><h3>Top 8 Sotto-Settori per N. Aziende</h3><canvas id="chartAtecoN"></canvas></div>
      <div class="chart-box"><h3>PD Media per Sotto-Settore (Top 8)</h3><canvas id="chartAtecoPD"></canvas></div>
    </div>
    <div class="sub-drilldown">
      <div class="sub-drilldown-header" onclick="toggleSub(this)">
        Caratteristiche settoriali complete per codice ATECO
        <div class="chevron"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg></div>
      </div>
      <div class="sub-drilldown-body"><div class="sub-drilldown-content">
        {df_to_premium_table(results["9. Per Codice ATECO"], dd_key="ateco", dd_col=0)}
      </div></div>
    </div>
    <div class="sub-drilldown" style="margin-top:12px">
      <div class="sub-drilldown-header" onclick="toggleSub(this)">
        Fatturato per codice ATECO (quota di mercato)
        <div class="chevron"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg></div>
      </div>
      <div class="sub-drilldown-body"><div class="sub-drilldown-content">
        {df_to_premium_table(results["9b. Fatturato per ATECO"], dd_key="ateco", dd_col=0)}
      </div></div>
    </div>
    <div class="sub-drilldown" style="margin-top:12px">
      <div class="sub-drilldown-header" onclick="toggleSub(this)">
        Rischio creditizio per codice ATECO
        <div class="chevron"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg></div>
      </div>
      <div class="sub-drilldown-body"><div class="sub-drilldown-content">
        {df_to_premium_table(results["10c. Rischio per ATECO"], dd_key="ateco", dd_col=0)}
      </div></div>
    </div>
  </div></div>
</div>

<!-- ══ SEZ. 11: FORMA GIURIDICA ═════════════════════════════════════ -->
<div class="section" id="legal">
  <div class="section-header" onclick="toggleSection(this)">
    <h2><span class="sec-num">13</span>Analisi per Forma Giuridica</h2>
    <div style="display:flex;align-items:center">
      <div class="chevron"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg></div>
    </div>
  </div>
  <div class="section-body"><div class="section-content">
    <div class="section-comment">
      <strong>Analisi:</strong> Le SRL (Private limited companies) e le ditte individuali dominano il panorama giuridico. Le societ&agrave; per azioni (Public limited companies), pur essendo solo {534:,}, generano un fatturato medio di oltre 100 milioni di euro. La PD pi&ugrave; elevata si registra nelle SPA (4.19%), probabilmente influenzata da grandi gruppi in crisi con forte impatto statistico.
    </div>
    <div id="legalTableContainer">{df_to_premium_table(legal)}</div>
  </div></div>
</div>

<!-- ══ SEZ. 12: TREND ═══════════════════════════════════════════════ -->
<div class="section" id="trend">
  <div class="section-header" onclick="toggleSection(this)">
    <h2><span class="sec-num">14</span>Trend Temporale (2015-oggi)</h2>
    <div style="display:flex;align-items:center">
      <div class="chevron"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg></div>
    </div>
  </div>
  <div class="section-body"><div class="section-content">
    <div class="section-comment">
      <strong>Analisi:</strong> Il fatturato medio mostra un trend crescente dal 2021, dopo il calo del periodo 2017-2019. L'EBITDA medio segue un andamento analogo, segnalando un recupero della capacit&agrave; di generare cassa. Il ROE medio si stabilizza intorno al 15-20% dal 2020, dopo la forte volatilit&agrave; degli anni precedenti, indicando una maturazione del settore.
    </div>
    <div class="chart-row">
      <div class="chart-box"><h3>Fatturato Medio &amp; EBITDA Medio</h3><canvas id="chartTrendRev"></canvas></div>
      <div class="chart-box"><h3>ROE Medio (%)</h3><canvas id="chartTrendROE"></canvas></div>
    </div>
    <div class="sub-drilldown">
      <div class="sub-drilldown-header" onclick="toggleSub(this)">
        Tabella trend completa
        <div class="chevron"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg></div>
      </div>
      <div class="sub-drilldown-body"><div class="sub-drilldown-content">
        {df_to_premium_table(trend)}
      </div></div>
    </div>
  </div></div>
</div>

<!-- ══ SEZ. 13: TOP & BOTTOM ════════════════════════════════════════ -->
<div class="section" id="top">
  <div class="section-header" onclick="toggleSection(this)">
    <h2><span class="sec-num">15</span>Top &amp; Bottom Performers</h2>
    <div style="display:flex;align-items:center">
      <div class="chevron"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg></div>
    </div>
  </div>
  <div class="section-body"><div class="section-content">
    <div class="section-comment">
      <strong>Analisi:</strong> Le top 20 aziende per fatturato includono nomi di riferimento come Chiesi, Bracco, Sanofi e Novartis. Notevole la presenza nel ranking di aziende con rating speculativo (M, P, Q), segnalando che dimensione e merito creditizio non sono sempre correlati. Le aziende a rischio massimo (PD 35%) sono tutte in stato di fallimento o liquidazione.
    </div>
    <div class="sub-drilldown open">
      <div class="sub-drilldown-header" onclick="toggleSub(this)">
        Top 20 per Fatturato
        <div class="chevron"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg></div>
      </div>
      <div class="sub-drilldown-body"><div class="sub-drilldown-content">
        <div id="topRevenueContainer">{df_to_premium_table(results["12. Top 20 per Fatturato"])}</div>
      </div></div>
    </div>
    <div class="sub-drilldown" style="margin-top:12px">
      <div class="sub-drilldown-header" onclick="toggleSub(this)">
        Top 20 Rischio Pi&ugrave; Alto
        <div class="chevron"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg></div>
      </div>
      <div class="sub-drilldown-body"><div class="sub-drilldown-content">
        <div id="topRiskContainer">{df_to_premium_table(results["12b. Top 20 Rischio Alto"])}</div>
      </div></div>
    </div>
  </div></div>
</div>

<!-- ══ FOOTER ════════════════════════════════════════════════════════ -->
<div class="footer">
  <div class="footer-left">
    <strong>Ministero dell'Economia e delle Finanze</strong><br>
    Fonte dati: {INPUT_FILE} &bull; {n_total:,} aziende &bull; {len(df):,} record
  </div>
  <div class="footer-right">
    Report generato il {report_date}<br>
    Dipartimento del Tesoro &mdash; Analisi Rischio Creditizio
  </div>
</div>

</div><!-- /main -->

<!-- ══ CHATBOT AI SIDEBAR ═══════════════════════════════════════════ -->
<div class="fab-bar">
  <button class="export-pdf-btn" onclick="exportPDF()" title="Esporta Report PDF">
    <svg viewBox="0 0 24 24"><path d="M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zm-3 11H8v-5h8v5zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-1-9H6v4h12V3z"/></svg>
    PDF
  </button>
  <button class="chatbot-toggle" onclick="toggleChatbot()" title="Apri Analista AI">
    <svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"/><path d="M7 9h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2z"/></svg>
    AI Assistant
  </button>
</div>

<div class="chatbot-sidebar" id="chatbotSidebar">
  <div class="chatbot-header">
    <div>
      <div class="chatbot-header-title">Analista AI &mdash; MEF</div>
      <div class="chatbot-header-sub">Settore Farmaceutico &bull; What-If Analysis</div>
    </div>
    <button class="chatbot-close" onclick="toggleChatbot()">&times;</button>
  </div>
  <div class="chatbot-messages" id="chatMessages">
    <div class="chatbot-welcome">
      <h4>Analista AI &mdash; What-If Engine</h4>
      <p>Seleziona uno scenario di policy o una dashboard, oppure scrivi una domanda libera.</p>

      <div class="chatbot-section-title">Scenari Policy</div>
      <div class="chatbot-suggestions">
        <button class="chatbot-suggestion" onclick="askScenario('A')"><span class="sc-tag">A</span>Incentivo R&amp;D &mdash; credito d'imposta rafforzato pharma/biotech</button>
        <button class="chatbot-suggestion" onclick="askScenario('B')"><span class="sc-tag">B</span>Reshoring API &mdash; incentivo CAPEX per produzione principi attivi in Italia</button>
        <button class="chatbot-suggestion" onclick="askScenario('C')"><span class="sc-tag">C</span>Taglio IRES mirato &mdash; riduzione condizionata a reinvestimento/STEM</button>
        <button class="chatbot-suggestion" onclick="askScenario('D')"><span class="sc-tag">D</span>Stretta regolatoria &mdash; compressione margini rimborsabili SSN</button>
      </div>
      <div class="chatbot-suggestions">
        <button class="chatbot-suggestion" onclick="askScenario('E')"><span class="sc-tag">E</span>Shock energia &mdash; +30% costo energia per 2 anni</button>
        <button class="chatbot-suggestion" onclick="askScenario('F')"><span class="sc-tag">F</span>Shock catena import &mdash; interruzione forniture API da paesi critici</button>
      </div>

      <div class="chatbot-section-title">Dashboard di Riepilogo</div>
      <div class="chatbot-suggestions">
        <button class="chatbot-suggestion" onclick="askDashboard(1)"><span class="sc-tag sc-tag-dash">1</span>Fiscal ROI &mdash; costo, VA, occupazione, payback per ogni policy</button>
        <button class="chatbot-suggestion" onclick="askDashboard(2)"><span class="sc-tag sc-tag-dash">2</span>Beneficiary Distribution &mdash; PMI/grandi, Nord/Sud, addizionalit&agrave;</button>
        <button class="chatbot-suggestion" onclick="askDashboard(3)"><span class="sc-tag sc-tag-dash">3</span>Strategic Dependency &mdash; vulnerabilit&agrave; filiera, input critici</button>
        <button class="chatbot-suggestion" onclick="askDashboard(4)"><span class="sc-tag sc-tag-dash">4</span>SSN-Industry &mdash; impatto policy sanitaria su imprese</button>
        <button class="chatbot-suggestion" onclick="askDashboard(5)"><span class="sc-tag sc-tag-dash">5</span>Regional Policy &mdash; cluster, produttivit&agrave;, moltiplicatore regionale</button>
      </div>
    </div>
  </div>
  <div class="chatbot-input">
    <input type="text" id="chatInput" placeholder="Chiedi un'analisi what-if..." onkeydown="if(event.key==='Enter')sendChat()">
    <button onclick="sendChat()">Invia</button>
  </div>
</div>

<!-- ══ JAVASCRIPT ════════════════════════════════════════════════════ -->
<script>
// ── Drill-down data ──
const DD_DATA = {dd_json_str};
const FILTER_DATA = {filter_json_str};
const FILTER_RAW = {filter_raw_str};
const ANOMALIES = {anomalies_json_str};

function toggleSection(header) {{
  header.closest('.section').classList.toggle('open');
}}
function toggleSub(header) {{
  header.closest('.sub-drilldown').classList.toggle('open');
}}
function toggleEconDD(toggle) {{
  toggle.classList.toggle('econ-dd-active');
  const container = toggle.nextElementSibling;
  if (!container) return;
  container.classList.toggle('econ-dd-open');
  // Lazy render on first open
  if (!container.dataset.rendered && container.classList.contains('econ-dd-open')) {{
    const type = container.dataset.type;
    const key = container.dataset.key;
    container.innerHTML = renderDDContent(type, key);
    container.dataset.rendered = '1';
  }}
  // Toggle arrow
  const arrow = toggle.querySelector('span');
  if (arrow) arrow.textContent = container.classList.contains('econ-dd-open') ? '\u25BC' : '\u25B6';
}}

// Nav active state on scroll
const sections = document.querySelectorAll('.section[id], .hero-grid[id]');
const navItems = document.querySelectorAll('.nav-item');
window.addEventListener('scroll', () => {{
  let current = '';
  sections.forEach(s => {{
    if (window.scrollY >= s.offsetTop - 120) current = s.id;
  }});
  navItems.forEach(item => {{
    item.classList.remove('active');
    if (item.getAttribute('href') === '#' + current) item.classList.add('active');
  }});
}});

// ── Recursive multi-level drill-down engine ──
// node = {{h: [headers], r: [{{k: key, c: [cells]}}], next: {{childKey: node}}}}
// leaf  = {{h: [headers], r: [{{c: [cells]}}]}}  (no next, no k)

function buildTable(node, depth) {{
  depth = depth || 0;
  if (!node || !node.r || !node.r.length) return '<em style="color:#888;font-size:11px">Nessun dato disponibile</em>';
  const hasNext = node.next && Object.keys(node.next).length > 0;
  const cls = depth === 0 ? 'dd-tbl' : (depth === 1 ? 'dd-tbl dd-tbl-l2' : 'dd-tbl dd-tbl-l3');
  let h = '<table class="' + cls + '"><thead><tr>';
  node.h.forEach(col => {{ h += '<th>' + col + '</th>'; }});
  h += '</tr></thead><tbody>';
  node.r.forEach((row, idx) => {{
    const rowKey = row.k || ('row_' + idx);
    const clickable = hasNext && row.k && node.next[row.k];
    const parentCls = clickable ? ' class="mldd" data-depth="' + depth + '" data-key="' + rowKey + '"' : '';
    h += '<tr' + parentCls + '>';
    row.c.forEach(v => {{ h += '<td>' + v + '</td>'; }});
    h += '</tr>';
    if (clickable) {{
      h += '<tr class="mldd-child" data-owner="' + rowKey + '" style="display:none"><td colspan="' + node.h.length + '">';
      h += '<div class="mldd-wrap" data-depth="' + depth + '" data-key="' + rowKey + '"></div>';
      h += '</td></tr>';
    }}
  }});
  h += '</tbody></table>';
  return h;
}}

function renderDDContent(type, key) {{
  const d = DD_DATA[type];
  if (!d || !d[key]) return '<div class="dd-inner"><em>Nessun dettaglio disponibile</em></div>';
  const node = d[key];
  return '<div class="dd-inner">' + buildTable(node, 0) + '</div>';
}}

// Global click delegation for multi-level drill-down
document.addEventListener('click', function(e) {{
  // Level-0: top-level table dd-parent rows
  const ddParent = e.target.closest('tr.dd-parent');
  if (ddParent) {{
    e.stopPropagation();
    const ddRow = ddParent.nextElementSibling;
    if (!ddRow || !ddRow.classList.contains('dd-row')) return;
    const isOpen = ddParent.classList.contains('dd-open');
    const tbody = ddParent.closest('tbody');
    tbody.querySelectorAll('tr.dd-parent.dd-open').forEach(r => {{
      r.classList.remove('dd-open');
      const sr = r.nextElementSibling;
      if (sr && sr.classList.contains('dd-row')) sr.classList.remove('dd-visible');
    }});
    if (!isOpen) {{
      ddParent.classList.add('dd-open');
      ddRow.classList.add('dd-visible');
      const container = ddRow.querySelector('.dd-container');
      if (container && !container.dataset.rendered) {{
        container.innerHTML = renderDDContent(container.dataset.type, container.dataset.key);
        container.dataset.rendered = '1';
      }}
    }}
    return;
  }}

  // Multi-level: .mldd rows inside drill-down content
  const mlRow = e.target.closest('tr.mldd');
  if (mlRow) {{
    e.stopPropagation();
    const depth = parseInt(mlRow.dataset.depth);
    const key = mlRow.dataset.key;
    const childRow = mlRow.nextElementSibling;
    if (!childRow || !childRow.classList.contains('mldd-child')) return;
    const isOpen = mlRow.classList.contains('dd-open');
    // Close siblings at same depth
    const tbody = mlRow.closest('tbody');
    tbody.querySelectorAll('tr.mldd.dd-open[data-depth="' + depth + '"]').forEach(r => {{
      r.classList.remove('dd-open');
      const cr = r.nextElementSibling;
      if (cr && cr.classList.contains('mldd-child')) cr.style.display = 'none';
    }});
    if (!isOpen) {{
      mlRow.classList.add('dd-open');
      childRow.style.display = 'table-row';
      // Lazy render next level
      const wrap = childRow.querySelector('.mldd-wrap');
      if (wrap && !wrap.dataset.rendered) {{
        // Find the correct data node
        const container = mlRow.closest('.dd-container') || mlRow.closest('.dd-inner').closest('td').querySelector('.dd-container');
        if (container) {{
          const type = container.dataset.type;
          const parentKey = container.dataset.key;
          const topNode = DD_DATA[type][parentKey];
          if (topNode) {{
            // Navigate to the right child node
            let targetNode = null;
            if (depth === 0 && topNode.next && topNode.next[key]) {{
              targetNode = topNode.next[key];
            }} else if (depth === 1) {{
              // Need to find the L1 parent key from DOM
              const l1Row = mlRow.closest('.mldd-wrap');
              if (l1Row) {{
                const l1Key = l1Row.dataset.key;
                const l1Node = topNode.next && topNode.next[l1Key];
                if (l1Node && l1Node.next && l1Node.next[key]) {{
                  targetNode = l1Node.next[key];
                }}
              }}
            }}
            if (targetNode) {{
              wrap.innerHTML = buildTable(targetNode, depth + 1);
            }} else {{
              wrap.innerHTML = '<em style="color:#888;font-size:11px">Fine del drill-down</em>';
            }}
          }}
        }}
        wrap.dataset.rendered = '1';
      }}
    }}
    return;
  }}
}});

// Chart.js defaults
Chart.defaults.font.family = "'Titillium Web', 'Segoe UI', sans-serif";
Chart.defaults.font.size = 11;
Chart.defaults.plugins.legend.labels.usePointStyle = true;
Chart.defaults.plugins.legend.labels.padding = 14;
Chart.defaults.color = '#5A6B8A';

const MEF_BLUE = '#003366';
const MEF_GOLD = '#B5985A';
const MEF_PALETTE = ['#003366','#004d99','#0066cc','#3399ff','#66b2ff',
                      '#B5985A','#D4B978','#E8D5A3','#1B7A43','#C17B1E',
                      '#B91C1C','#457b9d','#2a9d8f','#1d3557'];

// ── Overview Sottosettori Pie ──
let _chartOverviewPie = null;
(function() {{
  const ovPieLabels = {json.dumps(ov_pie_labels, ensure_ascii=False)};
  const ovPieValues = {json.dumps(ov_pie_values)};
  const ovData = {json.dumps(ov_table_data, ensure_ascii=False)};
  const pieCtx = document.getElementById('chartOverviewAtecoPie');
  if (pieCtx) {{
    const pieColors = ['#003366','#004d99','#0066cc','#3399ff',
                       '#B5985A','#D4B978','#1B7A43','#C17B1E','#9ca3af'];
    _chartOverviewPie = new Chart(pieCtx, {{
      type: 'pie',
      data: {{
        labels: ovPieLabels,
        datasets: [{{
          data: ovPieValues,
          backgroundColor: ovPieValues.map((_, i) => pieColors[i % pieColors.length]),
          borderWidth: 2,
          borderColor: '#fff',
          hoverOffset: 10
        }}]
      }},
      options: {{
        responsive: true,
        maintainAspectRatio: true,
        layout: {{ padding: 4 }},
        plugins: {{
          legend: {{
            position: 'right',
            labels: {{
              font: {{ size: 11.5, family: "'Titillium Web', sans-serif" }},
              boxWidth: 14,
              boxHeight: 14,
              padding: 10,
              generateLabels: function(chart) {{
                const ds = chart.data.datasets[0];
                const total = ds.data.reduce((a, b) => a + b, 0);
                return chart.data.labels.map((label, i) => ({{
                  text: label + '  ' + (ds.data[i] / total * 100).toFixed(1) + '%',
                  fillStyle: ds.backgroundColor[i],
                  strokeStyle: '#fff',
                  lineWidth: 1,
                  index: i
                }}));
              }}
            }}
          }},
          tooltip: {{
            callbacks: {{
              label: function(ctx) {{
                const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                return ' ' + ctx.parsed.toLocaleString('it-IT') + ' aziende (' + (ctx.parsed / total * 100).toFixed(1) + '%)';
              }}
            }}
          }}
        }}
      }}
    }});
  }}
  // Populate table with abbreviated EUR values
  const tbody = document.getElementById('tbodyOverviewAteco');
  if (tbody) {{
    const fmtE = v => {{
      if (v == null || v === 0) return 'N/A';
      const a = Math.abs(v), s = v < 0 ? '-' : '';
      if (a >= 1e9) return s + '€' + (a/1e9).toFixed(1) + ' Mld';
      if (a >= 1e6) return s + '€' + (a/1e6).toFixed(1) + ' Mln';
      if (a >= 1e3) return s + '€' + Math.round(a/1e3).toLocaleString('it-IT') + 'K';
      return s + '€' + Math.round(a).toLocaleString('it-IT');
    }};
    const fmtN = v => v != null ? Math.round(v).toLocaleString('it-IT') : 'N/A';
    // Data rows
    ovData.forEach(d => {{
      const tr = document.createElement('tr');
      tr.innerHTML = '<td style="font-weight:600;color:var(--mef-blue);">' + d.codice + '</td>'
        + '<td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + d.descrizione + '">' + d.descrizione + '</td>'
        + '<td style="text-align:right;font-weight:600;">' + d.n_aziende.toLocaleString('it-IT') + '</td>'
        + '<td style="text-align:right;">' + d.pct_aziende.toFixed(1) + '%</td>'
        + '<td style="text-align:right;">' + fmtE(d.fatturato_totale) + '</td>'
        + '<td style="text-align:right;">' + fmtE(d.fatturato_medio) + '</td>'
        + '<td style="text-align:right;color:' + (d.utile_medio >= 0 ? 'var(--mef-success)' : 'var(--mef-danger)') + ';font-weight:600;">' + fmtE(d.utile_medio) + '</td>'
        + '<td style="text-align:right;">' + fmtN(d.dipendenti_totali) + '</td>'
        + '<td style="text-align:right;">' + (d.dipendenti_medi != null ? d.dipendenti_medi.toFixed(1) : 'N/A') + '</td>'
        + '<td style="text-align:right;">' + fmtE(d.ebitda_medio) + '</td>';
      tbody.appendChild(tr);
    }});
    // TOTALE row
    const totN = ovData.reduce((s, d) => s + d.n_aziende, 0);
    const totFatt = ovData.reduce((s, d) => s + d.fatturato_totale, 0);
    const totDip = ovData.reduce((s, d) => s + d.dipendenti_totali, 0);
    const totUtilePond = totN > 0 ? ovData.reduce((s, d) => s + d.utile_medio * d.n_aziende, 0) / totN : 0;
    const totEbitdaPond = totN > 0 ? ovData.reduce((s, d) => s + d.ebitda_medio * d.n_aziende, 0) / totN : 0;
    const totFattMedio = totN > 0 ? totFatt / totN : 0;
    const totDipMedi = totN > 0 ? totDip / totN : 0;
    const tfoot = document.createElement('tfoot');
    const trT = document.createElement('tr');
    trT.style.cssText = 'background:var(--mef-blue-dark);color:#fff;font-weight:700;';
    trT.innerHTML = '<td></td>'
      + '<td>TOTALE</td>'
      + '<td style="text-align:right;">' + totN.toLocaleString('it-IT') + '</td>'
      + '<td style="text-align:right;">100%</td>'
      + '<td style="text-align:right;">' + fmtE(totFatt) + '</td>'
      + '<td style="text-align:right;">' + fmtE(totFattMedio) + '</td>'
      + '<td style="text-align:right;">' + fmtE(totUtilePond) + '</td>'
      + '<td style="text-align:right;">' + fmtN(totDip) + '</td>'
      + '<td style="text-align:right;">' + totDipMedi.toFixed(1) + '</td>'
      + '<td style="text-align:right;">' + fmtE(totEbitdaPond) + '</td>';
    tfoot.appendChild(trT);
    tbody.closest('table').appendChild(tfoot);
  }}
}})();

// ── Status Donut ──
let _chartStatus = new Chart(document.getElementById('chartStatus'), {{
  type: 'doughnut',
  data: {{
    labels: {json.dumps(status_labels)},
    datasets: [{{ data: {json.dumps(status_values)}, backgroundColor: ['#1B7A43','#5A6B8A','#B91C1C','#D8DCE3'], borderWidth: 0, hoverOffset: 6 }}]
  }},
  options: {{ responsive: true, cutout: '62%', plugins: {{ legend: {{ position: 'bottom' }} }} }}
}});

// ── Size Donut ──
let _chartSize = new Chart(document.getElementById('chartSize'), {{
  type: 'doughnut',
  data: {{
    labels: {json.dumps(size_labels)},
    datasets: [{{ data: {json.dumps(size_values)}, backgroundColor: ['#3399ff','#0066cc','#003366','#B5985A'], borderWidth: 0, hoverOffset: 6 }}]
  }},
  options: {{ responsive: true, cutout: '62%', plugins: {{ legend: {{ position: 'bottom' }} }} }}
}});

// ── Rating Bar ──
let _chartRating = new Chart(document.getElementById('chartRating'), {{
  type: 'bar',
  data: {{
    labels: {json.dumps(rating_chart_labels)},
    datasets: [{{
      label: 'N. Aziende',
      data: {json.dumps(rating_chart_values)},
      backgroundColor: {json.dumps(rating_chart_labels)}.map((r, i, arr) => {{
        const t = i / arr.length;
        return t < 0.5 ? `rgba(0,51,102,${{0.4 + t}})` : `rgba(181,152,90,${{0.4 + (t - 0.5)}})`;
      }}),
      borderRadius: 3,
      borderSkipped: false
    }}]
  }},
  options: {{
    responsive: true,
    plugins: {{ legend: {{ display: false }} }},
    scales: {{ y: {{ beginAtZero: true, grid: {{ color: '#EEF0F4' }} }}, x: {{ grid: {{ display: false }} }} }}
  }}
}});

// ── Grade Donut ──
let _chartGrade = new Chart(document.getElementById('chartGrade'), {{
  type: 'doughnut',
  data: {{
    labels: ['Investment Grade (A-H)', 'Speculative Grade (I-R)'],
    datasets: [{{ data: [{inv_grade}, {spec_grade}], backgroundColor: ['#1B7A43','#B91C1C'], borderWidth: 0, hoverOffset: 6 }}]
  }},
  options: {{ responsive: true, cutout: '62%', plugins: {{ legend: {{ position: 'bottom' }} }} }}
}});

// ── PD Bar ──
let _chartPD = new Chart(document.getElementById('chartPD'), {{
  type: 'bar',
  data: {{
    labels: {json.dumps(pd_chart_labels)},
    datasets: [{{
      label: 'PD Media (%)',
      data: {json.dumps(pd_chart_values)},
      backgroundColor: {json.dumps(pd_chart_values)}.map(v => v > 5 ? '#B91C1C' : v > 2 ? '#C17B1E' : '#1B7A43'),
      borderRadius: 3,
      borderSkipped: false
    }}]
  }},
  options: {{
    responsive: true,
    plugins: {{ legend: {{ display: false }} }},
    scales: {{ y: {{ beginAtZero: true, grid: {{ color: '#EEF0F4' }} }}, x: {{ grid: {{ display: false }} }} }}
  }}
}});

// ── Risk Donut ──
let _chartRisk = new Chart(document.getElementById('chartRisk'), {{
  type: 'doughnut',
  data: {{
    labels: {json.dumps(risk_labels)},
    datasets: [{{ data: {json.dumps(risk_values)}, backgroundColor: ['#1B7A43','#C17B1E','#B91C1C'], borderWidth: 0, hoverOffset: 6 }}]
  }},
  options: {{ responsive: true, cutout: '62%', plugins: {{ legend: {{ position: 'bottom' }} }} }}
}});

// ── Risk by Size Bar ──
let _chartRiskSize = new Chart(document.getElementById('chartRiskSize'), {{
  type: 'bar',
  data: {{
    labels: {json.dumps(risk_size_chart_labels)},
    datasets: [{{
      label: 'PD Media (%)',
      data: {json.dumps(risk_size_chart_pd)},
      backgroundColor: {json.dumps(risk_size_chart_pd)}.map(v => v > 3 ? '#B91C1C' : v > 2 ? '#C17B1E' : '#003366'),
      borderRadius: 3,
      borderSkipped: false
    }}]
  }},
  options: {{
    responsive: true,
    plugins: {{ legend: {{ display: false }} }},
    scales: {{ y: {{ beginAtZero: true, grid: {{ color: '#EEF0F4' }}, title: {{ display: true, text: 'PD Media (%)' }} }}, x: {{ grid: {{ display: false }} }} }}
  }}
}});

// ── Risk by Macro Bar ──
let _chartRiskMacro = new Chart(document.getElementById('chartRiskMacro'), {{
  type: 'bar',
  data: {{
    labels: {json.dumps(macro_chart_labels)},
    datasets: [{{
      label: 'PD Media (%)',
      data: {json.dumps(macro_chart_pd)},
      backgroundColor: ['#003366', '#B5985A', '#0066cc'],
      borderRadius: 3,
      borderSkipped: false
    }}]
  }},
  options: {{
    responsive: true,
    plugins: {{ legend: {{ display: false }} }},
    scales: {{ y: {{ beginAtZero: true, grid: {{ color: '#EEF0F4' }}, title: {{ display: true, text: 'PD Media (%)' }} }}, x: {{ grid: {{ display: false }} }} }}
  }}
}});

// ── Profit Donut ──
let _chartProfit = new Chart(document.getElementById('chartProfit'), {{
  type: 'doughnut',
  data: {{
    labels: {json.dumps(profit_labels)},
    datasets: [{{ data: {json.dumps(profit_values)}, backgroundColor: ['#1B7A43','#B91C1C','#D8DCE3'], borderWidth: 0, hoverOffset: 6 }}]
  }},
  options: {{ responsive: true, cutout: '62%', plugins: {{ legend: {{ position: 'bottom' }} }} }}
}});

// ── Geo Bars ──
let _chartGeo = new Chart(document.getElementById('chartGeo'), {{
  type: 'bar',
  data: {{
    labels: {json.dumps(geo_chart_labels)},
    datasets: [{{
      label: 'N. Aziende',
      data: {json.dumps(geo_chart_aziende)},
      backgroundColor: '#003366',
      borderRadius: 3,
      borderSkipped: false
    }}]
  }},
  options: {{
    indexAxis: 'y',
    responsive: true,
    plugins: {{ legend: {{ display: false }} }},
    scales: {{ x: {{ beginAtZero: true, grid: {{ color: '#EEF0F4' }} }}, y: {{ grid: {{ display: false }} }} }}
  }}
}});

let _chartGeoPD = new Chart(document.getElementById('chartGeoPD'), {{
  type: 'bar',
  data: {{
    labels: {json.dumps(geo_chart_labels)},
    datasets: [{{
      label: 'PD Media (%)',
      data: {json.dumps(geo_chart_pd)},
      backgroundColor: {json.dumps(geo_chart_pd)}.map(v => v > 2.3 ? '#C17B1E' : '#003366'),
      borderRadius: 3,
      borderSkipped: false
    }}]
  }},
  options: {{
    indexAxis: 'y',
    responsive: true,
    plugins: {{ legend: {{ display: false }} }},
    scales: {{ x: {{ beginAtZero: true, grid: {{ color: '#EEF0F4' }} }}, y: {{ grid: {{ display: false }} }} }}
  }}
}});

// ── Geo Revenue Bar ──
let _chartGeoRev = new Chart(document.getElementById('chartGeoRev'), {{
  type: 'bar',
  data: {{
    labels: {json.dumps(geo_rev_chart_labels)},
    datasets: [{{
      label: 'Fatturato Medio (EUR)',
      data: {json.dumps(geo_rev_chart_values)},
      backgroundColor: '#B5985A',
      borderRadius: 3,
      borderSkipped: false
    }}]
  }},
  options: {{
    indexAxis: 'y',
    responsive: true,
    plugins: {{ legend: {{ display: false }} }},
    scales: {{ x: {{ beginAtZero: true, grid: {{ color: '#EEF0F4' }} }}, y: {{ grid: {{ display: false }} }} }}
  }}
}});

// ── Risk by Region ──
let _chartRiskReg = new Chart(document.getElementById('chartRiskReg'), {{
  type: 'bar',
  data: {{
    labels: {json.dumps(risk_reg_chart_labels)},
    datasets: [{{
      label: 'PD Media (%)',
      data: {json.dumps(risk_reg_chart_pd)},
      backgroundColor: {json.dumps(risk_reg_chart_pd)}.map(v => v > 2.3 ? '#B91C1C' : v > 2.0 ? '#C17B1E' : '#1B7A43'),
      borderRadius: 3,
      borderSkipped: false
    }}]
  }},
  options: {{
    indexAxis: 'y',
    responsive: true,
    plugins: {{ legend: {{ display: false }} }},
    scales: {{ x: {{ beginAtZero: true, grid: {{ color: '#EEF0F4' }} }}, y: {{ grid: {{ display: false }} }} }}
  }}
}});

// ── Macro Revenue Bar ──
let _chartMacroRev = new Chart(document.getElementById('chartMacroRev'), {{
  type: 'bar',
  data: {{
    labels: {json.dumps(macro_chart_labels)},
    datasets: [
      {{ label: 'Fatturato Medio', data: {json.dumps(macro_chart_fat_medio)}, backgroundColor: '#003366', borderRadius: 3, borderSkipped: false }},
      {{ label: 'Fatturato Mediano', data: {json.dumps(macro_chart_fat_mediano)}, backgroundColor: '#B5985A', borderRadius: 3, borderSkipped: false }}
    ]
  }},
  options: {{
    responsive: true,
    plugins: {{ legend: {{ position: 'top' }} }},
    scales: {{ y: {{ beginAtZero: true, grid: {{ color: '#EEF0F4' }} }}, x: {{ grid: {{ display: false }} }} }}
  }}
}});

// ── Macro PD Bar ──
let _chartMacroPD = new Chart(document.getElementById('chartMacroPD'), {{
  type: 'bar',
  data: {{
    labels: {json.dumps(macro_chart_labels)},
    datasets: [{{
      label: 'PD Media (%)',
      data: {json.dumps(macro_chart_pd)},
      backgroundColor: ['#003366', '#B5985A', '#0066cc'],
      borderRadius: 3,
      borderSkipped: false
    }}]
  }},
  options: {{
    responsive: true,
    plugins: {{ legend: {{ display: false }} }},
    scales: {{ y: {{ beginAtZero: true, grid: {{ color: '#EEF0F4' }} }}, x: {{ grid: {{ display: false }} }} }}
  }}
}});

// ── ATECO N Aziende Bar ──
let _chartAtecoN = new Chart(document.getElementById('chartAtecoN'), {{
  type: 'bar',
  data: {{
    labels: {json.dumps(ateco_chart_labels)},
    datasets: [{{
      label: 'N. Aziende',
      data: {json.dumps(ateco_chart_aziende)},
      backgroundColor: '#003366',
      borderRadius: 3,
      borderSkipped: false
    }}]
  }},
  options: {{
    indexAxis: 'y',
    responsive: true,
    plugins: {{ legend: {{ display: false }} }},
    scales: {{ x: {{ beginAtZero: true, grid: {{ color: '#EEF0F4' }} }}, y: {{ grid: {{ display: false }}, ticks: {{ font: {{ size: 10 }} }} }} }}
  }}
}});

// ── ATECO PD Bar ──
let _chartAtecoPD = new Chart(document.getElementById('chartAtecoPD'), {{
  type: 'bar',
  data: {{
    labels: {json.dumps(ateco_chart_labels)},
    datasets: [{{
      label: 'PD Media (%)',
      data: {json.dumps(ateco_chart_pd)},
      backgroundColor: {json.dumps(ateco_chart_pd)}.map(v => v > 2.5 ? '#B91C1C' : v > 2.0 ? '#C17B1E' : '#003366'),
      borderRadius: 3,
      borderSkipped: false
    }}]
  }},
  options: {{
    indexAxis: 'y',
    responsive: true,
    plugins: {{ legend: {{ display: false }} }},
    scales: {{ x: {{ beginAtZero: true, grid: {{ color: '#EEF0F4' }} }}, y: {{ grid: {{ display: false }}, ticks: {{ font: {{ size: 10 }} }} }} }}
  }}
}});

// ── Trend Lines ──
let _chartTrendRev = new Chart(document.getElementById('chartTrendRev'), {{
  type: 'line',
  data: {{
    labels: {json.dumps(trend_chart_labels)},
    datasets: [
      {{
        label: 'Fatturato Medio',
        data: {json.dumps(trend_chart_fatturato)},
        borderColor: '#003366',
        backgroundColor: 'rgba(0,51,102,0.08)',
        fill: true, tension: 0.3, pointRadius: 4, pointHoverRadius: 6,
        pointBackgroundColor: '#003366'
      }},
      {{
        label: 'EBITDA Medio',
        data: {json.dumps(trend_chart_ebitda)},
        borderColor: '#B5985A',
        backgroundColor: 'rgba(181,152,90,0.08)',
        fill: true, tension: 0.3, pointRadius: 4, pointHoverRadius: 6,
        pointBackgroundColor: '#B5985A'
      }}
    ]
  }},
  options: {{
    responsive: true,
    interaction: {{ intersect: false, mode: 'index' }},
    scales: {{ y: {{ grid: {{ color: '#EEF0F4' }} }}, x: {{ grid: {{ display: false }} }} }},
    plugins: {{ legend: {{ position: 'top' }} }}
  }}
}});

let _chartTrendROE = new Chart(document.getElementById('chartTrendROE'), {{
  type: 'line',
  data: {{
    labels: {json.dumps(trend_chart_labels)},
    datasets: [{{
      label: 'ROE Medio (%)',
      data: {json.dumps(trend_chart_roe)},
      borderColor: '#1B7A43',
      backgroundColor: 'rgba(27,122,67,0.08)',
      fill: true, tension: 0.3, pointRadius: 4, pointHoverRadius: 6,
      pointBackgroundColor: '#1B7A43'
    }}]
  }},
  options: {{
    responsive: true,
    scales: {{ y: {{ grid: {{ color: '#EEF0F4' }} }}, x: {{ grid: {{ display: false }} }} }},
    plugins: {{ legend: {{ position: 'top' }} }}
  }}
}});

// ── ECONOMETRIC SCENARIO CHARTS ──
let _chartEconVA = null, _chartEconFP = null;
if (document.getElementById('chartEconVA')) {{
  _chartEconVA = new Chart(document.getElementById('chartEconVA'), {{
    type: 'bar',
    data: {{
      labels: {_sc_labels},
      datasets: [{{ label: '\u0394VA (Mln \u20ac)', data: {_sc_va},
        backgroundColor: {_sc_va}.map(v => v >= 0 ? '#1B7A43' : '#B91C1C'),
        borderRadius: 3, borderSkipped: false }}]
    }},
    options: {{ responsive: true, plugins: {{ legend: {{ display: false }} }},
      scales: {{ y: {{ grid: {{ color: '#EEF0F4' }} }}, x: {{ grid: {{ display: false }}, ticks: {{ font: {{ size: 10 }} }} }} }} }}
  }});
}}
if (document.getElementById('chartEconFP')) {{
  _chartEconFP = new Chart(document.getElementById('chartEconFP'), {{
    type: 'bar',
    data: {{
      labels: {_sc_labels},
      datasets: [{{ label: 'Saldo FP (Mln \u20ac)', data: {_sc_saldo},
        backgroundColor: {_sc_saldo}.map(v => v >= 0 ? '#1B7A43' : '#B91C1C'),
        borderRadius: 3, borderSkipped: false }}]
    }},
    options: {{ responsive: true, plugins: {{ legend: {{ display: false }} }},
      scales: {{ y: {{ grid: {{ color: '#EEF0F4' }} }}, x: {{ grid: {{ display: false }}, ticks: {{ font: {{ size: 10 }} }} }} }} }}
  }});
}}

// ── BRE: auto-render drill-down on card open ──
document.querySelectorAll('.bre-rule-card').forEach(card => {{
  const header = card.querySelector('.bre-rule-header');
  header.addEventListener('click', () => {{
    const container = card.querySelector('.dd-container');
    if (container && !container.dataset.rendered) {{
      container.innerHTML = renderDDContent(container.dataset.type, container.dataset.key);
      container.dataset.rendered = '1';
    }}
  }});
}});

// ── FILTER LOGIC ──
// Populate regione dropdown from FILTER_DATA
(function() {{
  const sel = document.getElementById('filterRegione');
  if (FILTER_DATA.regione) {{
    Object.keys(FILTER_DATA.regione).sort().forEach(r => {{
      const opt = document.createElement('option');
      opt.value = r;
      opt.textContent = r;
      sel.appendChild(opt);
    }});
  }}
}})();

// Populate ATECO dropdown from FILTER_RAW
(function() {{
  const sel = document.getElementById('filterAteco');
  if (FILTER_RAW.atecos) {{
    FILTER_RAW.atecos.forEach((label, i) => {{
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = label;
      sel.appendChild(opt);
    }});
  }}
}})();

// ── ANOMALY ALERTS ──
(function() {{
  const bar = document.getElementById('anomalyBar');
  if (!ANOMALIES || ANOMALIES.length === 0 || !bar) return;
  const icons = {{high: '&#9888;', medium: '&#9888;', low: '&#8505;'}};
  ANOMALIES.forEach(a => {{
    const div = document.createElement('div');
    div.className = 'anomaly-alert severity-' + a.severity;
    div.innerHTML = '<span class="anomaly-icon">' + (icons[a.severity] || '&#9888;') + '</span>'
      + '<div class="anomaly-body"><div class="anomaly-title">' + a.title + '</div>'
      + '<div class="anomaly-detail">' + a.detail + '</div></div>';
    div.onclick = function() {{ this.classList.toggle('expanded'); }};
    bar.appendChild(div);
  }});
}})();

function fmtNum(n) {{
  return n.toString().replace(/\\B(?=(\\d{{3}})+(?!\\d))/g, ',');
}}

// ── HELPER: mediana ──
function _median(arr) {{
  if (!arr.length) return 0;
  const s = arr.slice().sort((a,b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m-1] + s[m]) / 2;
}}

// ── AGGIORNAMENTO DINAMICO SEZIONI ──
// Indici FILTER_RAW.rows: [0]=macro_i, [1]=reg_i, [2]=size_i, [3]=stat_i, [4]=rg, [5]=rev, [6]=emp, [7]=pd, [8]=pnl, [9]=rn, [10]=ig, [11]=clean, [12]=ateco_i

function _updatePanoramica(rows) {{
  const statCounts = {{}};
  const sizeCounts = {{}};
  for (let i = 0; i < rows.length; i++) {{
    const s = rows[i][3]; if (s >= 0) statCounts[s] = (statCounts[s] || 0) + 1;
    const z = rows[i][2]; if (z >= 0) sizeCounts[z] = (sizeCounts[z] || 0) + 1;
  }}
  if (_chartStatus) {{
    const sLabels = FILTER_RAW.status_cats;
    _chartStatus.data.labels = sLabels;
    _chartStatus.data.datasets[0].data = sLabels.map((_, i) => statCounts[i] || 0);
    _chartStatus.update();
  }}
  if (_chartSize) {{
    const zLabels = FILTER_RAW.sizes;
    _chartSize.data.labels = zLabels;
    _chartSize.data.datasets[0].data = zLabels.map((_, i) => sizeCounts[i] || 0);
    _chartSize.update();
  }}
  const bPan = document.getElementById('badgePanoramica');
  if (bPan) bPan.textContent = rows.length.toLocaleString('it-IT') + ' AZIENDE';
}}

function _updateRating(rows) {{
  const rl = ['A','B','C','D','E','F','G','H','I','L','M','N','O','P','Q','R'];
  const counts = new Array(16).fill(0);
  let igSum = 0;
  for (let i = 0; i < rows.length; i++) {{
    const rn = rows[i][9];
    if (rn >= 0 && rn < 16) counts[rn]++;
    igSum += rows[i][10];
  }}
  if (_chartRating) {{
    _chartRating.data.labels = rl;
    _chartRating.data.datasets[0].data = counts;
    _chartRating.data.datasets[0].backgroundColor = rl.map((r, i, arr) => {{
      const t = i / arr.length;
      return t < 0.5 ? `rgba(0,51,102,${{0.4 + t}})` : `rgba(181,152,90,${{0.4 + (t - 0.5)}})`;
    }});
    _chartRating.update();
  }}
  if (_chartGrade) {{
    const sg = rows.length - igSum;
    _chartGrade.data.datasets[0].data = [igSum, sg];
    _chartGrade.update();
  }}
  // Badge
  const bRat = document.getElementById('badgeRating');
  if (bRat) {{
    // Rating medio ponderato
    let sumRn = 0, cRn = 0;
    for (let i = 0; i < rows.length; i++) {{ if (rows[i][9] !== null) {{ sumRn += rows[i][9]; cRn++; }} }}
    const avgRn = cRn > 0 ? Math.round(sumRn / cRn) : 8;
    bRat.textContent = 'Rating ' + rl[avgRn] + ' | IG ' + (rows.length > 0 ? (igSum / rows.length * 100).toFixed(1) : '0') + '%';
  }}
}}

function _updateDefault(rows) {{
  const rl = ['A','B','C','D','E','F','G','H','I','L','M','N','O','P','Q','R'];
  // PD medio per rating
  const pdSums = new Array(16).fill(0), pdCounts = new Array(16).fill(0);
  let low = 0, med = 0, high = 0, pdAll = 0, pdC = 0;
  for (let i = 0; i < rows.length; i++) {{
    const pd = rows[i][7], rn = rows[i][9];
    if (pd !== null) {{
      pdAll += pd; pdC++;
      if (pd < 1) low++; else if (pd < 5) med++; else high++;
      if (rn >= 0 && rn < 16) {{ pdSums[rn] += pd; pdCounts[rn]++; }}
    }}
  }}
  if (_chartPD) {{
    const pdByR = rl.map((_, i) => pdCounts[i] > 0 ? +(pdSums[i] / pdCounts[i]).toFixed(2) : 0);
    _chartPD.data.labels = rl;
    _chartPD.data.datasets[0].data = pdByR;
    _chartPD.data.datasets[0].backgroundColor = pdByR.map(v => v > 5 ? '#B91C1C' : v > 2 ? '#C17B1E' : '#1B7A43');
    _chartPD.update();
  }}
  if (_chartRisk) {{
    _chartRisk.data.datasets[0].data = [low, med, high];
    _chartRisk.update();
  }}
  const bDef = document.getElementById('badgeDefault');
  if (bDef) bDef.textContent = 'PD Media ' + (pdC > 0 ? (pdAll / pdC).toFixed(2) : '0') + '%';
}}

function _updateRiskDetail(rows) {{
  const szLabels = FILTER_RAW.sizes;
  const szPdS = new Array(szLabels.length).fill(0), szPdC = new Array(szLabels.length).fill(0);
  const mLabels = FILTER_RAW.macros;
  const mPdS = new Array(mLabels.length).fill(0), mPdC = new Array(mLabels.length).fill(0);
  for (let i = 0; i < rows.length; i++) {{
    const pd = rows[i][7], si = rows[i][2], mi = rows[i][0];
    if (pd !== null) {{
      if (si >= 0 && si < szLabels.length) {{ szPdS[si] += pd; szPdC[si]++; }}
      if (mi >= 0 && mi < mLabels.length) {{ mPdS[mi] += pd; mPdC[mi]++; }}
    }}
  }}
  if (_chartRiskSize) {{
    const d = szLabels.map((_, i) => szPdC[i] > 0 ? +(szPdS[i] / szPdC[i]).toFixed(2) : 0);
    _chartRiskSize.data.labels = szLabels;
    _chartRiskSize.data.datasets[0].data = d;
    _chartRiskSize.data.datasets[0].backgroundColor = d.map(v => v > 3 ? '#B91C1C' : v > 2 ? '#C17B1E' : '#003366');
    _chartRiskSize.update();
  }}
  if (_chartRiskMacro) {{
    const d = mLabels.map((_, i) => mPdC[i] > 0 ? +(mPdS[i] / mPdC[i]).toFixed(2) : 0);
    _chartRiskMacro.data.labels = mLabels;
    _chartRiskMacro.data.datasets[0].data = d;
    _chartRiskMacro.update();
  }}
}}

function _updateProfit(rows) {{
  let profit = 0, loss = 0, breakeven = 0;
  for (let i = 0; i < rows.length; i++) {{
    const pnl = rows[i][8];
    if (pnl !== null) {{
      if (pnl > 0) profit++; else if (pnl < 0) loss++; else breakeven++;
    }}
  }}
  if (_chartProfit) {{
    _chartProfit.data.datasets[0].data = [profit, loss, breakeven];
    _chartProfit.update();
  }}
  const bProf = document.getElementById('badgeProfitability');
  const total = profit + loss + breakeven;
  if (bProf) bProf.textContent = (total > 0 ? (profit / total * 100).toFixed(1) : '0') + '% in utile';
}}

function _updateGeo(rows) {{
  const regMap = {{}};
  for (let i = 0; i < rows.length; i++) {{
    const ri = rows[i][1], pd = rows[i][7], rev = rows[i][5];
    if (ri < 0) continue;
    if (!regMap[ri]) regMap[ri] = {{n: 0, pdS: 0, pdC: 0, revS: 0, revC: 0}};
    regMap[ri].n++;
    if (pd !== null) {{ regMap[ri].pdS += pd; regMap[ri].pdC++; }}
    if (rev !== null) {{ regMap[ri].revS += rev; regMap[ri].revC++; }}
  }}
  // Top 10 per count
  const entries = Object.entries(regMap).map(([ri, d]) => ({{
    label: FILTER_RAW.regioni[parseInt(ri)],
    n: d.n,
    pd: d.pdC > 0 ? +(d.pdS / d.pdC).toFixed(2) : 0,
    rev: d.revC > 0 ? Math.round(d.revS / d.revC) : 0
  }})).sort((a,b) => b.n - a.n).slice(0, 10);
  const geoLabels = entries.map(e => e.label);
  const geoN = entries.map(e => e.n);
  const geoPD = entries.map(e => e.pd);
  const geoRev = entries.map(e => e.rev);
  if (_chartGeo) {{
    _chartGeo.data.labels = geoLabels;
    _chartGeo.data.datasets[0].data = geoN;
    _chartGeo.update();
  }}
  if (_chartGeoPD) {{
    _chartGeoPD.data.labels = geoLabels;
    _chartGeoPD.data.datasets[0].data = geoPD;
    _chartGeoPD.data.datasets[0].backgroundColor = geoPD.map(v => v > 2.3 ? '#C17B1E' : '#003366');
    _chartGeoPD.update();
  }}
  if (_chartGeoRev) {{
    _chartGeoRev.data.labels = geoLabels;
    _chartGeoRev.data.datasets[0].data = geoRev;
    _chartGeoRev.update();
  }}
  // Risk by region (sorted by PD desc)
  const regPdEntries = entries.slice().sort((a,b) => b.pd - a.pd);
  if (_chartRiskReg) {{
    _chartRiskReg.data.labels = regPdEntries.map(e => e.label);
    const pdVals = regPdEntries.map(e => e.pd);
    _chartRiskReg.data.datasets[0].data = pdVals;
    _chartRiskReg.data.datasets[0].backgroundColor = pdVals.map(v => v > 2.3 ? '#B91C1C' : v > 2.0 ? '#C17B1E' : '#1B7A43');
    _chartRiskReg.update();
  }}
}}

function _updateNordSud(rows) {{
  const mLabels = FILTER_RAW.macros;
  const mRevArr = mLabels.map(() => []);
  const mPdS = new Array(mLabels.length).fill(0), mPdC = new Array(mLabels.length).fill(0);
  for (let i = 0; i < rows.length; i++) {{
    const mi = rows[i][0], rev = rows[i][5], pd = rows[i][7];
    if (mi < 0 || mi >= mLabels.length) continue;
    if (rev !== null) mRevArr[mi].push(rev);
    if (pd !== null) {{ mPdS[mi] += pd; mPdC[mi]++; }}
  }}
  if (_chartMacroRev) {{
    const means = mLabels.map((_, i) => mRevArr[i].length > 0 ? Math.round(mRevArr[i].reduce((a,b)=>a+b,0) / mRevArr[i].length) : 0);
    const medians = mLabels.map((_, i) => Math.round(_median(mRevArr[i])));
    _chartMacroRev.data.labels = mLabels;
    _chartMacroRev.data.datasets[0].data = means;
    _chartMacroRev.data.datasets[1].data = medians;
    _chartMacroRev.update();
  }}
  if (_chartMacroPD) {{
    _chartMacroPD.data.labels = mLabels;
    _chartMacroPD.data.datasets[0].data = mLabels.map((_, i) => mPdC[i] > 0 ? +(mPdS[i] / mPdC[i]).toFixed(2) : 0);
    _chartMacroPD.update();
  }}
}}

function _updateAtecoCharts(rows) {{
  const atecoMap = {{}};
  for (let i = 0; i < rows.length; i++) {{
    const ai = rows[i][12], pd = rows[i][7];
    if (!atecoMap[ai]) atecoMap[ai] = {{n: 0, pdS: 0, pdC: 0}};
    atecoMap[ai].n++;
    if (pd !== null) {{ atecoMap[ai].pdS += pd; atecoMap[ai].pdC++; }}
  }}
  const entries = Object.entries(atecoMap).map(([ai, d]) => ({{
    label: FILTER_RAW.atecos[parseInt(ai)],
    n: d.n,
    pd: d.pdC > 0 ? +(d.pdS / d.pdC).toFixed(2) : 0
  }})).sort((a,b) => b.n - a.n);
  const top8 = entries.slice(0, 8);
  if (_chartAtecoN) {{
    _chartAtecoN.data.labels = top8.map(e => e.label);
    _chartAtecoN.data.datasets[0].data = top8.map(e => e.n);
    _chartAtecoN.update();
  }}
  if (_chartAtecoPD) {{
    const pdVals = top8.map(e => e.pd);
    _chartAtecoPD.data.labels = top8.map(e => e.label);
    _chartAtecoPD.data.datasets[0].data = pdVals;
    _chartAtecoPD.data.datasets[0].backgroundColor = pdVals.map(v => v > 2.5 ? '#B91C1C' : v > 2.0 ? '#C17B1E' : '#003366');
    _chartAtecoPD.update();
  }}
  // Overview pie
  if (_chartOverviewPie) {{
    const top8pie = entries.slice(0, 8);
    const othersN = entries.slice(8).reduce((s,e) => s + e.n, 0);
    const pieLabels = top8pie.map(e => e.label);
    const pieValues = top8pie.map(e => e.n);
    if (othersN > 0) {{ pieLabels.push('Altri (' + (entries.length - 8) + ' sottosettori)'); pieValues.push(othersN); }}
    _chartOverviewPie.data.labels = pieLabels;
    _chartOverviewPie.data.datasets[0].data = pieValues;
    const pieColors = ['#003366','#004d99','#0066cc','#3399ff','#B5985A','#D4B978','#1B7A43','#C17B1E','#9ca3af'];
    _chartOverviewPie.data.datasets[0].backgroundColor = pieValues.map((_, i) => pieColors[i % pieColors.length]);
    _chartOverviewPie.update();
  }}
}}

// ── AGGIORNAMENTO SCENARI ──
// Per ogni scenario (4), indici per-riga: 13 + sc_idx*7 + offset
// offset: 0=d_va, 1=d_emp, 2=d_inv, 3=cost, 4=tax_new, 5=contrib, 6=iva
function _fmtSc(v) {{
  const a = Math.abs(v), s = v < 0 ? '-' : '+';
  if (a >= 1e9) return 'EUR ' + s + (a/1e9).toFixed(1) + ' Mld';
  if (a >= 1e6) return 'EUR ' + s + (a/1e6).toFixed(1) + ' Mln';
  if (a >= 1e3) return 'EUR ' + s + Math.round(a/1e3).toLocaleString('it-IT') + 'K';
  return 'EUR ' + s + Math.round(a).toLocaleString('it-IT');
}}

function _updateScenarios(rows) {{
  const nSc = FILTER_RAW.scenarios ? FILTER_RAW.scenarios.length : 0;
  if (nSc === 0) return;
  const scData = [];
  for (let si = 0; si < nSc; si++) {{
    const base = 13 + si * 7;
    let d_va = 0, d_emp = 0, d_inv = 0, cost = 0, tax_new = 0, contrib = 0, iva = 0;
    for (let i = 0; i < rows.length; i++) {{
      const r = rows[i];
      d_va += r[base] || 0;
      d_emp += r[base+1] || 0;
      d_inv += r[base+2] || 0;
      cost += r[base+3] || 0;
      tax_new += r[base+4] || 0;
      contrib += r[base+5] || 0;
      iva += r[base+6] || 0;
    }}
    const saldo = tax_new + contrib + iva - cost;
    scData.push({{
      name: FILTER_RAW.scenarios[si].name,
      desc: FILTER_RAW.scenarios[si].desc,
      d_va, d_emp, d_inv, cost, tax_new, contrib, iva, saldo
    }});
  }}
  // Aggiorna charts
  const vaVals = scData.map(s => +(s.d_va / 1e6).toFixed(1));
  const fpVals = scData.map(s => +(s.saldo / 1e6).toFixed(1));
  const scLabels = scData.map(s => s.name.substring(0, 20));
  if (_chartEconVA) {{
    _chartEconVA.data.labels = scLabels;
    _chartEconVA.data.datasets[0].data = vaVals;
    _chartEconVA.data.datasets[0].backgroundColor = vaVals.map(v => v >= 0 ? '#1B7A43' : '#B91C1C');
    _chartEconVA.update();
  }}
  if (_chartEconFP) {{
    _chartEconFP.data.labels = scLabels;
    _chartEconFP.data.datasets[0].data = fpVals;
    _chartEconFP.data.datasets[0].backgroundColor = fpVals.map(v => v >= 0 ? '#1B7A43' : '#B91C1C');
    _chartEconFP.update();
  }}
  // Ricostruisci cards scenari
  const container = document.getElementById('scenarioCardsContainer');
  if (container) {{
    let html = '';
    scData.forEach((sc, si) => {{
      const neg = sc.d_va < 0;
      const col = neg ? '#B91C1C' : '#1B7A43';
      const fpCol = sc.saldo >= 0 ? '#1B7A43' : '#B91C1C';
      html += '<div style="background:#fff;border:1px solid #D8DCE3;border-left:5px solid ' + col + ';border-radius:4px;padding:20px;margin-bottom:16px;box-shadow:0 1px 3px rgba(0,30,60,0.06)">'
        + '<h4 style="color:' + col + ';font-size:16px;margin-bottom:4px">' + sc.name + '</h4>'
        + '<p style="font-size:12px;color:#5A6B8A;margin-bottom:14px">' + sc.desc + '</p>'
        + '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px">'
        + '<div style="background:#F8F9FC;border:1px solid #D8DCE3;border-radius:4px;padding:10px"><div style="font-size:10px;text-transform:uppercase;color:#5A6B8A;font-weight:600">\u0394 Valore Aggiunto</div><div style="font-size:18px;font-weight:900;color:' + col + '">' + _fmtSc(sc.d_va) + '</div></div>'
        + '<div style="background:#F8F9FC;border:1px solid #D8DCE3;border-radius:4px;padding:10px"><div style="font-size:10px;text-transform:uppercase;color:#5A6B8A;font-weight:600">\u0394 Occupazione</div><div style="font-size:18px;font-weight:900;color:#003366">' + (sc.d_emp >= 0 ? '+' : '') + Math.round(sc.d_emp).toLocaleString('it-IT') + ' addetti</div></div>'
        + '<div style="background:#F8F9FC;border:1px solid #D8DCE3;border-radius:4px;padding:10px"><div style="font-size:10px;text-transform:uppercase;color:#5A6B8A;font-weight:600">\u0394 Investimento</div><div style="font-size:18px;font-weight:900;color:#003366">' + _fmtSc(sc.d_inv) + '</div></div>'
        + '</div>'
        + '<div style="background:#F4F5F7;border-radius:4px;padding:12px 16px;border:1px solid #D8DCE3">'
        + '<div style="display:flex;justify-content:space-between;font-size:13px;padding:3px 0"><span>Gettito diretto (IRES 24%)</span><span>' + _fmtSc(sc.tax_new) + '</span></div>'
        + '<div style="display:flex;justify-content:space-between;font-size:13px;padding:3px 0"><span>Gettito contributivo</span><span>' + _fmtSc(sc.contrib) + '</span></div>'
        + '<div style="display:flex;justify-content:space-between;font-size:13px;padding:3px 0"><span>Gettito IVA</span><span>' + _fmtSc(sc.iva) + '</span></div>'
        + '<div style="display:flex;justify-content:space-between;font-size:13px;padding:3px 0;color:#B91C1C"><span>Costo misura</span><span>' + _fmtSc(-Math.abs(sc.cost)) + '</span></div>'
        + '<div style="display:flex;justify-content:space-between;font-size:15px;padding:8px 0 3px;border-top:2px solid #003366;margin-top:6px"><strong>SALDO NETTO FP</strong><strong style="color:' + fpCol + '">' + _fmtSc(sc.saldo) + '</strong></div>'
        + '</div></div>';
    }});
    container.innerHTML = html;
  }}
}}

// ── SOLIDITA PATRIMONIALE ──
// Extra indices: 44=current_ratio, 45=gearing, 46=liquidity_ratio, 47=solvency_ratio
function _updateSolidity(rows) {{
  // Indices: 45=current_ratio, 46=gearing, 47=liquidity_ratio, 48=solvency_ratio
  const metrics = [
    {{name: 'Current Ratio', idx: 45}},
    {{name: 'Liquidity Ratio', idx: 47}},
    {{name: 'Solvency Ratio (%)', idx: 48}},
    {{name: 'Gearing (%)', idx: 46}},
  ];
  const container = document.getElementById('solidityTableContainer');
  if (!container) return;
  let html = '<table class="kpi-table"><thead><tr><th>KPI</th><th>Media</th><th>Mediana</th><th>Q25</th><th>Q75</th><th>N. Aziende</th></tr></thead><tbody>';
  metrics.forEach(m => {{
    const vals = [];
    for (let i = 0; i < rows.length; i++) {{
      const v = rows[i][m.idx];
      if (v !== null && v !== undefined && isFinite(v)) vals.push(v);
    }}
    if (vals.length === 0) {{
      html += '<tr><td>' + m.name + '</td><td>N/A</td><td>N/A</td><td>N/A</td><td>N/A</td><td>0</td></tr>';
      return;
    }}
    vals.sort((a,b) => a - b);
    const mean = vals.reduce((a,b) => a+b, 0) / vals.length;
    const med = _median(vals);
    const q25 = vals[Math.floor(vals.length * 0.25)];
    const q75 = vals[Math.floor(vals.length * 0.75)];
    html += '<tr><td style="font-weight:600">' + m.name + '</td><td>' + mean.toFixed(1) + '</td><td>' + med.toFixed(1) + '</td><td>' + q25.toFixed(1) + '</td><td>' + q75.toFixed(1) + '</td><td>' + vals.length.toLocaleString('it-IT') + '</td></tr>';
  }});
  html += '</tbody></table>';
  container.innerHTML = html;
}}

// ── FORMA GIURIDICA ──
// Extra index: 42=legal_form_i, 43=ebitda, 44=roe already used for solidity, check: 41=name, 42=legal_i, 43=ebitda, 44=cr, 45=gearing...
// Wait - actual indices: [41]=name, [42]=legal_i, [43]=ebitda, [44]=roe, [45]=cr, [46]=gearing, [47]=liq, [48]=solv
// BUT name is a string at index 41! Let me recheck the order from the Python code.
// Python: [_name, _leg_i, _ebitda, _roe, _cr, _gear, _liq, _solv]
// So: 41=name(str), 42=legal_i, 43=ebitda, 44=roe, 45=current_ratio, 46=gearing, 47=liquidity, 48=solvency
function _updateLegal(rows) {{
  const container = document.getElementById('legalTableContainer');
  if (!container) return;
  const legMap = {{}};
  for (let i = 0; i < rows.length; i++) {{
    const li = rows[i][42];
    if (li < 0) continue;
    if (!legMap[li]) legMap[li] = {{n:0, revS:0, revC:0, pdS:0, pdC:0, roeS:0, roeC:0, ebitdaS:0, ebitdaC:0}};
    legMap[li].n++;
    const rev = rows[i][5], pd = rows[i][7], roe = rows[i][44], ebitda = rows[i][43];
    if (rev !== null) {{ legMap[li].revS += rev; legMap[li].revC++; }}
    if (pd !== null) {{ legMap[li].pdS += pd; legMap[li].pdC++; }}
    if (roe !== null) {{ legMap[li].roeS += roe; legMap[li].roeC++; }}
    if (ebitda !== null) {{ legMap[li].ebitdaS += ebitda; legMap[li].ebitdaC++; }}
  }}
  const entries = Object.entries(legMap).map(([li, d]) => ({{
    name: FILTER_RAW.legal_forms[parseInt(li)],
    n: d.n,
    revMean: d.revC > 0 ? d.revS / d.revC : 0,
    pdMean: d.pdC > 0 ? d.pdS / d.pdC : 0,
    roeMean: d.roeC > 0 ? d.roeS / d.roeC : 0,
    ebitdaMean: d.ebitdaC > 0 ? d.ebitdaS / d.ebitdaC : 0,
  }})).sort((a,b) => b.n - a.n);
  const fE = v => {{
    const a = Math.abs(v), s = v < 0 ? '-' : '';
    if (a >= 1e9) return s + '\u20ac' + (a/1e9).toFixed(1) + ' Mld';
    if (a >= 1e6) return s + '\u20ac' + (a/1e6).toFixed(1) + ' Mln';
    if (a >= 1e3) return s + '\u20ac' + Math.round(a/1e3).toLocaleString('it-IT') + 'K';
    return s + '\u20ac' + Math.round(a).toLocaleString('it-IT');
  }};
  let html = '<table class="kpi-table"><thead><tr><th>Forma Giuridica</th><th style="text-align:right">N. Aziende</th><th style="text-align:right">Fatturato Medio</th><th style="text-align:right">PD Media (%)</th><th style="text-align:right">ROE Medio (%)</th><th style="text-align:right">EBITDA Medio</th></tr></thead><tbody>';
  entries.forEach(e => {{
    html += '<tr><td style="font-weight:600">' + e.name + '</td><td style="text-align:right">' + e.n.toLocaleString('it-IT') + '</td><td style="text-align:right">' + fE(e.revMean) + '</td><td style="text-align:right">' + e.pdMean.toFixed(2) + '%</td><td style="text-align:right">' + e.roeMean.toFixed(1) + '%</td><td style="text-align:right">' + fE(e.ebitdaMean) + '</td></tr>';
  }});
  html += '</tbody></table>';
  container.innerHTML = html;
}}

// ── TREND TEMPORALE ──
// FILTER_RAW.trend = [[company_idx, anno, rev, ebitda, roe], ...]
function _updateTrend(rows) {{
  if (!FILTER_RAW.trend) return;
  // Build set of valid company indices from filtered rows
  const validIdx = new Set();
  for (let i = 0; i < rows.length; i++) {{
    // rows index in FILTER_RAW.rows corresponds to company_idx in trend
    // But we need the actual index in FILTER_RAW.rows, not in filtered
    // So we need to find the original index
  }}
  // Actually: rows ARE elements of FILTER_RAW.rows. We need to find their original indices.
  // Faster: build a Set of row references
  const rowSet = new Set(rows);
  const allRows = FILTER_RAW.rows;
  for (let i = 0; i < allRows.length; i++) {{
    if (rowSet.has(allRows[i])) validIdx.add(i);
  }}
  // Aggregate trend by year for valid companies
  const yearMap = {{}};
  const trend = FILTER_RAW.trend;
  for (let i = 0; i < trend.length; i++) {{
    const cidx = trend[i][0], anno = trend[i][1], rev = trend[i][2], ebitda = trend[i][3], roe = trend[i][4];
    if (!validIdx.has(cidx)) continue;
    if (!yearMap[anno]) yearMap[anno] = {{revS:0, revC:0, ebitdaS:0, ebitdaC:0, roeS:0, roeC:0}};
    if (rev !== null) {{ yearMap[anno].revS += rev; yearMap[anno].revC++; }}
    if (ebitda !== null) {{ yearMap[anno].ebitdaS += ebitda; yearMap[anno].ebitdaC++; }}
    if (roe !== null) {{ yearMap[anno].roeS += roe; yearMap[anno].roeC++; }}
  }}
  const years = Object.keys(yearMap).map(Number).sort();
  const labels = years.map(String);
  const revMeans = years.map(y => yearMap[y].revC > 0 ? Math.round(yearMap[y].revS / yearMap[y].revC) : 0);
  const ebitdaMeans = years.map(y => yearMap[y].ebitdaC > 0 ? Math.round(yearMap[y].ebitdaS / yearMap[y].ebitdaC) : 0);
  const roeMeans = years.map(y => yearMap[y].roeC > 0 ? +(yearMap[y].roeS / yearMap[y].roeC).toFixed(1) : 0);
  if (_chartTrendRev) {{
    _chartTrendRev.data.labels = labels;
    _chartTrendRev.data.datasets[0].data = revMeans;
    _chartTrendRev.data.datasets[1].data = ebitdaMeans;
    _chartTrendRev.update();
  }}
  if (_chartTrendROE) {{
    _chartTrendROE.data.labels = labels;
    _chartTrendROE.data.datasets[0].data = roeMeans;
    _chartTrendROE.update();
  }}
}}

// ── TOP & BOTTOM PERFORMERS ──
// Extra indices: 41=name, 5=rev, 43=ebitda, 6=emp, 7=pd, 9=rn, 3=stat_i
function _updateTopPerformers(rows) {{
  const rl = ['A','B','C','D','E','F','G','H','I','L','M','N','O','P','Q','R'];
  const fE = v => {{
    if (v == null) return 'N/A';
    const a = Math.abs(v), s = v < 0 ? '-' : '';
    if (a >= 1e9) return s + '\u20ac' + (a/1e9).toFixed(1) + ' Mld';
    if (a >= 1e6) return s + '\u20ac' + (a/1e6).toFixed(1) + ' Mln';
    if (a >= 1e3) return s + '\u20ac' + Math.round(a/1e3).toLocaleString('it-IT') + 'K';
    return s + '\u20ac' + Math.round(a).toLocaleString('it-IT');
  }};
  // Top 20 revenue
  const byRev = rows.filter(r => r[5] !== null).sort((a,b) => b[5] - a[5]).slice(0, 20);
  const cRev = document.getElementById('topRevenueContainer');
  if (cRev) {{
    let html = '<table class="kpi-table"><thead><tr><th>Azienda</th><th>Regione</th><th>Rating</th><th style="text-align:right">Fatturato</th><th style="text-align:right">EBITDA</th><th style="text-align:right">Dipendenti</th><th style="text-align:right">PD (%)</th></tr></thead><tbody>';
    byRev.forEach(r => {{
      const name = r[41] || 'N/A';
      const reg = r[1] >= 0 ? FILTER_RAW.regioni[r[1]] : 'N/A';
      const rat = r[9] !== null && r[9] >= 0 && r[9] < 16 ? rl[Math.round(r[9])] : 'N/A';
      html += '<tr><td style="font-weight:600;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + name + '">' + name + '</td><td>' + reg + '</td><td>' + rat + '</td><td style="text-align:right">' + fE(r[5]) + '</td><td style="text-align:right">' + fE(r[43]) + '</td><td style="text-align:right">' + (r[6] != null ? Math.round(r[6]).toLocaleString('it-IT') : 'N/A') + '</td><td style="text-align:right">' + (r[7] != null ? r[7].toFixed(2) + '%' : 'N/A') + '</td></tr>';
    }});
    html += '</tbody></table>';
    cRev.innerHTML = html;
  }}
  // Top 20 risk
  const byRisk = rows.filter(r => r[7] !== null).sort((a,b) => b[7] - a[7]).slice(0, 20);
  const cRisk = document.getElementById('topRiskContainer');
  if (cRisk) {{
    let html = '<table class="kpi-table"><thead><tr><th>Azienda</th><th>Regione</th><th>Rating</th><th style="text-align:right">Fatturato</th><th style="text-align:right">PD (%)</th><th>Stato</th></tr></thead><tbody>';
    byRisk.forEach(r => {{
      const name = r[41] || 'N/A';
      const reg = r[1] >= 0 ? FILTER_RAW.regioni[r[1]] : 'N/A';
      const rat = r[9] !== null && r[9] >= 0 && r[9] < 16 ? rl[Math.round(r[9])] : 'N/A';
      const stat = r[3] >= 0 ? FILTER_RAW.status_cats[r[3]] : 'N/A';
      html += '<tr><td style="font-weight:600;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + name + '">' + name + '</td><td>' + reg + '</td><td>' + rat + '</td><td style="text-align:right">' + fE(r[5]) + '</td><td style="text-align:right;color:#B91C1C;font-weight:700">' + r[7].toFixed(2) + '%</td><td>' + stat + '</td></tr>';
    }});
    html += '</tbody></table>';
    cRisk.innerHTML = html;
  }}
}}

function _updateAllSections(rows) {{
  _updatePanoramica(rows);
  _updateRating(rows);
  _updateDefault(rows);
  _updateRiskDetail(rows);
  _updateProfit(rows);
  _updateGeo(rows);
  _updateNordSud(rows);
  _updateAtecoCharts(rows);
  _updateScenarios(rows);
  _updateSolidity(rows);
  _updateLegal(rows);
  _updateTrend(rows);
  _updateTopPerformers(rows);
}}

// ── FILTRI AND: calcolo stats su FILTER_RAW ──
const _ratingLetters = ['A','B','C','D','E','F','G','H','I','L','M','N','O','P','Q','R'];

function _computeStats(rows) {{
  const n = rows.length;
  if (n === 0) return null;
  let nAct = 0, sumRev = 0, cRev = 0, sumEmp = 0, cEmp = 0;
  let sumPd = 0, cPd = 0, sumPnl = 0, cPnl = 0, inProfit = 0;
  let sumRn = 0, cRn = 0, sumIg = 0, hrisk = 0;
  const revArr = [], empArr = [];
  for (let i = 0; i < n; i++) {{
    const r = rows[i];
    // r: [macro_i, reg_i, size_i, stat_i, rg, rev, emp, pd, pnl, rn, ig]
    if (r[3] === 0) nAct++;  // stat_i 0 = Attive
    if (r[5] !== null) {{ sumRev += r[5]; cRev++; revArr.push(r[5]); }}
    if (r[6] !== null) {{ sumEmp += r[6]; cEmp++; empArr.push(r[6]); }}
    if (r[7] !== null) {{ sumPd += r[7]; cPd++; if (r[7] >= 5) hrisk++; }}
    if (r[8] !== null) {{ cPnl++; if (r[8] > 0) inProfit++; }}
    if (r[9] !== null) {{ sumRn += r[9]; cRn++; }}
    sumIg += r[10];
  }}
  // Mediana helper
  function median(arr) {{
    if (arr.length === 0) return 0;
    arr.sort((a, b) => a - b);
    const mid = Math.floor(arr.length / 2);
    return arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
  }}
  const avgRn = cRn > 0 ? Math.round(sumRn / cRn) : 0;
  const ratLetter = (avgRn >= 1 && avgRn <= 16) ? _ratingLetters[avgRn - 1] : 'N/A';
  return {{
    n_total: n, n_active: nAct,
    rating_letter: ratLetter,
    pd_mean: cPd > 0 ? Math.round(sumPd / cPd * 100) / 100 : 0,
    rev_median: median(revArr),
    rev_mean: cRev > 0 ? sumRev / cRev : 0,
    emp_median: median(empArr),
    emp_mean: cEmp > 0 ? sumEmp / cEmp : 0,
    pct_profit: cPnl > 0 ? Math.round(inProfit / cPnl * 1000) / 10 : 0,
    pct_inv_grade: n > 0 ? Math.round(sumIg / n * 1000) / 10 : 0,
    pct_high_risk: cPd > 0 ? Math.round(hrisk / cPd * 1000) / 10 : 0,
  }};
}}

function applyFilter() {{
  const macro = document.getElementById('filterMacro').value;
  const rating = document.getElementById('filterRating').value;
  const size = document.getElementById('filterSize').value;
  const status = document.getElementById('filterStatus').value;
  const regione = document.getElementById('filterRegione').value;
  const quality = document.getElementById('filterQuality').value;
  const ateco = document.getElementById('filterAteco').value;

  const activeLabel = document.getElementById('filterActiveLabel');

  // Nessun filtro attivo (quality='all' equivale a nessun filtro qualita)
  if (!macro && !rating && !size && !status && !regione && !ateco && quality !== 'good') {{
    activeLabel.classList.remove('visible');
    _updateAllSections(FILTER_RAW.rows);
    updateAtecoKPI(null);
    return;
  }}

  // Risolvi indici per i filtri attivi
  const macroIdx = macro ? FILTER_RAW.macros.indexOf(macro) : -1;
  const regIdx = regione ? FILTER_RAW.regioni.indexOf(regione) : -1;
  const sizeIdx = size ? FILTER_RAW.sizes.indexOf(size) : -1;
  const statIdx = status ? FILTER_RAW.status_cats.indexOf(status) : -1;
  const ratingVal = rating === 'Investment Grade (A-H)' ? 0 : (rating === 'Speculative Grade (I-R)' ? 1 : -1);
  const qFilter = quality === 'good' ? 1 : -1;
  const atecoIdx = ateco !== '' ? parseInt(ateco) : -1;

  // Filtra righe con logica AND
  const filtered = [];
  const allRows = FILTER_RAW.rows;
  for (let i = 0; i < allRows.length; i++) {{
    const r = allRows[i];
    if (macroIdx >= 0 && r[0] !== macroIdx) continue;
    if (regIdx >= 0 && r[1] !== regIdx) continue;
    if (sizeIdx >= 0 && r[2] !== sizeIdx) continue;
    if (statIdx >= 0 && r[3] !== statIdx) continue;
    if (ratingVal >= 0 && r[4] !== ratingVal) continue;
    if (qFilter >= 0 && r[11] !== qFilter) continue;
    if (atecoIdx >= 0 && r[12] !== atecoIdx) continue;
    filtered.push(r);
  }}

  if (filtered.length === 0) {{
    activeLabel.textContent = 'Nessun risultato';
    activeLabel.classList.add('visible');
    _updateAllSections([]);
    updateAtecoKPI(null);
    return;
  }}

  // Label combinato
  const parts = [];
  if (quality === 'good') parts.push('Dati Buoni');
  if (macro) parts.push(macro);
  if (regione) parts.push(regione);
  if (size) parts.push(size);
  if (rating) parts.push(rating);
  if (status) parts.push(status);
  if (ateco) parts.push(FILTER_RAW.atecos[parseInt(ateco)]);
  activeLabel.textContent = 'Filtri: ' + parts.join(' + ');
  activeLabel.classList.add('visible');

  // Aggiorna TUTTI i grafici e KPI con i dati filtrati
  _updateAllSections(filtered);
  updateAtecoKPI(filtered, atecoIdx);
}}

function updateHeroCards(d) {{
  // Hero cards rimosse - funzione mantenuta come no-op per compatibilita filtri
}}

// ── ATECO KPI DASHBOARD ──
function updateAtecoKPI(filteredRows, selectedAtecoIdx) {{
  const container = document.getElementById('atecoKpiGrid');
  if (!container) return;

  // Se nessun filtro attivo, mostra breakdown di tutti i sottosettori
  const allRows = filteredRows || FILTER_RAW.rows;

  // Raggruppa per ateco
  const byAteco = {{}};
  for (let i = 0; i < allRows.length; i++) {{
    const r = allRows[i];
    const ai = r[12];
    if (ai < 0) continue;
    if (!byAteco[ai]) byAteco[ai] = [];
    byAteco[ai].push(r);
  }}

  // Ordina per numero aziende desc
  const entries = Object.entries(byAteco).sort((a, b) => b[1].length - a[1].length);

  if (entries.length === 0) {{
    container.innerHTML = '<p style="color:#64748b;text-align:center">Nessun dato disponibile</p>';
    return;
  }}

  let html = '<table class="ateco-kpi-table"><thead><tr>' +
    '<th>Sottosettore ATECO</th><th>Aziende</th><th>Fatturato Med.</th>' +
    '<th>Dipendenti Med.</th><th>Rating</th><th>PD Media</th><th>% Inv.Grade</th>' +
    '<th>% Rischio Alto</th><th>% In Utile</th></tr></thead><tbody>';

  const rl = ['A','B','C','D','E','F','G','H','I','L','M','N','O','P','Q','R'];

  entries.forEach(([aiStr, rows]) => {{
    const ai = parseInt(aiStr);
    const s = _computeStats(rows);
    if (!s) return;
    const label = FILTER_RAW.atecos[ai] || ('ATECO ' + ai);
    const isSelected = ai === selectedAtecoIdx;
    const trClass = isSelected ? ' class="ateco-row-selected"' : '';
    html += '<tr' + trClass + '>' +
      '<td style="text-align:left;font-weight:600;font-size:11px;max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + label + '">' + label + '</td>' +
      '<td>' + fmtNum(s.n_total) + '</td>' +
      '<td>&euro;' + fmtNum(Math.round(s.rev_median)) + '</td>' +
      '<td>' + fmtNum(Math.round(s.emp_median)) + '</td>' +
      '<td style="font-weight:700">' + s.rating_letter + '</td>' +
      '<td>' + s.pd_mean.toFixed(2) + '%</td>' +
      '<td>' + s.pct_inv_grade.toFixed(1) + '%</td>' +
      '<td style="color:' + (s.pct_high_risk > 10 ? '#dc2626' : '#059669') + '">' + s.pct_high_risk.toFixed(1) + '%</td>' +
      '<td>' + s.pct_profit.toFixed(1) + '%</td></tr>';
  }});

  html += '</tbody></table>';
  container.innerHTML = html;
}}

// Init ATECO KPI on load
document.addEventListener('DOMContentLoaded', function() {{ updateAtecoKPI(null); }});

function setQuality(val) {{
  document.getElementById('filterQuality').value = val;
  document.querySelectorAll('.qt-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(val === 'good' ? '.qt-good' : '.qt-all').classList.add('active');
  // Nascondi/mostra anomalie e BRE quando filtro qualita attivo
  const hideAlerts = (val === 'good');
  const anomBar = document.getElementById('anomalyBar');
  const breSection = document.getElementById('bre');
  if (anomBar) anomBar.style.display = hideAlerts ? 'none' : '';
  if (breSection) breSection.style.display = hideAlerts ? 'none' : '';
  applyFilter();
}}

function resetFilters() {{
  document.getElementById('filterMacro').value = '';
  document.getElementById('filterRating').value = '';
  document.getElementById('filterSize').value = '';
  document.getElementById('filterStatus').value = '';
  document.getElementById('filterRegione').value = '';
  document.getElementById('filterAteco').value = '';
  // Ripristina visibilita anomalie e BRE
  const anomBar = document.getElementById('anomalyBar');
  const breSection = document.getElementById('bre');
  if (anomBar) anomBar.style.display = '';
  if (breSection) breSection.style.display = '';
  setQuality('all');
  _updateAllSections(FILTER_RAW.rows);
  updateAtecoKPI(null);
}}

// ── CHATBOT AI ──
const CHATBOT_API = 'http://localhost:5050/api/chat';
let chatHistory = [];

function toggleChatbot() {{
  const sidebar = document.getElementById('chatbotSidebar');
  sidebar.classList.toggle('open');
  document.body.classList.toggle('chatbot-active', sidebar.classList.contains('open'));
  if (sidebar.classList.contains('open')) {{
    setTimeout(() => document.getElementById('chatInput').focus(), 400);
  }}
}}

function exportPDF() {{
  // Espandi tutte le sezioni e sub-drilldown
  document.querySelectorAll('.section').forEach(s => s.classList.add('open'));
  document.querySelectorAll('.sub-drilldown').forEach(s => s.classList.add('open'));
  document.querySelectorAll('.bre-rule-card').forEach(s => s.classList.add('open'));
  // Chiudi chatbot se aperto
  const sidebar = document.getElementById('chatbotSidebar');
  const wasOpen = sidebar.classList.contains('open');
  if (wasOpen) {{
    sidebar.classList.remove('open');
    document.body.classList.remove('chatbot-active');
  }}
  // Stampa dopo un breve delay per permettere il rendering
  setTimeout(() => {{
    window.print();
    // Ripristina stato chatbot
    if (wasOpen) {{
      sidebar.classList.add('open');
      document.body.classList.add('chatbot-active');
    }}
  }}, 500);
}}

function askSuggestion(btn) {{
  document.getElementById('chatInput').value = btn.textContent;
  sendChat();
}}

const SCENARIOS = {{
  'A': 'SCENARIO A - INCENTIVO R&D\\n\\nPolicy: Aumento credito d\\'imposta R&D dal livello base a livello rafforzato per pharma/biotech.\\n\\nSimula e quantifica con i dati del dataset:\\n1. Addizionalità R&D (EUR e % su base attuale)\\n2. Costo fiscale per lo Stato\\n3. Impatto su occupazione qualificata (STEM)\\n4. Impatto su produttività a 3-5 anni\\n\\nPresenta i risultati in formato tabellare con breakdown per dimensione (PMI vs grandi) e macro area (Nord/Centro/Sud). Calcola il Fiscal ROI.',
  'B': 'SCENARIO B - RESHORING API (PRINCIPI ATTIVI)\\n\\nPolicy: Incentivo CAPEX + energia + logistica per riportare produzione API (Active Pharmaceutical Ingredients) in Italia.\\n\\nSimula e quantifica con i dati del dataset:\\n1. Investimenti attivati (EUR)\\n2. Riduzione dipendenza estera (% import sostituito)\\n3. Costo per unità di resilienza guadagnata\\n4. Impatto su prezzi e fiscalità\\n\\nPresenta breakdown per macro area e dimensione. Stima il tempo di payback.',
  'C': 'SCENARIO C - TAGLIO IRES MIRATO\\n\\nPolicy: Riduzione IRES condizionata a reinvestimento degli utili o assunzione occupazione STEM.\\n\\nSimula e quantifica con i dati del dataset:\\n1. Tax expenditure totale (EUR)\\n2. Investimento addizionale generato\\n3. Effetto differenziale multinazionali vs PMI\\n4. Rischio windfall gains (% beneficiari che avrebbero investito comunque)\\n\\nPresenta distribuzione beneficiari per dimensione e area geografica.',
  'D': 'SCENARIO D - STRETTA REGOLATORIA / PREZZI\\n\\nPolicy: Maggiore compressione margini sui farmaci rimborsabili SSN.\\n\\nSimula e quantifica con i dati del dataset:\\n1. Risparmio SSN (EUR)\\n2. Perdita di investimenti privati\\n3. Rischio delocalizzazione (N. imprese a rischio, per area)\\n4. Perdita di gettito dinamico (IRES, IRAP, contributi)\\n\\nPresenta impatto differenziale per dimensione e macro area. Calcola il saldo netto per la finanza pubblica.',
  'E': 'SCENARIO E - SHOCK ENERGIA\\n\\nShock: +30% costo energia per 2 anni.\\n\\nSimula e quantifica con i dati del dataset:\\n1. Imprese a rischio (N. e % per fascia dimensionale)\\n2. Perdita di output / valore aggiunto (EUR)\\n3. Effetto sui nodi critici della filiera farmaceutica\\n4. Necessità di supporto selettivo (EUR e criteri di targeting)\\n\\nPresenta breakdown Nord/Centro/Sud e per classe di rischio PD.',
  'F': 'SCENARIO F - SHOCK CATENA DI IMPORT\\n\\nShock: Interruzione parziale forniture API (principi attivi) da Cina e India.\\n\\nSimula e quantifica con i dati del dataset:\\n1. Rischio shortage (N. imprese impattate, % produzione a rischio)\\n2. Capacità di sostituzione interna (produttori italiani/UE)\\n3. Tempo di recovery stimato (mesi)\\n4. Necessità di scorte strategiche e incentivi (EUR)\\n\\nPresenta mappa vulnerabilità per macro area e dimensione.'
}};

const DASHBOARDS = {{
  1: 'DASHBOARD 1 - FISCAL ROI\\n\\nGenera una tabella comparativa per TUTTI i 6 scenari (A-F) con le seguenti colonne:\\n- Scenario\\n- Costo statico (EUR)\\n- Costo dinamico netto (EUR)\\n- VA generato (EUR)\\n- Occupazione generata (addetti)\\n- Imposte recuperate (IRES + contributi + IVA)\\n- Tempo di payback (anni)\\n- ROI fiscale (%)\\n\\nUsa i dati del dataset per le stime. Evidenzia lo scenario con miglior ROI e quello con peggior rapporto costo-beneficio.',
  2: 'DASHBOARD 2 - BENEFICIARY DISTRIBUTION\\n\\nPer ciascuno dei 6 scenari (A-F), analizza con i dati del dataset:\\n- Top 10 beneficiari per fatturato\\n- Distribuzione benefici: Micro vs Piccole vs Medie vs Grandi\\n- Distribuzione geografica: Nord vs Centro vs Sud e Isole\\n- Quota risorse su imprese davvero addizionali vs imprese che avrebbero investito comunque (stima deadweight)\\n\\nPresenta in formato tabellare comparativo.',
  3: 'DASHBOARD 3 - STRATEGIC DEPENDENCY\\n\\nAnalizza con i dati del dataset la vulnerabilità della filiera farmaceutica italiana:\\n- Mappa vulnerabilità per macro area e ATECO\\n- Imprese critiche (grandi produttori, N. dipendenti elevato, mono-prodotto)\\n- Input critici (API, eccipienti, packaging)\\n- Rischio shortage per categoria\\n- Concentrazione geografica dei fornitori\\n\\nPresenta in formato tabellare con indicatori di rischio (alto/medio/basso).',
  4: 'DASHBOARD 4 - SSN-INDUSTRY INTERACTION\\n\\nAnalizza con i dati del dataset come una policy sanitaria (es. revisione prontuario, taglio prezzi rimborsabili) impatta:\\n- N. imprese coinvolte per fascia dimensionale\\n- Occupazione a rischio (addetti)\\n- Investimenti persi (EUR)\\n- Disponibilità prodotti a rischio\\n- Gettito fiscale perso\\n\\nPresenta con breakdown per macro area e classe dimensionale.',
  5: 'DASHBOARD 5 - REGIONAL INDUSTRIAL POLICY\\n\\nAnalizza con i dati del dataset per ciascuna macro area (Nord, Centro, Sud e Isole):\\n- Cluster territoriali farmaceutici (regioni chiave, N. imprese)\\n- Produttività media (fatturato/dipendente)\\n- Indicatori innovazione (R&D/fatturato, brevetti proxy)\\n- Moltiplicatore regionale stimato (EUR investito → EUR VA generato)\\n- Opportunità di politica place-based (dove un EUR pubblico genera più valore)\\n\\nPresenta ranking regionale e raccomandazioni di policy territoriale.'
}};

function askScenario(key) {{
  const prompt = SCENARIOS[key];
  if (prompt) {{
    document.getElementById('chatInput').value = prompt;
    sendChat();
  }}
}}

function askDashboard(num) {{
  const prompt = DASHBOARDS[num];
  if (prompt) {{
    document.getElementById('chatInput').value = prompt;
    sendChat();
  }}
}}

function appendMessage(role, text) {{
  const container = document.getElementById('chatMessages');
  // Remove welcome on first message
  const welcome = container.querySelector('.chatbot-welcome');
  if (welcome) welcome.remove();

  const div = document.createElement('div');
  div.className = 'chat-msg chat-msg-' + role;
  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble';
  // Simple markdown: bold, line breaks
  let html = text.replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>')
                  .replace(/\\n/g, '<br>');
  bubble.innerHTML = html;
  div.appendChild(bubble);
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  return div;
}}

function removeLastMessage() {{
  const container = document.getElementById('chatMessages');
  const last = container.lastElementChild;
  if (last) last.remove();
}}

async function sendChat() {{
  const input = document.getElementById('chatInput');
  const msg = input.value.trim();
  if (!msg) return;
  input.value = '';

  appendMessage('user', msg);
  chatHistory.push({{role: 'user', content: msg}});

  const typingDiv = appendMessage('ai', '<span class="chat-typing">Analisi in corso...</span>');

  try {{
    const res = await fetch(CHATBOT_API, {{
      method: 'POST',
      headers: {{'Content-Type': 'application/json'}},
      body: JSON.stringify({{message: msg, history: chatHistory.slice(-10)}})
    }});
    const data = await res.json();
    removeLastMessage();
    if (data.response) {{
      appendMessage('ai', data.response);
      chatHistory.push({{role: 'assistant', content: data.response}});
    }} else {{
      appendMessage('ai', 'Errore nella risposta del server.');
    }}
  }} catch(e) {{
    removeLastMessage();
    appendMessage('ai', 'Errore di connessione al server AI.\\n\\nAssicurati che **chatbot_server.py** sia in esecuzione:\\n`python chatbot_server.py`\\n\\nIl server usa Claude Code CLI (nessuna API key necessaria).');
  }}
}}
</script>
</body>
</html>"""

html_path = os.path.join(OUTPUT_DIR, "report_kpi_farmaceutico.html")
with open(html_path, "w", encoding="utf-8") as f:
    f.write(html_content)
print(f"  Salvato: {html_path}")

# Copia anche nella root del progetto
html_root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "report_kpi_farmaceutico.html")
with open(html_root, "w", encoding="utf-8") as f:
    f.write(html_content)
print(f"  Salvato: {html_root}")


# ── 7. RIEPILOGO CONSOLE ───────────────────────────────────────────────────
print("\n[7/7] Riepilogo KPI principali:")
print("=" * 60)
print(f"  {'Totale aziende:':<40} {n_total:,}")
print(f"  {'Aziende attive:':<40} {n_active:,} ({pct(n_active, n_total)})")
print(f"  {'Rating medio:':<40} {avg_rating_letter} ({avg_rating_num:.1f})")
print(f"  {'Investment Grade (A-H):':<40} {inv_grade:,} ({pct(inv_grade, n_total)})")
print(f"  {'PD media:':<40} {pd_stats['mean']:.2f}%")
print(f"  {'Rischio alto (PD >= 5%):':<40} {high_risk:,} ({pct(high_risk, pd_valid)})")
if not np.isnan(rev_stats['median']):
    print(f"  {'Fatturato mediano:':<40} EUR {rev_stats['median']:,.0f}")
if not np.isnan(emp_stats['median']):
    print(f"  {'Dipendenti mediani:':<40} {emp_stats['median']:,.0f}")
print(f"  {'Aziende in utile:':<40} {in_profit:,} ({pct(in_profit, pnl_valid)})")
print(f"  {'Aziende in perdita:':<40} {in_loss:,} ({pct(in_loss, pnl_valid)})")
print(f"  {'Codici ATECO:':<40} {df_last['ateco_code'].nunique()}")
print(f"  {'Macro-aree:':<40} {df_last['macro_area'].nunique()}")
print("=" * 60)
print(f"\nOutput salvati in: {OUTPUT_DIR}/")
print(f"   - kpi_farmaceutico.xlsx  (Excel con tutti i KPI)")
print(f"   - report_kpi_farmaceutico.html  (Report visuale premium)")
print(f"   - report_kpi_farmaceutico.html  (copia in root)")


# ══════════════════════════════════════════════════════════════════════════════
# ── 8. CHATBOT SERVER INTEGRATO ──────────────────────────────────────────────
# ══════════════════════════════════════════════════════════════════════════════

def run_chatbot_server():
    """Avvia il server Flask per il chatbot AI integrato nella dashboard."""
    try:
        from flask import Flask, request, jsonify
        from flask_cors import CORS
    except ImportError:
        print("\n  ATTENZIONE: flask/flask-cors non installati. Chatbot non disponibile.")
        print("  Installa con: pip install flask flask-cors")
        return

    CLAUDE_CLI = shutil.which("claude") or "claude"
    MODEL = "sonnet"
    cli_available = shutil.which("claude") is not None

    # Riusa i dati già calcolati per il system prompt
    _macro_counts = df_last["macro_area"].value_counts().to_dict()
    _rating_counts = df_last["implied_rating"].value_counts().head(10).to_dict()
    _rev = df_last["operating_revenue_turnover"]
    _emp = df_last["number_of_employees"]
    _pd_col = df_last["probability_of_default_x100"]

    _summary = f"""DATASET: Settore Farmaceutico Italiano
- Aziende totali: {n_total:,}
- Aziende attive: {n_active:,} ({n_active/n_total*100:.1f}%)
- Distribuzione geografica: {json.dumps(_macro_counts, ensure_ascii=False)}
- Distribuzione rating (top 10): {json.dumps(_rating_counts, ensure_ascii=False)}
- Fatturato: mediano EUR {_rev.median():,.0f}, medio EUR {_rev.mean():,.0f}, max EUR {_rev.max():,.0f}
- Dipendenti: mediani {_emp.median():.0f}, medi {_emp.mean():.1f}
- PD media: {_pd_col.mean():.2f}%, mediana: {_pd_col.median():.2f}%
- Rischio alto (PD>=5%): {int((_pd_col >= 5).sum()):,} aziende ({(_pd_col >= 5).mean()*100:.1f}%)
- Aziende in utile: {in_profit:,} su {pnl_valid:,} con dato
- ATECO (primi 10): {json.dumps(df_last['ateco_code'].value_counts().head(10).to_dict(), ensure_ascii=False)}
"""

    SYSTEM_PROMPT = f"""Sei un analista senior del Ministero dell'Economia e delle Finanze (MEF), Dipartimento del Tesoro, esperto di analisi del settore farmaceutico italiano.

Hai accesso ai seguenti dati aggregati del dataset:

{_summary}

SCENARI PRESETTATI MEF (usa questi dati per simulazioni dettagliate):

**Scenario A - Incentivo R&D**: Aumento credito d'imposta R&D da livello base a rafforzato per pharma/biotech.
**Scenario B - Reshoring API**: Incentivo CAPEX + energia + logistica per riportare produzione API in Italia.
**Scenario C - Taglio IRES mirato**: Riduzione IRES condizionata a reinvestimento o occupazione STEM.
**Scenario D - Stretta regolatoria/prezzi**: Maggiore compressione margini sui farmaci rimborsabili SSN.
**Scenario E - Shock energia**: +30% costo energia per 2 anni.
**Scenario F - Shock catena import**: Interruzione parziale forniture API da paesi critici (Cina/India).

DASHBOARD: 1.Fiscal ROI 2.Beneficiary distribution 3.Strategic dependency 4.SSN-industry interaction 5.Regional industrial policy

ISTRUZIONI:
- Rispondi SEMPRE in italiano
- Usa numeri precisi dai dati quando possibile
- Per analisi what-if: spiega le assunzioni, calcola gli impatti stimati, quantifica effetti su occupazione, VA, gettito
- Usa elasticita' dalla letteratura economica farmaceutica
- Struttura: **Policy**, **Assunzioni**, **Impatti quantificati** (tabella), **Rischi**, **Raccomandazioni**
- Sii conciso ma rigoroso. Usa formattazione markdown con tabelle.
"""

    def call_claude_cli(user_msg, history=None):
        full_prompt = ""
        if history:
            for h in history[-6:]:
                role = h.get("role", "")
                content = h.get("content", "")
                if role == "user":
                    full_prompt += f"[Domanda precedente]: {content}\n"
                elif role == "assistant":
                    full_prompt += f"[Risposta precedente]: {content}\n"
            full_prompt += "\n"
        full_prompt += user_msg

        cmd = [CLAUDE_CLI, "--print", "--model", MODEL,
               "--system-prompt", SYSTEM_PROMPT, "--no-session-persistence"]
        try:
            result = subprocess.run(cmd, input=full_prompt, capture_output=True,
                                    text=True, timeout=120,
                                    cwd=os.path.dirname(os.path.abspath(__file__)))
            if result.returncode == 0 and result.stdout.strip():
                return result.stdout.strip()
            err = result.stderr.strip() if result.stderr else "Nessun output"
            return f"Errore Claude CLI (exit {result.returncode}): {err}"
        except subprocess.TimeoutExpired:
            return "Timeout: la risposta ha impiegato troppo tempo. Riprova con una domanda piu' breve."
        except FileNotFoundError:
            return "Errore: comando 'claude' non trovato. Assicurati che Claude Code CLI sia installato."
        except Exception as e:
            return f"Errore: {str(e)}"

    app = Flask(__name__)
    CORS(app)

    @app.route("/api/chat", methods=["POST"])
    def chat():
        if not cli_available:
            return jsonify({"response": "Errore: Claude Code CLI non trovato."}), 500
        data = request.json or {}
        user_msg = data.get("message", "").strip()
        history = data.get("history", [])
        if not user_msg:
            return jsonify({"response": "Messaggio vuoto."}), 400
        reply = call_claude_cli(user_msg, history)
        return jsonify({"response": reply})

    @app.route("/api/health", methods=["GET"])
    def health():
        return jsonify({"status": "ok", "cli_available": cli_available, "model": MODEL})

    print(f"\n{'='*60}")
    print(f"  CHATBOT SERVER avviato su http://localhost:5050")
    print(f"  Claude CLI: {'disponibile' if cli_available else 'NON trovato'}")
    print(f"  Modello: {MODEL}")
    print(f"{'='*60}\n")
    app.run(host="127.0.0.1", port=5050, debug=False, use_reloader=False)


# ── MAIN ──
if "--no-server" in sys.argv:
    print("\nDone! (server chatbot non avviato, usa --no-server per solo report)")
else:
    print("\n[8/8] Avvio chatbot server + apertura report...")

    # Apri il report nel browser
    import webbrowser
    webbrowser.open(f"file://{html_root}")

    # Avvia il server (blocca il processo)
    run_chatbot_server()
