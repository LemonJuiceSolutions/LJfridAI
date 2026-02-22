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

// ── Chart Style Presets ──

export interface PlotlyStylePreset {
  id: string;
  label: string;
  description: string;
  overrides: PlotlyStyleOverrides;
}

export const PLOTLY_STYLE_PRESETS: PlotlyStylePreset[] = [
  // ─── CORPORATE / CONSULTING ───
  {
    id: 'mckinsey',
    label: 'McKinsey',
    description: 'Blu scuro su bianco, palette controllata — top consulting',
    overrides: {
      paper_bgcolor: '#ffffff', plot_bgcolor: '#ffffff',
      font_family: 'Helvetica Neue', font_size: 12, font_color: '#2c2c2c',
      title_font_size: 16, title_font_color: '#00263a',
      colorway: ['#00263a', '#0073b7', '#6cbfef', '#a0a0a0', '#d4d4d4', '#f5c242', '#e87722', '#c9302c'],
      xaxis_showgrid: false, yaxis_showgrid: true,
      yaxis_gridcolor: '#e8e8e8', yaxis_griddash: 'solid',
      showlegend: true, legend_orientation: 'h', legend_x: 0, legend_y: -0.15,
      margin_t: 60, margin_b: 60, margin_l: 60, margin_r: 20,
    },
  },
  {
    id: 'deloitte',
    label: 'Deloitte',
    description: 'Verde Deloitte su bianco — audit e advisory',
    overrides: {
      paper_bgcolor: '#ffffff', plot_bgcolor: '#ffffff',
      font_family: 'Arial', font_size: 12, font_color: '#2d2d2d',
      title_font_size: 16, title_font_color: '#000000',
      colorway: ['#86bc25', '#00a3e0', '#43b02a', '#0076a8', '#62b5e5', '#97999b', '#c4d600', '#009a44'],
      xaxis_showgrid: false, yaxis_showgrid: true,
      yaxis_gridcolor: '#eeeeee', yaxis_griddash: 'solid',
      showlegend: true, legend_orientation: 'h', legend_x: 0, legend_y: -0.15,
      margin_t: 60, margin_b: 60, margin_l: 60, margin_r: 20,
    },
  },
  {
    id: 'kpmg',
    label: 'KPMG',
    description: 'Blu royal intenso — revisione e consulenza istituzionale',
    overrides: {
      paper_bgcolor: '#ffffff', plot_bgcolor: '#ffffff',
      font_family: 'Arial', font_size: 12, font_color: '#1e1e1e',
      title_font_size: 16, title_font_color: '#00338d',
      colorway: ['#00338d', '#0091da', '#483698', '#470a68', '#00b8f1', '#6d2077', '#009fdf', '#1a3668'],
      xaxis_showgrid: false, yaxis_showgrid: true,
      yaxis_gridcolor: '#e8ecf4', yaxis_griddash: 'solid',
      showlegend: true, legend_orientation: 'h', legend_x: 0, legend_y: -0.15,
      margin_t: 60, margin_b: 60, margin_l: 60, margin_r: 20,
    },
  },
  {
    id: 'pwc',
    label: 'PwC',
    description: 'Arancione e carbone — stile PricewaterhouseCoopers',
    overrides: {
      paper_bgcolor: '#ffffff', plot_bgcolor: '#ffffff',
      font_family: 'Georgia', font_size: 12, font_color: '#2d2d2d',
      title_font_size: 16, title_font_color: '#2d2d2d',
      colorway: ['#e0301e', '#d04a02', '#eb8c00', '#ffb600', '#2d2d2d', '#7d7d7d', '#b8b8b8', '#464646'],
      xaxis_showgrid: false, yaxis_showgrid: true,
      yaxis_gridcolor: '#eeeeee', yaxis_griddash: 'solid',
      showlegend: true, legend_orientation: 'h', legend_x: 0, legend_y: -0.15,
      margin_t: 60, margin_b: 60, margin_l: 60, margin_r: 20,
    },
  },
  // ─── FINANZA & DATI ───
  {
    id: 'bloomberg',
    label: 'Bloomberg',
    description: 'Terminale nero con arancio — stile Bloomberg',
    overrides: {
      paper_bgcolor: '#000000', plot_bgcolor: '#0d0d0d',
      font_family: 'Consolas', font_size: 11, font_color: '#cccccc',
      title_font_size: 14, title_font_color: '#ff8c00',
      colorway: ['#ff8c00', '#00cc66', '#ff3333', '#3399ff', '#ffcc00', '#cc66ff', '#00cccc', '#ff6699'],
      xaxis_showgrid: true, yaxis_showgrid: true,
      xaxis_gridcolor: '#1a1a1a', yaxis_gridcolor: '#1a1a1a',
      xaxis_griddash: 'solid', yaxis_griddash: 'solid',
      showlegend: true, legend_orientation: 'v',
      margin_t: 50, margin_b: 50, margin_l: 60, margin_r: 20,
    },
  },
  {
    id: 'financial-times',
    label: 'Financial Times',
    description: 'Salmone caldo e nero — giornalismo finanziario',
    overrides: {
      paper_bgcolor: '#fff1e5', plot_bgcolor: '#fff1e5',
      font_family: 'Georgia', font_size: 12, font_color: '#33302e',
      title_font_size: 16, title_font_color: '#1a1a1a',
      colorway: ['#0f5499', '#990f3d', '#ff7faa', '#00994d', '#ffd700', '#593d7f', '#ff8c38', '#669999'],
      xaxis_showgrid: false, yaxis_showgrid: true,
      yaxis_gridcolor: '#e0cdb8', yaxis_griddash: 'solid',
      showlegend: true, legend_orientation: 'h', legend_x: 0, legend_y: -0.15,
      margin_t: 60, margin_b: 60, margin_l: 50, margin_r: 20,
    },
  },
  {
    id: 'economist',
    label: 'The Economist',
    description: 'Rosso e bianco, serif — settimanale economico',
    overrides: {
      paper_bgcolor: '#ffffff', plot_bgcolor: '#ffffff',
      font_family: 'Georgia', font_size: 12, font_color: '#1d1d1b',
      title_font_size: 16, title_font_color: '#e3120b',
      colorway: ['#e3120b', '#0f5499', '#3f9c35', '#fbb040', '#6c4f97', '#0098db', '#ef6c00', '#666666'],
      xaxis_showgrid: false, yaxis_showgrid: true,
      yaxis_gridcolor: '#e0e0e0', yaxis_griddash: 'solid',
      showlegend: true, legend_orientation: 'h', legend_x: 0, legend_y: -0.15,
      margin_t: 60, margin_b: 60, margin_l: 50, margin_r: 20,
    },
  },
  {
    id: 'excel-classic',
    label: 'Excel Classic',
    description: 'Palette classica Excel — familiare e leggibile',
    overrides: {
      paper_bgcolor: '#ffffff', plot_bgcolor: '#ffffff',
      font_family: 'Calibri', font_size: 11, font_color: '#000000',
      title_font_size: 14, title_font_color: '#1f3864',
      colorway: ['#4472c4', '#ed7d31', '#a5a5a5', '#ffc000', '#5b9bd5', '#70ad47', '#264478', '#9b57a0'],
      xaxis_showgrid: false, yaxis_showgrid: true,
      yaxis_gridcolor: '#d0d0d0', yaxis_griddash: 'solid',
      showlegend: true, legend_orientation: 'v',
      margin_t: 60, margin_b: 50, margin_l: 60, margin_r: 20,
    },
  },
  // ─── CORPORATE MODERNI ───
  {
    id: 'swiss-clean',
    label: 'Swiss Clean',
    description: 'Design svizzero — Helvetica, griglia minimal, palette neutra',
    overrides: {
      paper_bgcolor: '#ffffff', plot_bgcolor: '#ffffff',
      font_family: 'Helvetica Neue', font_size: 12, font_color: '#333333',
      title_font_size: 16, title_font_color: '#111111',
      colorway: ['#111111', '#555555', '#999999', '#cc0000', '#0066cc', '#339933', '#cc6600', '#6633cc'],
      xaxis_showgrid: false, yaxis_showgrid: true,
      yaxis_gridcolor: '#eeeeee', yaxis_griddash: 'solid',
      showlegend: true, legend_orientation: 'h', legend_x: 0, legend_y: -0.15,
      margin_t: 60, margin_b: 60, margin_l: 50, margin_r: 20,
    },
  },
  {
    id: 'flat-modern',
    label: 'Flat Modern',
    description: 'Colori piatti e vivaci — stile SaaS dashboard',
    overrides: {
      paper_bgcolor: '#f8f9fa', plot_bgcolor: '#ffffff',
      font_family: 'Inter', font_size: 12, font_color: '#374151',
      title_font_size: 16, title_font_color: '#111827',
      colorway: ['#2563eb', '#059669', '#d97706', '#dc2626', '#7c3aed', '#db2777', '#0891b2', '#65a30d'],
      xaxis_showgrid: false, yaxis_showgrid: true,
      yaxis_gridcolor: '#f3f4f6', yaxis_griddash: 'solid',
      showlegend: true, legend_orientation: 'h', legend_x: 0, legend_y: -0.15,
      margin_t: 60, margin_b: 60, margin_l: 50, margin_r: 20,
    },
  },
  {
    id: 'notion-style',
    label: 'Notion Style',
    description: 'Bianco e nero leggero — stile Notion',
    overrides: {
      paper_bgcolor: '#ffffff', plot_bgcolor: '#ffffff',
      font_family: 'Inter', font_size: 12, font_color: '#37352f',
      title_font_size: 16, title_font_color: '#37352f',
      colorway: ['#2383e2', '#5c6ac4', '#d44c47', '#448361', '#cf9f00', '#9065b0', '#d9730d', '#787774'],
      xaxis_showgrid: false, yaxis_showgrid: true,
      yaxis_gridcolor: '#f1f1ef', yaxis_griddash: 'solid',
      showlegend: true, legend_orientation: 'h', legend_x: 0, legend_y: -0.15,
      margin_t: 60, margin_b: 60, margin_l: 50, margin_r: 20,
    },
  },
  {
    id: 'stripe-docs',
    label: 'Stripe Docs',
    description: 'Viola e blu — stile documentazione Stripe',
    overrides: {
      paper_bgcolor: '#f6f9fc', plot_bgcolor: '#ffffff',
      font_family: 'Inter', font_size: 12, font_color: '#525f7f',
      title_font_size: 16, title_font_color: '#32325d',
      colorway: ['#6772e5', '#3ecf8e', '#e56b6f', '#f5be58', '#0d6efd', '#24b47e', '#fd7e14', '#8898aa'],
      xaxis_showgrid: false, yaxis_showgrid: true,
      yaxis_gridcolor: '#f0f3f7', yaxis_griddash: 'solid',
      showlegend: true, legend_orientation: 'h', legend_x: 0, legend_y: -0.15,
      margin_t: 60, margin_b: 60, margin_l: 50, margin_r: 20,
    },
  },
  // ─── ELEGANTI / LUSSO ───
  {
    id: 'black-tie',
    label: 'Black Tie',
    description: 'Nero assoluto e oro — lusso e prestigio',
    overrides: {
      paper_bgcolor: '#0a0a0a', plot_bgcolor: '#111111',
      font_family: 'Georgia', font_size: 12, font_color: '#d4d4d4',
      title_font_size: 16, title_font_color: '#c9a96e',
      colorway: ['#c9a96e', '#8b7355', '#d4d4d4', '#a67c52', '#e8d5b0', '#7a6845', '#b89f7a', '#666666'],
      xaxis_showgrid: false, yaxis_showgrid: true,
      yaxis_gridcolor: '#1f1f1f', yaxis_griddash: 'solid',
      showlegend: true, legend_orientation: 'h', legend_x: 0, legend_y: -0.15,
      margin_t: 60, margin_b: 60, margin_l: 50, margin_r: 20,
    },
  },
  {
    id: 'marble-rose',
    label: 'Marble Rose',
    description: 'Rosa antico su marmo — raffinato ed elegante',
    overrides: {
      paper_bgcolor: '#faf8f6', plot_bgcolor: '#ffffff',
      font_family: 'Georgia', font_size: 12, font_color: '#4a3f3f',
      title_font_size: 16, title_font_color: '#6b4c4c',
      colorway: ['#c4a6a6', '#8b6f6f', '#b89090', '#a3c4a3', '#6b8e6b', '#d4b8a0', '#9e8080', '#c8b0a0'],
      xaxis_showgrid: false, yaxis_showgrid: true,
      yaxis_gridcolor: '#f0e8e3', yaxis_griddash: 'solid',
      showlegend: true, legend_orientation: 'h', legend_x: 0, legend_y: -0.15,
      margin_t: 60, margin_b: 60, margin_l: 50, margin_r: 20,
    },
  },
  {
    id: 'charcoal-copper',
    label: 'Charcoal & Copper',
    description: 'Carbone scuro e rame — industriale di lusso',
    overrides: {
      paper_bgcolor: '#1a1a1a', plot_bgcolor: '#1f1f1f',
      font_family: 'Arial', font_size: 12, font_color: '#c8c8c8',
      title_font_size: 16, title_font_color: '#d4956a',
      colorway: ['#d4956a', '#5cb85c', '#5bc0de', '#f0ad4e', '#d9534f', '#9b59b6', '#e67e22', '#95a5a6'],
      xaxis_showgrid: false, yaxis_showgrid: true,
      yaxis_gridcolor: '#2a2a2a', yaxis_griddash: 'solid',
      showlegend: true, legend_orientation: 'h', legend_x: 0, legend_y: -0.15,
      margin_t: 60, margin_b: 60, margin_l: 50, margin_r: 20,
    },
  },
  // ─── DARK PROFESSIONALI ───
  {
    id: 'midnight-navy',
    label: 'Midnight Navy',
    description: 'Navy profondo con accenti chiari — report serale',
    overrides: {
      paper_bgcolor: '#0b1426', plot_bgcolor: '#0e1726',
      font_family: 'Inter', font_size: 12, font_color: '#cbd5e1',
      title_font_size: 16, title_font_color: '#e2e8f0',
      colorway: ['#93c5fd', '#34d399', '#fbbf24', '#f87171', '#a78bfa', '#fb923c', '#67e8f9', '#86efac'],
      xaxis_showgrid: false, yaxis_showgrid: true,
      yaxis_gridcolor: '#152033', yaxis_griddash: 'solid',
      showlegend: true, legend_orientation: 'h', legend_x: 0, legend_y: -0.15,
      margin_t: 60, margin_b: 60, margin_l: 50, margin_r: 20,
    },
  },
  {
    id: 'github-dark',
    label: 'GitHub Dark',
    description: 'Grigio scuro — stile GitHub dark mode',
    overrides: {
      paper_bgcolor: '#0d1117', plot_bgcolor: '#0d1117',
      font_family: 'Inter', font_size: 12, font_color: '#c9d1d9',
      title_font_size: 16, title_font_color: '#c9d1d9',
      colorway: ['#58a6ff', '#3fb950', '#d29922', '#f85149', '#bc8cff', '#f778ba', '#79c0ff', '#56d364'],
      xaxis_showgrid: false, yaxis_showgrid: true,
      yaxis_gridcolor: '#21262d', yaxis_griddash: 'solid',
      showlegend: true, legend_orientation: 'h', legend_x: 0, legend_y: -0.15,
      margin_t: 60, margin_b: 60, margin_l: 50, margin_r: 20,
    },
  },
  // ─── TIPOGRAFICI / EDITORIALI ───
  {
    id: 'annual-report',
    label: 'Annual Report',
    description: 'Serif editoriale su bianco — stile bilancio annuale',
    overrides: {
      paper_bgcolor: '#ffffff', plot_bgcolor: '#ffffff',
      font_family: 'Georgia', font_size: 12, font_color: '#333333',
      title_font_size: 16, title_font_color: '#1a1a1a',
      colorway: ['#1a1a1a', '#555555', '#888888', '#1a6b3c', '#b91c1c', '#c9a96e', '#3d5a80', '#aaaaaa'],
      xaxis_showgrid: false, yaxis_showgrid: true,
      yaxis_gridcolor: '#e5e5e5', yaxis_griddash: 'solid',
      showlegend: true, legend_orientation: 'h', legend_x: 0, legend_y: -0.15,
      margin_t: 60, margin_b: 60, margin_l: 50, margin_r: 20,
    },
  },
  {
    id: 'bauhaus',
    label: 'Bauhaus',
    description: 'Geometrico e audace — stile Bauhaus modernista',
    overrides: {
      paper_bgcolor: '#f5f0e8', plot_bgcolor: '#faf6ee',
      font_family: 'Trebuchet MS', font_size: 12, font_color: '#1a1a1a',
      title_font_size: 16, title_font_color: '#e63946',
      colorway: ['#e63946', '#1a1a1a', '#457b9d', '#f4a261', '#2a7f62', '#264653', '#e9c46a', '#6d6875'],
      xaxis_showgrid: false, yaxis_showgrid: true,
      yaxis_gridcolor: '#e0dcd2', yaxis_griddash: 'solid',
      showlegend: true, legend_orientation: 'h', legend_x: 0, legend_y: -0.15,
      margin_t: 60, margin_b: 60, margin_l: 50, margin_r: 20,
    },
  },
];

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
