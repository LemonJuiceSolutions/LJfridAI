"""
Automatic conversion of matplotlib and plotly charts to Recharts JSON configurations.
This module extracts data from Python chart objects and converts them to WidgetConfig format
compatible with the SmartWidgetRenderer React component.
"""

import matplotlib.pyplot as plt
import plotly.graph_objects as go
import numpy as np
from typing import Dict, List, Any, Optional, Union


def convert_to_native_type(value: Any) -> Any:
    """
    Convert NumPy types to native Python types for JSON serialization.
    
    Args:
        value: Any value that might be a NumPy type
        
    Returns:
        Native Python type equivalent
    """
    if isinstance(value, (np.integer, np.int64, np.int32, np.int16, np.int8)):
        return int(value)
    elif isinstance(value, (np.floating, np.float64, np.float32, np.float16)):
        return float(value)
    elif isinstance(value, np.ndarray):
        return value.tolist()
    elif isinstance(value, (list, tuple)):
        return [convert_to_native_type(v) for v in value]
    elif isinstance(value, dict):
        return {k: convert_to_native_type(v) for k, v in value.items()}
    else:
        return value


def matplotlib_to_recharts(fig: plt.Figure) -> Optional[Dict[str, Any]]:
    """
    Convert a matplotlib Figure to Recharts WidgetConfig JSON.
    
    Args:
        fig: matplotlib Figure object
        
    Returns:
        WidgetConfig dict compatible with SmartWidgetRenderer, or None if conversion fails
    """
    try:
        print(f"🔍 [CONVERTER] Starting matplotlib conversion...")
        axes = fig.get_axes()
        if not axes:
            print("⚠️ [CONVERTER] No axes found in figure")
            return None
        
        print(f"📊 [CONVERTER] Found {len(axes)} axes")
        # Use the first axes for now (TODO: support subplots)
        ax = axes[0]
        
        # Detect chart type and extract data
        lines = ax.get_lines()
        patches = ax.patches
        
        print(f"📊 [CONVERTER]   Lines: {len(lines)}, Patches: {len(patches)}")        
        chart_type = "line-chart"
        data = []
        data_keys = []
        colors = []
        
        # Extract title and labels
        title = ax.get_title() or fig._suptitle.get_text() if fig._suptitle else ""
        x_label = ax.get_xlabel() or None
        y_label = ax.get_ylabel() or None
        
        if patches and len(patches) > 0:
            # Bar chart detected
            chart_type = "bar-chart"
            
            # Group patches by x-position to handle grouped bars
            bar_groups = {}
            for patch in patches:
                x_center = patch.get_x() + patch.get_width() / 2
                x_key = round(x_center, 2)
                if x_key not in bar_groups:
                    bar_groups[x_key] = []
                bar_groups[x_key].append(patch)
            
            # Extract x-tick labels
            x_ticks = ax.get_xticks()
            x_ticklabels = [label.get_text() for label in ax.get_xticklabels()]
            
            # Build data rows
            for i, (x_pos, bars) in enumerate(sorted(bar_groups.items())):
                row = {}
                # Use tick label if available, otherwise use index
                if i < len(x_ticklabels) and x_ticklabels[i]:
                    row["category"] = x_ticklabels[i]
                else:
                    row["category"] = f"Cat {i+1}"
                
                for j, bar in enumerate(bars):
                    key = f"series{j+1}" if len(bars) > 1 else "value"
                    row[key] = convert_to_native_type(bar.get_height())
                    
                    # Extract color
                    if j >= len(colors):
                        color = bar.get_facecolor()
                        if isinstance(color, (list, tuple)) and len(color) >= 3:
                            # Convert RGBA to hex
                            r, g, b = [int(c * 255) for c in color[:3]]
                            colors.append(f"#{r:02x}{g:02x}{b:02x}")
                
                data.append(row)
            
            # Determine data keys from first row
            if data:
                data_keys = [k for k in data[0].keys() if k != "category"]
        
        elif lines and len(lines) > 0:
            # Line chart detected
            chart_type = "line-chart"
            
            # Extract data from all lines
            all_x_values = set()
            line_data = []
            
            for line in lines:
                x_data = line.get_xdata()
                y_data = line.get_ydata()
                label = line.get_label()
                
                if label.startswith('_'):  # Skip internal labels
                    label = f"Series {len(line_data) + 1}"
                
                line_data.append({
                    'x': x_data,
                    'y': y_data,
                    'label': label
                })
                
                all_x_values.update(x_data)
                
                # Extract color
                color = line.get_color()
                if isinstance(color, str):
                    colors.append(color)
                elif isinstance(color, (list, tuple)) and len(color) >= 3:
                    r, g, b = [int(c * 255) for c in color[:3]]
                    colors.append(f"#{r:02x}{g:02x}{b:02x}")
            
            # Build data rows with all x values
            sorted_x = sorted(all_x_values)
            for x_val in sorted_x:
                row = {"x": convert_to_native_type(x_val)}
                for line_info in line_data:
                    # Find corresponding y value
                    try:
                        idx = np.where(line_info['x'] == x_val)[0]
                        if len(idx) > 0:
                            row[line_info['label']] = convert_to_native_type(line_info['y'][idx[0]])
                    except:
                        pass
                data.append(row)
            
            data_keys = [ld['label'] for ld in line_data]
        
        else:
            # No recognizable chart elements
            return None
        
        # Build WidgetConfig (convert all data to native types)
        data = convert_to_native_type(data)
        config = {
            "type": chart_type,
            "title": title if title else None,
            "xAxisKey": "category" if chart_type == "bar-chart" else "x",
            "dataKeys": data_keys,
            "colors": colors if colors else None,
        }
        
        if x_label:
            config["xAxisTitle"] = x_label
        if y_label:
            config["yAxisTitle"] = y_label
        
        # Remove None values
        config = {k: v for k, v in config.items() if v is not None}
        
        return {
            "config": config,
            "data": data
        }
        
    except Exception as e:
        print(f"⚠️ [CONVERTER] Matplotlib conversion error: {e}")
        return None


def plotly_to_recharts(fig: go.Figure) -> Optional[Dict[str, Any]]:
    """
    Convert a plotly Figure to Recharts WidgetConfig JSON.
    
    Args:
        fig: plotly Figure object
        
    Returns:
        WidgetConfig dict compatible with SmartWidgetRenderer, or None if conversion fails
    """
    try:
        if not hasattr(fig, 'data') or len(fig.data) == 0:
            return None
        
        # Detect chart type from first trace
        first_trace = fig.data[0]
        trace_type = first_trace.type if hasattr(first_trace, 'type') else 'scatter'
        
        # Map plotly types to Recharts types
        type_mapping = {
            'scatter': 'line-chart',
            'scattergl': 'line-chart',
            'line': 'line-chart',
            'bar': 'bar-chart',
            'pie': 'pie-chart',
            'area': 'area-chart',
        }
        
        chart_type = type_mapping.get(trace_type, 'line-chart')
        
        # For scatter, check if it should be line or markers
        if trace_type == 'scatter':
            mode = getattr(first_trace, 'mode', 'lines')
            if 'lines' in mode:
                chart_type = 'line-chart'
            elif 'markers' in mode and 'lines' not in mode:
                chart_type = 'bar-chart'  # Fallback to bar for scatter plots
        
        data = []
        data_keys = []
        colors = []
        
        # Extract title and labels from layout
        layout = fig.layout if hasattr(fig, 'layout') else {}
        title = layout.title.text if hasattr(layout, 'title') and hasattr(layout.title, 'text') else ""
        x_label = layout.xaxis.title.text if hasattr(layout, 'xaxis') and hasattr(layout.xaxis, 'title') and hasattr(layout.xaxis.title, 'text') else None
        y_label = layout.yaxis.title.text if hasattr(layout, 'yaxis') and hasattr(layout.yaxis, 'title') and hasattr(layout.yaxis.title, 'text') else None
        
        if chart_type == 'pie-chart':
            # Pie chart: extract labels and values from first trace
            trace = fig.data[0]
            labels = trace.labels if hasattr(trace, 'labels') else []
            values = trace.values if hasattr(trace, 'values') else []
            trace_colors = trace.marker.colors if hasattr(trace, 'marker') and hasattr(trace.marker, 'colors') else []
            
            for i, (label, value) in enumerate(zip(labels, values)):
                data.append({
                    "name": str(label),
                    "value": convert_to_native_type(value)
                })
                if i < len(trace_colors):
                    colors.append(trace_colors[i])
            
            return {
                "config": {
                    "type": "pie-chart",
                    "title": title if title else None,
                    "xAxisKey": "name",
                    "dataKeys": ["value"],
                    "colors": colors if colors else None,
                },
                "data": data
            }
        
        else:
            # Line, bar, area charts: combine all traces
            # First, collect all unique x values
            all_x_values = set()
            trace_info = []
            
            for trace in fig.data:
                x_data = trace.x if hasattr(trace, 'x') else []
                y_data = trace.y if hasattr(trace, 'y') else []
                name = trace.name if hasattr(trace, 'name') else f"Series {len(trace_info) + 1}"
                
                # Extract color
                color = None
                if hasattr(trace, 'marker') and hasattr(trace.marker, 'color'):
                    color = trace.marker.color
                elif hasattr(trace, 'line') and hasattr(trace.line, 'color'):
                    color = trace.line.color
                
                if color:
                    colors.append(color)
                
                trace_info.append({
                    'x': list(x_data),
                    'y': list(y_data),
                    'name': name
                })
                
                data_keys.append(name)
                all_x_values.update(x_data)
            
            # Build data rows
            sorted_x = sorted(all_x_values)
            for x_val in sorted_x:
                row = {"x": convert_to_native_type(x_val)}
                for trace in trace_info:
                    # Find corresponding y value
                    try:
                        if x_val in trace['x']:
                            idx = trace['x'].index(x_val)
                            row[trace['name']] = convert_to_native_type(trace['y'][idx])
                    except:
                        pass
                data.append(row)
            
            # Build config
            config = {
                "type": chart_type,
                "title": title if title else None,
                "xAxisKey": "x",
                "dataKeys": data_keys,
                "colors": colors if colors else None,
            }
            
            if x_label:
                config["xAxisTitle"] = x_label
            if y_label:
                config["yAxisTitle"] = y_label
            
            # Remove None values
            config = {k: v for k, v in config.items() if v is not None}
            
            return {
                "config": config,
                "data": data
            }
    
    except Exception as e:
        print(f"⚠️ [CONVERTER] Plotly conversion error: {e}")
        return None


def infer_chart_type(fig_obj: Any) -> str:
    """
    Infer the type of chart library used.
    
    Args:
        fig_obj: Chart object (matplotlib Figure or plotly Figure)
        
    Returns:
        'matplotlib', 'plotly', or 'unknown'
    """
    if isinstance(fig_obj, plt.Figure):
        return 'matplotlib'
    elif isinstance(fig_obj, go.Figure) or hasattr(fig_obj, 'to_json'):
        return 'plotly'
    else:
        return 'unknown'
