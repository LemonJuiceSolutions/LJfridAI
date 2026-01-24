
import pandas as pd
import requests
import io
import os
import numpy as np

# Set options for better debugging in logs
pd.set_option('display.max_columns', None)

# 1. Retrieve Environment Variables (Injected by executePythonPreviewAction)
token = os.environ.get('SHAREPOINT_TOKEN')
site_id = os.environ.get('SHAREPOINT_SITE_ID')
drive_id = os.environ.get('SHAREPOINT_DRIVE_ID')
file_id = os.environ.get('SHAREPOINT_FILE_ID')
sheet_name = os.environ.get('SHAREPOINT_SHEET_NAME')

# Debug logs
print(f"DEBUG: Token present: {'Yes' if token else 'No'}")
print(f"DEBUG: Site ID: {site_id}")
print(f"DEBUG: Drive ID: {drive_id}")
print(f"DEBUG: File ID: {file_id}")
print(f"DEBUG: Sheet Name: {sheet_name}")

if not token: 
    raise Exception("Token SharePoint mancante! Assicurati di aver fatto il login o che il token sia valido.")

if not (site_id and drive_id and file_id):
    raise Exception("ID SharePoint mancanti (Site, Drive o File). Verifica la configurazione del nodo.")

# 2. Download File Content
url = f"https://graph.microsoft.com/v1.0/sites/{site_id}/drives/{drive_id}/items/{file_id}/content"
headers = {'Authorization': f'Bearer {token}'}

print(f"Scaricamento file da: {url}")
response = requests.get(url, headers=headers)

if response.status_code != 200:
    raise Exception(f"Errore download file SharePoint: {response.status_code} - {response.text}")

print(f"File scaricato. Dimensione: {len(response.content)} bytes")

# 3. Load into Pandas
try:
    # header=3 means row index 3 (4th row) is header. Verify if this is static for the user.
    # We stick to user's snippet logic: header=3
    header_row = 3
    
    if sheet_name:
        print(f"Caricamento foglio '{sheet_name}'...")
        df = pd.read_excel(io.BytesIO(response.content), sheet_name=sheet_name, header=header_row)
    else:
        print("Caricamento primo foglio disponibile...")
        df = pd.read_excel(io.BytesIO(response.content), header=header_row)

    print(f"Dati caricati. Righe: {len(df)}, Colonne: {len(df.columns)}")
    
except Exception as e:
    raise Exception(f"Errore durante la lettura dell'Excel con Pandas: {str(e)}")

# 4. ROBUSTNESS FIX: Force all data to Strings to prevent SQL Type Inference Errors
# The issue is "Arithmetic overflow error converting nvarchar to data type numeric".
# This happens when SQL infers a column as Numeric (from first row) but later encounters text or huge numbers.
# By forcing everything to String (Object), the node backend will create an NVARCHAR/TEXT table.

print("Applicazione conversione forzata a stringhe per compatibilità SQL...")

# Convert all columns to string, handling NaNs
# 'astype(str)' converts NaN to 'nan' string, which is ugly. We want None/Null.
# Step A: Convert to object first to allow mixed types
df = df.astype(object)

# Step B: Replace Pandas/Numpy NaNs with None (which becomes NULL in SQL)
df = df.where(pd.notnull(df), None)

# Step C: Iterate and convert actual values to string, preserving None
# This ensures 123 becomes "123", but None stays None
for col in df.columns:
    # Convert column to string, but keep None as None
    # We use a lambda: if x is None, return None, else str(x)
    df[col] = df[col].apply(lambda x: str(x) if x is not None else None)
    
    # Optional: Clean "nan" strings if they slipped through
    df[col] = df[col].replace('nan', None)

print("Conversione completata.")

# 5. Clean Column Names for SQL
# We force columns to string but we DO NOT strip whitespace anymore,
# because strictly matching downstream queries might fail if they expect " Col1 ".
df.columns = df.columns.astype(str)

print(f"Colonne finali: {list(df.columns)}")
print(df.head())

# 6. Set Output
# The node backend looks for 'result' or 'df' or 'data'.
result = df
