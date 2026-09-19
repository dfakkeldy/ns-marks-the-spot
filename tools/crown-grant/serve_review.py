"""Serve only the explicitly prepared private review directory on loopback."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control','no-store')
        super().end_headers()
    def list_directory(self,path):
        self.send_error(403,'Directory listings disabled')
        return None

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--root',type=Path,required=True);p.add_argument('--port',type=int,default=8765);a=p.parse_args()
    root=a.root.resolve();assert (root/'manifest.json').is_file(), 'Prepare review manifest first'
    server=ThreadingHTTPServer(('127.0.0.1',a.port),partial(Handler,directory=str(root)))
    print(f'Private review at http://127.0.0.1:{a.port}/ (root {root})',flush=True)
    server.serve_forever()
