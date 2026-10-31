#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
出海宝 · 本地 LLM 代理
=====================
作用：把 OpenAI Key 留在本机服务端，浏览器只访问 localhost，彻底解决：
  1) Key 不出浏览器（不再存 localStorage / 不再暴露给打开页面的人）
  2) 跨域 CORS（由服务端统一加 CORS 头）
  3) 网络问题（可用 HTTP_PROXY/HTTPS_PROXY 环境变量走代理，走不通时返回友好错误）

零第三方依赖，仅用 Python 标准库。

用法：
  1. 把 key 写进 .env（同目录）：  OPENAI_API_KEY=sk-xxxx
  2. 启动：  python proxy.py
     可选参数：python proxy.py --port 8787 --model gpt-4o-mini
  3. 浏览器端访问：http://127.0.0.1:8787
     接口：
       GET  /health          -> {"ok": true, "configured": true/false}
       POST /chat            -> 转发 chat/completions
       GET  /                -> 返回一个简单的状态页

可选代理（网络问题）：启动前设置环境变量
  set HTTPS_PROXY=http://127.0.0.1:7890
"""

import os
import sys
import json
import argparse
import urllib.request
import urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# ---------- 配置 ----------
HERE = os.path.dirname(os.path.abspath(__file__))
ENV_FILE = os.path.join(HERE, ".env")

DEFAULT_ENDPOINT = "https://api.openai.com/v1/chat/completions"
DEFAULT_MODEL = "gpt-4o-mini"

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
}

# 允许的来源（默认本机；如需局域网访问可放宽）
ALLOWED_ORIGINS = None  # None 表示不限制来源（本机演示用）


def load_env():
    """读取 .env，返回 dict；兼容 KEY=value 与 KEY="value"。"""
    cfg = {}
    if os.path.exists(ENV_FILE):
        with open(ENV_FILE, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                k = k.strip()
                v = v.strip().strip('"').strip("'")
                cfg[k] = v
    return cfg


def get_api_key():
    """优先读环境变量，其次读 .env。"""
    env = load_env()
    return os.environ.get("OPENAI_API_KEY", "").strip() or env.get("OPENAI_API_KEY", "").strip()


def get_config(args):
    env = load_env()
    endpoint = os.environ.get("OPENAI_ENDPOINT", "").strip() or env.get("OPENAI_ENDPOINT", "").strip() or DEFAULT_ENDPOINT
    model = args.model or os.environ.get("OPENAI_MODEL", "").strip() or env.get("OPENAI_MODEL", "").strip() or DEFAULT_MODEL
    # 出站代理：优先 .env 的 PROXY_URL，其次 HTTPS_PROXY / HTTP_PROXY 环境变量
    proxy = env.get("PROXY_URL", "").strip() or os.environ.get("HTTPS_PROXY", "").strip() or os.environ.get("HTTP_PROXY", "").strip()
    return endpoint, model, proxy


def call_openai(endpoint, model, key, messages, temperature=0.8, max_tokens=1500, proxy=""):
    """同步调用 OpenAI，返回 (status, body_dict)。proxy 形如 http://127.0.0.1:7897"""
    payload = json.dumps({
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }).encode("utf-8")

    req = urllib.request.Request(endpoint, data=payload, method="POST")
    req.add_header("Content-Type", "application/json")
    req.add_header("Authorization", "Bearer " + key)

    # 构造 opener：有代理就走代理，否则直连
    if proxy:
        handler = urllib.request.ProxyHandler({"http": proxy, "https": proxy})
    else:
        handler = urllib.request.ProxyHandler({})
    opener = urllib.request.build_opener(handler)

    try:
        with opener.open(req, timeout=60) as resp:
            data = resp.read().decode("utf-8")
            return resp.status, json.loads(data)
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        try:
            return e.code, json.loads(body)
        except Exception:
            return e.code, {"error": {"message": body[:500]}}
    except urllib.error.URLError as e:
        return 502, {"error": {"message": "无法连接 OpenAI（网络问题）：" + str(e.reason)}}
    except Exception as e:
        return 500, {"error": {"message": "代理内部错误：" + str(e)}}


class Handler(BaseHTTPRequestHandler):
    server_version = "ChuhaibaoProxy/1.0"

    def _send_json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        for k, v in CORS_HEADERS.items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def _send_html(self, code, html):
        body = html.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        for k, v in CORS_HEADERS.items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        for k, v in CORS_HEADERS.items():
            self.send_header(k, v)
        self.end_headers()

    def do_GET(self):
        if self.path in ("/", "/health", "/healthz"):
            key = get_api_key()
            if self.path.startswith("/health"):
                self._send_json(200, {"ok": True, "configured": bool(key)})
            else:
                masked = (key[:6] + "..." + key[-4:]) if len(key) > 12 else ("已配置" if key else "未配置")
                self._send_html(200, self._status_page(masked))
            return
        self._send_json(404, {"error": {"message": "not found"}})

    def do_POST(self):
        if self.path not in ("/chat", "/v1/chat/completions"):
            self._send_json(404, {"error": {"message": "not found"}})
            return

        key = get_api_key()
        if not key:
            self._send_json(401, {"error": {"message": "服务端未配置 OPENAI_API_KEY（请编辑 .env）"}})
            return

        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length) if length else b""
        try:
            req = json.loads(raw.decode("utf-8"))
        except Exception:
            self._send_json(400, {"error": {"message": "请求体不是合法 JSON"}})
            return

        messages = req.get("messages") or []
        temperature = req.get("temperature", 0.8)
        max_tokens = req.get("max_tokens", 1500)

        endpoint, model, proxy = get_config(self.server.args)
        # 允许前端覆盖 model，但默认用服务端配置
        model = req.get("model") or model

        status, body = call_openai(endpoint, model, key, messages, temperature, max_tokens, proxy)

        # 兼容前端期望的 {choices:[...]} 结构；出错时把错误透传，前端据此兜底
        self._send_json(status, body)

    def log_message(self, fmt, *args):
        sys.stderr.write("[proxy] " + fmt % args + "\n")

    def _status_page(self, masked_key):
        return f"""<!DOCTYPE html>
<html lang="zh"><head><meta charset="utf-8"><title>出海宝代理</title>
<style>
body{{font-family:-apple-system,'Segoe UI',sans-serif;background:#0f172a;color:#e2e8f0;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}}
.card{{background:#1e293b;border-radius:16px;padding:40px;max-width:420px;box-shadow:0 10px 40px rgba(0,0,0,.4)}}
h1{{font-size:20px;margin:0 0 8px}} .ok{{color:#34d399}} .no{{color:#fbbf24}}
p{{color:#94a3b8;line-height:1.7;font-size:14px}} code{{background:#0f172a;padding:2px 6px;border-radius:4px;color:#7dd3fc}}
</style></head><body><div class="card">
<h1>🚀 出海宝 · 本地 LLM 代理</h1>
<p class="{'ok' if masked_key != '未配置' else 'no'}">{'✅ 运行中，Key 已配置：' + masked_key if masked_key != '未配置' else '⚠️ 运行中，但未配置 Key（编辑 .env 后重启）'}</p>
<p>接口：<code>GET /health</code> · <code>POST /chat</code></p>
<p>浏览器端现在只需访问 <code>http://127.0.0.1:8787/chat</code>，Key 不再经过浏览器。</p>
</div></body></html>"""


def main():
    ap = argparse.ArgumentParser(description="出海宝本地 LLM 代理")
    ap.add_argument("--port", type=int, default=8787, help="监听端口（默认 8787）")
    ap.add_argument("--host", default="127.0.0.1", help="监听地址（默认 127.0.0.1，仅本机）")
    ap.add_argument("--model", default=None, help="默认模型（默认 gpt-4o-mini）")
    args = ap.parse_args()

    server = ThreadingHTTPServer((args.host, args.port), Handler)
    server.args = args  # 注入给 Handler 用

    key = get_api_key()
    endpoint, model, proxy = get_config(args)
    print("=" * 50)
    print("  出海宝 · 本地 LLM 代理")
    print("=" * 50)
    print(f"  监听地址 : http://{args.host}:{args.port}")
    print(f"  Key 状态 : {'已配置' if key else '未配置（请编辑 .env）'}")
    print(f"  出站代理 : {proxy if proxy else '直连（未设代理，可能连不上 OpenAI）'}")
    print(f"  接口     : GET /health  |  POST /chat")
    print("  关闭     : Ctrl+C")
    print("=" * 50)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止。")
        server.server_close()


if __name__ == "__main__":
    main()
