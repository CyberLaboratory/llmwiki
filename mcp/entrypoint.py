"""Docker entrypoint for hosted and local MCP modes."""

import os
import sys

import uvicorn


def main() -> None:
    mode = os.getenv("MODE", "hosted").strip().lower()
    port = int(os.getenv("PORT", "8080"))

    if mode == "hosted":
        from hosted import app
    elif mode == "local":
        from local_http import app
    else:
        print("MODE must be 'hosted' or 'local'", file=sys.stderr)
        raise SystemExit(2)

    uvicorn.run(app, host="0.0.0.0", port=port)


if __name__ == "__main__":
    main()
