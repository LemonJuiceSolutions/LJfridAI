import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts';

// ==========================================
// 1. DATA TYPES (Simulating the Python inputs)
// ==========================================

interface BudgetRow {
  Anno: number;
  Mese: number;
  BudgetMensile: number;
}

interface FatturatoRow {
  Anno: number;
  Mese: number;
  RicavoStimatoTot: number;
}

interface ProdottoRow {
  Anno: number;
  Mese: number;
  LineaFornitore: string;
  RepartoInterno: string;
  RicavoStimatoTot: number;
}

// ==========================================
// 2. MOCK DATA
// ==========================================

const RAW_BUDGET: BudgetRow[] = [
  { Anno: 2026, Mese: 1, BudgetMensile: 50000 },
  { Anno: 2026, Mese: 2, BudgetMensile: 55000 },
  { Anno: 2026, Mese: 3, BudgetMensile: 60000 },
  { Anno: 2026, Mese: 4, BudgetMensile: 62000 },
  { Anno: 2026, Mese: 5, BudgetMensile: 70000 },
  { Anno: 2026, Mese: 6, BudgetMensile: 75000 },
  { Anno: 2026, Mese: 7, BudgetMensile: 80000 },
  { Anno: 2026, Mese: 8, BudgetMensile: 40000 }, // Agosto basso
  { Anno: 2026, Mese: 9, BudgetMensile: 70000 },
  { Anno: 2026, Mese: 10, BudgetMensile: 75000 },
  { Anno: 2026, Mese: 11, BudgetMensile: 80000 },
  { Anno: 2026, Mese: 12, BudgetMensile: 60000 },
];

const RAW_FATTURATO: FatturatoRow[] = [
  { Anno: 2026, Mese: 1, RicavoStimatoTot: 48000 },
  { Anno: 2026, Mese: 2, RicavoStimatoTot: 53000 },
  { Anno: 2026, Mese: 3, RicavoStimatoTot: 65000 }, // Sopra budget
  { Anno: 2026, Mese: 4, RicavoStimatoTot: 60000 },
];

const RAW_PRODOTTO: ProdottoRow[] = [
  // Gennaio
  { Anno: 2026, Mese: 1, LineaFornitore: "Linea A", RepartoInterno: "Rep 1", RicavoStimatoTot: 15000 },
  { Anno: 2026, Mese: 1, LineaFornitore: "Linea A", RepartoInterno: "Rep 2", RicavoStimatoTot: 10000 },
  { Anno: 2026, Mese: 1, LineaFornitore: "Linea B", RepartoInterno: "Rep 1", RicavoStimatoTot: 20000 },
  // Febbraio
  { Anno: 2026, Mese: 2, LineaFornitore: "Linea A", RepartoInterno: "Rep 1", RicavoStimatoTot: 16000 },
  { Anno: 2026, Mese: 2, LineaFornitore: "Linea A", RepartoInterno: "Rep 2", RicavoStimatoTot: 12000 },
  { Anno: 2026, Mese: 2, LineaFornitore: "Linea B", RepartoInterno: "Rep 1", RicavoStimatoTot: 22000 },
  // Marzo
  { Anno: 2026, Mese: 3, LineaFornitore: "Linea A", RepartoInterno: "Rep 1", RicavoStimatoTot: 18000 },
  { Anno: 2026, Mese: 3, LineaFornitore: "Linea A", RepartoInterno: "Rep 2", RicavoStimatoTot: 15000 },
  { Anno: 2026, Mese: 3, LineaFornitore: "Linea B", RepartoInterno: "Rep 1", RicavoStimatoTot: 30000 },
];

// ==========================================
// 3. LOGIC & HELPERS
// ==========================================

const MONTHS = [
  "Gen", "Feb", "Mar", "Apr", "Mag", "Giu",
  "Lug", "Ago", "Set", "Ott", "Nov", "Dic"
];

// Genera colori casuali per le aree
const stringToColor = (str: string) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const c = (hash & 0x00ffffff).toString(16).toUpperCase();
  return '#' + '00000'.substring(0, 6 - c.length) + c;
};

// ==========================================
// 4. COMPONENT
// ==========================================

export default function AdvancedChart() {
  
  // Questa logica replica i passaggi Pandas del tuo script Python
  const processedData = useMemo(() => {
    
    // 1. Inizializza il calendario 12 mesi
    const calendar = MONTHS.map((name, index) => ({
      Mese: index + 1,
      NomeMese: name,
      BudgetMensile: 0,
      FatturatoTot: 0,
      ProdottoTot: 0,
      // Per le breakdown dinamiche
      breakdown: {} as Record<string, number>
    }));

    // 2. Merge Budget
    RAW_BUDGET.forEach(row => {
      if (row.Anno === 2026) {
        const monthIdx = row.Mese - 1;
        if (monthIdx >= 0 && monthIdx < 12) {
          calendar[monthIdx].BudgetMensile += row.BudgetMensile;
        }
      }
    });

    // 3. Merge Fatturato
    RAW_FATTURATO.forEach(row => {
      if (row.Anno === 2026) {
        const monthIdx = row.Mese - 1;
        if (monthIdx >= 0 && monthIdx < 12) {
          calendar[monthIdx].FatturatoTot += row.RicavoStimatoTot;
        }
      }
    });

    // 4. Merge Prodotto (e Breakdown)
    const breakdownKeys = new Set<string>();
    
    RAW_PRODOTTO.forEach(row => {
      if (row.Anno === 2026) {
        const monthIdx = row.Mese - 1;
        if (monthIdx >= 0 && monthIdx < 12) {
          // Totale
          calendar[monthIdx].ProdottoTot += row.RicavoStimatoTot;
          
          // Breakdown Key: "Linea | Reparto"
          const key = `${row.LineaFornitore} | ${row.RepartoInterno}`;
          breakdownKeys.add(key);
          
          calendar[monthIdx].breakdown[key] = (calendar[monthIdx].breakdown[key] || 0) + row.RicavoStimatoTot;
        }
      }
    });

    // 5. Appiattisci i dati per Recharts (che vuole oggetti piatti)
    const monthlyData = calendar.map(item => {
      const flatItem: any = {
        name: item.NomeMese,
        BudgetMensile: item.BudgetMensile,
        FatturatoTot: item.FatturatoTot,
        ProdottoTot: item.ProdottoTot,
      };
      // Aggiungi chiavi dinamiche per le aree
      breakdownKeys.forEach(key => {
        flatItem[key] = item.breakdown[key] || 0;
      });
      return flatItem;
    });

    // 6. Calcola i Cumulati
    let budgetCum = 0;
    let fattCum = 0;
    let prodCum = 0;
    const breakdownCum: Record<string, number> = {};
    
    breakdownKeys.forEach(k => breakdownCum[k] = 0);

    const cumulativeData = monthlyData.map(item => {
      budgetCum += item.BudgetMensile;
      fattCum += item.FatturatoTot;
      prodCum += item.ProdottoTot;

      const flatItem: any = {
        name: item.name,
        BudgetCum: budgetCum,
        FatturatoCum: fattCum,
        ProdottoCum: prodCum,
      };

      breakdownKeys.forEach(key => {
        breakdownCum[key] += (item[key] || 0);
        flatItem[key] = breakdownCum[key];
      });

      return flatItem;
    });

    return {
      monthlyData,
      cumulativeData,
      breakdownKeys: Array.from(breakdownKeys)
    };
  }, []);

  const { monthlyData, cumulativeData, breakdownKeys } = processedData;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '50px', padding: '20px' }}>
      
      {/* ---------------------------------------------------
          GRAFICO 1: VALORI MENSILI
      --------------------------------------------------- */}
      <div style={{ width: '100%', height: 400 }}>
        <h3 style={{ textAlign: 'center' }}>Valori mensili (con breakdown aree)</h3>
        <ResponsiveContainer>
          <ComposedChart data={monthlyData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Legend />
            
            {/* Aree Stacked per Breakdown Prodotto (molto tenui) */}
            {breakdownKeys.map((key, idx) => (
              <Area 
                key={key}
                type="monotone"
                dataKey={key}
                stackId="1"
                fill={stringToColor(key)}
                stroke={stringToColor(key)}
                fillOpacity={0.2}
                strokeOpacity={0} // Nessun bordo per le aree di sfondo
              />
            ))}

            {/* Linee Principali (sopra le aree) */}
            <Line type="monotone" dataKey="BudgetMensile" stroke="rgb(37, 99, 235)" strokeWidth={3} dot={{ r: 4 }} />
            <Line type="monotone" dataKey="FatturatoTot" stroke="rgb(139, 92, 246)" strokeWidth={3} dot={{ r: 4 }} />
            <Line type="monotone" dataKey="ProdottoTot" stroke="rgb(34, 197, 94)" strokeWidth={3} dot={{ r: 4 }} />
            
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* ---------------------------------------------------
          GRAFICO 2: CUMULATI
      --------------------------------------------------- */}
      <div style={{ width: '100%', height: 400 }}>
        <h3 style={{ textAlign: 'center' }}>Cumulato (2026)</h3>
        <ResponsiveContainer>
          <ComposedChart data={cumulativeData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Legend />

             {/* Aree Stacked Cumulate (ancora più tenui) */}
             {breakdownKeys.map((key) => (
              <Area 
                key={key}
                type="monotone"
                dataKey={key}
                stackId="1"
                fill={stringToColor(key)}
                stroke="none"
                fillOpacity={0.1}
              />
            ))}

            <Line type="monotone" dataKey="BudgetCum" name="Budget (cum)" stroke="rgb(37, 99, 235)" strokeWidth={3} dot={{ r: 4 }} />
            <Line type="monotone" dataKey="FatturatoCum" name="Fatturato (cum)" stroke="rgb(139, 92, 246)" strokeWidth={3} dot={{ r: 4 }} />
            <Line type="monotone" dataKey="ProdottoCum" name="Prodotto (cum)" stroke="rgb(34, 197, 94)" strokeWidth={3} dot={{ r: 4 }} />
            
          </ComposedChart>
        </ResponsiveContainer>
      </div>

    </div>
  );
}
