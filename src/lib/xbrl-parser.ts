import { XMLParser } from 'fast-xml-parser';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ParsedFinancialData {
  year: number;
  fileName: string;
  entity: {
    name: string;
    partitaIva: string;
    sede: string;
    formaGiuridica: string;
    capitaleSociale: number;
    ateco: string;
    dipendenti: number;
  };
  statoPatrimoniale: {
    // ATTIVO
    immobilizzazioniImmateriali: number;
    immobilizzazioniMateriali: number;
    immobilizzazioniFinanziarie: number;
    totaleImmobilizzazioni: number;
    rimanenze: number;
    creditiVersoClienti: number;
    creditiTributari: number;
    creditiVersoAltri: number;
    totaleCrediti: number;
    disponibilitaLiquide: number;
    totaleAttivoCircolante: number;
    rateiRiscontiAttivo: number;
    totaleAttivo: number;
    // PASSIVO
    patrimonioNettoCapitale: number;
    riservaLegale: number;
    altreRiserve: number;
    riservaCoperturaFlussi: number;
    utilePerditaEsercizio: number;
    totalePatrimonioNetto: number;
    fondoTFR: number;
    totaleFondiRischiOneri: number;
    debitiVersoBanche: number;
    debitiBancheBreve: number;
    debitiBancheLungo: number;
    debitiVersoAltriFinanziatori: number;
    debitiVersoFornitori: number;
    debitiTributari: number;
    debitiPrevidenziali: number;
    altriDebiti: number;
    totaleDebiti: number;
    rateiRiscontiPassivo: number;
    totalePassivo: number;
  };
  contoEconomico: {
    ricaviVendite: number;
    variazioneRimanenzeProdotti: number;
    contributiContoEsercizio: number;
    altriRicaviProventi: number;
    totaleAltriRicaviProventi: number;
    totaleValoreProduzione: number;
    costiMateriePrime: number;
    costiServizi: number;
    godimentoBeniTerzi: number;
    totaleCostiPersonale: number;
    salariStipendi: number;
    oneriSociali: number;
    tfr: number;
    ammortamentiImmateriali: number;
    ammortamentiMateriali: number;
    totaleAmmortamenti: number;
    variazioneRimanenzeMaterie: number;
    oneriDiversi: number;
    totaleCostiProduzione: number;
    differenzaValoreCosti: number;
    totaleProventiFinanziari: number;
    totaleOneriFinanziari: number;
    totaleProventiOneriFinanziari: number;
    risultatoPrimaImposte: number;
    imposte: number;
    utilePerditaEsercizio: number;
  };
  rendicontoFinanziario: {
    flussoOperativo: number;
    flussoInvestimento: number;
    flussoFinanziamento: number;
  };
}

export interface MultiYearFinancialData {
  entity: ParsedFinancialData['entity'];
  years: ParsedFinancialData[];
}

export type AnalysisRating = 'Eccellente' | 'Positivo' | 'Nella Media' | 'Negativo' | 'Critico';

export interface FinancialRatios {
  year: number;
  // Equilibrio Patrimoniale
  rapportoImmobilizzazioniAttivo: number;
  rapportoCircolanteAttivo: number;
  rapportoCapitaleProprioPassivo: number;
  rapportoDebitiPassivo: number;
  capitaleCircolanteNetto: number;
  // Equilibrio Finanziario
  currentRatio: number;
  quickRatio: number;
  cashRatio: number;
  pfn: number;
  pfnEbitda: number;
  // Equilibrio Economico
  ebitda: number;
  ebitdaMargin: number;
  ebit: number;
  incidenzaMaterie: number;
  incidenzaServizi: number;
  incidenzaPersonale: number;
  incidenzaAmmortamenti: number;
  incidenzaOneriFinanziari: number;
  // Redditivita
  roe: number;
  roi: number;
  ros: number;
  // Sostenibilita Debito
  debitoBancarioEbitda: number;
  costoIndebitamento: number;
  leverageRatio: number;
  // Gestione Capitale Circolante
  giorniIncassoCrediti: number;
  giorniPagamentoFornitori: number;
  giorniGiacenzaMagazzino: number;
  cicloCassa: number;
  // Trend (vs anno precedente)
  crescitaRicavi: number | null;
  crescitaUtile: number | null;
  crescitaAttivo: number | null;
  crescitaPN: number | null;
}

// ─── XBRL Field Mapping ─────────────────────────────────────────────────────

type FieldMapping = {
  section: 'entity' | 'statoPatrimoniale' | 'contoEconomico' | 'rendicontoFinanziario';
  field: string;
};

const XBRL_FIELD_MAP: Record<string, FieldMapping> = {
  // Entity
  'DatiAnagraficiDenominazione': { section: 'entity', field: 'name' },
  'DatiAnagraficiSede': { section: 'entity', field: 'sede' },
  'DatiAnagraficiPartitaIva': { section: 'entity', field: 'partitaIva' },
  'DatiAnagraficiFormaGiuridica': { section: 'entity', field: 'formaGiuridica' },
  'DatiAnagraficiCapitaleSociale': { section: 'entity', field: 'capitaleSociale' },
  'DatiAnagraficiSettoreAttivitaPrevalenteAteco': { section: 'entity', field: 'ateco' },
  'TotaleDipendentiNumeroMedio': { section: 'entity', field: 'dipendenti' },

  // Stato Patrimoniale - ATTIVO
  'TotaleImmobilizzazioniImmateriali': { section: 'statoPatrimoniale', field: 'immobilizzazioniImmateriali' },
  'TotaleImmobilizzazioniMateriali': { section: 'statoPatrimoniale', field: 'immobilizzazioniMateriali' },
  'TotaleImmobilizzazioniFinanziarie': { section: 'statoPatrimoniale', field: 'immobilizzazioniFinanziarie' },
  'TotaleImmobilizzazioni': { section: 'statoPatrimoniale', field: 'totaleImmobilizzazioni' },
  'TotaleRimanenze': { section: 'statoPatrimoniale', field: 'rimanenze' },
  'CreditiVersoClientiTotaleCreditiVersoClienti': { section: 'statoPatrimoniale', field: 'creditiVersoClienti' },
  'CreditiCreditiTributariTotaleCreditiTributari': { section: 'statoPatrimoniale', field: 'creditiTributari' },
  'CreditiVersoAltriTotaleCreditiVersoAltri': { section: 'statoPatrimoniale', field: 'creditiVersoAltri' },
  'TotaleCrediti': { section: 'statoPatrimoniale', field: 'totaleCrediti' },
  'TotaleDisponibilitaLiquide': { section: 'statoPatrimoniale', field: 'disponibilitaLiquide' },
  'TotaleAttivoCircolante': { section: 'statoPatrimoniale', field: 'totaleAttivoCircolante' },
  'AttivoRateiRisconti': { section: 'statoPatrimoniale', field: 'rateiRiscontiAttivo' },
  'TotaleAttivo': { section: 'statoPatrimoniale', field: 'totaleAttivo' },

  // Stato Patrimoniale - PASSIVO
  'PatrimonioNettoCapitale': { section: 'statoPatrimoniale', field: 'patrimonioNettoCapitale' },
  'PatrimonioNettoRiservaLegale': { section: 'statoPatrimoniale', field: 'riservaLegale' },
  'PatrimonioNettoAltreRiserveDistintamenteIndicateTotaleAltreRiserve': { section: 'statoPatrimoniale', field: 'altreRiserve' },
  'PatrimonioNettoRiservaOperazioniCoperturaFlussiFinanziariAttesi': { section: 'statoPatrimoniale', field: 'riservaCoperturaFlussi' },
  'PatrimonioNettoUtilePerditaEsercizio': { section: 'statoPatrimoniale', field: 'utilePerditaEsercizio' },
  'TotalePatrimonioNetto': { section: 'statoPatrimoniale', field: 'totalePatrimonioNetto' },
  'TrattamentoFineRapportoLavoroSubordinato': { section: 'statoPatrimoniale', field: 'fondoTFR' },
  'TotaleFondiRischiOneri': { section: 'statoPatrimoniale', field: 'totaleFondiRischiOneri' },
  'DebitiDebitiVersoBancheTotaleDebitiVersoBanche': { section: 'statoPatrimoniale', field: 'debitiVersoBanche' },
  'DebitiDebitiVersoBancheEsigibiliEntroEsercizioSuccessivo': { section: 'statoPatrimoniale', field: 'debitiBancheBreve' },
  'DebitiDebitiVersoBancheEsigibiliOltreEsercizioSuccessivo': { section: 'statoPatrimoniale', field: 'debitiBancheLungo' },
  'DebitiDebitiVersoAltriFinanziatoriTotaleDebitiVersoAltriFinanziatori': { section: 'statoPatrimoniale', field: 'debitiVersoAltriFinanziatori' },
  'DebitiDebitiVersoFornitoriTotaleDebitiVersoFornitori': { section: 'statoPatrimoniale', field: 'debitiVersoFornitori' },
  'DebitiDebitiTributariTotaleDebitiTributari': { section: 'statoPatrimoniale', field: 'debitiTributari' },
  'DebitiDebitiVersoIstitutiPrevidenzaSicurezzaSocialeTotaleDebitiVersoIstitutiPrevidenzaSicurezzaSociale': { section: 'statoPatrimoniale', field: 'debitiPrevidenziali' },
  'DebitiAltriDebitiTotaleAltriDebiti': { section: 'statoPatrimoniale', field: 'altriDebiti' },
  'TotaleDebiti': { section: 'statoPatrimoniale', field: 'totaleDebiti' },
  'PassivoRateiRisconti': { section: 'statoPatrimoniale', field: 'rateiRiscontiPassivo' },
  'TotalePassivo': { section: 'statoPatrimoniale', field: 'totalePassivo' },

  // Conto Economico
  'ValoreProduzioneRicaviVenditePrestazioni': { section: 'contoEconomico', field: 'ricaviVendite' },
  'ValoreProduzioneVariazioniRimanenzeProdottiCorsoLavorazioneSemilavoratiFiniti': { section: 'contoEconomico', field: 'variazioneRimanenzeProdotti' },
  'ValoreProduzioneAltriRicaviProventiContributiContoEsercizio': { section: 'contoEconomico', field: 'contributiContoEsercizio' },
  'ValoreProduzioneAltriRicaviProventiAltri': { section: 'contoEconomico', field: 'altriRicaviProventi' },
  'ValoreProduzioneAltriRicaviProventiTotaleAltriRicaviProventi': { section: 'contoEconomico', field: 'totaleAltriRicaviProventi' },
  'TotaleValoreProduzione': { section: 'contoEconomico', field: 'totaleValoreProduzione' },
  'CostiProduzioneMateriePrimeSussidiarieConsumoMerci': { section: 'contoEconomico', field: 'costiMateriePrime' },
  'CostiProduzioneServizi': { section: 'contoEconomico', field: 'costiServizi' },
  'CostiProduzioneGodimentoBeniTerzi': { section: 'contoEconomico', field: 'godimentoBeniTerzi' },
  'CostiProduzionePersonaleTotaleCostiPersonale': { section: 'contoEconomico', field: 'totaleCostiPersonale' },
  'CostiProduzionePersonaleSalariStipendi': { section: 'contoEconomico', field: 'salariStipendi' },
  'CostiProduzionePersonaleOneriSociali': { section: 'contoEconomico', field: 'oneriSociali' },
  'CostiProduzionePersonaleTrattamentoFineRapporto': { section: 'contoEconomico', field: 'tfr' },
  'CostiProduzioneAmmortamentiSvalutazioniAmmortamentoImmobilizzazioniImmateriali': { section: 'contoEconomico', field: 'ammortamentiImmateriali' },
  'CostiProduzioneAmmortamentiSvalutazioniAmmortamentoImmobilizzazioniMateriali': { section: 'contoEconomico', field: 'ammortamentiMateriali' },
  'CostiProduzioneAmmortamentiSvalutazioniTotaleAmmortamentiSvalutazioni': { section: 'contoEconomico', field: 'totaleAmmortamenti' },
  'CostiProduzioneVariazioniRimanenzeMateriePrimeSussidiarieConsumoMerci': { section: 'contoEconomico', field: 'variazioneRimanenzeMaterie' },
  'CostiProduzioneOneriDiversiGestione': { section: 'contoEconomico', field: 'oneriDiversi' },
  'TotaleCostiProduzione': { section: 'contoEconomico', field: 'totaleCostiProduzione' },
  'DifferenzaValoreCostiProduzione': { section: 'contoEconomico', field: 'differenzaValoreCosti' },
  'ProventiOneriFinanziariAltriProventiFinanziariTotaleAltriProventiFinanziari': { section: 'contoEconomico', field: 'totaleProventiFinanziari' },
  'ProventiOneriFinanziariInteressiAltriOneriFinanziariTotaleInteressiAltriOneriFinanziari': { section: 'contoEconomico', field: 'totaleOneriFinanziari' },
  'TotaleProventiOneriFinanziari': { section: 'contoEconomico', field: 'totaleProventiOneriFinanziari' },
  'RisultatoPrimaImposte': { section: 'contoEconomico', field: 'risultatoPrimaImposte' },
  'ImposteRedditoEsercizioCorrentiDifferiteAnticipateTotaleImposteRedditoEsercizioCorrentiDifferiteAnticipate': { section: 'contoEconomico', field: 'imposte' },
  'UtilePerditaEsercizio': { section: 'contoEconomico', field: 'utilePerditaEsercizio' },

  // Rendiconto Finanziario
  'FlussoFinanziarioAttivitaOperativa': { section: 'rendicontoFinanziario', field: 'flussoOperativo' },
  'FlussoFinanziarioAttivitaInvestimento': { section: 'rendicontoFinanziario', field: 'flussoInvestimento' },
  'FlussoFinanziarioAttivitaFinanziamento': { section: 'rendicontoFinanziario', field: 'flussoFinanziamento' },
};

// ─── Context Parsing ─────────────────────────────────────────────────────────

interface XbrlContext {
  id: string;
  year: number;
  type: 'instant' | 'duration';
}

function parseContexts(parsed: any): Map<string, XbrlContext> {
  const contexts = new Map<string, XbrlContext>();
  const xbrl = parsed['xbrl'] || parsed;
  let ctxArray = xbrl['context'] || [];
  if (!Array.isArray(ctxArray)) ctxArray = [ctxArray];

  for (const ctx of ctxArray) {
    const id = ctx['@_id'] as string;
    if (!id) continue;

    const period = ctx['period'];
    if (!period) continue;

    let year: number;
    let type: 'instant' | 'duration';

    if (period['instant']) {
      type = 'instant';
      year = parseInt(String(period['instant']).substring(0, 4), 10);
    } else if (period['startDate'] && period['endDate']) {
      type = 'duration';
      year = parseInt(String(period['endDate']).substring(0, 4), 10);
    } else {
      continue;
    }

    contexts.set(id, { id, year, type });
  }
  return contexts;
}

// ─── Main Parser ─────────────────────────────────────────────────────────────

function createEmptyData(year: number, fileName: string): ParsedFinancialData {
  return {
    year,
    fileName,
    entity: { name: '', partitaIva: '', sede: '', formaGiuridica: '', capitaleSociale: 0, ateco: '', dipendenti: 0 },
    statoPatrimoniale: {
      immobilizzazioniImmateriali: 0, immobilizzazioniMateriali: 0, immobilizzazioniFinanziarie: 0, totaleImmobilizzazioni: 0,
      rimanenze: 0, creditiVersoClienti: 0, creditiTributari: 0, creditiVersoAltri: 0, totaleCrediti: 0,
      disponibilitaLiquide: 0, totaleAttivoCircolante: 0, rateiRiscontiAttivo: 0, totaleAttivo: 0,
      patrimonioNettoCapitale: 0, riservaLegale: 0, altreRiserve: 0, riservaCoperturaFlussi: 0,
      utilePerditaEsercizio: 0, totalePatrimonioNetto: 0,
      fondoTFR: 0, totaleFondiRischiOneri: 0,
      debitiVersoBanche: 0, debitiBancheBreve: 0, debitiBancheLungo: 0, debitiVersoAltriFinanziatori: 0,
      debitiVersoFornitori: 0, debitiTributari: 0, debitiPrevidenziali: 0, altriDebiti: 0,
      totaleDebiti: 0, rateiRiscontiPassivo: 0, totalePassivo: 0,
    },
    contoEconomico: {
      ricaviVendite: 0, variazioneRimanenzeProdotti: 0, contributiContoEsercizio: 0,
      altriRicaviProventi: 0, totaleAltriRicaviProventi: 0, totaleValoreProduzione: 0,
      costiMateriePrime: 0, costiServizi: 0, godimentoBeniTerzi: 0,
      totaleCostiPersonale: 0, salariStipendi: 0, oneriSociali: 0, tfr: 0,
      ammortamentiImmateriali: 0, ammortamentiMateriali: 0, totaleAmmortamenti: 0,
      variazioneRimanenzeMaterie: 0, oneriDiversi: 0, totaleCostiProduzione: 0,
      differenzaValoreCosti: 0,
      totaleProventiFinanziari: 0, totaleOneriFinanziari: 0, totaleProventiOneriFinanziari: 0,
      risultatoPrimaImposte: 0, imposte: 0, utilePerditaEsercizio: 0,
    },
    rendicontoFinanziario: { flussoOperativo: 0, flussoInvestimento: 0, flussoFinanziamento: 0 },
  };
}

export function parseXbrlFile(xmlContent: string, fileName: string): ParsedFinancialData[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    removeNSPrefix: false,
    isArray: (name) => name === 'context',
  });

  const parsed = parser.parse(xmlContent);
  const xbrl = parsed['xbrl'] || parsed;
  const contexts = parseContexts(parsed);

  // Group data by year
  const yearDataMap = new Map<number, ParsedFinancialData>();

  // Find the primary years from contexts
  const years = new Set<number>();
  contexts.forEach(ctx => years.add(ctx.year));

  for (const year of years) {
    yearDataMap.set(year, createEmptyData(year, fileName));
  }

  // Iterate all keys in the xbrl object
  for (const fullKey of Object.keys(xbrl)) {
    // Strip namespace prefix: "itcc-ci:ElementName" -> "ElementName"
    const colonIdx = fullKey.indexOf(':');
    const localName = colonIdx >= 0 ? fullKey.substring(colonIdx + 1) : fullKey;

    const mapping = XBRL_FIELD_MAP[localName];
    if (!mapping) continue;

    // The value can be a single object or an array (when same element appears with different contexts)
    let values = xbrl[fullKey];
    if (!Array.isArray(values)) values = [values];

    for (const val of values) {
      // Extract contextRef and actual value
      let contextRef: string;
      let rawValue: any;

      if (typeof val === 'object' && val !== null) {
        contextRef = val['@_contextRef'];
        // The text content is in '#text' when attributes are present
        rawValue = val['#text'] !== undefined ? val['#text'] : val;
      } else {
        // Simple text node without attributes - skip (shouldn't happen for mapped fields)
        continue;
      }

      if (!contextRef) continue;

      const ctx = contexts.get(contextRef);
      if (!ctx) continue;

      const data = yearDataMap.get(ctx.year);
      if (!data) continue;

      // Assign value to the right field
      const section = data[mapping.section] as any;
      if (!section) continue;

      // Parse numeric values
      const numVal = typeof rawValue === 'number' ? rawValue : parseFloat(String(rawValue));
      if (typeof section[mapping.field] === 'number') {
        section[mapping.field] = isNaN(numVal) ? 0 : numVal;
      } else {
        section[mapping.field] = String(rawValue);
      }
    }
  }

  // Return sorted by year, only years that have actual data
  return Array.from(yearDataMap.values())
    .filter(d => d.statoPatrimoniale.totaleAttivo > 0 || d.contoEconomico.totaleValoreProduzione > 0)
    .sort((a, b) => a.year - b.year);
}

// ─── Ratio Computation ───────────────────────────────────────────────────────

export function computeRatios(data: ParsedFinancialData, priorYear?: ParsedFinancialData): FinancialRatios {
  const sp = data.statoPatrimoniale;
  const ce = data.contoEconomico;

  const totaleAttivo = sp.totaleAttivo || 1;
  const totalePassivo = sp.totalePassivo || 1;
  const ricavi = ce.totaleValoreProduzione || 1;

  // EBITDA = differenza valore/costi + ammortamenti
  const ebitda = ce.differenzaValoreCosti + ce.totaleAmmortamenti;
  const ebit = ce.differenzaValoreCosti;
  const ebitdaSafe = ebitda || 1;

  // Debiti a breve (approssimazione: debiti banche breve + fornitori + tributari + previdenziali + altri debiti)
  const debitiBrTerm = sp.debitiBancheBreve + sp.debitiVersoFornitori + sp.debitiTributari + sp.debitiPrevidenziali + sp.altriDebiti + sp.debitiVersoAltriFinanziatori;

  // PFN = Debiti finanziari - Disponibilita' liquide
  const pfn = sp.debitiVersoBanche + sp.debitiVersoAltriFinanziatori - sp.disponibilitaLiquide;

  // Costo indebitamento
  const debitoBancario = sp.debitiVersoBanche || 1;
  const costoIndebitamento = debitoBancario > 0 ? (Math.abs(ce.totaleOneriFinanziari) / debitoBancario) * 100 : 0;

  // Giorni capitale circolante (stima su ricavi giornalieri)
  const ricaviGiornalieri = ce.ricaviVendite / 365 || 1;
  const costiGiornalieri = ce.totaleCostiProduzione / 365 || 1;

  const giorniIncasso = sp.creditiVersoClienti / ricaviGiornalieri;
  const giorniPagamento = sp.debitiVersoFornitori / costiGiornalieri;
  const giorniMagazzino = ce.costiMateriePrime > 0 ? sp.rimanenze / (ce.costiMateriePrime / 365) : 0;

  // Trend vs anno precedente
  const pct = (curr: number, prev: number) => prev !== 0 ? ((curr - prev) / Math.abs(prev)) * 100 : null;

  return {
    year: data.year,
    // Equilibrio Patrimoniale
    rapportoImmobilizzazioniAttivo: (sp.totaleImmobilizzazioni / totaleAttivo) * 100,
    rapportoCircolanteAttivo: (sp.totaleAttivoCircolante / totaleAttivo) * 100,
    rapportoCapitaleProprioPassivo: (sp.totalePatrimonioNetto / totalePassivo) * 100,
    rapportoDebitiPassivo: (sp.totaleDebiti / totalePassivo) * 100,
    capitaleCircolanteNetto: sp.totaleAttivoCircolante - debitiBrTerm,
    // Equilibrio Finanziario
    currentRatio: debitiBrTerm > 0 ? sp.totaleAttivoCircolante / debitiBrTerm : 0,
    quickRatio: debitiBrTerm > 0 ? (sp.totaleAttivoCircolante - sp.rimanenze) / debitiBrTerm : 0,
    cashRatio: debitiBrTerm > 0 ? sp.disponibilitaLiquide / debitiBrTerm : 0,
    pfn,
    pfnEbitda: pfn / ebitdaSafe,
    // Equilibrio Economico
    ebitda,
    ebitdaMargin: (ebitda / ricavi) * 100,
    ebit,
    incidenzaMaterie: (ce.costiMateriePrime / ricavi) * 100,
    incidenzaServizi: ((ce.costiServizi + ce.godimentoBeniTerzi) / ricavi) * 100,
    incidenzaPersonale: (ce.totaleCostiPersonale / ricavi) * 100,
    incidenzaAmmortamenti: (ce.totaleAmmortamenti / ricavi) * 100,
    incidenzaOneriFinanziari: (Math.abs(ce.totaleOneriFinanziari) / ricavi) * 100,
    // Redditivita
    roe: sp.totalePatrimonioNetto > 0 ? (ce.utilePerditaEsercizio / sp.totalePatrimonioNetto) * 100 : 0,
    roi: (ebit / totaleAttivo) * 100,
    ros: (ebit / (ce.ricaviVendite || 1)) * 100,
    // Sostenibilita Debito
    debitoBancarioEbitda: sp.debitiVersoBanche / ebitdaSafe,
    costoIndebitamento,
    leverageRatio: sp.totalePatrimonioNetto > 0 ? sp.totaleDebiti / sp.totalePatrimonioNetto : 0,
    // Gestione Capitale Circolante
    giorniIncassoCrediti: Math.round(giorniIncasso),
    giorniPagamentoFornitori: Math.round(giorniPagamento),
    giorniGiacenzaMagazzino: Math.round(giorniMagazzino),
    cicloCassa: Math.round(giorniIncasso + giorniMagazzino - giorniPagamento),
    // Trend
    crescitaRicavi: priorYear ? pct(ce.totaleValoreProduzione, priorYear.contoEconomico.totaleValoreProduzione) : null,
    crescitaUtile: priorYear ? pct(ce.utilePerditaEsercizio, priorYear.contoEconomico.utilePerditaEsercizio) : null,
    crescitaAttivo: priorYear ? pct(sp.totaleAttivo, priorYear.statoPatrimoniale.totaleAttivo) : null,
    crescitaPN: priorYear ? pct(sp.totalePatrimonioNetto, priorYear.statoPatrimoniale.totalePatrimonioNetto) : null,
  };
}

// ─── Multi-Year Combination ──────────────────────────────────────────────────

export function combineMultiYearData(allYears: ParsedFinancialData[]): MultiYearFinancialData {
  // Sort by year
  const sorted = [...allYears].sort((a, b) => a.year - b.year);

  // Use entity from the most recent year
  const latest = sorted[sorted.length - 1];

  return {
    entity: latest.entity,
    years: sorted,
  };
}

export function computeAllRatios(data: MultiYearFinancialData): FinancialRatios[] {
  const ratios: FinancialRatios[] = [];
  for (let i = 0; i < data.years.length; i++) {
    const priorYear = i > 0 ? data.years[i - 1] : undefined;
    ratios.push(computeRatios(data.years[i], priorYear));
  }
  return ratios;
}
