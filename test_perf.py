import requests
import pandas as pd
import numpy as np
import time
import json

# 1. Generate Dummy Data (20k rows)
print("Generating 20k rows of dummy data...")
dates = pd.date_range('2024-01-01', periods=365)
depts = [f'Reparto_{i}' for i in range(55)] # ~55 departments to get ~20k rows
data = []
for d in depts:
    for dt in dates:
        data.append({
            'REPARTO': d,
            'DATA': dt.strftime('%d-%m-%Y'),
            'CAPACITA': np.random.randint(100, 200),
            'ORE_LAVORATE': np.random.randint(80, 180),
            'CAPACITA_NETTA': np.random.randint(90, 190),
            'ORE_STRAORD': np.random.randint(0, 20),
            'ORE_LAVORATE_NET': np.random.randint(70, 170),
            'CAPACITA_NETTA_NET': np.random.randint(80, 180)
        })

df = pd.DataFrame(data)
print(f"Data shape: {df.shape}")

# 2. Define the WebGL script
code = """
import plotly.graph_objects as go
from plotly.subplots import make_subplots
import pandas as pd

df['DATA'] = pd.to_datetime(df['DATA'], format='%d-%m-%Y', errors='coerce')
col_straord = 'ORE_STRAORD'
cols = ['CAPACITA', 'ORE_LAVORATE', 'CAPACITA_NETTA', col_straord, 'ORE_LAVORATE_NET', 'CAPACITA_NETTA_NET']
for c in cols: df[c] = pd.to_numeric(df[c], errors='coerce')

df_clean = df.dropna(subset=['REPARTO', 'DATA']).copy()
df_clean['GIORNO'] = df_clean['DATA'].dt.normalize()
agg = df_clean.groupby(['REPARTO', 'GIORNO'], as_index=False)[cols].sum()
agg = agg.rename(columns={col_straord: 'ORE_STRAORD'}).sort_values(['REPARTO', 'GIORNO'])

reparti = agg['REPARTO'].dropna().unique()
num_reparti = len(reparti)

fig = make_subplots(rows=num_reparti + 1, cols=1, vertical_spacing=0.01)

# Simpler loop for benchmark
for idx, r in enumerate(reparti):
    d = agg[agg['REPARTO'] == r]
    fig.add_trace(go.Scattergl(x=d['GIORNO'], y=d['ORE_LAVORATE']), row=idx+2, col=1)

fig.update_layout(height=300*num_reparti, template='emerald')
"""

# 3. Send Request
payload = {
    "code": code,
    "outputType": "chart",
    "inputData": {"HR1": df.to_dict(orient='records')}
}

print("Sending request to localhost:5005...")
start = time.time()
try:
    res = requests.post("http://localhost:5005/execute", json=payload, headers={'Content-Type': 'application/json'}, timeout=300)
    end = time.time()
    print(f"Status: {res.status_code}")
    print(f"Time: {end - start:.2f} seconds")
    if res.status_code == 200:
        rj = res.json()
        print(f"Success. Chart HTML len: {len(rj.get('chartHtml', ''))}")
    else:
        print("Error:", res.text)
except Exception as e:
    print("Exception:", e)
