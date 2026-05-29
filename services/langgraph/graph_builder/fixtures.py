"""Phase 1a -- load the canonical Add Employee IR (shared with the TS compiler)."""

import json
from pathlib import Path
from typing import Any

_FIXTURE_DIR = Path(__file__).parent / "fixtures"


def load_add_employee() -> dict[str, Any]:
    """The canonical Add Employee definition (byte-identical to the TS compiler fixture)."""
    with open(_FIXTURE_DIR / "add-employee.langgraph.json", encoding="utf-8") as fh:
        return json.load(fh)
