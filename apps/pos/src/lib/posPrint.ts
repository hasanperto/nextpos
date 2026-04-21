/**
 * Tarayıcı üzerinden 80mm tarzı mutfak / adisyon çıktısı (window.print).
 * ESC/POS donanım köprüsü yok; istenirse aynı HTML QZ / yerel servise yönlendirilebilir.
 */

export type PrintStationSettings = {
    /** OS / Windows’ta “Yazıcılar” listesindeki ad (yerel köprüden seçilir) */
    printers?: {
        id: string;
        name: string;
        role: 'kitchen' | 'receipt' | 'bar';
        systemPrinterName?: string;
    }[];
    /** Mutfağa gönder (sipariş oluştur, ödeme yok) */
    kitchenAutoPrint?: boolean;
    /** Hızlı ödeme / checkout tek akış */
    receiptOnPayment?: boolean;
    /** Masa oturumu kapatılınca toplu ödeme */
    receiptOnSessionClose?: boolean;
    reprintKitchenEnabled?: boolean;
    reprintReceiptEnabled?: boolean;
};

function getPrintCfg(settings: unknown): PrintStationSettings {
    const s = settings as { integrations?: { printStations?: PrintStationSettings } } | null;
    return s?.integrations?.printStations || {};
}

function esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function openPrintWindow(title: string, innerHtml: string): void {
    const w = window.open('', '_blank', 'width=400,height=700');
    if (!w) {
        console.warn('[posPrint] Pop-up engellendi');
        return;
    }
    w.document.open();
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  @page { size: 80mm auto; margin: 4mm; }
  :root { --w: 72mm; }
  * { box-sizing: border-box; }
  body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; font-size: 12px; color: #0b0d12; max-width: var(--w); margin: 0 auto; letter-spacing: 0.1px; }
  h1 { font-size: 14px; margin: 0; text-align: center; font-weight: 900; letter-spacing: 0.6px; }
  .ticket { padding: 0; }
  .sub { margin-top: 2px; text-align: center; font-size: 10px; font-weight: 700; letter-spacing: 0.7px; color: #4b5563; text-transform: uppercase; }
  .divider { margin: 10px 0 8px; border-top: 1px dashed #d1d5db; }
  .meta { font-size: 10px; color: #111827; margin: 0; text-align: center; line-height: 1.35; }
  .meta .muted { color: #6b7280; font-weight: 600; }
  .metaGrid { margin-top: 8px; display: grid; grid-template-columns: 1fr 1fr; gap: 4px 10px; font-size: 10px; color: #111827; }
  .metaGrid .k { color: #6b7280; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; }
  .metaGrid .v { text-align: right; font-weight: 800; font-variant-numeric: tabular-nums; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 6px 0; vertical-align: top; border-bottom: 1px dotted #e5e7eb; }
  .qty { width: 30px; font-weight: 900; }
  .name { font-weight: 800; }
  .money { text-align: right; font-weight: 900; font-variant-numeric: tabular-nums; }
  .note { margin-top: 2px; font-size: 10px; color: #6b7280; font-weight: 600; }
  .totals { margin-top: 10px; padding-top: 8px; border-top: 1px dashed #d1d5db; }
  .totalRow { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
  .totalRow .label { font-size: 11px; font-weight: 900; letter-spacing: 0.4px; text-transform: uppercase; color: #111827; }
  .totalRow .value { font-size: 16px; font-weight: 1000; font-variant-numeric: tabular-nums; }
  .foot { margin-top: 10px; font-size: 10px; text-align: center; color: #6b7280; line-height: 1.35; }
  .legal { margin-top: 6px; font-size: 9px; text-align: center; color: #9ca3af; letter-spacing: 0.4px; }
</style></head><body>${innerHtml}<script>window.onload=function(){window.print();setTimeout(function(){window.close();},250);}</script></body></html>`);
    w.document.close();
}

export type KitchenPrintLine = { name: string; qty: number; notes?: string };

export function printKitchenTicket(opts: {
    settings: unknown;
    restaurantName: string;
    orderId: number;
    tableLabel?: string;
    orderTypeLabel?: string;
    lines: KitchenPrintLine[];
    orderNotes?: string;
}): void {
    const cfg = getPrintCfg(opts.settings);
    const p = cfg.printers?.find((x) => x.role === 'kitchen');
    const disp = p?.systemPrinterName || p?.name;
    const sub = disp ? ` — ${esc(disp)}` : '';

    const rows = opts.lines
        .map(
            (l) =>
                `<tr><td class="qty">${l.qty}x</td><td><strong>${esc(l.name)}</strong>${
                    l.notes ? `<div style="font-size:10px;color:#555;">${esc(l.notes)}</div>` : ''
                }</td></tr>`
        )
        .join('');

    const html = `
      <div class="ticket">
        <h1>MUTFAK${sub}</h1>
        <div class="meta">
          <span class="muted">${esc(opts.restaurantName)}</span><br/>
          <span class="muted">#${opts.orderId}</span> · ${esc(opts.orderTypeLabel || '')}<br/>
          ${opts.tableLabel ? esc(opts.tableLabel) : ''}
          ${opts.orderNotes ? `<br/><span class="muted">Not:</span> ${esc(opts.orderNotes)}` : ''}
        </div>
        <div class="divider"></div>
        <table>${rows}</table>
        <div class="foot">${new Date().toLocaleString()}</div>
      </div>
    `;
    openPrintWindow(`Mutfak-${opts.orderId}`, html);
}

export type ReceiptPrintLine = { name: string; qty: number; lineTotal: number };

export function printReceiptTicket(opts: {
    settings: unknown;
    restaurantName: string;
    address?: string;
    phone?: string;
    orderId: number;
    orderType?: 'dine_in' | 'takeaway' | 'delivery';
    tableLabel?: string;
    methodLabel: string;
    lines: ReceiptPrintLine[];
    total: number;
    currency: string;
    header?: string;
    footer?: string;
}): void {
    const cfg = getPrintCfg(opts.settings);
    const p = cfg.printers?.find((x) => x.role === 'receipt');
    const disp = p?.systemPrinterName || p?.name;
    const sub = disp ? ` — ${esc(disp)}` : '';

    const hdr = opts.header || opts.restaurantName;
    const rows = opts.lines
        .map(
            (l) =>
                `<tr>
                  <td class="qty">${l.qty}×</td>
                  <td><div class="name">${esc(l.name)}</div></td>
                  <td class="money">${l.lineTotal.toFixed(2)}</td>
                </tr>`
        )
        .join('');

    const now = new Date();
    const dt = now.toLocaleString();
    const ref = `#${opts.orderId}`;
    const orderType =
        opts.orderType || (opts.tableLabel ? 'dine_in' : 'takeaway');
    const service =
        orderType === 'dine_in'
            ? `Masa${opts.tableLabel ? `: ${opts.tableLabel}` : ''}`
            : orderType === 'delivery'
              ? 'Paket'
              : 'Gel-Al';

    const html = `
      <div class="ticket">
        <h1>${esc(hdr)}${sub}</h1>
        <div class="sub">ADİSYON / FİŞ</div>
        <div class="divider"></div>

        <div class="meta">
          ${opts.address ? esc(opts.address) + '<br/>' : ''}
          ${opts.phone ? esc(opts.phone) + '<br/>' : ''}
          <span class="muted">${esc(dt)}</span>
        </div>

        <div class="metaGrid">
          <div class="k">Sipariş No</div><div class="v">${esc(ref)}</div>
          <div class="k">Servis</div><div class="v">${esc(service)}</div>
          <div class="k">Ödeme</div><div class="v">${esc(opts.methodLabel)}</div>
        </div>

        <div class="divider"></div>
        <table>${rows}</table>

        <div class="totals">
          <div class="totalRow">
            <div class="label">Toplam</div>
            <div class="value">${opts.total.toFixed(2)} ${esc(opts.currency)}</div>
          </div>
        </div>

        <div class="foot">${opts.footer ? esc(opts.footer) : 'Teşekkürler'}</div>
        <div class="legal">Bu belge bilgilendirme amaçlıdır. Mali değeri yoktur.</div>
      </div>
    `;
    openPrintWindow(`Adisyon-${opts.orderId}`, html);
}

export function shouldAutoPrintKitchen(settings: unknown): boolean {
    const c = getPrintCfg(settings);
    return c.kitchenAutoPrint !== false;
}

export function shouldPrintReceiptOnPayment(settings: unknown): boolean {
    const c = getPrintCfg(settings);
    return c.receiptOnPayment !== false;
}

export function shouldPrintReceiptOnSessionClose(settings: unknown): boolean {
    const c = getPrintCfg(settings);
    return c.receiptOnSessionClose !== false;
}

/** POS store’da saklanacak anlık görüntü (yeniden yazdır) */
export type KitchenTicketSnapshot = Omit<Parameters<typeof printKitchenTicket>[0], 'settings'>;
export type ReceiptTicketSnapshot = Omit<Parameters<typeof printReceiptTicket>[0], 'settings'>;

export function reprintKitchenTicket(settings: unknown, snap: KitchenTicketSnapshot): void {
    printKitchenTicket({ settings, ...snap });
}

export function reprintReceiptTicket(settings: unknown, snap: ReceiptTicketSnapshot): void {
    printReceiptTicket({ settings, ...snap });
}
