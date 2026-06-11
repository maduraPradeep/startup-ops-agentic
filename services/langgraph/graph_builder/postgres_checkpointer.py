"""Phase 1c -- production checkpointer binding: langgraph's ``PostgresSaver``.

The runtime checkpointer is langgraph-owned and **separate from our ``skill_executions`` index**:
``PostgresSaver`` manages its own ``checkpoints*`` tables (created by ``.setup()``), while
``skill_executions`` remains our application-level execution index and is **not touched** here.

Tests use the in-memory ``MemorySaver`` (see ``LangGraphBackend.compile``). Production -- and the
DB-reachability-gated test -- use ``PostgresSaver`` against the Phase 1b Supabase Postgres. The DSN
is resolved from the environment with a local-dev fallback so the suite can exercise the Postgres
leg when the DB is up and skip it cleanly when it is not (same skip-not-fail pattern as the rest of
the suite).
"""

import os
from contextlib import contextmanager
from typing import Any, Iterator

# Local Supabase Postgres (Phase 1b migrations + seed already applied).
LOCAL_FALLBACK_DSN = "postgresql://postgres:postgres@localhost:54322/postgres"

# Checked in order; first non-empty wins. Falls back to the local dev DSN.
_DSN_ENV_VARS = ("LANGGRAPH_DB_URL", "SUPABASE_DB_URL", "DATABASE_URL")


def resolve_dsn() -> str:
    """The Postgres DSN for the langgraph checkpointer (env, else the local dev fallback)."""
    for var in _DSN_ENV_VARS:
        value = os.environ.get(var)
        if value:
            return value
    return LOCAL_FALLBACK_DSN


def postgres_reachable(dsn: str | None = None, timeout: int = 3) -> bool:
    """True iff a trivial connection to ``dsn`` succeeds -- used to gate the Postgres test leg."""
    try:  # pragma: no cover - depends on a live DB
        import psycopg  # type: ignore
    except ImportError:  # pragma: no cover
        return False
    dsn = dsn or resolve_dsn()
    try:  # pragma: no cover - depends on a live DB
        with psycopg.connect(dsn, connect_timeout=timeout) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
                cur.fetchone()
        return True
    except Exception:  # pragma: no cover - DB down / unreachable
        return False


@contextmanager
def postgres_saver(dsn: str | None = None, *, setup: bool = True) -> Iterator[Any]:
    """Yield a ready ``PostgresSaver`` bound to ``dsn`` (context-managed connection pool).

    ``PostgresSaver`` owns its checkpoint tables; ``setup()`` creates/migrates them on first use.
    This is a context manager because the saver holds a live connection pool that must be closed.
    """
    from langgraph.checkpoint.postgres import PostgresSaver  # type: ignore

    dsn = dsn or resolve_dsn()
    with PostgresSaver.from_conn_string(dsn) as saver:
        if setup:
            saver.setup()
        yield saver
