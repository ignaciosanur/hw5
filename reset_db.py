"""Reset the working DB: copy the untouched original over data/campus_customs_new.db,
then add the working-copy-only tables (payment_requests, drafts) the agents need.

Used from the command line and by POST /api/reset (backend/main.py)."""
import os
import shutil
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).parent
DATA = ROOT / "data"
ORIGINAL = DATA / "campus_customs.db"
WORKING = Path(os.getenv("CC_WORKING_DB") or DATA / "campus_customs_new.db")

sys.path.insert(0, str(ROOT / "mcp_server"))
from server import EXTRA_TABLES  # noqa: E402  (one schema, shared with the server)


def reset_working_db() -> Path:
    """Restore the seeded state. Same result every time: a fresh copy of the read-only original."""
    if WORKING.resolve() == ORIGINAL.resolve():
        raise RuntimeError("CC_WORKING_DB points at the read-only original; refusing to overwrite it.")
    if not ORIGINAL.exists():
        raise FileNotFoundError(f"{ORIGINAL} is missing; unzip dataHw5.zip into data/.")
    tmp = WORKING.with_suffix(".resetting")
    shutil.copyfile(ORIGINAL, tmp)
    tmp.chmod(0o644)  # the original is read-only; the copy must stay writable
    with sqlite3.connect(tmp) as conn:
        conn.executescript(EXTRA_TABLES)
    conn.close()
    tmp.replace(WORKING)  # atomic swap: readers never see a half-copied file
    return WORKING


if __name__ == "__main__":
    reset_working_db()
    print(f"Reset {WORKING} from {ORIGINAL.name} (+ payment_requests, drafts)")
