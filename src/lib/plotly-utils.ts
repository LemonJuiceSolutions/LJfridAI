/**
 * Plotly utility functions shared between client (PlotlyStyleEditor) and server (email actions).
 * Pure functions with no React or browser dependencies.
 */

export interface PlotlyStyleOverrides {
  paper_bgcolor?: string;
  plot_bgcolor?: string;
  font_family?: string;
  font_size?: number;
  font_color?: string;
  title_font_size?: number;
  title_font_color?: string;
  margin_l?: number;
  margin_r?: number;
  margin_t?: number;
  margin_b?: number;
  showlegend?: boolean;
  legend_orientation?: 'v' | 'h';
  legend_x?: number;
  legend_y?: number;
  xaxis_showgrid?: boolean;
  yaxis_showgrid?: boolean;
  xaxis_gridcolor?: string;
  yaxis_gridcolor?: string;
  xaxis_griddash?: 'solid' | 'dash' | 'dot' | 'dashdot';
  yaxis_griddash?: 'solid' | 'dash' | 'dot' | 'dashdot';
  xaxis_title_font_size?: number;
  yaxis_title_font_size?: number;
  xaxis_tickfont_size?: number;
  yaxis_tickfont_size?: number;
  colorway?: string[];
  /** Per-trace color overrides keyed by trace index */
  trace_colors?: Record<number, string>;
  height?: number;
}

/**
 * Apply PlotlyStyleOverrides to a Plotly figure JSON (deep merge into layout).
 * Returns a new figure object (does not mutate the original).
 */
export function applyPlotlyOverrides(
  originalFigure: any,
  overrides: PlotlyStyleOverrides
): any {
  if (!originalFigure) return originalFigure;

  const fig = JSON.parse(JSON.stringify(originalFigure));
  const layout = fig.layout || {};

  if (overrides.paper_bgcolor !== undefined) layout.paper_bgcolor = overrides.paper_bgcolor;
  if (overrides.plot_bgcolor !== undefined) layout.plot_bgcolor = overrides.plot_bgcolor;

  if (!layout.font) layout.font = {};
  if (overrides.font_family !== undefined) layout.font.family = overrides.font_family;
  if (overrides.font_size !== undefined) layout.font.size = overrides.font_size;
  if (overrides.font_color !== undefined) layout.font.color = overrides.font_color;

  if (layout.title && typeof layout.title === 'object') {
    if (!layout.title.font) layout.title.font = {};
    if (overrides.title_font_size !== undefined) layout.title.font.size = overrides.title_font_size;
    if (overrides.title_font_color !== undefined) layout.title.font.color = overrides.title_font_color;
  }

  if (!layout.margin) layout.margin = {};
  if (overrides.margin_l !== undefined) layout.margin.l = overrides.margin_l;
  if (overrides.margin_r !== undefined) layout.margin.r = overrides.margin_r;
  if (overrides.margin_t !== undefined) layout.margin.t = overrides.margin_t;
  if (overrides.margin_b !== undefined) layout.margin.b = overrides.margin_b;

  if (overrides.showlegend !== undefined) layout.showlegend = overrides.showlegend;
  if (!layout.legend) layout.legend = {};
  if (overrides.legend_orientation !== undefined) layout.legend.orientation = overrides.legend_orientation;
  if (overrides.legend_x !== undefined) layout.legend.x = overrides.legend_x;
  if (overrides.legend_y !== undefined) layout.legend.y = overrides.legend_y;

  const axisKeys = Object.keys(layout).filter(k => k.startsWith('xaxis') || k.startsWith('yaxis'));
  if (!axisKeys.includes('xaxis') && (overrides.xaxis_showgrid !== undefined || overrides.xaxis_gridcolor !== undefined || overrides.xaxis_griddash !== undefined || overrides.xaxis_title_font_size !== undefined || overrides.xaxis_tickfont_size !== undefined)) {
    layout.xaxis = layout.xaxis || {};
    axisKeys.push('xaxis');
  }
  if (!axisKeys.includes('yaxis') && (overrides.yaxis_showgrid !== undefined || overrides.yaxis_gridcolor !== undefined || overrides.yaxis_griddash !== undefined || overrides.yaxis_title_font_size !== undefined || overrides.yaxis_tickfont_size !== undefined)) {
    layout.yaxis = layout.yaxis || {};
    axisKeys.push('yaxis');
  }

  for (const key of axisKeys) {
    const isX = key.startsWith('xaxis');
    const axis = layout[key] || {};

    if (isX) {
      if (overrides.xaxis_showgrid !== undefined) axis.showgrid = overrides.xaxis_showgrid;
      if (overrides.xaxis_gridcolor !== undefined) axis.gridcolor = overrides.xaxis_gridcolor;
      if (overrides.xaxis_griddash !== undefined) axis.griddash = overrides.xaxis_griddash;
      if (overrides.xaxis_title_font_size !== undefined) {
        if (!axis.title) axis.title = {};
        if (typeof axis.title === 'string') axis.title = { text: axis.title };
        if (!axis.title.font) axis.title.font = {};
        axis.title.font.size = overrides.xaxis_title_font_size;
      }
      if (overrides.xaxis_tickfont_size !== undefined) {
        if (!axis.tickfont) axis.tickfont = {};
        axis.tickfont.size = overrides.xaxis_tickfont_size;
      }
    } else {
      if (overrides.yaxis_showgrid !== undefined) axis.showgrid = overrides.yaxis_showgrid;
      if (overrides.yaxis_gridcolor !== undefined) axis.gridcolor = overrides.yaxis_gridcolor;
      if (overrides.yaxis_griddash !== undefined) axis.griddash = overrides.yaxis_griddash;
      if (overrides.yaxis_title_font_size !== undefined) {
        if (!axis.title) axis.title = {};
        if (typeof axis.title === 'string') axis.title = { text: axis.title };
        if (!axis.title.font) axis.title.font = {};
        axis.title.font.size = overrides.yaxis_title_font_size;
      }
      if (overrides.yaxis_tickfont_size !== undefined) {
        if (!axis.tickfont) axis.tickfont = {};
        axis.tickfont.size = overrides.yaxis_tickfont_size;
      }
    }

    layout[key] = axis;
  }

  if (overrides.colorway && overrides.colorway.length > 0) {
    layout.colorway = overrides.colorway;
  }

  if (overrides.height !== undefined) layout.height = overrides.height;

  fig.layout = layout;

  // Apply per-trace color overrides
  if (overrides.trace_colors && fig.data) {
    for (const [idxStr, color] of Object.entries(overrides.trace_colors)) {
      const idx = Number(idxStr);
      if (idx >= 0 && idx < fig.data.length && color) {
        const trace = fig.data[idx];
        if (trace.marker) {
          if (Array.isArray(trace.marker.color)) {
            // Replace all per-point colors with the override
            trace.marker.color = trace.marker.color.map(() => color);
          } else {
            trace.marker.color = color;
          }
        } else if (trace.line) {
          trace.line.color = color;
        } else {
          trace.marker = { color };
        }
      }
    }
  }

  return fig;
}

/**
 * Generate a self-contained HTML string from a Plotly figure JSON.
 */
export function plotlyJsonToHtml(figure: any): string {
  const figStr = JSON.stringify(figure);
  const hasHeight = figure?.layout?.height;
  return `<!DOCTYPE html>
<html><head>
<script src="https://cdn.plot.ly/plotly-2.35.2.min.js"></script>
<style>
body{margin:0;padding:0;overflow:auto}
#chart{width:100%;${hasHeight ? '' : 'height:100vh;'}}
</style>
</head><body>
<div id="chart"></div>
<script>
var fig=${figStr};
Plotly.newPlot('chart',fig.data,fig.layout,{responsive:true,displayModeBar:true});
</script>
</body></html>`;
}
