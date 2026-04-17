import pandas as pd
import numpy as np

# Mock implementation of the user's script logic to test column renaming

def main():
    # Mock data structure matching what HubSpot API would return (simplified)
    deals = [
        {
            "id": "123",
            "dealname": "Test Deal 1",
            "createdate": "2023-01-01T00:00:00Z",
            "deadline_progetto": "2023-02-01T00:00:00Z",
            "dealstage": "2464693444", # Mapped to "1- BRIEF E PROPOSTA"
            "hubspot_owner_id": "owner1",
            "product_manager": "pm1",
            "referente_commerciale_up": "ref1",
            "campione": "Product A",
            "amount": "1000",
            "hs_priority": "High",
            "associations": {"companies": {"results": [{"id": "comp1"}]}}
        }
    ]

    # Mock mappings
    DEALSTAGE_MAPPING = {
        "2464693444": "1- BRIEF E PROPOSTA"
    }
    
    company_map = {"comp1": "Test Company"}
    prod_map = {"123": "Product A"}
    qty_map = {"123": "10"}
    owners_map = {
        "owner1": "Owner Name Test",
        "pm1": "PM Name Test",
        "ref1": "Ref Name Test"
    }

    # Replicating the user's script logic exactly
    for d in deals:
        deal_id = str(d.get("id") or "")

        cid = "comp1" # Simplified lookup
        d["company_name"] = company_map.get(cid, "") if cid else ""

        d["prodotti"] = (prod_map.get(deal_id, "") or d.get("campione", "") or "")
        d["quantita"] = (qty_map.get(deal_id, "") or "")

        stage_code = (d.get("dealstage") or "").strip()
        d["dealstage"] = DEALSTAGE_MAPPING.get(stage_code, stage_code)

        owner_id = str(d.get("hubspot_owner_id") or "").strip()
        pm_val    = str(d.get("product_manager") or "").strip()
        ref_id   = str(d.get("referente_commerciale_up") or "").strip()

        d["owner_name"] = owners_map.get(owner_id, owner_id) if owner_id else ""
        d["product_manager_name"] = owners_map.get(pm_val, pm_val) if pm_val else ""
        d["referente_commerciale_name"] = owners_map.get(ref_id, ref_id) if ref_id else ""

    df0 = pd.DataFrame(deals)

    # Simplified lead time calc for mock
    df0["createdate_dt"] = pd.to_datetime(df0.get("createdate"))
    df0["Data Creazione"] = df0["createdate_dt"].dt.strftime("%d/%m/%Y").fillna("")
    df0["deadline_dt"] = pd.to_datetime(df0.get("deadline_progetto"))
    df0["Lead Time (gg)"] = 20 # Mock value

    for c in ["dealname","company_name","referente_commerciale_name","owner_name","product_manager_name","prodotti"]:
        if c in df0.columns:
            df0[c] = df0[c].fillna("").astype(str).str.upper()

    # THE CRITICAL RENAME STEP
    df_export = df0.rename(columns={
        "dealname": "Deal Name",
        "deadline_progetto": "Deadline",
        "dealstage": "Stage",
        "company_name": "Nome Cliente",
        "referente_commerciale_name": "Commerciale di riferimento",
        "owner_name": "PROPRIETARIO TRATTATIVA",
        "product_manager_name": "PROCESS MANAGER",
        "prodotti": "Prodotti",
        "quantita": "Q.tà",
        "budget_cliente": "BDG Cliente",
        "budget_diba": "BDG DiBa",
        "hs_priority": "Priorità",
    })

    wanted = [
        "Deal Name","Data Creazione","Deadline","Lead Time (gg)","Stage",
        "Nome Cliente","Commerciale di riferimento","PROPRIETARIO TRATTATIVA","PROCESS MANAGER",
        "Prodotti","Q.tà","BDG Cliente","BDG DiBa","Priorità"
    ]
    
    # Fill missing columns
    for c in wanted:
        if c not in df_export.columns:
            df_export[c] = ""

    final_df = df_export[wanted]
    print("Columns in final output:")
    print(final_df.columns.tolist())
    
    # Check if implicit 'Owner' column exists (it shouldn't)
    if 'Owner' in final_df.columns:
        print("ERROR: 'Owner' column persisted!")
    else:
        print("SUCCESS: 'Owner' column correctly renamed/removed.")

    # Check if 'PROPRIETARIO TRATTATIVA' exists
    if 'PROPRIETARIO TRATTATIVA' in final_df.columns:
         print("SUCCESS: 'PROPRIETARIO TRATTATIVA' column exists.")
    else:
         print("ERROR: 'PROPRIETARIO TRATTATIVA' column MISSING!")

if __name__ == "__main__":
    main()
