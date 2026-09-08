"""Serve a local corridor preview with persistent connections for tile bursts."""

import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class TileHandler(SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"


class TileServer(ThreadingHTTPServer):
    request_queue_size = 128
    daemon_threads = True


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--directory", required=True)
    p.add_argument("--port", type=int, default=4198)
    a = p.parse_args()
    with TileServer(
        ("127.0.0.1", a.port), partial(TileHandler, directory=a.directory)
    ) as server:
        print(f"Local tiles: http://127.0.0.1:{a.port}", flush=True)
        server.serve_forever()


if __name__ == "__main__":
    main()
