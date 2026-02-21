'use server';

import { readFile, readdir } from 'fs/promises';
import { join } from 'path';
import { nanoid } from 'nanoid';
import {
  parseXbrlFile,
  combineMultiYearData,
  computeAllRatios,
  type ParsedFinancialData,
  type MultiYearFinancialData,
  type FinancialRatios,
} from '@/lib/xbrl-parser';
import { analysisTree } from '@/lib/xbrl-analysis-tree';
import { db } from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/session';

const DOCUMENTS_DIR = join(process.cwd(), 'public', 'documents');

export async function listXbrlFilesAction(): Promise<{ files: { name: string; url: string }[]; error?: string }> {
  try {
    const entries = await readdir(DOCUMENTS_DIR).catch(() => []);
    const xbrlFiles = (entries as string[])
      .filter(f => f.endsWith('.xbrl'))
      .map(name => ({ name, url: `/documents/${name}` }));
    return { files: xbrlFiles };
  } catch (error) {
    return { files: [], error: String(error) };
  }
}

export async function parseAllXbrlAction(): Promise<{
  data?: MultiYearFinancialData;
  ratios?: FinancialRatios[];
  error?: string;
}> {
  try {
    const entries = await readdir(DOCUMENTS_DIR).catch(() => []);
    const xbrlFiles = (entries as string[]).filter(f => f.endsWith('.xbrl'));

    if (xbrlFiles.length === 0) {
      return { error: 'Nessun file XBRL trovato nella cartella documenti. Carica i file .xbrl dalla pagina Impostazioni.' };
    }

    const allYears: ParsedFinancialData[] = [];

    for (const fileName of xbrlFiles) {
      const filePath = join(DOCUMENTS_DIR, fileName);
      const content = await readFile(filePath, 'utf-8');
      const parsed = parseXbrlFile(content, fileName);
      allYears.push(...parsed);
    }

    if (allYears.length === 0) {
      return { error: 'Nessun dato finanziario trovato nei file XBRL.' };
    }

    // Deduplicate by year (keep the one with more data)
    const byYear = new Map<number, ParsedFinancialData>();
    for (const yearData of allYears) {
      const existing = byYear.get(yearData.year);
      if (!existing || yearData.statoPatrimoniale.totaleAttivo > existing.statoPatrimoniale.totaleAttivo) {
        byYear.set(yearData.year, yearData);
      }
    }

    const deduped = Array.from(byYear.values()).sort((a, b) => a.year - b.year);
    const data = combineMultiYearData(deduped);
    const ratios = computeAllRatios(data);

    return { data, ratios };
  } catch (error) {
    console.error('XBRL parse error:', error);
    return { error: String(error) };
  }
}

/**
 * Creates a decision tree in "Flussi & Regole" from XBRL analysis data.
 * Parses all XBRL files, evaluates analysis nodes, and builds a tree
 * with widgetConfig + sealed data on each leaf.
 */
export async function createXbrlAnalysisTreeAction(): Promise<{
  success?: boolean;
  treeId?: string;
  error?: string;
}> {
  try {
    const user = await getAuthenticatedUser();
    if (!user || !user.companyId) {
      return { error: 'Utente non associato a nessuna azienda.' };
    }
    const companyId = user.companyId;

    // 1. Parse all XBRL files
    const result = await parseAllXbrlAction();
    if (result.error || !result.data || !result.ratios) {
      return { error: result.error || 'Nessun dato XBRL disponibile.' };
    }
    const { data, ratios } = result;

    const yearsStr = data.years.map(y => y.year).join(', ');
    const entityName = data.entity.name || 'Azienda';

    // 1b. Get source document links
    const fileList = await listXbrlFilesAction();
    const sourceLinks = fileList.files.map(f => ({
      name: f.name,
      url: f.url,
    }));

    // 1c. Build Python script that lists source documents
    const fileListStr = fileList.files.map(f => `    "${f.name}",  # ${f.url}`).join('\n');
    const buildPythonScript = (nodeLabel: string, chartTitle: string, dataKeys: string[]) => {
      const keysStr = dataKeys.map(k => `"${k}"`).join(', ');
      return `# ${nodeLabel} — ${chartTitle}
# Fonti: Documenti XBRL caricati in Impostazioni
# Entita: ${entityName}
# Anni analizzati: ${yearsStr}

import xml.etree.ElementTree as ET
import os

# File XBRL sorgente (caricati da Impostazioni > Documenti)
XBRL_FILES = [
${fileListStr}
]

DOCUMENTS_DIR = "public/documents"

def parse_xbrl_files():
    """Legge e parsa i file XBRL dal folder documenti."""
    results = {}
    for filename in XBRL_FILES:
        filepath = os.path.join(DOCUMENTS_DIR, filename)
        if os.path.exists(filepath):
            tree = ET.parse(filepath)
            root = tree.getroot()
            results[filename] = root
            print(f"Caricato: {filename}")
        else:
            print(f"File non trovato: {filename}")
    return results

# Metriche estratte per questo grafico:
DATA_KEYS = [${keysStr}]

# Esecuzione
data = parse_xbrl_files()
print(f"File caricati: {len(data)}/{len(XBRL_FILES)}")
`;
    };

    // 2. Build the decision tree JSON
    // Root → 7 analysis area options → each with chart sub-options
    const options: Record<string, unknown> = {};

    for (const node of analysisTree) {
      const evalResult = node.evaluate(ratios, data);

      // Build chart sub-options for this analysis area
      const chartOptions: Record<string, unknown> = {};

      for (const chart of node.charts) {
        const extracted = chart.dataExtractor(data, ratios);
        const dataKeys = extracted.config.dataKeys || [];
        chartOptions[chart.title] = {
          id: `leaf-${chart.id}`,
          decision: `${chart.title} — ${evalResult.description}`,
          links: sourceLinks,
          pythonCode: buildPythonScript(node.label, chart.title, dataKeys),
          widgetConfig: {
            ...extracted.config,
            type: extracted.config.type || chart.type,
            title: extracted.config.title || chart.title,
            data: extracted.data,
          },
        };
      }

      // Single chart → leaf directly, multiple → sub-question
      if (node.charts.length === 1) {
        const chart = node.charts[0];
        const extracted = chart.dataExtractor(data, ratios);
        const dataKeys = extracted.config.dataKeys || [];
        options[`${node.label} — ${evalResult.rating}`] = {
          id: `leaf-${node.id}`,
          decision: `${evalResult.description}`,
          links: sourceLinks,
          pythonCode: buildPythonScript(node.label, chart.title, dataKeys),
          widgetConfig: {
            ...extracted.config,
            type: extracted.config.type || chart.type,
            title: extracted.config.title || chart.title,
            data: extracted.data,
          },
        };
      } else {
        options[`${node.label} — ${evalResult.rating}`] = {
          id: `node-${node.id}`,
          question: `${node.label}: ${evalResult.description}`,
          links: sourceLinks,
          options: chartOptions,
        };
      }
    }

    const jsonTree = {
      id: 'xbrl-root',
      question: `Analisi Finanziaria XBRL\n${entityName}\nAnni: ${yearsStr} | Dipendenti: ${data.entity.dipendenti}`,
      links: sourceLinks,
      options,
    };

    // 3. Build natural language description
    const nlDescription = analysisTree.map(node => {
      const evalResult = node.evaluate(ratios, data);
      return `• ${node.label}: ${evalResult.rating} — ${evalResult.description}`;
    }).join('\n');

    // 4. Save to DB
    const newTree = await db.tree.create({
      data: {
        id: nanoid(),
        name: `Analisi XBRL — ${entityName}`,
        description: `Analisi finanziaria basata sui bilanci XBRL (${yearsStr})`,
        jsonDecisionTree: JSON.stringify(jsonTree),
        naturalLanguageDecisionTree: `Analisi Finanziaria XBRL per ${entityName}\nAnni analizzati: ${yearsStr}\n\n${nlDescription}`,
        questionsScript: '',
        type: 'RULE',
        companyId,
        createdAt: new Date(),
      },
    });

    return { success: true, treeId: newTree.id };
  } catch (error) {
    console.error('Error creating XBRL analysis tree:', error);
    return { error: String(error) };
  }
}
