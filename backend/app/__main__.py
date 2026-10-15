"""Single command to run the whole backend: `python -m app`.

Serves the REST API and the presence WebSocket on the same host/port, so the
frontend needs one origin for both.
"""

import os

import uvicorn


def main() -> None:
    host = os.getenv("PIERPLACE_HOST", "0.0.0.0")
    port = int(os.getenv("PIERPLACE_PORT", "8000"))
    reload = os.getenv("PIERPLACE_RELOAD", "1").lower() not in ("0", "false", "no")
    uvicorn.run("app.main:app", host=host, port=port, reload=reload)


if __name__ == "__main__":
    main()
