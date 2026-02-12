import time
import pandas as pd
import numpy as np
import requests
import plotly.graph_objects as go
import datetime

# =========================================================
# CONFIG
# =========================================================
HUBSPOT_TOKEN = "pat-eu1-4504b5ac-6d16-4638-86a8-679713fea314"
HEADERS = {"Authorization": f"Bearer {HUBSPOT_TOKEN}"}
TARGET_PIPELINE_ID = "1811568848"  # Ufficio Prodotto

DEALSTAGE_MAPPING = {
    "2464693444": "1- BRIEF E PROPOSTA",
    "4570389704": "Sblocco Sviluppo",
    "4611711172": "RICERCA e PROPOSTA",
    "2484351181": "ORDINE CAMPIONATURE",
    "2484351183": "INS.MODELLO",
    "2484351184": "KIT CAMPIONARIO",
    "2484351182": "STAMPA/RICAMO",
    "2490043623": "SVILUPPO CAMPIONE",
    "2484351185": "CAMPIONE PRONTO",
    "2484351186": "SCHEDA COSTI",
    "2484351187": "CARTELLA TESSUTI",
    "2484351188": "FOTO CAMPIONE",
    "2484351189": "SPEDIZIONE CAMPIONE"
}

DEAL_PROPERTIES = [
    "amount","data_consegna","deadline_progetto","dealname","dealstage","dealtype","description",
    "hs_priority","hs_forecast_probability","art14_trat","campione","hs_deal_stage_probability",
    "pipeline","hubspot_owner_id","product_manager","budget_cliente","budget_diba","createdate",
    "referente_commerciale_up"
]

SLEEP_SMALL = 0.03

def safe_get(url, params=None, timeout=30, max_retry=4):
    for attempt in range(max_retry):
        try:
            r = requests.get(url, headers=HEADERS, params=params, timeout=timeout)
            if r.status_code == 200:
                return r
            if r.status_code in (429, 500, 502, 503, 504):
                time.sleep(0.4 * (attempt + 1))
                continue
            print(f"⚠️ Errore GET {url}: {r.status_code} - {r.text}")
            return r
        except Exception as e:
            print(f"⚠️ Eccezione GET {url}: {e}")
            time.sleep(0.4 * (attempt + 1))
    print(f"❌ Fallito GET {url} dopo {max_retry} tentativi.")
    return None

def safe_post(url, data, timeout=30, max_retry=4):
    for attempt in range(max_retry):
        try:
            r = requests.post(url, headers=HEADERS, json=data, timeout=timeout)
            if r.status_code == 200:
                return r
            if r.status_code in (429, 500, 502, 503, 504):
                time.sleep(0.4 * (attempt + 1))
                continue
            print(f"⚠️ Errore POST {url}: {r.status_code} - {r.text}")
            return r
        except Exception as e:
            print(f"⚠️ Eccezione POST {url}: {e}")
            time.sleep(0.4 * (attempt + 1))
    print(f"❌ Fallito POST {url} dopo {max_retry} tentativi.")
    return None

def get_owners_map():
    owners_map = {}
    url = "https://api.hubapi.com/crm/v3/owners"
    while url:
        r = safe_get(url)
        if r is None or r.status_code != 200:
            break
        data = r.json() or {}
        for o in data.get("results", []) or []:
            oid = str(o.get("id") or "").strip()
            first = (o.get("firstName") or "").strip()
            last  = (o.get("lastName") or "").strip()
            email = (o.get("email") or "").strip()
            full = (first + " " + last).strip() or email
            if oid:
                owners_map[oid] = full
        url = (data.get("paging") or {}).get("next", {}).get("link")
    return owners_map

def fetch_deals():
    out = []
    url = "https://api.hubapi.com/crm/v3/objects/deals"
    params = {
        "limit": 100,
        "archived": "false",
        "properties": ",".join(DEAL_PROPERTIES),
        "associations": "companies,line_items"
    }
    while url:
        r = safe_get(url, params=params)
        if r is None or r.status_code != 200:
            break
        data = r.json() or {}
        for deal in data.get("results", []) or []:
            props = (deal.get("properties") or {}).copy()
            if (props.get("pipeline") or "").strip() != TARGET_PIPELINE_ID:
                continue
            props["id"] = str(deal.get("id") or "")
            props["associations"] = deal.get("associations") or {}
            out.append(props)
        url = (data.get("paging") or {}).get("next", {}).get("link")
        params = {} # params already included in next link if present
    return out

def first_company_id(deal):
    assoc = (deal.get("associations") or {}).get("companies", {})
    res = assoc.get("results", []) if isinstance(assoc, dict) else []
    return str(res[0].get("id")) if res and res[0].get("id") else ""

def get_company_names_batch(company_ids):
    if not company_ids:
        return {}
    ids = list(company_ids)
    out = {}
    batch_size = 100
    for i in range(0, len(ids), batch_size):
        batch = ids[i:i + batch_size]
        payload = {"properties": ["name"], "inputs": [{"id": str(x)} for x in batch]}
        r = safe_post("https://api.hubapi.com/crm/v3/objects/companies/batch/read", payload)
        if r is None or r.status_code != 200:
            continue
        for c in r.json().get("results", []):
            cid = str(c.get("id") or "")
            name = ((c.get("properties") or {}).get("name") or "").strip()
            if cid:
                out[cid] = name
        time.sleep(SLEEP_SMALL)
    return out

def get_line_item_ids_for_deals(deal_ids):
    deal_to_item_ids = {str(did): [] for did in deal_ids}
    all_item_ids = []

    for did in deal_ids:
        url = f"https://api.hubapi.com/crm/v4/objects/deals/{did}/associations/line_items"
        r = safe_get(url)
        if r is None or r.status_code != 200:
            continue
        results = r.json().get("results", []) or []
        ids = []
        for res in results:
            item_id = res.get("toObjectId")
            if item_id is not None:
                ids.append(str(item_id))
        deal_to_item_ids[str(did)] = ids
        all_item_ids.extend(ids)
        time.sleep(SLEEP_SMALL) # Small breath to respect rate limits

    # unique
    all_item_ids = list(dict.fromkeys(all_item_ids))
    return deal_to_item_ids, all_item_ids

def batch_read_line_items(line_item_ids):
    if not line_item_ids:
        return {}

    out = {}
    batch_size = 100
    for i in range(0, len(line_item_ids), batch_size):
        batch = line_item_ids[i:i + batch_size]
        payload = {"properties": ["name", "quantity"], "inputs": [{"id": str(x)} for x in batch]}
        r = safe_post("https://api.hubapi.com/crm/v3/objects/line_items/batch/read", payload)
        if r is None or r.status_code != 200:
            continue
        for it in r.json().get("results", []):
            iid = str(it.get("id") or "")
            out[iid] = it.get("properties", {}) or {}
        time.sleep(SLEEP_SMALL)
    return out

def get_deal_products_quantities(deals):
    deal_ids = [d.get("id") for d in deals if d.get("id")]
    deal_to_items, all_item_ids = get_line_item_ids_for_deals(deal_ids)
    item_props = batch_read_line_items(all_item_ids)

    deal_products = {}
    deal_quantities = {}

    for did, item_ids in deal_to_items.items():
        prods = []
        qtys = []
        for iid in item_ids:
            p = item_props.get(str(iid), {})
            name = (p.get("name") or "").strip()
            qty = (p.get("quantity") or "").strip()
            if name:
                prods.append(name)
                if qty:
                    qtys.append(str(qty))
        deal_products[did] = "; ".join(prods) if prods else ""
        deal_quantities[did] = "; ".join(qtys) if qtys else ""

    return deal_products, deal_quantities

def to_dt(series):
    s = pd.to_datetime(series, errors="coerce")
    try:
        if getattr(s.dt, "tz", None) is not None:
            s = s.dt.tz_localize(None)
    except Exception:
        pass
    return s

def lead_time_busdays(a, b):
    if pd.isna(a) or pd.isna(b):
        return ""
    try:
        return int(np.busday_count(a.date(), b.date()))
    except Exception:
        return ""

def build_df():
    deals = fetch_deals()
    if not deals:
        print("❗ Nessuna trattativa trovata nella pipeline Ufficio Prodotto.")
        return pd.DataFrame()

    company_ids = set()
    for d in deals:
        cid = first_company_id(d)
        if cid:
            company_ids.add(cid)

    company_map = get_company_names_batch(company_ids)
    prod_map, qty_map = get_deal_products_quantities(deals)
    owners_map = get_owners_map()

    for d in deals:
        deal_id = str(d.get("id") or "")

        cid = first_company_id(d)
        d["company_name"] = company_map.get(cid, "") if cid else ""

        d["prodotti"] = (prod_map.get(deal_id, "") or d.get("campione", "") or "")
        d["quantita"] = (qty_map.get(deal_id, "") or "")

        # Apply dealstage mapping here for filtering
        stage_code = (d.get("dealstage") or "").strip()
        d["dealstage_mapped"] = DEALSTAGE_MAPPING.get(stage_code, stage_code)

        owner_id = str(d.get("hubspot_owner_id") or "").strip()
        pm_val    = str(d.get("product_manager") or "").strip()
        ref_id   = str(d.get("referente_commerciale_up") or "").strip()

        d["owner_name"] = owners_map.get(owner_id, owner_id) if owner_id else ""
        d["product_manager_name"] = owners_map.get(pm_val, pm_val) if pm_val else ""
        d["referente_commerciale_name"] = owners_map.get(ref_id, ref_id) if ref_id else ""

    df0 = pd.DataFrame(deals)

    df0["createdate_dt"] = to_dt(df0.get("createdate"))
    df0["Data Creazione"] = df0["createdate_dt"].dt.strftime("%d/%m/%Y").fillna("")

    df0["deadline_dt"] = to_dt(df0.get("deadline_progetto"))
    df0["Lead Time (gg)"] = df0.apply(lambda r: lead_time_busdays(r["createdate_dt"], r["deadline_dt"]), axis=1)

    for c in ["dealname","company_name","referente_commerciale_name","owner_name","product_manager_name","prodotti"]:
        if c in df0.columns:
            df0[c] = df0[c].fillna("").astype(str).str.upper()

    # --- Apply filtering based on user request ---
    # Filter for 'SPEDIZIONE CAMPIONE' stage using the mapped stage
    df_filtered_stage_and_week = df0[df0['dealstage_mapped'] == 'SPEDIZIONE CAMPIONE'].copy()

    # Filter for the current week (Monday 10 Feb 2026 - Sunday 16 Feb 2026)
    start_of_week = datetime.datetime(2026, 2, 10).date()
    end_of_week = datetime.datetime(2026, 2, 16).date() 

    df_filtered_stage_and_week = df_filtered_stage_and_week[
        (df_filtered_stage_and_week['createdate_dt'].dt.date >= start_of_week) &
        (df_filtered_stage_and_week['createdate_dt'].dt.date <= end_of_week)
    ].copy()

    # Now, apply renaming and select wanted columns on the already filtered DataFrame
    df_export = df_filtered_stage_and_week.rename(columns={
        "dealname": "Deal Name",
        "deadline_progetto": "Deadline",
        "dealstage_mapped": "Stage", # Use the mapped stage for the final column name
        "company_name": "Nome Cliente",
        "referente_commerciale_name": "Commerciale di riferimento",
        "owner_name": "PROPRIETARIO TRATTATIVA",
        "product_manager_name": "PROCESS MANAGER",
        "prodotti": "Prodotti",
        "quantita": "Q.tà",
        "budget_cliente": "BDG Cliente",
        "budget_diba": "BDG DiBa",
        "hs_priority": "Priorità"
    })

    wanted = [
        "Deal Name","Data Creazione","Deadline","Lead Time (gg)","Stage",
        "Nome Cliente","Commerciale di riferimento","PROPRIETARIO TRATTATIVA","PROCESS MANAGER",
        "Prodotti","Q.tà","BDG Cliente","BDG DiBa","Priorità"
    ]
    for c in wanted:
        if c not in df_export.columns:
            df_export[c] = ""

    return df_export[wanted]

# ===== OUTPUT PER IL NODO PYTHON (TABLE) =====
df_result = build_df()

if not df_result.empty:
    # Mostra solo le prime 20 righe per l\'anteprima
    df_preview = df_result.head(20)

    # Crea una tabella Plotly
    fig = go.Figure(data=[go.Table(
        header=dict(values=list(df_preview.columns),
                    fill_color='paleturquoise',
                    align='left'),
        cells=dict(values=[df_preview[col] for col in df_preview.columns],
                   fill_color='lavender',
                   align='left'))
    ])

    fig.show()
else:
    print("Nessun dato da visualizzare o nessun progetto trovato per i criteri specificati.")
