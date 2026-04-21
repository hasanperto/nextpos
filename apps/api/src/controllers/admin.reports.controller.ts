import { Request, Response } from 'express';
import PDFDocument from 'pdfkit';
import { withTenant } from '../lib/db.js';
import { FiscalService } from '../services/fiscal.service.js';

export type ZReportPayload = {
    date: string;
    paymentsByMethod: { method: string; total: number; tips: number; cnt: number }[];
    payments: { payment_total: number; tip_total: number; payment_lines: number };
    orders: { orders: number; gross: number; tax: number; subtotal: number };
    tss_signature?: string;
    /** `z_business_day_locks` tablosunda bu tarih için kayıt var mı */
    dayLocked?: boolean;
};

async function ensureZDayLocksTable(conn: { query: (sql: string, params?: unknown[]) => Promise<unknown> }) {
    await conn.query(`
        CREATE TABLE IF NOT EXISTS z_business_day_locks (
            business_date DATE NOT NULL,
            branch_id INTEGER NOT NULL DEFAULT 1,
            locked_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            locked_by INTEGER,
            PRIMARY KEY (business_date, branch_id)
        )
    `);
}

async function loadZReportPayload(
    conn: { query: (sql: string, params: unknown[]) => Promise<unknown> },
    date: string,
    branchId: number | undefined
): Promise<ZReportPayload> {
    const branchO = branchId ? ' AND o.branch_id = ?' : '';
    const paramsDay = branchId ? [date, branchId] : [date];

    const [byMethod]: any = await conn.query(
        `SELECT p.method,
                COALESCE(SUM(p.amount), 0)::float AS total,
                COALESCE(SUM(p.tip_amount), 0)::float AS tips,
                COUNT(*)::int AS cnt
         FROM payments p
         INNER JOIN orders o ON p.order_id = o.id
         WHERE p.created_at::date = ?::date
           AND p.status = 'completed'
           AND o.status NOT IN ('cancelled')
           AND o.deleted_at IS NULL
           ${branchO}
         GROUP BY p.method
         ORDER BY p.method`,
        paramsDay
    );

    const [payTotals]: any = await conn.query(
        `SELECT COALESCE(SUM(p.amount), 0)::float AS payment_total,
                COALESCE(SUM(p.tip_amount), 0)::float AS tip_total,
                COUNT(*)::int AS payment_lines
         FROM payments p
         INNER JOIN orders o ON p.order_id = o.id
         WHERE p.created_at::date = ?::date
           AND p.status = 'completed'
           AND o.status NOT IN ('cancelled')
           AND o.deleted_at IS NULL
           ${branchO}`,
        paramsDay
    );

    const branchOrders = branchId ? ' AND branch_id = ?' : '';
    const [orderDay]: any = await conn.query(
        `SELECT COUNT(*)::int AS orders,
                COALESCE(SUM(total_amount), 0)::float AS gross,
                COALESCE(SUM(tax_amount), 0)::float AS tax,
                COALESCE(SUM(subtotal), 0)::float AS subtotal
         FROM orders
         WHERE created_at::date = ?::date
           AND status NOT IN ('cancelled')
           AND deleted_at IS NULL
           ${branchOrders}`,
        paramsDay
    );

    return {
        date,
        paymentsByMethod: Array.isArray(byMethod) ? byMethod : [],
        payments: payTotals?.[0] || {
            payment_total: 0,
            tip_total: 0,
            payment_lines: 0,
        },
        orders: orderDay?.[0] || {
            orders: 0,
            gross: 0,
            tax: 0,
            subtotal: 0,
        },
        tss_signature: undefined
    };
}

export type SummaryReportPayload = {
    from: string;
    to: string;
    daily: { day: string; order_count: number; revenue: number }[];
    totals: { orders: number; revenue: number };
    topProducts: { name: string; qty: number; revenue: number }[];
};

async function loadSummaryPayload(
    conn: { query: (sql: string, params: unknown[]) => Promise<unknown> },
    from: string,
    to: string,
    branchId: number | undefined
): Promise<SummaryReportPayload> {
    const branchClause = branchId ? ' AND branch_id = ?' : '';
    const branchForOrders = branchId ? ' AND o.branch_id = ?' : '';

    const dailyParams = branchId ? [from, to, branchId] : [from, to];
    const [daily]: any = await conn.query(
        `SELECT (created_at::date)::text AS day,
                COUNT(*)::int AS order_count,
                COALESCE(SUM(total_amount), 0)::float AS revenue
         FROM orders
         WHERE created_at::date >= ?::date
           AND created_at::date <= ?::date
           AND status NOT IN ('cancelled')
           AND deleted_at IS NULL
           ${branchClause}
         GROUP BY created_at::date
         ORDER BY day`,
        dailyParams
    );

    const totalsParams = branchId ? [from, to, branchId] : [from, to];
    const [totals]: any = await conn.query(
        `SELECT COUNT(*)::int AS orders,
                COALESCE(SUM(total_amount), 0)::float AS revenue
         FROM orders
         WHERE created_at::date >= ?::date
           AND created_at::date <= ?::date
           AND status NOT IN ('cancelled')
           AND deleted_at IS NULL
           ${branchClause}`,
        totalsParams
    );

    const topParams = branchId ? [from, to, branchId] : [from, to];
    const [top]: any = await conn.query(
        `SELECT p.name,
                COALESCE(SUM(oi.quantity), 0)::float AS qty,
                COALESCE(SUM(oi.total_price), 0)::float AS revenue
         FROM order_items oi
         JOIN orders o ON oi.order_id = o.id
         JOIN products p ON oi.product_id = p.id
         WHERE o.created_at::date >= ?::date
           AND o.created_at::date <= ?::date
           AND o.status NOT IN ('cancelled')
           AND o.deleted_at IS NULL
           ${branchForOrders}
         GROUP BY p.id, p.name
         ORDER BY revenue DESC
         LIMIT 20`,
        topParams
    );

    return {
        from,
        to,
        daily: Array.isArray(daily) ? daily : [],
        totals: totals?.[0] || { orders: 0, revenue: 0 },
        topProducts: Array.isArray(top) ? top : [],
    };
}

function euro(n: number): string {
    return `€${Number(n).toFixed(2)}`;
}

function pipeSummaryPdf(res: Response, data: SummaryReportPayload): void {
    const doc = new PDFDocument({ margin: 48, size: 'A4' });
    const safeName = `summary-${data.from}_to_${data.to}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
    doc.pipe(res);

    doc.fontSize(18).text('NextPOS — Period summary', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor('#666').text(`From ${data.from} to ${data.to}`, { align: 'center' });
    doc.fillColor('#000');
    doc.moveDown(1);

    const t = data.totals;
    doc.fontSize(12).text('Totals', { underline: true });
    doc.moveDown(0.4);
    doc.fontSize(10).text(`Orders: ${t.orders}`);
    doc.text(`Revenue: ${euro(t.revenue)}`);
    doc.moveDown(0.8);

    doc.fontSize(12).text('Daily breakdown', { underline: true });
    doc.moveDown(0.4);
    let y = doc.y;
    const c1 = 48;
    const c2 = 200;
    const c3 = 320;
    doc.fontSize(9).fillColor('#444');
    doc.text('Day', c1, y);
    doc.text('Orders', c2, y);
    doc.text('Revenue', c3, y);
    doc.fillColor('#000');
    y += 14;
    doc.fontSize(10);
    for (const row of data.daily) {
        doc.text(String(row.day), c1, y);
        doc.text(String(row.order_count), c2, y);
        doc.text(euro(row.revenue), c3, y);
        y += 16;
        if (y > 720) {
            doc.addPage();
            y = 48;
        }
    }

    doc.y = y + 12;
    doc.fontSize(12).text('Top products (by revenue)', { underline: true });
    doc.moveDown(0.4);
    y = doc.y;
    doc.fontSize(9).fillColor('#444');
    doc.text('Product', c1, y, { width: 240 });
    doc.text('Qty', c2, y);
    doc.text('Revenue', c3, y);
    doc.fillColor('#000');
    y += 14;
    doc.fontSize(10);
    for (const p of data.topProducts) {
        const name = String(p.name ?? '—').slice(0, 60);
        doc.text(name, c1, y, { width: 240 });
        doc.text(String(Number(p.qty).toFixed(0)), c2, y);
        doc.text(euro(p.revenue), c3, y);
        y += 16;
        if (y > 720) {
            doc.addPage();
            y = 48;
        }
    }

    doc.fontSize(8).fillColor('#888').text('NextPOS — summary export', 48, 780, { align: 'center', width: 500 });
    doc.end();
}

/** PDF içeriği Helvetica ile (Türkçe karakter sınırlı); etiketler İngilizce. */
function pipeZReportPdf(res: Response, data: ZReportPayload): void {
    const doc = new PDFDocument({ margin: 48, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="z-report-${data.date}.pdf"`);
    doc.pipe(res);

    doc.fontSize(18).text('NextPOS — Daily close (Z)', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor('#666').text(`Generated for branch date: ${data.date}`, { align: 'center' });
    doc.fillColor('#000');
    doc.moveDown(1.2);

    const p = data.payments;
    const o = data.orders;
    doc.fontSize(12).text('Payments', { underline: true });
    doc.moveDown(0.4);
    doc.fontSize(10).text(`Total payments: ${euro(p.payment_total)}`);
    doc.text(`Payment lines: ${p.payment_lines}`);
    doc.text(`Tips total: ${euro(p.tip_total)}`);
    doc.moveDown(0.8);

    doc.fontSize(12).text('Orders (same day)', { underline: true });
    doc.moveDown(0.4);
    doc.fontSize(10).text(`Order count: ${o.orders}`);
    doc.text(`Gross: ${euro(o.gross)}`);
    doc.text(`Subtotal (net): ${euro(o.subtotal)}`);
    doc.text(`Tax (VAT): ${euro(o.tax)}`);
    doc.moveDown(0.8);

    doc.fontSize(12).text('By payment method', { underline: true });
    doc.moveDown(0.4);

    const tableTop = doc.y;
    const col1 = 48;
    const col2 = 200;
    const col3 = 280;
    const col4 = 380;
    doc.fontSize(9).fillColor('#444');
    doc.text('Method', col1, tableTop);
    doc.text('Count', col2, tableTop);
    doc.text('Amount', col3, tableTop);
    doc.text('Tips', col4, tableTop);
    doc.fillColor('#000');
    let y = tableTop + 16;
    doc.fontSize(10);
    for (const row of data.paymentsByMethod) {
        const method = String(row.method ?? '—');
        doc.text(method, col1, y, { width: 140 });
        doc.text(String(row.cnt), col2, y);
        doc.text(euro(row.total), col3, y);
        doc.text(euro(row.tips), col4, y);
        y += 18;
        if (y > 720) {
            doc.addPage();
            y = 48;
        }
    }

    doc.fontSize(8).fillColor('#888').text('NextPOS — Z report export', 48, 780, { align: 'center', width: 500 });
    
    if (data.tss_signature) {
        doc.moveDown(2);
        doc.fontSize(7).fillColor('#aaa').text(`Fiscal Signature (TSE/KassenSichV): ${data.tss_signature}`, { align: 'center' });
    }
    
    doc.end();
}

/** Tarih aralığı özet + CSV için satırlar */
export const getReportsSummaryHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const from = String(req.query.from || '').slice(0, 10);
        const to = String(req.query.to || '').slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
            return res.status(400).json({ error: 'from ve to YYYY-MM-DD olmalı' });
        }

        const data = await withTenant(tenantId, async (conn) =>
            loadSummaryPayload(conn, from, to, req.branchId)
        );

        res.json(data);
    } catch (error) {
        console.error('reports summary:', error);
        res.status(500).json({ error: 'Rapor oluşturulamadı' });
    }
};

/** Dönem özeti — PDF indir */
export const getSummaryPdfHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const from = String(req.query.from || '').slice(0, 10);
        const to = String(req.query.to || '').slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
            return res.status(400).json({ error: 'from ve to YYYY-MM-DD olmalı' });
        }

        const data = await withTenant(tenantId, async (conn) =>
            loadSummaryPayload(conn, from, to, req.branchId)
        );

        pipeSummaryPdf(res, data);
    } catch (error) {
        console.error('summary pdf:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Özet raporu PDF oluşturulamadı' });
        }
    }
};

/** Günlük kapanış (Z): ödemeler + yöntem kırılımı + sipariş KDV matrahı */
export const getZReportHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const date = String(req.query.date || '').slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return res.status(400).json({ error: 'date=YYYY-MM-DD gerekli' });
        }

        const data = await withTenant(tenantId, async (conn: any) => {
            await ensureZDayLocksTable(conn);
            const payload = await loadZReportPayload(conn, date, req.branchId);
            const branchId = req.branchId || 1;
            const [lk]: any = await conn.query(
                `SELECT 1 FROM z_business_day_locks WHERE business_date = ?::date AND branch_id = ? LIMIT 1`,
                [date, branchId]
            );
            (payload as ZReportPayload).dayLocked = Array.isArray(lk) && lk.length > 0;

            // Persist and sign the Z-Report
            const [existing]: any = await conn.query('SELECT id, tss_signature FROM daily_summaries WHERE report_date = ?::date AND branch_id = ?', [date, branchId]);
            
            let reportId: number;
            if (existing.length > 0) {
                reportId = existing[0].id;
                payload.tss_signature = existing[0].tss_signature;
            } else {
                const [insertRows]: any = await conn.query(
                    'INSERT INTO daily_summaries (report_date, branch_id, total_revenue, subtotal, tax_total) VALUES (?::date, ?, ?, ?, ?) RETURNING id',
                    [date, branchId, payload.orders.gross, payload.orders.subtotal, payload.orders.tax]
                );
                reportId = Number(insertRows?.[0]?.id || 0);
                if (!reportId) {
                    throw new Error('daily_summaries INSERT RETURNING id başarısız');
                }
            }

            if (!payload.tss_signature) {
                payload.tss_signature = await FiscalService.signZReport(conn, reportId);
                // Update with signature
                await conn.query('UPDATE daily_summaries SET tss_signature = ? WHERE id = ?', [payload.tss_signature, reportId]);
            }

            return payload;
        });

        res.json(data);
    } catch (error) {
        console.error('z-close report:', error);
        res.status(500).json({ error: 'Z raporu oluşturulamadı' });
    }
};

/** Günlük kapanış (Z) — PDF indir */
export const getZReportPdfHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const date = String(req.query.date || '').slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return res.status(400).json({ error: 'date=YYYY-MM-DD gerekli' });
        }

        const data = await withTenant(tenantId, async (conn: any) => {
            const payload = await loadZReportPayload(conn, date, req.branchId);
            const [existing]: any = await conn.query('SELECT tss_signature FROM daily_summaries WHERE report_date = ?::date AND branch_id = ?', [date, req.branchId || 1]);
            if (existing.length > 0) {
                payload.tss_signature = existing[0].tss_signature;
            }
            return payload;
        });

        pipeZReportPdf(res, data);
    } catch (error) {
        console.error('z-close pdf:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Z raporu PDF oluşturulamadı' });
        }
    }
};

/** Personel Performans Raporu — Garson ve Kuryeler için */
export const getStaffPerformanceHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const branchId = req.branchId || 1;
        const from = String(req.query.from || '').slice(0, 10);
        const to = String(req.query.to || '').slice(0, 10);

        const data = await withTenant(tenantId, async (connection: any) => {
            // Picked up by staff stats
            const [rows]: any = await connection.query(
                `SELECT 
                    u.id as staff_id,
                    u.name as staff_name,
                    u.role as staff_role,
                    COUNT(o.id) as total_pickups,
                    SUM(o.total_amount) as total_revenue,
                    AVG(EXTRACT(EPOCH FROM (o.picked_up_at - o.created_at)) / 60) as avg_pickup_time_mins
                 FROM users u
                 JOIN orders o ON (u.id::text = o.picked_up_by::text)
                 WHERE o.status IN ('served', 'shipped', 'completed')
                   AND o.picked_up_at IS NOT NULL
                   AND DATE(o.picked_up_at) BETWEEN ? AND ?
                 GROUP BY u.id, u.name, u.role
                 ORDER BY total_pickups DESC`,
                [from || '2000-01-01', to || '2100-01-01']
            );

            // Kurye spesifik: Teslimat hızı (Pickup -> Tamamlanma)
            const [deliveryRows]: any = await connection.query(
                `SELECT 
                    u.id as staff_id,
                    u.name as staff_name,
                    COUNT(d.id) as total_deliveries,
                    AVG(EXTRACT(EPOCH FROM (d.delivered_at - d.picked_at)) / 60) as avg_delivery_time_mins
                 FROM users u
                 JOIN deliveries d ON u.id = d.courier_id
                 WHERE d.status = 'delivered'
                   AND d.delivered_at IS NOT NULL
                   AND DATE(d.delivered_at) BETWEEN ? AND ?
                 GROUP BY u.id, u.name
                 ORDER BY total_deliveries DESC`,
                [from || '2000-01-01', to || '2100-01-01']
            );

            return {
                pickupStats: rows,
                deliveryStats: deliveryRows
            };
        });

        res.json(data);
    } catch (error) {
        console.error('staff performance report:', error);
        res.status(500).json({ error: 'Personel raporu oluşturulamadı' });
    }
};

/** İş günü kilitler — mali işlem değişikliğini engellemek için (sipariş durumu güncellemesi vb.) */
export const postZDayLockHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const date = String(req.body?.date || '').slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return res.status(400).json({ error: 'date=YYYY-MM-DD gerekli' });
        }
        const branchId = req.branchId || 1;
        const uid = req.user?.userId ?? null;
        await withTenant(tenantId, async (conn: any) => {
            await ensureZDayLocksTable(conn);
            await conn.query(
                `INSERT INTO z_business_day_locks (business_date, branch_id, locked_by)
                 VALUES (?::date, ?, ?)
                 ON CONFLICT (business_date, branch_id) DO UPDATE SET locked_at = CURRENT_TIMESTAMP, locked_by = EXCLUDED.locked_by`,
                [date, branchId, uid]
            );
        });
        res.json({ ok: true, date, branchId });
    } catch (e) {
        console.error('postZDayLockHandler', e);
        res.status(500).json({ error: 'Gün kilitlenemedi' });
    }
};

export const deleteZDayLockHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const date = String(req.params.date || '').slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return res.status(400).json({ error: 'Geçersiz tarih' });
        }
        const branchId = req.branchId || 1;
        await withTenant(tenantId, async (conn: any) => {
            await ensureZDayLocksTable(conn);
            await conn.query(`DELETE FROM z_business_day_locks WHERE business_date = ?::date AND branch_id = ?`, [
                date,
                branchId,
            ]);
        });
        res.json({ ok: true });
    } catch (e) {
        console.error('deleteZDayLockHandler', e);
        res.status(500).json({ error: 'Kilit kaldırılamadı' });
    }
};
