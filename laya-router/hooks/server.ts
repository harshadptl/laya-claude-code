// The laya decision server, run as `python -c SERVER_PY <socket> <model>`.
// Keeps one laya-mlx Agent resident so each decision costs milliseconds, not a model load.
// Embedded as a string because a hooks module has no path to its own plugin folder.
export const SERVER_PY = String.raw`
import json, os, socketserver, sys
from http.server import BaseHTTPRequestHandler

import laya_mlx as laya

sock, model = sys.argv[1], sys.argv[2]
agent = laya.load(model)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def address_string(self):
        return "unix"

    def send(self, code, body):
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        self.send(200, {"ok": True, "model": model})

    def do_POST(self):
        try:
            req = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            self.send(200, agent.predict(req["state"], req["questions"]))
        except Exception as e:
            self.send(400, {"error": repr(e)})


if os.path.exists(sock):
    os.unlink(sock)
with socketserver.UnixStreamServer(sock, Handler) as server:
    print("laya-router: ready", model, flush=True)
    server.serve_forever()
`
