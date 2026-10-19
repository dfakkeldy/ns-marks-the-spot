"""Serve local pilot output using the existing Fletcher tile server."""
import argparse
from functools import partial

from tools.fletcher.serve_corridor_tiles import TileHandler, TileServer


class PilotHandler(TileHandler):
    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", required=True, help="Parent of the generated revision, containing only local pilot output")
    parser.add_argument("--port", type=int, default=4199)
    args = parser.parse_args()
    with TileServer(("127.0.0.1", args.port), partial(PilotHandler, directory=args.directory)) as server:
        print(f"Local CHM tiles: http://127.0.0.1:{args.port}", flush=True)
        server.serve_forever()


if __name__ == "__main__":
    main()
