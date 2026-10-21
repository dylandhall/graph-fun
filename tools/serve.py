"""Dev server for Graph Fun: serves the project on all interfaces (so phones on the
local network can connect), with caching off and .cjs served as JavaScript.

Python's plain http.server sends .cjs as application/octet-stream, which Safari may
refuse to run, and lets browsers cache stale scripts while you edit.

Usage: python3 tools/serve.py [port]   (default 8080, or $PORT)
"""
import functools
import http.server
import os
import socket
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = int(sys.argv[1] if len(sys.argv) > 1 else os.environ.get('PORT', 8080))


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.cjs': 'text/javascript',
        '.js': 'text/javascript',
        '.mjs': 'text/javascript',
        '.woff2': 'font/woff2',
        '.wav': 'audio/wav',
    }

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


def lan_address():
    # Connecting a UDP socket sends nothing; it just picks the outgoing interface.
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(('192.0.2.1', 9))
            return s.getsockname()[0]
    except OSError:
        return None


http.server.ThreadingHTTPServer.allow_reuse_address = True
server = http.server.ThreadingHTTPServer(('0.0.0.0', PORT), functools.partial(Handler, directory=ROOT))
print(f'Graph Fun on http://localhost:{PORT}/', flush=True)
lan = lan_address()
if lan:
    print(f'On your network: http://{lan}:{PORT}/', flush=True)
try:
    server.serve_forever()
except KeyboardInterrupt:
    pass
