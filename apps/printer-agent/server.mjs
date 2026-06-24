/**
 * Yerel yazıcı listesi ve Caller ID (Fritz!Box & USB CID) donanım köprüsü.
 * Bu süreç kasa PC'de çalışır: node apps/printer-agent/server.mjs veya npm run printer-agent
 */
import http from 'node:http';
import { execSync, spawn } from 'node:child_process';
import os from 'node:os';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.PRINTER_AGENT_PORT || 3910);
const HOST = process.env.PRINTER_AGENT_HOST || '127.0.0.1';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG_FILE = path.join(__dirname, 'config.json');

// --- Global Değişkenler ---
let fritzClient = null;
let fritzEnabled = false;
let usbCidProcess = null;
let usbCidEnabled = false;

let currentConfig = {
    enabled: false,
    source: 'android',
    defaultCountryCode: '90',
    defaultAreaCode: '',
    usbCidPort: 'COM3',
    fritzBoxIP: '192.168.178.1',
    fritzBoxPort: 1012,
    webhookUrl: ''
};

function cors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
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

// --- Helper Functions ---
function readJsonBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch (err) {
                reject(err);
            }
        });
    });
}

async function triggerWebhook(webhookUrl, number) {
    if (!webhookUrl) {
        console.warn(`[Agent] Webhook URL yapılandırılmamış, çağrı es geçildi.`);
        return;
    }
    try {
        console.log(`[Agent] Webhook tetikleniyor: ${webhookUrl} (Numara: ${number})`);
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ number, name: 'Arayan Numara' })
        });
        const resText = await response.text();
        console.log(`[Agent] Webhook yanıt durumu ${response.status}: ${resText}`);
    } catch (err) {
        console.error(`[Agent] Webhook tetikleme hatası:`, err.message);
    }
}

// --- Fritz!Box Call Monitor Dinleyicisi ---
function startFritzBoxListener(ip, port, webhookUrl) {
    if (fritzClient) {
        fritzClient.destroy();
        fritzClient = null;
    }

    console.log(`[Fritz!Box] Call Monitor'a bağlanılıyor: ${ip}:${port}...`);
    fritzClient = net.connect({ host: ip, port: port }, () => {
        console.log(`[Fritz!Box] Bağlantı başarılı: ${ip}:${port}`);
    });

    let buffer = '';
    fritzClient.on('data', (data) => {
        buffer += data.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Kısmi satırı sakla

        for (const line of lines) {
            handleFritzLine(line, webhookUrl);
        }
    });

    fritzClient.on('error', (err) => {
        console.error(`[Fritz!Box] Soket hatası:`, err.message);
    });

    fritzClient.on('close', () => {
        console.log(`[Fritz!Box] Bağlantı kapandı. 10 saniye sonra tekrar denenecek...`);
        setTimeout(() => {
            if (fritzEnabled) {
                startFritzBoxListener(ip, port, webhookUrl);
            }
        }, 10000);
    });
}

function handleFritzLine(line, webhookUrl) {
    // Örnek RING satırı: 06.06.26 21:23:45;RING;0;01761234567;883212;SIP0;
    console.log(`[Fritz!Box] Veri:`, line.trim());
    const parts = line.split(';');
    if (parts[1] === 'RING') {
        const incomingNumber = parts[3];
        if (incomingNumber) {
            console.log(`[Fritz!Box] Yeni çağrı yakalandı! Arayan: ${incomingNumber}`);
            triggerWebhook(webhookUrl, incomingNumber);
        }
    }
}

// --- USB CID (Serial Port / COM Port) Dinleyicisi ---
function startUsbCidListener(portName, webhookUrl) {
    if (usbCidProcess) {
        try {
            usbCidProcess.kill();
        } catch {}
        usbCidProcess = null;
    }

    console.log(`[USB CID] PowerShell Seri Okuyucu başlatılıyor: ${portName}...`);
    
    // Windows PowerShell ile COM Port dinleme betiği
    const psCode = `
$port = New-Object System.IO.Ports.SerialPort "${portName}", 9600, None, 8, one
$port.ReadTimeout = 5000
try {
    $port.Open()
    Write-Output "CONNECTED"
    while ($port.IsOpen) {
        try {
            $line = $port.ReadLine()
            if ($line) {
                Write-Output "LINE: $line"
            }
        } catch [TimeoutException] {
            # Loop
        }
    }
} catch {
    Write-Error $_.Exception.Message
    exit 1
}
`;

    usbCidProcess = spawn('powershell', ['-NoProfile', '-Command', psCode]);

    usbCidProcess.stdout.on('data', (data) => {
        const output = data.toString();
        const lines = output.split(/\r?\n/);
        for (const line of lines) {
            if (line.startsWith('LINE: ')) {
                const serialLine = line.substring(6);
                handleUsbCidLine(serialLine, webhookUrl);
            } else if (line.trim() === 'CONNECTED') {
                console.log(`[USB CID] Port ${portName} başarıyla dinlemeye alındı.`);
            }
        }
    });

    usbCidProcess.stderr.on('data', (data) => {
        console.error(`[USB CID] PowerShell Hata Çıktısı:`, data.toString().trim());
    });

    usbCidProcess.on('close', (code) => {
        console.log(`[USB CID] Dinleme süreci kapandı (Kod: ${code}).`);
    });
}

function handleUsbCidLine(line, webhookUrl) {
    console.log(`[USB CID] Gelen veri:`, line.trim());
    let number = null;

    // 1. "NUMBER: 0532..." formatını ara
    const numMatch = /NUMBER:\s*([+0-9]+)/i.exec(line);
    if (numMatch) {
        number = numMatch[1];
    } else {
        // 2. Satır içindeki 7 ila 15 haneli telefon numarasını ara
        const digitsMatch = /(?:^|\D)(\d{7,15})(?:$|\D)/.exec(line);
        if (digitsMatch) {
            number = digitsMatch[1];
        }
    }

    if (number) {
        console.log(`[USB CID] Yakalanan numara:`, number);
        triggerWebhook(webhookUrl, number);
    }
}

// --- Yapılandırmayı Uygulama Mantığı ---
function applyConfig() {
    // Fritz!Box Call Monitor kontrolü
    if (!currentConfig.enabled || currentConfig.source !== 'fritzbox') {
        fritzEnabled = false;
        if (fritzClient) {
            fritzClient.destroy();
            fritzClient = null;
            console.log(`[Fritz!Box] Dinleyici durduruldu.`);
        }
    } else {
        fritzEnabled = true;
        const ip = currentConfig.fritzBoxIP || '192.168.178.1';
        const port = Number(currentConfig.fritzBoxPort || 1012);
        startFritzBoxListener(ip, port, currentConfig.webhookUrl);
    }

    // USB CID Serial kontrolü
    if (!currentConfig.enabled || currentConfig.source !== 'usbcid') {
        usbCidEnabled = false;
        if (usbCidProcess) {
            try { usbCidProcess.kill(); } catch {}
            usbCidProcess = null;
            console.log(`[USB CID] Dinleyici durduruldu.`);
        }
    } else {
        usbCidEnabled = true;
        const portName = currentConfig.usbCidPort || 'COM3';
        startUsbCidListener(portName, currentConfig.webhookUrl);
    }
}

function loadPersistedConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            const data = fs.readFileSync(CONFIG_FILE, 'utf8');
            currentConfig = { ...currentConfig, ...JSON.parse(data) };
            console.log(`[Agent] Kayıtlı konfigürasyon yüklendi:`, currentConfig);
            applyConfig();
        }
    } catch (err) {
        console.error(`[Agent] Kayıtlı konfigürasyon okunamadı:`, err.message);
    }
}

function saveConfig(config) {
    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
    } catch (err) {
        console.error(`[Agent] Konfigürasyon kaydedilemedi:`, err.message);
    }
}

// --- HTTP Sunucu İstek Yönetimi ---
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

    if (req.method === 'POST' && url.pathname === '/caller-id/config') {
        readJsonBody(req)
            .then(body => {
                currentConfig = { ...currentConfig, ...body };
                saveConfig(currentConfig);
                applyConfig();

                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ ok: true, config: currentConfig }));
            })
            .catch(err => {
                res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ ok: false, error: 'Geçersiz JSON formatı: ' + err.message }));
            });
        return;
    }

    if (req.method === 'GET' && url.pathname === '/caller-id/config') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, config: currentConfig }));
        return;
    }

    res.writeHead(404);
    res.end();
});

server.listen(PORT, HOST, () => {
    console.log(`[nextpos-agent] Sunucu dinlemede: http://${HOST}:${PORT}/printers (Ctrl+C ile çık)`);
    // Başlangıçta kayıtlı konfigürasyonu yükle
    loadPersistedConfig();
});
