/**
 * Kasadaki PC'de çalışan yerel köprü (printer-agent) üzerinden sistem yazıcı listesi.
 * Geliştirmede Vite /__printer_agent → 127.0.0.1:3910 yönlendirir.
 */
export type PrinterAgentListResult = { ok: boolean; printers: string[]; error?: string };

export function getPrinterListUrl(): string {
    const env = typeof import.meta !== 'undefined' && import.meta.env?.VITE_PRINTER_AGENT_LIST_URL;
    if (env && String(env).trim()) return String(env).trim();
    if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
        return '/__printer_agent/printers';
    }
    return 'http://127.0.0.1:3910/printers';
}

export async function fetchLocalPrinterList(): Promise<PrinterAgentListResult> {
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
