from __future__ import annotations

import json
import os
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

BASE_DIR = Path(__file__).resolve().parent
MAX_REQUEST_BYTES = 2 * 1024 * 1024


HOST = "0.0.0.0"
PORT = int(os.environ.get("PORT", "8080"))
APP_VERSION = "3.12"
from morphometry import estimate as estimate_morphometry
from hybrid_weighing import estimate_hybrid, estimate_two_photo_ellipse



def send_json(handler: SimpleHTTPRequestHandler, status: int, payload: dict | list) -> None:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("X-Content-Type-Options", "nosniff")
    handler.end_headers()
    handler.wfile.write(body)


class PesaBoiHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(BASE_DIR), **kwargs)

    def log_message(self, fmt: str, *args) -> None:
        print("[PesaBoi] " + (fmt % args), flush=True)

    def read_body(self) -> bytes:
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError as exc:
            raise ValueError("Tamanho da solicitação inválido.") from exc
        if length <= 0 or length > MAX_REQUEST_BYTES:
            raise ValueError("A solicitação está vazia ou excede 2 MB.")
        return self.rfile.read(length)

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/api/health":
            send_json(self, 200, {
                "ok": True,
                "app": "PesaBoi",
                "version": APP_VERSION,
                "engine": "PesaBoi 3.12 — AdSense conectado para verificação + pré-estimativa morfométrica",
                "estimator": "detecção visual no navegador + proporções médias de raça/porte + fórmula morfométrica experimental",
                "ai": True,
                "ai_provider": "COCO-SSD local no navegador; sem chave de API",
                "fallback_by_breed_or_size": False,
                "night_mode": "realce digital + lanterna/câmera IR quando o hardware suportar",
            })
            return
        if path == "/api/monetization/status":
            # A versão contém os espaços de anúncio, mas não simula uma assinatura paga.
            # A validação Premium só será ativada após integrar um gateway e autenticação.
            send_json(self, 200, {
                "ok": True,
                "premium": False,
                "premium_available": False,
                "premium_status": "payment_provider_not_configured",
                "ads_provider": "Google AdSense (optional; publisher approval and IDs required)",
                "note": "Anúncios só carregam após configuração dos IDs e consentimento publicitário. Nenhuma assinatura é cobrada ou ativada nesta versão."
            })
            return
        if path == "/api/morphometry":
            send_json(self, 200, {
                "engine": "PesaBoi 3.12 — AdSense conectado para verificação + pré-estimativa morfométrica",
                "method": "pré-estimativa visual por detecção bovina local e geometria elíptica aproximada",
                "endpoint": "POST /api/estimate/hybrid",
                "required": ["foto", "raça", "porte"],
                "note": "O fluxo do site usa detecção local e pré-estimativa experimental. A API geométrica antiga permanece apenas para compatibilidade com versões anteriores."
            })
            return
        super().do_GET()

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        if path not in {"/api/estimate/morphometry", "/api/estimate/hybrid", "/api/estimate/two-photo-ellipse"}:
            send_json(self, 404, {"error": "Endpoint não encontrado."})
            return
        try:
            payload = json.loads(self.read_body().decode("utf-8"))
            if not isinstance(payload, dict):
                raise ValueError("Envie um objeto JSON com calibração, landmarks e fatias de profundidade.")
            result = (estimate_hybrid(payload) if path == "/api/estimate/hybrid" else estimate_two_photo_ellipse(payload.get("depth_cm"), payload.get("width_cm")) if path == "/api/estimate/two-photo-ellipse" else estimate_morphometry(payload))
            send_json(self, 200, result)
        except ValueError as exc:
            send_json(self, 422, {"error": str(exc), "status": "insufficient_geometry"})
        except json.JSONDecodeError:
            send_json(self, 400, {"error": "JSON inválido."})
        except Exception as exc:
            print("[PesaBoi] Erro morfométrico:", repr(exc), flush=True)
            send_json(self, 500, {"error": "Falha ao calcular a morfometria."})


def main() -> None:
    global PORT
    candidates = [PORT] if os.environ.get("PORT") else range(PORT, PORT + 11)
    httpd = None
    last_error = None
    for candidate in candidates:
        try:
            httpd = ThreadingHTTPServer((HOST, candidate), PesaBoiHandler)
            PORT = candidate
            break
        except OSError as exc:
            last_error = exc
    if httpd is None:
        raise SystemExit(f"Não foi possível abrir uma porta para o PesaBoi: {last_error}")
    httpd.daemon_threads = True
    print("=" * 62)
    print(f"PESABOI {APP_VERSION} — AdSense conectado para verificação + detecção bovina local")
    print(f"Servidor: http://127.0.0.1:{PORT}")
    if not os.environ.get("PORT") and PORT != 8080:
        print(f"Aviso: a porta 8080 estava ocupada; usando a porta {PORT}.")
    print("API morfométrica legada disponível; o fluxo do site calcula no navegador.", flush=True)
    print("Para encerrar: CTRL + C")
    print("=" * 62, flush=True)
    if not os.environ.get("RENDER"):
        import webbrowser
        import threading as _threading
        _threading.Timer(1.0, lambda: webbrowser.open(f"http://127.0.0.1:{PORT}")).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("Encerrando PesaBoi...")
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
