#!/usr/bin/env python3
"""CLI wrapper for WhatIfAgent — outputs { report, perturbazioni, matrix } as JSON to stdout.

`matrix` is a list of records where each row represents one NumeroConto with columns:
  NumeroConto, tipo, and one column per YYYY-MM period (the perturbation matrix as a DataFrame).
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from whatif_agent import WhatIfAgent  # noqa: E402

if __name__ == "__main__":
    request = " ".join(sys.argv[1:]) if len(sys.argv) > 1 else ""
    if not request.strip():
        print(json.dumps({"error": "No request provided"}))
        sys.exit(1)

    agent = WhatIfAgent()
    result = agent.generate_and_save(request)  # also saves .md report to agents/what-if/reports/

    # Build matrix as list of records (one row per NumeroConto)
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

    output = {
        "report": result.report,
        "perturbazioni": json.loads(result.model_dump_json())["perturbazioni"],
        "matrix": matrix,
    }
    print(json.dumps(output))
