from flask import Flask, request, jsonify
from flask_cors import CORS
import pandas as pd
import numpy as np
import matplotlib
matplotlib.use('Agg')  # Non-interactive backend for server
import matplotlib.pyplot as plt
import plotly.express as px
import plotly.graph_objects as go
import io
import base64
import sys
import traceback
from contextlib import redirect_stdout, redirect_stderr

app = Flask(__name__)
CORS(app)  # Allow cross-origin requests from Next.js

VERSION = "1.0.4"

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'version': VERSION})

@app.route('/execute', methods=['POST'])
def execute_python():
    # ... (skipping docstring)
    try:
        data = request.get_json()
        code = data.get('code', '')
        output_type = data.get('outputType', 'table')
        input_data = data.get('inputData', {})
        
        if not code:
            return jsonify({'success': False, 'error': 'No code provided'}), 400
        
        # Prepare execution namespace
        ns = {
            'pd': pd,
            'np': np,
            'plt': plt,
            'px': px,
            'go': go,
            '__builtins__': __builtins__,
            'df': pd.DataFrame(),
            'result': None,
            'data': None,
            'output': None,
            'fig': None
        }

        # Inject input data
        print(f"🐍 [v{VERSION}] Received {len(input_data)} tables.")
        for i, (table_name, table_data) in enumerate(input_data.items()):
            if isinstance(table_data, list):
                df_table = pd.DataFrame(table_data)
                ns[table_name] = df_table
                cols = df_table.columns.tolist()
                print(f"   - Table '{table_name}': {len(df_table)} rows, Columns: {cols}")
                
                if i == 0 or table_name == 'df':
                    ns['df'] = df_table
                    print(f"   - 'df' mapped to '{table_name}'")

        print(f"🐍 [v{VERSION}] Executing script...")
        
        raw_stdout = io.StringIO()
        raw_stderr = io.StringIO()
        safe_code = code.replace('plt.show()', '# plt.show() removed')

        try:
            with redirect_stdout(raw_stdout), redirect_stderr(raw_stderr):
                exec(safe_code, ns, ns) # Use ns for both globals and locals
        except Exception as e:
            error_details = traceback.format_exc()
            error_msg = str(e)
            
            # Make common errors more readable
            if isinstance(e, KeyError):
                error_msg = f"KeyError: La colonna {error_msg} non è presente nei dati. Controlla i nomi delle colonne nel terminale."
            elif isinstance(e, NameError):
                error_msg = f"NameError: {error_msg}. Hai definito tutte le variabili necessarie?"
            
            print(f"❌ [EXECUTE] Script error: {error_msg}")
            return jsonify({
                'success': False,
                'error': error_msg,
                'traceback': error_details,
                'stdout': raw_stdout.getvalue(),
                'stderr': raw_stderr.getvalue()
            }), 200

        stdout_val = raw_stdout.getvalue()
        stderr_val = raw_stderr.getvalue()
        
        # Discovery: try to find the best result in the namespace
        res_val = None
        
        # Priority 1: Common result names
        search_order = ['result', 'output', 'data', 'fig', 'df']
        for key in search_order:
            if key in ns and ns[key] is not None:
                # If we injected an empty 'df' and it's still empty, skip it unless no inputs were provided
                if key == 'df' and isinstance(ns[key], pd.DataFrame) and ns[key].empty and len(input_data) == 0:
                    continue
                res_val = ns[key]
                print(f"✅ [EXECUTE] Found result in variable: '{key}'")
                break
        
        # Priority 2: Last line expression (heuristic)
        # In current implementation, if no P1 found, we just use None
        
        # If result is Plotly/Matplotlib and we want a table or variable, we might need adjustment
        # but usually user picks the right outputType.
        
        # Process result based on requested output type
        if output_type == 'table':
            if isinstance(res_val, pd.DataFrame):
                # Convert DataFrame to list of dicts
                return jsonify({
                    'success': True,
                    'data': res_val.to_dict(orient='records'),
                    'rowCount': len(res_val),
                    'stdout': stdout_val
                })
            else:
                return jsonify({
                    'success': False,
                    'error': f'Expected DataFrame result for output type "table", but got {type(res_val).__name__}',
                    'stdout': stdout_val
                })
        
        elif output_type == 'variable':
            if isinstance(res_val, dict):
                return jsonify({
                    'success': True,
                    'variables': res_val,
                    'stdout': stdout_val
                })
            else:
                # Fallback: if it's not a dict, try to wrap it if it's a simple type
                return jsonify({
                    'success': True,
                    'variables': {'result': res_val},
                    'stdout': stdout_val
                })
        
        elif output_type == 'chart':
            # Matplotlib Figure
            if isinstance(res_val, plt.Figure):
                buf = io.BytesIO()
                res_val.savefig(buf, format='png', dpi=150, bbox_inches='tight')
                buf.seek(0)
                img_base64 = base64.b64encode(buf.read()).decode('utf-8')
                plt.close(res_val)  # Clean up
                
                return jsonify({
                    'success': True,
                    'chartBase64': img_base64,
                    'stdout': stdout_val
                })
            
            # Plotly Figure
            elif hasattr(res_val, 'to_image'):
                img_bytes = res_val.to_image(format="png")
                img_base64 = base64.b64encode(img_bytes).decode('utf-8')
                return jsonify({
                    'success': True,
                    'chartBase64': img_base64,
                    'stdout': stdout_val
                })
            
            else:
                # Try to get the current figure as fallback
                try:
                    curr_fig = plt.gcf()
                    if curr_fig and len(curr_fig.get_axes()) > 0:
                        buf = io.BytesIO()
                        curr_fig.savefig(buf, format='png', dpi=150, bbox_inches='tight')
                        buf.seek(0)
                        img_base64 = base64.b64encode(buf.read()).decode('utf-8')
                        plt.close(curr_fig)
                        return jsonify({
                            'success': True,
                            'chartBase64': img_base64,
                            'stdout': stdout_val
                        })
                except:
                    pass
                    
                return jsonify({
                    'success': False,
                    'error': f'Result is not a valid chart object (Matplotlib Fig or Plotly), got {type(res_val).__name__}',
                    'stdout': stdout_val
                })
        
        else:
            return jsonify({
                'success': False,
                'error': f'Unknown output type: {output_type}'
            })
    
    except Exception as e:
        error_trace = traceback.format_exc()
        return jsonify({
            'success': False,
            'error': str(e),
            'traceback': error_trace
        }), 500


if __name__ == '__main__':
    print("🐍 Starting Python Execution Backend on port 5005...")
    app.run(host='0.0.0.0', port=5005, debug=True)
