"""Serve only the explicitly prepared private review directory on loopback."""
import argparse
import os
import subprocess
import sys
import time
import urllib.request
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
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--root',type=Path,required=True);p.add_argument('--port',type=int,default=8842);p.add_argument('--detach',action='store_true');a=p.parse_args()
    root=a.root.resolve();assert (root/'manifest.json').is_file(), 'Prepare review manifest first'
    pid_file=root.parent/f'review-server-{a.port}.pid'
    if a.detach:
        log_path=root.parent/f'review-server-{a.port}.log'
        with log_path.open('ab') as log:
            child=subprocess.Popen([sys.executable,str(Path(__file__).resolve()),'--root',str(root),'--port',str(a.port)],stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT,start_new_session=True,close_fds=True)
        for _ in range(40):
            if child.poll() is not None:
                raise SystemExit(f'Server failed; see {log_path}')
            if pid_file.exists() and pid_file.read_text().strip()==str(child.pid):
                try:
                    with urllib.request.urlopen(f'http://127.0.0.1:{a.port}/manifest.json',timeout=.5) as response:
                        assert response.status==200
                    print(f'Private review http://127.0.0.1:{a.port}/; PID {child.pid}; log {log_path}')
                    raise SystemExit(0)
                except (OSError,AssertionError):
                    pass
            time.sleep(.1)
        child.terminate()
        raise SystemExit(f'Server did not become ready; see {log_path}')
    server=ThreadingHTTPServer(('127.0.0.1',a.port),partial(Handler,directory=str(root)))
    pid_file.write_text(str(os.getpid())+'\n')
    print(f'Private review at http://127.0.0.1:{a.port}/ (root {root})',flush=True)
    server.serve_forever()
