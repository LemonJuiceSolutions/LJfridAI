import type { MultiYearFinancialData, FinancialRatios, AnalysisRating } from './xbrl-parser';
import type { WidgetConfig } from './types';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AnalysisNodeResult {
  rating: AnalysisRating;
  score: number;
  description: string;
}

export interface AnalysisChartConfig {
  id: string;
  title: string;
  type: WidgetConfig['type'];
  dataExtractor: (data: MultiYearFinancialData, ratios: FinancialRatios[]) => {
    data: Record<string, unknown>[];
    config: Partial<WidgetConfig>;
  };
}

export interface AnalysisTreeNode {
  id: string;
  label: string;
  icon: string;
  description: string;
  evaluate: (ratios: FinancialRatios[], data: MultiYearFinancialData) => AnalysisNodeResult;
  charts: AnalysisChartConfig[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (n: number) => Math.round(n * 10) / 10;

function ratingFromScore(score: number): AnalysisRating {
  if (score >= 80) return 'Eccellente';
  if (score >= 60) return 'Positivo';
  if (score >= 40) return 'Nella Media';
  if (score >= 20) return 'Negativo';
  return 'Critico';
}

// ─── Analysis Nodes ──────────────────────────────────────────────────────────

export const analysisTree: AnalysisTreeNode[] = [
  // ── 1. Equilibrio Patrimoniale ────────────────────────────────────────
  {
    id: 'equilibrio-patrimoniale',
    label: 'Equilibrio Patrimoniale',
    icon: 'Scale',
    description: 'Composizione di attivo e passivo',
    evaluate: (ratios) => {
      const r = ratios[ratios.length - 1];
      let score = 0;
      if (r.rapportoCapitaleProprioPassivo > 30) score += 35;
      else if (r.rapportoCapitaleProprioPassivo > 20) score += 25;
      else if (r.rapportoCapitaleProprioPassivo > 10) score += 15;
      if (r.capitaleCircolanteNetto > 0) score += 35;
      else score += 10;
      if (r.rapportoCircolanteAttivo > 50) score += 30;
      else if (r.rapportoCircolanteAttivo > 30) score += 20;
      else score += 10;
      return {
        rating: ratingFromScore(score),
        score,
        description: `PN/Passivo: ${fmt(r.rapportoCapitaleProprioPassivo)}%, CCN: ${Math.round(r.capitaleCircolanteNetto).toLocaleString('it-IT')}`,
      };
    },
    charts: [
      {
        id: 'composizione-attivo',
        title: 'Composizione Attivo',
        type: 'bar-chart',
        dataExtractor: (data) => ({
          data: data.years.map(y => ({
            Anno: String(y.year),
            Immobilizzazioni: y.statoPatrimoniale.totaleImmobilizzazioni,
            'Attivo Circolante': y.statoPatrimoniale.totaleAttivoCircolante,
            'Ratei/Risconti': y.statoPatrimoniale.rateiRiscontiAttivo,
          })),
          config: {
            type: 'bar-chart',
            title: 'Composizione Attivo',
            xAxisKey: 'Anno',
            dataKeys: ['Immobilizzazioni', 'Attivo Circolante', 'Ratei/Risconti'],
            yAxisTitle: 'EUR',
          },
        }),
      },
      {
        id: 'composizione-passivo',
        title: 'Composizione Passivo',
        type: 'bar-chart',
        dataExtractor: (data) => ({
          data: data.years.map(y => ({
            Anno: String(y.year),
            'Patrimonio Netto': y.statoPatrimoniale.totalePatrimonioNetto,
            TFR: y.statoPatrimoniale.fondoTFR,
            'Fondi Rischi': y.statoPatrimoniale.totaleFondiRischiOneri,
            Debiti: y.statoPatrimoniale.totaleDebiti,
          })),
          config: {
            type: 'bar-chart',
            title: 'Composizione Passivo',
            xAxisKey: 'Anno',
            dataKeys: ['Patrimonio Netto', 'TFR', 'Fondi Rischi', 'Debiti'],
            yAxisTitle: 'EUR',
          },
        }),
      },
    ],
  },

  // ── 2. Equilibrio Finanziario ─────────────────────────────────────────
  {
    id: 'equilibrio-finanziario',
    label: 'Equilibrio Finanziario',
    icon: 'Landmark',
    description: 'Liquidita\' e posizione finanziaria',
    evaluate: (ratios) => {
      const r = ratios[ratios.length - 1];
      let score = 0;
      if (r.currentRatio > 1.5) score += 30;
      else if (r.currentRatio > 1) score += 20;
      else score += 5;
      if (r.quickRatio > 1) score += 25;
      else if (r.quickRatio > 0.7) score += 15;
      if (r.pfnEbitda < 3) score += 25;
      else if (r.pfnEbitda < 6) score += 15;
      if (r.cashRatio > 0.5) score += 20;
      else if (r.cashRatio > 0.2) score += 10;
      return {
        rating: ratingFromScore(score),
        score,
        description: `Current Ratio: ${fmt(r.currentRatio)}, PFN/EBITDA: ${fmt(r.pfnEbitda)}`,
      };
    },
    charts: [
      {
        id: 'indici-liquidita',
        title: 'Indici di Liquidita\'',
        type: 'bar-chart',
        dataExtractor: (_data, ratios) => ({
          data: ratios.map(r => ({
            Anno: String(r.year),
            'Current Ratio': fmt(r.currentRatio),
            'Quick Ratio': fmt(r.quickRatio),
            'Cash Ratio': fmt(r.cashRatio),
          })),
          config: {
            type: 'bar-chart',
            title: 'Indici di Liquidita\'',
            xAxisKey: 'Anno',
            dataKeys: ['Current Ratio', 'Quick Ratio', 'Cash Ratio'],
          },
        }),
      },
      {
        id: 'pfn-ebitda',
        title: 'PFN / EBITDA',
        type: 'bar-chart',
        dataExtractor: (_data, ratios) => ({
          data: ratios.map(r => ({
            Anno: String(r.year),
            'PFN/EBITDA': fmt(r.pfnEbitda),
          })),
          config: {
            type: 'bar-chart',
            title: 'PFN / EBITDA',
            xAxisKey: 'Anno',
            dataKeys: ['PFN/EBITDA'],
          },
        }),
      },
    ],
  },

  // ── 3. Equilibrio Economico ───────────────────────────────────────────
  {
    id: 'equilibrio-economico',
    label: 'Equilibrio Economico',
    icon: 'TrendingUp',
    description: 'Struttura costi e margini operativi',
    evaluate: (ratios) => {
      const r = ratios[ratios.length - 1];
      let score = 0;
      if (r.ebitdaMargin > 15) score += 35;
      else if (r.ebitdaMargin > 10) score += 25;
      else if (r.ebitdaMargin > 5) score += 15;
      if (r.ebit > 0) score += 30;
      else score += 5;
      if (r.ros > 5) score += 20;
      else if (r.ros > 0) score += 10;
      if (r.crescitaRicavi !== null && r.crescitaRicavi > 0) score += 15;
      else score += 5;
      return {
        rating: ratingFromScore(score),
        score,
        description: `EBITDA Margin: ${fmt(r.ebitdaMargin)}%, ROS: ${fmt(r.ros)}%`,
      };
    },
    charts: [
      {
        id: 'struttura-costi',
        title: 'Struttura Costi (% su Ricavi)',
        type: 'bar-chart',
        dataExtractor: (_data, ratios) => ({
          data: ratios.map(r => ({
            Anno: String(r.year),
            'Materie Prime': fmt(r.incidenzaMaterie),
            Servizi: fmt(r.incidenzaServizi),
            Personale: fmt(r.incidenzaPersonale),
            Ammortamenti: fmt(r.incidenzaAmmortamenti),
            'Oneri Finanziari': fmt(r.incidenzaOneriFinanziari),
          })),
          config: {
            type: 'bar-chart',
            title: 'Struttura Costi (% su Ricavi)',
            xAxisKey: 'Anno',
            dataKeys: ['Materie Prime', 'Servizi', 'Personale', 'Ammortamenti', 'Oneri Finanziari'],
            yAxisTitle: '%',
          },
        }),
      },
      {
        id: 'margini-trend',
        title: 'Margini Operativi Trend',
        type: 'line-chart',
        dataExtractor: (data, ratios) => ({
          data: ratios.map((r, i) => ({
            Anno: String(r.year),
            'EBITDA': data.years[i].contoEconomico.differenzaValoreCosti + data.years[i].contoEconomico.totaleAmmortamenti,
            'EBIT': data.years[i].contoEconomico.differenzaValoreCosti,
            'Utile Netto': data.years[i].contoEconomico.utilePerditaEsercizio,
          })),
          config: {
            type: 'line-chart',
            title: 'Margini Operativi Trend',
            xAxisKey: 'Anno',
            dataKeys: ['EBITDA', 'EBIT', 'Utile Netto'],
            yAxisTitle: 'EUR',
          },
        }),
      },
    ],
  },

  // ── 4. Sostenibilita' del Debito ──────────────────────────────────────
  {
    id: 'sostenibilita-debito',
    label: 'Sostenibilita\' del Debito',
    icon: 'Building2',
    description: 'Capacita\' di sostenere il debito',
    evaluate: (ratios) => {
      const r = ratios[ratios.length - 1];
      let score = 0;
      if (r.debitoBancarioEbitda < 3) score += 35;
      else if (r.debitoBancarioEbitda < 6) score += 20;
      else score += 5;
      if (r.costoIndebitamento < 5) score += 25;
      else if (r.costoIndebitamento < 8) score += 15;
      if (r.leverageRatio < 2) score += 25;
      else if (r.leverageRatio < 4) score += 15;
      else score += 5;
      score += 15; // base
      return {
        rating: ratingFromScore(score),
        score,
        description: `Debito Bancario/EBITDA: ${fmt(r.debitoBancarioEbitda)}, Leverage: ${fmt(r.leverageRatio)}`,
      };
    },
    charts: [
      {
        id: 'leverage-trend',
        title: 'Leverage e Costo Debito',
        type: 'bar-chart',
        dataExtractor: (_data, ratios) => ({
          data: ratios.map(r => ({
            Anno: String(r.year),
            'Leverage (Debiti/PN)': fmt(r.leverageRatio),
            'Debito Bancario/EBITDA': fmt(r.debitoBancarioEbitda),
          })),
          config: {
            type: 'bar-chart',
            title: 'Leverage e Costo Debito',
            xAxisKey: 'Anno',
            dataKeys: ['Leverage (Debiti/PN)', 'Debito Bancario/EBITDA'],
          },
        }),
      },
    ],
  },

  // ── 5. Trend di Sviluppo ──────────────────────────────────────────────
  {
    id: 'trend-sviluppo',
    label: 'Trend di Sviluppo',
    icon: 'LineChart',
    description: 'Evoluzione di ricavi, utile e patrimonio',
    evaluate: (ratios) => {
      const r = ratios[ratios.length - 1];
      let score = 0;
      if (r.crescitaRicavi !== null) {
        if (r.crescitaRicavi > 5) score += 25;
        else if (r.crescitaRicavi > 0) score += 15;
        else score += 5;
      } else score += 10;
      if (r.crescitaUtile !== null) {
        if (r.crescitaUtile > 20) score += 25;
        else if (r.crescitaUtile > 0) score += 15;
        else score += 5;
      } else score += 10;
      if (r.crescitaPN !== null) {
        if (r.crescitaPN > 10) score += 25;
        else if (r.crescitaPN > 0) score += 15;
        else score += 5;
      } else score += 10;
      score += 15; // base
      return {
        rating: ratingFromScore(score),
        score,
        description: `Crescita ricavi: ${r.crescitaRicavi !== null ? fmt(r.crescitaRicavi) + '%' : 'N/A'}, Utile: ${r.crescitaUtile !== null ? fmt(r.crescitaUtile) + '%' : 'N/A'}`,
      };
    },
    charts: [
      {
        id: 'evoluzione-ricavi',
        title: 'Evoluzione Ricavi e Utile',
        type: 'bar-chart',
        dataExtractor: (data) => ({
          data: data.years.map(y => ({
            Anno: String(y.year),
            'Valore Produzione': y.contoEconomico.totaleValoreProduzione,
            'Utile Netto': y.contoEconomico.utilePerditaEsercizio,
          })),
          config: {
            type: 'bar-chart',
            title: 'Evoluzione Ricavi e Utile',
            xAxisKey: 'Anno',
            dataKeys: ['Valore Produzione', 'Utile Netto'],
            yAxisTitle: 'EUR',
          },
        }),
      },
      {
        id: 'evoluzione-patrimonio',
        title: 'Evoluzione Patrimonio',
        type: 'area-chart',
        dataExtractor: (data) => ({
          data: data.years.map(y => ({
            Anno: String(y.year),
            'Totale Attivo': y.statoPatrimoniale.totaleAttivo,
            'Patrimonio Netto': y.statoPatrimoniale.totalePatrimonioNetto,
          })),
          config: {
            type: 'area-chart',
            title: 'Evoluzione Patrimonio',
            xAxisKey: 'Anno',
            dataKeys: ['Totale Attivo', 'Patrimonio Netto'],
            yAxisTitle: 'EUR',
          },
        }),
      },
    ],
  },

  // ── 6. Indicatori di Redditivita' ─────────────────────────────────────
  {
    id: 'indicatori-redditivita',
    label: 'Indicatori di Redditivita\'',
    icon: 'Percent',
    description: 'ROE, ROI, ROS',
    evaluate: (ratios) => {
      const r = ratios[ratios.length - 1];
      let score = 0;
      if (r.roe > 15) score += 30;
      else if (r.roe > 5) score += 20;
      else if (r.roe > 0) score += 10;
      if (r.roi > 10) score += 25;
      else if (r.roi > 5) score += 15;
      else if (r.roi > 0) score += 8;
      if (r.ros > 5) score += 25;
      else if (r.ros > 0) score += 15;
      score += 15; // base
      return {
        rating: ratingFromScore(score),
        score,
        description: `ROE: ${fmt(r.roe)}%, ROI: ${fmt(r.roi)}%, ROS: ${fmt(r.ros)}%`,
      };
    },
    charts: [
      {
        id: 'trend-indicatori',
        title: 'Indicatori di Redditivita\'',
        type: 'line-chart',
        dataExtractor: (_data, ratios) => ({
          data: ratios.map(r => ({
            Anno: String(r.year),
            'ROE %': fmt(r.roe),
            'ROI %': fmt(r.roi),
            'ROS %': fmt(r.ros),
            'EBITDA Margin %': fmt(r.ebitdaMargin),
          })),
          config: {
            type: 'line-chart',
            title: 'Indicatori di Redditivita\'',
            xAxisKey: 'Anno',
            dataKeys: ['ROE %', 'ROI %', 'ROS %', 'EBITDA Margin %'],
          },
        }),
      },
    ],
  },

  // ── 7. Gestione Capitale Circolante ───────────────────────────────────
  {
    id: 'capitale-circolante',
    label: 'Gestione Capitale Circolante',
    icon: 'ArrowLeftRight',
    description: 'Giorni incasso, pagamento e ciclo di cassa',
    evaluate: (ratios) => {
      const r = ratios[ratios.length - 1];
      let score = 0;
      if (r.giorniIncassoCrediti < 60) score += 25;
      else if (r.giorniIncassoCrediti < 90) score += 20;
      else if (r.giorniIncassoCrediti < 120) score += 10;
      else score += 5;
      if (r.cicloCassa < 30) score += 25;
      else if (r.cicloCassa < 60) score += 20;
      else if (r.cicloCassa < 90) score += 10;
      if (r.giorniGiacenzaMagazzino < 30) score += 20;
      else if (r.giorniGiacenzaMagazzino < 60) score += 15;
      else score += 5;
      score += 20; // base
      return {
        rating: ratingFromScore(score),
        score,
        description: `Incasso: ${r.giorniIncassoCrediti}gg, Pagamento: ${r.giorniPagamentoFornitori}gg, Ciclo: ${r.cicloCassa}gg`,
      };
    },
    charts: [
      {
        id: 'giorni-ciclo',
        title: 'Giorni Incasso / Pagamento',
        type: 'bar-chart',
        dataExtractor: (_data, ratios) => ({
          data: ratios.map(r => ({
            Anno: String(r.year),
            'Giorni Incasso': r.giorniIncassoCrediti,
            'Giorni Pagamento': r.giorniPagamentoFornitori,
            'Giorni Magazzino': r.giorniGiacenzaMagazzino,
          })),
          config: {
            type: 'bar-chart',
            title: 'Giorni Incasso / Pagamento',
            xAxisKey: 'Anno',
            dataKeys: ['Giorni Incasso', 'Giorni Pagamento', 'Giorni Magazzino'],
            yAxisTitle: 'Giorni',
          },
        }),
      },
      {
        id: 'ciclo-cassa',
        title: 'Ciclo di Cassa',
        type: 'line-chart',
        dataExtractor: (_data, ratios) => ({
          data: ratios.map(r => ({
            Anno: String(r.year),
            'Ciclo di Cassa (gg)': r.cicloCassa,
          })),
          config: {
            type: 'line-chart',
            title: 'Ciclo di Cassa',
            xAxisKey: 'Anno',
            dataKeys: ['Ciclo di Cassa (gg)'],
            yAxisTitle: 'Giorni',
          },
        }),
      },
    ],
  },
];

// Helper to find a node by id
export function findAnalysisNode(nodeId: string): AnalysisTreeNode | undefined {
  return analysisTree.find(n => n.id === nodeId);
}

// Helper to find a chart config within a node
export function findChartConfig(nodeId: string, chartId: string): AnalysisChartConfig | undefined {
  const node = findAnalysisNode(nodeId);
  return node?.charts.find(c => c.id === chartId);
}
