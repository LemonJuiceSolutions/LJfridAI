"""
What-If Agent — genera la matrice di perturbazione per la what-if analysis.

Flusso:
  1. Init  : legge Mappatura_CDC_e_bilancio.xlsx e costruisce il contesto sui conti
  2. Query : interpreta una richiesta in linguaggio naturale e produce una
             WhatIfResult strutturata tramite OpenRouter
  3. Output: salva un report markdown in reports/ e stampa la matrice di perturbazione

Uso:
    agent = WhatIfAgent()
    result = agent.generate_and_save("Aumenta i ricavi del 10% da aprile a giugno")
    print(agent.to_matrix_code(result))

Variabili d'ambiente:
    OPENROUTER_API_KEY  — chiave API OpenRouter (obbligatoria)
"""

import json
import os
import textwrap
from datetime import date, datetime
from pathlib import Path
from typing import Literal

import pandas as pd
from dotenv import load_dotenv
from openai import OpenAI
from pydantic import BaseModel

load_dotenv()

REPORTS_DIR = Path("reports")
REPORTS_DIR.mkdir(exist_ok=True)

MAPPING_FILE = "Mappatura_CDC_e_bilancio.xlsx"
CE_MAPPATURA_FILE = "conti_ce_mappatura.md"
DEFAULT_MODEL = os.getenv("WHATIF_MODEL", "anthropic/claude-opus-4-6")


# ── Schema strutturato per l'output dell'agente ──────────────────────────────

class ValoreMese(BaseModel):
    """Coppia periodo → valore per un singolo NumeroConto."""
    periodo: str   # formato YYYY-MM  (es. "2025-04")
    valore: float  # delta in € oppure fattore moltiplicativo


class PerturbazioneConto(BaseModel):
    """Perturbazione per un singolo NumeroConto."""
    numero_conto: str
    tipo: Literal['delta', 'mult']
    valori: list[ValoreMese]


class WhatIfResult(BaseModel):
    """Output strutturato dell'agente."""
    perturbazioni: list[PerturbazioneConto]
    report: str  # analisi in linguaggio naturale (italiano), 2-4 paragrafi


# ── Agente ───────────────────────────────────────────────────────────────────

class WhatIfAgent:

    def __init__(
        self,
        mapping_file: str = MAPPING_FILE,
        ce_mappatura_file: str = CE_MAPPATURA_FILE,
        model: str = DEFAULT_MODEL,
    ):
        self.client = OpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=os.environ["OPENROUTER_API_KEY"],
        )
        self.model = model
        self.mapping_context = self._build_context(mapping_file, ce_mappatura_file)

    # ── Init ─────────────────────────────────────────────────────────────────

    def _build_context(self, mapping_file: str, ce_mappatura_file: str) -> str:
        """
        Fase di init: legge il file di mappatura Excel e conti_ce_mappatura.md,
        e costruisce il contesto completo per guidare la generazione della matrice.
        """
        df = pd.read_excel(mapping_file)
        excel_section = "\n".join([
            "# Mappatura raw (Mappatura_CDC_e_bilancio.xlsx)",
            "",
            "Colonne disponibili: " + ", ".join(df.columns.tolist()),
            "",
            df.to_string(index=False, max_rows=500),
        ])

        ce_section = Path(ce_mappatura_file).read_text(encoding="utf-8")

        return "\n\n---\n\n".join([ce_section, excel_section])

    # ── Calcolo mesi forecast ─────────────────────────────────────────────────

    @staticmethod
    def next_12_months() -> list[str]:
        """
        Calcola i 12 mesi futuri in formato YYYY-MM.
        Replica la logica di step1.py: parte dal mese precedente a oggi.
        """
        today = date.today()
        y, m = today.year, today.month - 1
        if m == 0:
            m, y = 12, y - 1
        months = []
        for _ in range(12):
            m += 1
            if m > 12:
                m, y = 1, y + 1
            months.append(f"{y}-{m:02d}")
        return months

    # ── Generazione ──────────────────────────────────────────────────────────

    def generate(
        self,
        user_request: str,
        future_months: list[str] | None = None,
    ) -> WhatIfResult:
        """
        Interpreta la richiesta what-if e restituisce la matrice di perturbazione.

        Args:
            user_request:   Descrizione in linguaggio naturale dello scenario
            future_months:  Lista di periodi YYYY-MM (default: prossimi 12 mesi)
        """
        if future_months is None:
            future_months = self.next_12_months()

        schema = WhatIfResult.model_json_schema()

        system_prompt = textwrap.dedent(f"""
            Sei un analista finanziario esperto di forecasting e scenario analysis.
            Lavori con un pipeline di previsione Monte Carlo per il Conto Economico.

            ## Mappatura conti (fase di init)

            {self.mapping_context}

            ## Specifiche tecniche della matrice (whatif_matrix_spec.md)

            - Tipo 'delta': valore assoluto in € aggiunto a NetAmount.
              I bound CI vengono traslati dello stesso importo.
            - Tipo 'mult': fattore moltiplicativo applicato a NetAmount.
              Usa 1.10 per +10%, 0.90 per -10%.
              I bound CI vengono scalati proporzionalmente.
            - NetAmount = Credit - Debit:
              ricavi tipicamente positivi, costi tipicamente negativi.
            - Mesi forecast disponibili: {', '.join(future_months)}
            - Includi solo i mesi effettivamente perturbati (ometti gli altri).

            ## Output atteso

            Rispondi ESCLUSIVAMENTE con un oggetto JSON valido che rispetta questo schema:
            {json.dumps(schema, ensure_ascii=False, indent=2)}

            Il campo 'report' deve contenere un'analisi in italiano (2-4 paragrafi)
            che spiega le scelte: quali conti hai scelto, perché, e l'impatto atteso sul CE.
        """).strip()

        response = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_request},
            ],
            response_format={"type": "json_object"},
        )

        raw = response.choices[0].message.content
        # Some models wrap the JSON in a markdown code block — strip it
        if "```" in raw:
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        return WhatIfResult.model_validate_json(raw.strip())

    # ── Salvataggio report ────────────────────────────────────────────────────

    def _save_report(self, user_request: str, result: WhatIfResult) -> Path:
        """Salva il report markdown e il JSON della matrice in reports/."""
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        path = REPORTS_DIR / f"whatif_{ts}.md"

        code = self.to_matrix_code(result)
        content = textwrap.dedent(f"""
            # What-If Report — {datetime.now().strftime('%Y-%m-%d %H:%M')}

            ## Richiesta

            > {user_request}

            ## Analisi

            {result.report}

            ## Matrice di perturbazione

            ```python
            {code}
            ```
        """).lstrip()

        path.write_text(content, encoding="utf-8")

        # Salva anche il JSON affiancato (.json) per permettere il caricamento della matrice
        all_periodi: list[str] = sorted(
            {v.periodo for p in result.perturbazioni for v in p.valori}
        )
        matrix: list[dict] = []
        for p in result.perturbazioni:
            row: dict = {"NumeroConto": p.numero_conto, "tipo": p.tipo}
            for per in all_periodi:
                matching = [v.valore for v in p.valori if v.periodo == per]
                row[per] = matching[0] if matching else None
            matrix.append(row)

        json_path = path.with_suffix(".json")
        json_path.write_text(
            json.dumps({
                "request": user_request,
                "report": result.report,
                "perturbazioni": json.loads(result.model_dump_json())["perturbazioni"],
                "matrix": matrix,
            }, ensure_ascii=False),
            encoding="utf-8",
        )

        return path

    # ── API pubblica ──────────────────────────────────────────────────────────

    def generate_and_save(
        self,
        user_request: str,
        future_months: list[str] | None = None,
    ) -> WhatIfResult:
        """Genera la matrice, salva il report e restituisce il risultato."""
        result = self.generate(user_request, future_months)
        path = self._save_report(user_request, result)
        print(f"Report salvato: {path}")
        return result

    def to_matrix_code(self, result: WhatIfResult) -> str:
        """
        Genera il blocco Python della matrice di perturbazione.
        La colonna 'tipo' è inclusa nella stessa DataFrame accanto alle colonne YYYY-MM.
        """
        lines = ["result = pd.DataFrame("]
        lines.append("    {")

        tipo_dict = {p.numero_conto: p.tipo for p in result.perturbazioni}
        lines.append(f"        'tipo': {json.dumps(tipo_dict)},")

        all_periodi: list[str] = sorted(
            {v.periodo for p in result.perturbazioni for v in p.valori}
        )
        for per in all_periodi:
            vals = {
                p.numero_conto: v.valore
                for p in result.perturbazioni
                for v in p.valori
                if v.periodo == per
            }
            lines.append(f"        '{per}': {json.dumps(vals)},")

        lines.append("    }")
        lines.append(").rename_axis('NumeroConto')")
        return "\n".join(lines)


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import sys

    agent = WhatIfAgent()

    request = " ".join(sys.argv[1:]) if len(sys.argv) > 1 else (
        "Simulazione pessimistica: ricavi -5% e costi del personale +3% "
        "per tutti i mesi forecast."
    )

    print(f"Richiesta: {request}\n")
    result = agent.generate_and_save(request)

    print("\n── Matrice di perturbazione ─────────────────────────────────────")
    print(agent.to_matrix_code(result))
