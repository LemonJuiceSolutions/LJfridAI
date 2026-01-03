from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import pandas as pd
import numpy as np
import matplotlib
matplotlib.use('Agg')  # Non-interactive backend for server
import matplotlib.pyplot as plt
import plotly.express as px
import plotly.graph_objects as go
import plotly.io as pio
import io
import base64
import sys
import traceback
from contextlib import redirect_stdout, redirect_stderr
import os

app = Flask(__name__)
CORS(app)  # Allow cross-origin requests from Next.js

VERSION = "1.0.4"

# --- Premium Emerald Theme for Plotly ---
emerald_template = go.layout.Template(
    layout=go.Layout(
        colorway=['#059669', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'],
        paper_bgcolor='white',
        plot_bgcolor='rgba(248, 250, 252, 0.5)',
        font=dict(family="Inter, -apple-system, sans-serif", color="#475569", size=12),
        title=dict(font=dict(size=18, color="#1e293b", weight='bold'), x=0.05, y=0.95),
        margin=dict(l=50, r=40, t=80, b=50),
        xaxis=dict(
            gridcolor="#e2e8f0", 
            zerolinecolor="#cbd5e1", 
            tickfont=dict(size=10),
            title=dict(font=dict(size=12, color="#64748b"))
        ),
        yaxis=dict(
            gridcolor="#e2e8f0", 
            zerolinecolor="#cbd5e1", 
            tickfont=dict(size=10),
            title=dict(font=dict(size=12, color="#64748b"))
        ),
        hoverlabel=dict(bgcolor="white", font_size=12, font_family="Inter"),
        legend=dict(bgcolor="rgba(255,255,255,0.8)", bordercolor="#e2e8f0", borderwidth=1)
    )
)
pio.templates["emerald"] = emerald_template
pio.templates.default = "emerald"

# --- Premium Emerald Theme for Matplotlib ---
try:
    plt.rcParams.update({
        'figure.facecolor': 'white',
        'axes.facecolor': 'white',
        'axes.edgecolor': '#cbd5e1',
        'axes.grid': True,
        'grid.color': '#f1f5f9',
        'grid.linestyle': '-',
        'axes.labelcolor': '#64748b',
        'axes.titleweight': 'bold',
        'axes.titlesize': 14,
        'axes.titlecolor': '#111827',
        'axes.spines.top': False,
        'axes.spines.right': False,
        'font.family': 'sans-serif',
        'font.sans-serif': ['Inter', 'Arial', 'sans-serif'],
        'xtick.color': '#94a3b8',
        'ytick.color': '#94a3b8',
        'axes.prop_cycle': plt.cycler(color=['#059669', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'])
    })
except:
    pass

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'version': VERSION})

@app.route('/download-excel', methods=['POST'])
def download_excel():
    try:
        data = request.get_json().get('data', [])
        if not data:
            return jsonify({"error": "No data provided"}), 400
        
        df = pd.DataFrame(data)
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name='DataPreview')
        
        output.seek(0)
        return send_file(
            output,
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            as_attachment=True,
            download_name='preview_data.xlsx'
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500

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
                    ns['data'] = df_table # Alias 'data' for the first table
                    print(f"   - 'df' & 'data' mapped to '{table_name}'")

        
        # --- Prevent blocking calls ---
        def no_op_show(*args, **kwargs):
            print("⚠️ [EXECUTE] 'show()' call ignored to prevent blocking. The figure is captured automatically.")

        # Monkey-patch plt.show in the namespace
        # (We can't easily replace the module 'plt' passed in 'ns' if it's the real module, 
        # so we wrap it or assign the function to the module instance locally if possible, 
        # but better to just shadow 'plt' in the dict with a wrapper)
        class PltWrapper:
            def __init__(self, original_plt):
                self._original_plt = original_plt
            def __getattr__(self, name):
                if name == 'show':
                    return no_op_show
                return getattr(self._original_plt, name)
        
        ns['plt'] = PltWrapper(plt)
        
        # Disable Plotly browser renderer
        pio.renderers.default = "json" # or None, but json is safe

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
        
        # Priority 1: Common result names (ordered by most likely output)
        # Priority 1: Common result names (ordered by most likely output)
        if output_type == 'chart':
            search_order = ['fig', 'chart', 'result', 'output']
            # Filter: we strictly want a chart object if possible
            for key in search_order:
                if key in ns:
                    val = ns[key]
                    if hasattr(val, 'to_json') or isinstance(val, (plt.Figure, go.Figure)):
                        res_val = val
                        print(f"✅ [EXECUTE] Found chart result in variable: '{key}'")
                        break
            
            # Fallback: look for ANY chart object if none of the priority names matched
            if res_val is None:
                for key, val in reversed(list(ns.items())):
                    if key not in ['plt', 'px', 'go', 'pd', 'np', 'data', 'df'] and \
                       (hasattr(val, 'to_json') or isinstance(val, (plt.Figure, go.Figure))):
                        res_val = val
                        print(f"✅ [EXECUTE] Found chart result in generic variable: '{key}'")
                        break
        else:
            search_order = ['result', 'output', 'df', 'data']
            for key in search_order:
                if key in ns and ns[key] is not None:
                    # If we injected an empty 'df' and it's still empty, skip it unless no inputs were provided
                    if key in ['df', 'data'] and isinstance(ns[key], pd.DataFrame) and ns[key].empty and len(input_data) == 0:
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
            # 1. Plotly Figure (Check this first for interactivity)
            if hasattr(res_val, 'to_json') or isinstance(res_val, go.Figure) or hasattr(res_val, 'to_image'):
                try:
                    # Return HTML for interactivity
                    chart_html = pio.to_html(res_val, full_html=False, include_plotlyjs='cdn')
                    
                    # Also generate PNG for email body compatibility
                    chart_base64 = None
                    try:
                        # Try to generate static image using kaleido
                        img_bytes = pio.to_image(res_val, format='png', width=800, height=600)
                        chart_base64 = base64.b64encode(img_bytes).decode('utf-8')
                        print(f"✅ [EXECUTE] Generated both HTML and PNG for Plotly chart")
                    except Exception as img_err:
                        print(f"⚠️ [EXECUTE] Could not generate PNG (kaleido might not be installed): {str(img_err)}")
                    
                    response = {
                        'success': True,
                        'chartHtml': chart_html,
                        'stdout': stdout_val
                    }
                    if chart_base64:
                        response['chartBase64'] = chart_base64
                    
                    return jsonify(response)
                except Exception as pe:
                    print(f"⚠️ [EXECUTE] Plotly HTML conversion failed, falling back to PNG: {str(pe)}")
            
            # 2. Matplotlib Figure
            if isinstance(res_val, plt.Figure):
                buf = io.BytesIO()
                res_val.savefig(buf, format='png', dpi=150, bbox_inches='tight')
                buf.seek(0)
                img_base64 = base64.b64encode(buf.read()).decode('utf-8')
                plt.close(res_val)
                
                return jsonify({
                    'success': True,
                    'chartBase64': img_base64,
                    'stdout': stdout_val
                })
            
            # 3. Fallback: current matplotlib figure
            else:
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
