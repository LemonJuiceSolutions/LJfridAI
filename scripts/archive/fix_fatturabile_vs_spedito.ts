/**
 * Fix: Fatturabile vs Spedito Python node - handle empty SpeditoMeseCorrente gracefully
 *
 * Problem: when SpeditoMeseCorrente SQL returns 0 rows (e.g. beginning of month, no DDTs yet),
 * the Python code raises RuntimeError instead of showing a partial/empty chart.
 *
 * Fix: replace raise RuntimeError with graceful empty DataFrame handling.
 */

import { db } from '@/lib/db';

const TREE_ID = 'RzX9nFJGQUs832cLVvecO';
const NODE_ID = 'vKJhk8mI'; // Fatturabile vs Spedito (also email task node)

const OLD_SPED_CHECK = `if sped_date_col is None or sped_val_col is None:
    raise RuntimeError(f"SpeditoMeseCorrente: colonne non trovate. Ho: {list(df_sped.columns)}")

df_sped["Data"] = parse_date_col(df_sped[sped_date_col])
df_sped["SpeditoGiorno"] = safe_num(df_sped[sped_val_col])
df_sped = df_sped[df_sped["Data"].notna()].copy()

# NB: il tuo spedito può avere più righe per lo stesso DDT/data -> sommo per giorno
sped_day = (
    df_sped.groupby("Data", as_index=False)["SpeditoGiorno"]
    .sum()
    .sort_values("Data")
)`;

const NEW_SPED_CHECK = `if sped_date_col is None or sped_val_col is None:
    # Nessun dato spedito per questo periodo (es. inizio mese senza DDT): usa serie vuota
    sped_day = pd.DataFrame({"Data": pd.Series([], dtype="datetime64[ns]"), "SpeditoGiorno": pd.Series([], dtype=float)})
else:
    df_sped["Data"] = parse_date_col(df_sped[sped_date_col])
    df_sped["SpeditoGiorno"] = safe_num(df_sped[sped_val_col])
    df_sped = df_sped[df_sped["Data"].notna()].copy()

    # NB: il tuo spedito può avere più righe per lo stesso DDT/data -> sommo per giorno
    sped_day = (
        df_sped.groupby("Data", as_index=False)["SpeditoGiorno"]
        .sum()
        .sort_values("Data")
    )`;

const OLD_FATT_CHECK = `if fatt_date_col is None or fatt_val_col is None:
    raise RuntimeError(f"FatturabileMeseCorrente: colonne non trovate. Ho: {list(df_fatt.columns)}")

df_fatt["Data"] = parse_date_col(df_fatt[fatt_date_col])
df_fatt["FatturabileGiorno"] = safe_num(df_fatt[fatt_val_col])
df_fatt = df_fatt[df_fatt["Data"].notna()].copy()

fatt_day = (
    df_fatt.groupby("Data", as_index=False)["FatturabileGiorno"]
    .sum()
    .sort_values("Data")
)`;

const NEW_FATT_CHECK = `if fatt_date_col is None or fatt_val_col is None:
    # Nessun dato fatturabile per questo periodo: usa serie vuota
    fatt_day = pd.DataFrame({"Data": pd.Series([], dtype="datetime64[ns]"), "FatturabileGiorno": pd.Series([], dtype=float)})
else:
    df_fatt["Data"] = parse_date_col(df_fatt[fatt_date_col])
    df_fatt["FatturabileGiorno"] = safe_num(df_fatt[fatt_val_col])
    df_fatt = df_fatt[df_fatt["Data"].notna()].copy()

    fatt_day = (
        df_fatt.groupby("Data", as_index=False)["FatturabileGiorno"]
        .sum()
        .sort_values("Data")
    )`;

// Also fix the "all_dates.empty" check which would fail if BOTH are empty
const OLD_EMPTY_CHECK = `if all_dates.empty:
    raise RuntimeError("Nessuna data valida trovata in SpeditoMeseCorrente / FatturabileMeseCorrente.")`;

const NEW_EMPTY_CHECK = `if all_dates.empty:
    # Entrambe le serie sono vuote: genera grafico con messaggio "nessun dato"
    import datetime
    today = pd.Timestamp.now().normalize()
    MONTH_START = today.replace(day=1)
    MONTH_END = MONTH_START + pd.offsets.MonthBegin(1)
    ref = today
else:
    ref = pd.to_datetime(all_dates.min()).normalize()
    MONTH_START, MONTH_END = month_bounds_from_any_date(ref)

if False:  # placeholder to keep indent structure`;

// We also need to remove the duplicate ref/MONTH_START assignment that comes right after
const OLD_REF_LINE = `ref = pd.to_datetime(all_dates.min()).normalize()
MONTH_START, MONTH_END = month_bounds_from_any_date(ref)`;

async function fixNode() {
  console.log(`Looking up tree ${TREE_ID}...`);
  const tree = await db.tree.findUnique({ where: { id: TREE_ID } });
  if (!tree) {
    console.error('Tree not found!');
    process.exit(1);
  }

  const treeJson = tree.jsonDecisionTree as any;

  function findAndUpdate(node: any): boolean {
    if (!node || typeof node !== 'object') return false;
    if (node.id === NODE_ID && node.pythonResultName === 'Fatturabile vs Spedito') {
      const original = node.pythonCode as string;

      if (!original.includes('raise RuntimeError')) {
        console.log('Python code already patched, skipping.');
        return true;
      }

      let updated = original;

      // Fix 1: SpeditoMeseCorrente empty handling
      if (updated.includes(OLD_SPED_CHECK)) {
        updated = updated.replace(OLD_SPED_CHECK, NEW_SPED_CHECK);
        console.log('✅ Fixed SpeditoMeseCorrente check');
      } else {
        console.warn('⚠️  Could not find OLD_SPED_CHECK pattern');
        console.log('Looking for partial match...');
        const idx = updated.indexOf('raise RuntimeError(f"SpeditoMeseCorrente');
        if (idx >= 0) console.log('Found partial at:', idx, updated.substring(idx - 50, idx + 100));
      }

      // Fix 2: FatturabileMeseCorrente empty handling
      if (updated.includes(OLD_FATT_CHECK)) {
        updated = updated.replace(OLD_FATT_CHECK, NEW_FATT_CHECK);
        console.log('✅ Fixed FatturabileMeseCorrente check');
      } else {
        console.warn('⚠️  Could not find OLD_FATT_CHECK pattern');
      }

      // Fix 3: all_dates.empty handling
      if (updated.includes(OLD_EMPTY_CHECK)) {
        // Replace the old check + the next ref line
        const combined = OLD_EMPTY_CHECK + '\n\n' + OLD_REF_LINE;
        const newCombined = NEW_EMPTY_CHECK;
        if (updated.includes(combined)) {
          updated = updated.replace(combined, newCombined);
          console.log('✅ Fixed all_dates.empty check');
        } else {
          updated = updated.replace(OLD_EMPTY_CHECK, NEW_EMPTY_CHECK);
          console.log('✅ Fixed all_dates.empty check (partial)');
        }
      } else {
        console.warn('⚠️  Could not find OLD_EMPTY_CHECK pattern');
      }

      node.pythonCode = updated;
      return true;
    }

    if (node.options && typeof node.options === 'object') {
      for (const v of Object.values(node.options)) {
        if (findAndUpdate(v)) return true;
      }
    }
    return false;
  }

  const found = findAndUpdate(treeJson);
  if (!found) {
    console.error(`Node ${NODE_ID} not found in tree!`);
    process.exit(1);
  }

  await db.tree.update({
    where: { id: TREE_ID },
    data: { jsonDecisionTree: treeJson as any }
  });

  console.log('✅ Tree updated successfully!');
  process.exit(0);
}

fixNode().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
