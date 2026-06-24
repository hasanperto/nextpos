/**
 * Kasadaki PC'de çalışan yerel köprü (printer-agent) üzerinden sistem yazıcı listesi.
 * Geliştirmede Vite /__printer_agent → 127.0.0.1:3910 yönlendirir.
 */
export type PrinterAgentListResult = { ok: boolean; printers: string[]; error?: string };

const AGENT_SKIP_KEY = 'nextpos_printer_agent_skip_until';
const AGENT_PROBE_MS = 900;
const AGENT_SKIP_MS = 10 * 60 * 1000;

let agentProbePromise: Promise<boolean> | null = null;

export function getPrinterListUrl(): string {
    const env = typeof import.meta !== 'undefined' && import.meta.env?.VITE_PRINTER_AGENT_LIST_URL;
    if (env && String(env).trim()) return String(env).trim();
    return 'http://127.0.0.1:3910/printers';
}

export function getCallerIdConfigUrl(): string {
    const env = typeof import.meta !== 'undefined' && import.meta.env?.VITE_PRINTER_AGENT_LIST_URL;
    if (env && String(env).trim()) {
        const base = String(env).trim().replace(/\/printers$/, '');
        return `${base}/caller-id/config`;
    }
    return 'http://127.0.0.1:3910/caller-id/config';
}

function readSkipUntil(): number {
    try {
        const raw = sessionStorage.getItem(AGENT_SKIP_KEY);
        const n = raw ? Number(raw) : 0;
        return Number.isFinite(n) ? n : 0;
    } catch {
        return 0;
    }
}

function markAgentOffline(): void {
    try {
        sessionStorage.setItem(AGENT_SKIP_KEY, String(Date.now() + AGENT_SKIP_MS));
    } catch {
        /* ignore */
    }
}

function clearAgentOfflineMark(): void {
    try {
        sessionStorage.removeItem(AGENT_SKIP_KEY);
    } catch {
        /* ignore */
    }
}

/** Agent kapalıysa tekrar tekrar 502 üretmemek için önbellekli probe */
export async function isPrinterAgentOnline(): Promise<boolean> {
    if (Date.now() < readSkipUntil()) return false;
    if (agentProbePromise) return agentProbePromise;

    agentProbePromise = (async () => {
        try {
            const r = await fetch(getPrinterListUrl(), {
                method: 'GET',
                signal: AbortSignal.timeout(AGENT_PROBE_MS),
            });
            if (r.ok) {
                clearAgentOfflineMark();
                return true;
            }
        } catch {
            /* agent yok */
        }
        markAgentOffline();
        return false;
    })().finally(() => {
        agentProbePromise = null;
    });

    return agentProbePromise;
}

export type CallerIdAgentConfig = {
    enabled: boolean;
    source: string;
    defaultCountryCode: string;
    defaultAreaCode: string;
    usbCidPort: string;
    fritzBoxIP: string;
    fritzBoxPort: number;
    webhookUrl: string;
};

/** Caller ID ayarını yerel agent'a gönderir; agent yoksa istek atılmaz */
export async function syncCallerIdConfigToAgent(config: CallerIdAgentConfig): Promise<boolean> {
    if (!config.enabled) return false;
    const online = await isPrinterAgentOnline();
    if (!online) return false;

    try {
        const r = await fetch(getCallerIdConfigUrl(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config),
            signal: AbortSignal.timeout(2500),
        });
        if (!r.ok) markAgentOffline();
        return r.ok;
    } catch {
        markAgentOffline();
        return false;
    }
}

export async function fetchLocalPrinterList(): Promise<PrinterAgentListResult> {
    const online = await isPrinterAgentOnline();
    if (!online) {
        return { ok: false, printers: [], error: 'printer-agent kapalı' };
    }

    const url = getPrinterListUrl();
    try {
        const r = await fetch(url, { signal: AbortSignal.timeout(12000) });
        if (!r.ok) {
            return { ok: false, printers: [], error: `HTTP ${r.status}` };
        }
        const data = (await r.json()) as { ok?: boolean; printers?: string[]; error?: string };
        const list = Array.isArray(data.printers) ? data.printers.filter((x) => typeof x === 'string') : [];
        return { ok: data.ok !== false, printers: list, error: data.error };
    } catch (e) {
        return {
            ok: false,
            printers: [],
            error: e instanceof Error ? e.message : String(e),
        };
    }
}
