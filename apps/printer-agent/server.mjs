/**
 * Yerel yazıcı listesi köprüsü (POS tarayıcısı güvenlik nedeniyle OS yazıcılarını göremez).
 * Bu süreç kasa PC'de çalışır: node apps/printer-agent/server.mjs  veya  npm run printer-agent
 *
 * GET http://127.0.0.1:3910/printers  → { "ok": true, "printers": ["EPSON TM...", ...] }
 */
import http from 'node:http';
import { execSync } from 'node:child_process';
import os from 'node:os';

const PORT = Number(process.env.PRINTER_AGENT_PORT || 3910);
const HOST = process.env.PRINTER_AGENT_HOST || '127.0.0.1';

function cors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function listPrinters() {
    const platform = os.platform();
    if (platform === 'win32') {
        try {
            const out = execSync(
                'powershell -NoProfile -Command "Get-Printer | Select-Object -ExpandProperty Name"',
                { encoding: 'utf8', timeout: 20000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }
            );
            return out
                .split(/\r?\n/)
                .map((s) => s.trim())
                .filter(Boolean);
        } catch {
            return [];
        }
    }
    try {
        const out = execSync('lpstat -p 2>/dev/null', { encoding: 'utf8', timeout: 15000, maxBuffer: 1024 * 1024 });
        const names = [];
        for (const line of out.split('\n')) {
            const m = /^printer\s+(\S+)/i.exec(line.trim());
            if (m) names.push(m[1]);
        }
        return names;
    } catch {
        try {
            const out = execSync('lpstat -a 2>/dev/null', { encoding: 'utf8', timeout: 15000 });
            return out
                .split('\n')
                .map((l) => l.trim().split(/\s+/)[0])
                .filter(Boolean);
        } catch {
            return [];
        }
    }
}

const server = http.createServer((req, res) => {
    cors(res);
    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }
    const url = new URL(req.url || '/', `http://${HOST}`);
    if (req.method === 'GET' && (url.pathname === '/printers' || url.pathname === '/')) {
        try {
            const printers = listPrinters();
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ ok: true, printers, platform: os.platform() }));
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ ok: false, printers: [], error: String(e?.message || e) }));
        }
        return;
    }
    if (req.method === 'GET' && url.pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
    }
    res.writeHead(404);
    res.end();
});

server.listen(PORT, HOST, () => {
    console.log(`[printer-agent] http://${HOST}:${PORT}/printers  (Ctrl+C ile çık)`);
});
