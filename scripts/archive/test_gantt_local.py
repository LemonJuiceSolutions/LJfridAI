
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
import os

# 1. SETUP MOCK ENVIRONMENT
print("--- STARTING LOCAL TEST ---")
try:
    # Load the user's preview data
    file_path = '/Users/manuelezanoni/Desktop/VisualStudio/LikeAiSaid/preview_data-2.xlsx'
    print(f"Loading mock data from: {file_path}")
    
    # Needs openpyxl
    SharePointSQL = pd.read_excel(file_path)
    print(f"Loaded DataFrame: {SharePointSQL.shape}")
    print("Columns:", SharePointSQL.columns.tolist())
    
    # Inject into globals so the script can find it
    globals()['SharePointSQL'] = SharePointSQL
    
except Exception as e:
    print(f"FATAL: Could not load mock data: {e}")
    exit(1)

# 2. RUN THE GANTT SCRIPT LOGIC
# We will read the script content and exec it
script_path = '/Users/manuelezanoni/Desktop/VisualStudio/LikeAiSaid/scripts/generate_gantt.py'
print(f"Executing script: {script_path}")

try:
    with open(script_path, 'r') as f:
        script_code = f.read()
    
    # Execute in current global scope
    exec(script_code)
    
except Exception as e:
    print(f"CRASH during script execution: {e}")
    import traceback
    traceback.print_exc()

print("--- END LOCAL TEST ---")
