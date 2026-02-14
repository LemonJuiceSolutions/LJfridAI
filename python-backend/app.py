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
import json
import re
from chart_to_recharts_converter import matplotlib_to_recharts, plotly_to_recharts, infer_chart_type

# --- Monkey-patch requests to enforce longer timeout ---
try:
    import requests.adapters
    
    _orig_send = requests.adapters.HTTPAdapter.send

    def _patched_send(self, request, stream=False, timeout=None, verify=True, cert=None, proxies=None):
        # Default to 120s if None or too short (e.g. 30s default in some libs)
        # We want to allow long-running API calls
        MIN_TIMEOUT = 120
        
        if timeout is None:
            timeout = MIN_TIMEOUT
        elif isinstance(timeout, (int, float)) and timeout < MIN_TIMEOUT:
            print(f"⚠️ [PATCH] Upgrading timeout from {timeout}s to {MIN_TIMEOUT}s for {request.url}")
            timeout = MIN_TIMEOUT
        elif isinstance(timeout, tuple):
            # timeout is (connect, read)
            connect, read = timeout
            new_read = max(read, MIN_TIMEOUT) if read is not None else MIN_TIMEOUT
            if new_read != read:
                print(f"⚠️ [PATCH] Upgrading read timeout from {read}s to {new_read}s for {request.url}")
                timeout = (connect, new_read)
                
        return _orig_send(self, request, stream=stream, timeout=timeout, verify=verify, cert=cert, proxies=proxies)

    requests.adapters.HTTPAdapter.send = _patched_send
    print(f"✅ [INIT] Requests timeout patched to minimum 120s")
except ImportError:
    print(f"⚠️ [INIT] Requests not found, skipping timeout patch")
except Exception as e:
    print(f"⚠️ [INIT] Failed to patch requests timeout: {e}")

app = Flask(__name__)
app.json.sort_keys = False
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
        chart_theme = data.get('chartTheme', None)  # Full theme object from frontend
        import sys
        print(f"🎨 [THEME] chart_theme received: {type(chart_theme).__name__}, value: {str(chart_theme)[:200] if chart_theme else 'None'}", file=sys.stderr, flush=True)

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
            '__name__': '__main__',
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
        
        env_vars = data.get('env', {}) # Receive env vars
        from unittest.mock import patch

        # Apply per-request chart theme if provided (colors, fonts, grid, margins)
        original_plotly_layout = None
        original_mpl_params = None
        _theme_plotly_overrides = None  # for post-exec forced application
        if chart_theme and isinstance(chart_theme, dict):
            try:
                colors = chart_theme.get('colors', [])
                font_family = chart_theme.get('fontFamily', 'Inter, -apple-system, sans-serif')
                axis_font_size = chart_theme.get('axisFontSize', 12)
                tooltip_font_size = chart_theme.get('tooltipFontSize', 12)
                legend_font_size = chart_theme.get('legendFontSize', 12)
                title_font_size = chart_theme.get('titleFontSize', 16)
                grid_color = chart_theme.get('gridColor', '#e2e8f0')
                grid_style = chart_theme.get('gridStyle', 'dashed')
                line_width = chart_theme.get('lineWidth', 2)
                margins = chart_theme.get('chartMargins', {})

                # Map grid style to matplotlib linestyle
                mpl_grid_style = '-' if grid_style == 'solid' else '--' if grid_style == 'dashed' else ':' if grid_style == 'dotted' else ''
                show_grid = grid_style != 'none'

                # Inject CHART_THEME into execution namespace so scripts can use it
                ns['CHART_THEME'] = chart_theme
                ns['THEME_COLORS'] = colors
                print(f"🎨 [THEME] Injected CHART_THEME with {len(colors)} colors: {colors[:3]}...", file=sys.stderr, flush=True)

                # Set emerald as default template so ALL plotly charts use our modified version
                pio.templates.default = "emerald"

                # Save originals for restoration (use to_plotly_json() instead of dict() for Plotly objects)
                layout = emerald_template.layout
                original_plotly_layout = {
                    'colorway': list(layout.colorway) if layout.colorway else None,
                    'font': layout.font.to_plotly_json() if layout.font else None,
                    'title': layout.title.to_plotly_json() if layout.title else None,
                    'margin': layout.margin.to_plotly_json() if layout.margin else None,
                    'xaxis': layout.xaxis.to_plotly_json() if layout.xaxis else None,
                    'yaxis': layout.yaxis.to_plotly_json() if layout.yaxis else None,
                    'hoverlabel': layout.hoverlabel.to_plotly_json() if layout.hoverlabel else None,
                }
                original_mpl_params = {
                    'axes.prop_cycle': plt.rcParams.get('axes.prop_cycle'),
                    'font.sans-serif': list(plt.rcParams.get('font.sans-serif', [])),
                    'axes.grid': plt.rcParams.get('axes.grid'),
                    'grid.color': plt.rcParams.get('grid.color'),
                    'grid.linestyle': plt.rcParams.get('grid.linestyle'),
                    'axes.titlesize': plt.rcParams.get('axes.titlesize'),
                    'axes.labelsize': plt.rcParams.get('axes.labelsize'),
                    'xtick.labelsize': plt.rcParams.get('xtick.labelsize'),
                    'ytick.labelsize': plt.rcParams.get('ytick.labelsize'),
                    'legend.fontsize': plt.rcParams.get('legend.fontsize'),
                }

                # Build overrides dict for post-exec forced application on Plotly figures
                _theme_plotly_overrides = {
                    'colors': colors,
                    'font_family': font_family,
                    'axis_font_size': axis_font_size,
                    'tooltip_font_size': tooltip_font_size,
                    'legend_font_size': legend_font_size,
                    'title_font_size': title_font_size,
                    'grid_color': grid_color,
                    'grid_style': grid_style,
                }

                # Apply to Plotly template (defaults for charts that don't override)
                if colors:
                    layout.colorway = colors
                layout.font = dict(family=font_family, color="#475569", size=axis_font_size)
                layout.title = dict(font=dict(size=title_font_size, color="#1e293b"), x=0.05, y=0.95)
                layout.margin = dict(
                    l=margins.get('left', 50), r=margins.get('right', 40),
                    t=margins.get('top', 80), b=margins.get('bottom', 50)
                )
                layout.xaxis = dict(gridcolor=grid_color, zerolinecolor="#cbd5e1",
                    tickfont=dict(size=axis_font_size), title=dict(font=dict(size=axis_font_size, color="#64748b")))
                layout.yaxis = dict(gridcolor=grid_color, zerolinecolor="#cbd5e1",
                    tickfont=dict(size=axis_font_size), title=dict(font=dict(size=axis_font_size, color="#64748b")))
                layout.hoverlabel = dict(bgcolor="white", font_size=tooltip_font_size, font_family=font_family)
                layout.legend = dict(bgcolor="rgba(255,255,255,0.8)", bordercolor="#e2e8f0", borderwidth=1, font=dict(size=legend_font_size))

                # Apply to Matplotlib
                font_parts = [f.strip() for f in font_family.split(',')]
                if colors:
                    plt.rcParams['axes.prop_cycle'] = plt.cycler(color=colors)
                plt.rcParams['font.sans-serif'] = font_parts + ['Arial', 'sans-serif']
                plt.rcParams['axes.grid'] = show_grid
                plt.rcParams['grid.color'] = grid_color
                plt.rcParams['grid.linestyle'] = mpl_grid_style
                plt.rcParams['axes.titlesize'] = title_font_size
                plt.rcParams['axes.labelsize'] = axis_font_size
                plt.rcParams['xtick.labelsize'] = axis_font_size
                plt.rcParams['ytick.labelsize'] = axis_font_size
                plt.rcParams['legend.fontsize'] = legend_font_size
                plt.rcParams['lines.linewidth'] = line_width

                print(f"✅ [THEME] Applied theme to Plotly template and matplotlib rcParams", file=sys.stderr, flush=True)
            except Exception as e:
                import traceback as tb
                print(f"⚠️ Failed to apply chart theme: {e}", file=sys.stderr, flush=True)
                tb.print_exc(file=sys.stderr)

        try:
            with redirect_stdout(raw_stdout), redirect_stderr(raw_stderr):
                # Patch os.environ for the duration of execution
                with patch.dict(os.environ, env_vars):
                    exec(safe_code, ns, ns) # Use ns for both globals and locals
        except Exception as e:
            error_details = traceback.format_exc()
            error_msg = str(e)
            
            # Make common errors more readable
            if isinstance(e, KeyError):
                error_msg = f"KeyError: La colonna {error_msg} non è presente nei dati. Controlla i nomi delle colonne nel terminale."
            elif isinstance(e, NameError):
                # Extract the variable name from the error message
                missing_var_match = re.search(r"name '(\w+)' is not defined", str(e))
                missing_var = missing_var_match.group(1) if missing_var_match else 'unknown'
                
                # List available data tables that were injected
                available_tables = [name for name in input_data.keys()]
                
                if available_tables:
                    error_msg = f"NameError: La variabile '{missing_var}' non è definita.\n\n"
                    error_msg += f"📊 Tabelle disponibili: {', '.join(available_tables)}\n\n"
                    error_msg += "💡 Suggerimento: Verifica che il nome della variabile corrisponda esattamente "
                    error_msg += "al nome della dipendenza configurata (case-sensitive).\n"
                    error_msg += "Controlla anche che la dipendenza sia selezionata nel dropdown 'USA DATI DA (PIPELINE)'."
                else:
                    error_msg = f"NameError: La variabile '{missing_var}' non è definita.\n\n"
                    error_msg += "⚠️ Nessuna tabella è stata fornita come dipendenza.\n\n"
                    error_msg += "💡 Suggerimento: Questo script richiede dati da altri nodi. "
                    error_msg += "Seleziona le dipendenze necessarie nel dropdown 'USA DATI DA (PIPELINE)'."
            
            print(f"❌ [EXECUTE] Script error: {error_msg}")
            print(f"--- FAILING CODE START (Line 131 context: {safe_code.splitlines()[130] if len(safe_code.splitlines()) > 130 else 'N/A'}) ---")
            # Print code with line numbers for easier debugging
            for i, line in enumerate(safe_code.splitlines(), 1):
                print(f"{i:4d}: {line}")
            print("--- FAILING CODE END ---")

            return jsonify({
                'success': False,
                'error': error_msg,
                'traceback': error_details,
                'stdout': raw_stdout.getvalue(),
                'stderr': raw_stderr.getvalue()
            }), 200
        finally:
            # Restore original Plotly layout, matplotlib params, and default template
            if original_plotly_layout is not None:
                try:
                    layout = emerald_template.layout
                    for key, val in original_plotly_layout.items():
                        if val is not None:
                            setattr(layout, key, val)
                    pio.templates.default = "plotly"  # Restore default template
                except: pass
            if original_mpl_params is not None:
                try:
                    for key, val in original_mpl_params.items():
                        if val is not None:
                            plt.rcParams[key] = val
                except: pass


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
        elif output_type == 'html':
            search_order = ['html_result', 'html', 'result', 'output']
            for key in search_order:
                if key in ns and ns[key] is not None:
                    res_val = ns[key]
                    print(f"✅ [EXECUTE] Found HTML result in variable: '{key}'")
                    break
            
            # Fallback: find any string that looks like HTML
            if res_val is None:
                for key, val in reversed(list(ns.items())):
                    if key not in ['plt', 'px', 'go', 'pd', 'np', 'data', 'df'] and \
                       isinstance(val, str) and ('<' in val and '>' in val):
                        res_val = val
                        print(f"✅ [EXECUTE] Found HTML-like string in variable: '{key}'")
                        break
            
            # Fallback 2: Check stdout for HTML content (Relaxed: accept any stdout if mode is explicitly HTML)
            if res_val is None and stdout_val.strip():
                 res_val = stdout_val
                 print(f"✅ [EXECUTE] Using stdout as HTML result (fallback)")
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
        
        
        # Priority 2: JSON in stdout (heuristic fallback)
        if res_val is None and stdout_val.strip():
            try:
                # Naive rfind fails on nested structures (finds inner dict instead of outer list).
                # New strategy: Try specific candidate indices that are likely starts of the main JSON.
                
                candidates = []
                # 1. First '[' (Likely start of a list output if logs are minimal)
                p1 = stdout_val.find('[')
                if p1 != -1: candidates.append(p1)
                
                # 2. First '{' (Likely start of a dict/wrapper)
                p2 = stdout_val.find('{')
                if p2 != -1: candidates.append(p2)
                
                # 3. Last '[' (Dangerous for nested, but maybe valid if flat)
                p3 = stdout_val.rfind('[')
                if p3 != -1 and p3 != p1: candidates.append(p3)
                
                # 4. Last '{' (Dangerous, but maybe valid)
                p4 = stdout_val.rfind('{')
                if p4 != -1 and p4 != p2: candidates.append(p4)
                
                # Sort candidates to try from beginning to end? 
                # Or maybe reversed to find the "result" at the end?
                # Usually we want the *largest* structure or the one that parses successfully.
                # Let's try them all and pick the one that looks like a DataFrame data source (List of Dicts).
                
                candidates = sorted(list(set(candidates)))
                
                best_parsed = None
                
                for start_idx in candidates:
                    try:
                        potential_json = stdout_val[start_idx:]
                        parsed = json.loads(potential_json)
                        
                        # Apply heavy heuristic: We want a List of Dicts or a specific Dict wrapper
                        if isinstance(parsed, list) and len(parsed) > 0 and isinstance(parsed[0], dict):
                            best_parsed = parsed
                            print(f"✅ [EXECUTE] Found valid List[Dict] JSON at index {start_idx}")
                            break # High confidence
                        
                        if isinstance(parsed, dict) and ('rows' in parsed or 'cols' in parsed):
                             best_parsed = parsed
                             print(f"✅ [EXECUTE] Found valid Table Dict JSON at index {start_idx}")
                             break
                             
                        # Keep it as fallback
                        if best_parsed is None:
                            best_parsed = parsed
                            
                    except json.JSONDecodeError:
                        continue
                
                if best_parsed is not None:
                     res_val = best_parsed
                     # Convert to DataFrame if needed (logic below handles it)
                     if output_type == 'table':
                        if isinstance(best_parsed, list):
                            res_val = pd.DataFrame(best_parsed)
                        elif isinstance(best_parsed, dict):
                             # ... existing dict handling ...
                             if 'rows' in best_parsed and isinstance(best_parsed['rows'], list):
                                 res_val = pd.DataFrame(best_parsed['rows'])
                                 # Reorder columns if 'cols' is provided
                                 if 'cols' in best_parsed and isinstance(best_parsed['cols'], list):
                                     valid_cols = [c for c in best_parsed['cols'] if c in res_val.columns]
                                     # Append any remaining columns not in 'cols'
                                     remaining = [c for c in res_val.columns if c not in valid_cols]
                                     res_val = res_val[valid_cols + remaining]

                             else:
                                 res_val = pd.DataFrame([best_parsed]) if not isinstance(best_parsed, pd.DataFrame) else best_parsed

            except Exception as e:
                print(f"⚠️ [EXECUTE] Error parsing stdout JSON: {e}")

        # Priority 3: Last line expression (heuristic - NOT IMPLEMENTED for safety/complexity)

        # ── Post-exec: force-apply theme to any Plotly figure found ──
        # Template defaults are overridden by explicit fig.update_layout() in user code,
        # so we re-apply the full theme directly on the figure object.
        if _theme_plotly_overrides and res_val is not None and isinstance(res_val, go.Figure):
            try:
                ovr = _theme_plotly_overrides
                ff = ovr['font_family']
                afs = ovr['axis_font_size']
                tfs = ovr['title_font_size']
                ttfs = ovr['tooltip_font_size']
                lfs = ovr['legend_font_size']
                gc = ovr['grid_color']

                # 1. Global font
                res_val.update_layout(
                    font=dict(family=ff, color="#475569", size=afs),
                    hoverlabel=dict(bgcolor="white", font_size=ttfs, font_family=ff),
                    legend=dict(bgcolor="rgba(255,255,255,0.8)", bordercolor="#e2e8f0",
                                borderwidth=1, font=dict(size=lfs, family=ff)),
                )

                # 2. All axes (xaxis, yaxis, xaxis2, yaxis2, etc.)
                for attr_name in list(res_val.layout.to_plotly_json().keys()):
                    if attr_name.startswith('xaxis') or attr_name.startswith('yaxis'):
                        axis_obj = getattr(res_val.layout, attr_name, None)
                        if axis_obj is not None:
                            axis_obj.tickfont = dict(family=ff, size=afs)
                            axis_obj.gridcolor = gc
                            if hasattr(axis_obj, 'title') and axis_obj.title:
                                if axis_obj.title.font:
                                    axis_obj.title.font.family = ff

                # 3. Annotations (subplot titles, custom annotations)
                if res_val.layout.annotations:
                    for ann in res_val.layout.annotations:
                        if ann.font:
                            ann.font.family = ff
                        else:
                            ann.font = dict(family=ff)

                # 4. All trace text fonts (bar labels, scatter text, etc.)
                for trace in res_val.data:
                    if hasattr(trace, 'textfont') and trace.textfont:
                        trace.textfont.family = ff

                print(f"🎨 [THEME] Force-applied full theme to Plotly figure (font={ff}, axes={afs}px, grid={gc})", file=sys.stderr, flush=True)
            except Exception as e:
                import traceback
                print(f"⚠️ [THEME] Could not force-apply theme to figure: {e}", file=sys.stderr, flush=True)
                traceback.print_exc(file=sys.stderr)

        # Process result based on requested output type
        if output_type == 'table':
            if isinstance(res_val, pd.DataFrame):
                # Convert DataFrame to list of dicts
                # FIX: Replace NaN with None so it becomes null in JSON (NaN is invalid JSON)
                # FIX: Also replace NaT (missing datetime) with None
                # IMPORTANT: Must cast to object first, otherwise None in float columns reverts to NaN!
                df_clean = res_val.astype(object).where(pd.notnull(res_val), None)
                
                # Double check for NaT specifically if where() missed it for object types
                # (Sometimes NaT persists in object columns)
                df_clean = df_clean.replace({pd.NaT: None})

                return jsonify({
                    'success': True,
                    'data': df_clean.to_dict(orient='records'),
                    'columns': list(res_val.columns.astype(str)),
                    'rowCount': len(res_val),
                    'stdout': stdout_val
                })
            else:
                # DEBUG: Show what we captured
                debug_hint = f" [Stdout len: {len(stdout_val)}]"
                if len(stdout_val) > 100:
                    debug_hint += f" Last 100: {stdout_val[-100:]}"
                else:
                    debug_hint += f" Content: {stdout_val}"

                return jsonify({
                    'success': False,
                    'error': f'Expected DataFrame result for output type "table", but got {type(res_val).__name__}.{debug_hint}',
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
        
        elif output_type == 'html':
            # Ensure the result is a string
            html_content = str(res_val) if res_val is not None else ""
            return jsonify({
                'success': True,
                'html': html_content,
                'stdout': stdout_val
            })
        
        elif output_type == 'chart':
            print(f"📊 [EXECUTE] Chart output requested, result type: {type(res_val).__name__}")
            
            # NEW: Convert charts to Recharts config automatically
            chart_lib = infer_chart_type(res_val)
            print(f"📊 [EXECUTE] Inferred chart library: {chart_lib}")
            recharts_result = None
            
            # Try to convert to Recharts
            if chart_lib == 'matplotlib':
                print("📊 [EXECUTE] Converting matplotlib chart to Recharts...")
                recharts_result = matplotlib_to_recharts(res_val)
            elif chart_lib == 'plotly':
                print("📊 [EXECUTE] Converting plotly chart to Recharts...")
                recharts_result = plotly_to_recharts(res_val)
            
            print(f"📊 [EXECUTE] Recharts conversion result: {recharts_result is not None}")
            
            # If conversion successful, return Recharts config
            if recharts_result:
                print(f"✅ [EXECUTE] Successfully converted to Recharts ({recharts_result['config']['type']})")
                
                response = {
                    'success': True,
                    'rechartsConfig': recharts_result['config'],
                    'rechartsData': recharts_result['data'],
                    'stdout': stdout_val
                }
                
                # Also generate PNG for email compatibility (only if needed)
                # This will be triggered by a separate request with need_png_for_email flag
                try:
                    if chart_lib == 'plotly' and hasattr(res_val, 'to_image'):
                        # Generate PNG for plotly
                        fig_width = res_val.layout.width if res_val.layout.width else 1000
                        fig_height = res_val.layout.height if res_val.layout.height else 500
                        
                        MAX_WIDTH = 1200
                        MAX_HEIGHT = 6000
                        
                        if fig_width > MAX_WIDTH:
                            ratio = MAX_WIDTH / fig_width
                            fig_width = MAX_WIDTH
                            fig_height = int(fig_height * ratio)
                        
                        if fig_height > MAX_HEIGHT:
                            ratio = MAX_HEIGHT / fig_height
                            fig_height = MAX_HEIGHT
                            fig_width = int(fig_width * ratio)
                        
                        scale = 2.5
                        img_bytes = pio.to_image(res_val, format='png', width=fig_width, height=fig_height, scale=scale)
                        response['chartBase64'] = base64.b64encode(img_bytes).decode('utf-8')
                        print(f"✅ [EXECUTE] Also generated PNG for email ({len(img_bytes)//1024} KB)")
                    
                    elif chart_lib == 'matplotlib' and isinstance(res_val, plt.Figure):
                        # Generate PNG for matplotlib
                        buf = io.BytesIO()
                        res_val.savefig(buf, format='png', dpi=150, bbox_inches='tight')
                        buf.seek(0)
                        response['chartBase64'] = base64.b64encode(buf.read()).decode('utf-8')
                        plt.close(res_val)
                        print(f"✅ [EXECUTE] Also generated PNG for email")
                
                except Exception as png_err:
                    print(f"⚠️ [EXECUTE] Could not generate PNG (non-critical): {str(png_err)}")
                
                return jsonify(response)
            
            # Fallback: If conversion failed, use old logic (PNG/HTML)
            print(f"⚠️ [EXECUTE] Recharts conversion failed, falling back to PNG/HTML")
            
            # 1. Plotly Figure (Check this first for interactivity)
            if hasattr(res_val, 'to_json') or isinstance(res_val, go.Figure) or hasattr(res_val, 'to_image'):
                try:
                    # Return HTML for interactivity
                    chart_html = pio.to_html(res_val, full_html=False, include_plotlyjs='cdn')
                    
                    # Also generate PNG for email body compatibility
                    chart_base64 = None
                    try:
                        # Extract dimensions from figure layout, or use sensible defaults
                        fig_width = res_val.layout.width if res_val.layout.width else 1000
                        fig_height = res_val.layout.height if res_val.layout.height else 500
                        
                        # CRITICAL: Limit dimensions for email compatibility
                        # Enforce max width but allow height to grow (emails scroll vertically)
                        MAX_WIDTH = 1200
                        MAX_HEIGHT = 6000  # Increased significantly to allow very tall charts (Gantt)
                        
                        # Scale proportionally if too large horizontally
                        if fig_width > MAX_WIDTH:
                            ratio = MAX_WIDTH / fig_width
                            fig_width = MAX_WIDTH
                            fig_height = int(fig_height * ratio)
                        
                        # Don't strictly constrain height to avoid crushing width on tall charts
                        # If extremely tall, we just cap it but try to preserve width if possible? 
                        # Actually with 6000 limit it should be fine.
                        if fig_height > MAX_HEIGHT:
                            # Only if it exceeds 6000px legical (which is huge)
                            ratio = MAX_HEIGHT / fig_height
                            fig_height = MAX_HEIGHT
                            fig_width = int(fig_width * ratio)
                        
                        # Use 2.5x scale for high-DPI (Retina) quality without creating massive files
                        scale = 2.5
                        
                        print(f"📊 [EXECUTE] Generating PNG: {fig_width}x{fig_height} @ {scale}x scale")
                        img_bytes = pio.to_image(res_val, format='png', width=fig_width, height=fig_height, scale=scale)
                        chart_base64 = base64.b64encode(img_bytes).decode('utf-8')
                        print(f"✅ [EXECUTE] Generated both HTML and PNG for Plotly chart ({len(img_bytes)//1024} KB)")
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
