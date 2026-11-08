/**
 * Public gateway for sharing the prototype through a tunnel.
 *  - Access-code gate (cookie) so only people with the code can use the app (it triggers paid AWS calls).
 *  - /voice WebSocket  -> voice-server (VOICE_PORT, default 3001)
 *  - everything else   -> Next.js (APP_PORT, default 3100), incl. dev HMR websockets
 * Run: ACCESS_CODE=xxxx npx tsx gateway.mts   (prints the code if not set)
 */
import http from "node:http";
import net from "node:net";
import crypto from "node:crypto";

const PORT = Number(process.env.GATEWAY_PORT || 8080);
const APP_PORT = Number(process.env.APP_PORT || 3100);
const VOICE_PORT = Number(process.env.VOICE_PORT || 3001);
const CODE = process.env.ACCESS_CODE || crypto.randomBytes(3).toString("hex").toUpperCase();
const SECRET = crypto.randomBytes(16).toString("hex");
const TOKEN = crypto.createHmac("sha256", SECRET).update(CODE).digest("hex").slice(0, 32);
const COOKIE = "udyam_access";

function authed(req: http.IncomingMessage) {
  const c = req.headers.cookie ?? "";
  return c.split(/;\s*/).some((p) => p === `${COOKIE}=${TOKEN}`);
}

const LOGIN = (err = "") => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Accel Business · access</title><style>
body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#f4f4f5;color:#1d1d1f}
body:before{content:"";position:fixed;width:520px;height:520px;top:-160px;right:-120px;border-radius:50%;background:rgba(228,0,0,.10);filter:blur(90px)}
form{position:relative;background:rgba(255,255,255,.62);backdrop-filter:blur(22px);border:1px solid rgba(255,255,255,.75);border-radius:28px;padding:32px;width:min(340px,86vw);box-shadow:0 10px 30px rgba(0,0,0,.05)}
h1{font-size:20px;margin:0 0 6px;letter-spacing:-.02em}p{color:#6e6e73;font-size:14px;margin:0 0 20px}
input{width:100%;box-sizing:border-box;height:44px;border-radius:12px;border:1px solid rgba(0,0,0,.1);padding:0 14px;font-size:16px;letter-spacing:.2em;text-transform:uppercase;background:rgba(255,255,255,.8)}
button{margin-top:12px;width:100%;height:44px;border:0;border-radius:999px;background:#e40000;color:#fff;font-size:15px;font-weight:600;cursor:pointer}
.e{color:#e40000;font-size:13px;margin-top:10px}
</style></head><body><form method="GET" action="/__access"><h1>Accel Business</h1><p>Enter the access code you were given.</p>
<input name="code" autocomplete="off" autofocus required><button>Continue</button>${err ? `<div class="e">${err}</div>` : ""}</form></body></html>`;

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  if (url.pathname === "/__access") {
    const ok = (url.searchParams.get("code") ?? "").trim().toUpperCase() === CODE;
    if (!ok) {
      res.writeHead(401, { "content-type": "text/html; charset=utf-8" });
      return res.end(LOGIN("Wrong code."));
    }
    res.writeHead(302, { "set-cookie": `${COOKIE}=${TOKEN}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=86400`, location: "/" });
    return res.end();
  }
  if (!authed(req)) {
    res.writeHead(401, { "content-type": "text/html; charset=utf-8" });
    return res.end(LOGIN());
  }
  const up = http.request(
    { host: "127.0.0.1", port: APP_PORT, method: req.method, path: req.url, headers: { ...req.headers, "x-forwarded-proto": "https" } },
    (r) => {
      res.writeHead(r.statusCode ?? 502, r.headers);
      r.pipe(res);
    },
  );
  up.on("error", () => {
    if (!res.headersSent) res.writeHead(502, { "content-type": "text/plain" });
    res.end("App is not running");
  });
  req.pipe(up);
});

// WebSocket upgrades: /voice -> voice server, others (Next HMR) -> app
server.on("upgrade", (req, socket, head) => {
  if (!authed(req)) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    return socket.destroy();
  }
  const path = req.url ?? "/";
  const target = path.startsWith("/voice") ? VOICE_PORT : APP_PORT;
  const up = net.connect(target, "127.0.0.1", () => {
    const lines = [`${req.method} ${path} HTTP/1.1`];
    for (let i = 0; i < req.rawHeaders.length; i += 2) lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
    up.write(lines.join("\r\n") + "\r\n\r\n");
    if (head?.length) up.write(head);
    socket.pipe(up).pipe(socket);
  });
  up.on("error", () => socket.destroy());
  socket.on("error", () => up.destroy());
});

server.listen(PORT, () => {
  console.log(`gateway on http://localhost:${PORT} -> app :${APP_PORT}, voice :${VOICE_PORT}`);
  console.log(`ACCESS CODE: ${CODE}`);
});
