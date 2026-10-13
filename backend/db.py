"""Read-only queries for the API. Every write goes through the MCP server's tools
(agents propose, approve_and_pay pays), so this module opens the DB in read-only mode."""
import sqlite3

from backend.config import ROOT

DB_PATH = ROOT / "data" / "campus_customs_new.db"


class DatabaseUnavailable(RuntimeError):
    pass


def read_conn() -> sqlite3.Connection:
    if not DB_PATH.exists():
        raise DatabaseUnavailable("Working DB is missing. POST /api/reset or run reset_db.py.")
    conn = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True, timeout=5)
    conn.row_factory = sqlite3.Row
    return conn


def query(sql: str, params: tuple = ()) -> list[dict]:
    try:
        conn = read_conn()
        try:
            return [dict(r) for r in conn.execute(sql, params)]
        finally:
            conn.close()
    except sqlite3.Error as exc:
        raise DatabaseUnavailable(f"Database error: {exc}") from exc


def tickets() -> list[dict]:
    return query("SELECT * FROM tickets ORDER BY id")


def ticket(ticket_id: int) -> dict | None:
    rows = query("SELECT * FROM tickets WHERE id = ?", (ticket_id,))
    return rows[0] if rows else None


# Each request plus who gets paid and what it's for, joined from vendors / leases / invoices.
_REQUESTS_SQL = """
SELECT pr.*,
       CASE WHEN pr.kind = 'rent' THEN l.landlord ELSE v.name END AS payee,
       CASE pr.kind
            WHEN 'rent' THEN 'Rent for ' || l.space_name || ' (lease ' || l.id || '), due ' || l.next_due
            WHEN 'invoice' THEN 'Invoice ' || pr.ref_id || ': ' || COALESCE(i.description, '') || ', due ' || i.due_date
            ELSE 'Restock ' || pr.qty || ' x ' || pr.sku || ' size ' || pr.size
       END AS description
FROM payment_requests pr
LEFT JOIN leases l   ON pr.kind = 'rent' AND l.id = pr.ref_id
LEFT JOIN invoices i ON pr.kind = 'invoice' AND i.id = pr.ref_id
LEFT JOIN vendors v  ON v.id = pr.vendor_id
"""


def payment_requests(status: str | None = None, ticket_id: int | None = None) -> list[dict]:
    sql, params = _REQUESTS_SQL + " WHERE 1=1", []
    if status:
        sql += " AND pr.status = ?"; params.append(status)
    if ticket_id is not None:
        sql += " AND pr.ticket_id = ?"; params.append(ticket_id)
    return query(sql + " ORDER BY pr.id", tuple(params))


def payment_request(request_id: int) -> dict | None:
    rows = query(_REQUESTS_SQL + " WHERE pr.id = ?", (request_id,))
    return rows[0] if rows else None


def drafts(ticket_id: int | None = None) -> list[dict]:
    if ticket_id is None:
        return query("SELECT * FROM drafts ORDER BY id")
    return query("SELECT * FROM drafts WHERE ticket_id = ? ORDER BY id", (ticket_id,))


def cash_accounts() -> list[dict]:
    return query("SELECT name, balance, date FROM cash_accounts ORDER BY name")


def count(table: str) -> int:
    assert table in {"payments", "payment_requests", "drafts"}
    return query(f"SELECT COUNT(*) AS n FROM {table}")[0]["n"]
