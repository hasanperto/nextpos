import { Request, Response } from 'express';
import { z } from 'zod';
import PDFDocument from 'pdfkit';
import { queryPublic, withTenant } from '../lib/db.js';
import { trySendMail } from '../lib/email.js';

type InvoiceRow = {
    order_id: number;
    pos_invoice_no: string;
    created_at: string;
    branch_id: number | null;
    branch_name: string | null;
    cashier_id: number | null;
    cashier_name: string | null;
    order_type: string | null;
    status: string | null;
    payment_status: string | null;
    subtotal: number;
    discount_amount: number;
    tax_amount: number;
    total_amount: number;
    paid_amount: number;
    tip_total: number;
    methods: string | null;
    customer_name: string | null;
    customer_phone: string | null;
    customer_email: string | null;
    delivery_phone: string | null;
    delivery_address: string | null;
};

type InvoiceDetail = InvoiceRow & {
    items: {
        id: number;
        product_id: number;
        product_name: string;
        variant_id: number | null;
        variant_name: string | null;
        quantity: number;
        unit_price: number;
        total_price: number;
        modifiers: any;
        notes: string | null;
        status: string | null;
    }[];
    payments: {
        id: number;
        amount: number;
        method: string;
        status: string | null;
        tip_amount: number;
        change_amount: number;
        received_amount: number | null;
        reference: string | null;
        cashier_id: number | null;
        cashier_name: string | null;
        notes: string | null;
        created_at: string;
    }[];
};

function posInvoiceNoFromOrderId(orderId: number): string {
    return `POS-${orderId}`;
}

async function assertAdminOrResellerOwnsTenant(req: Request, tenantId: string): Promise<boolean> {
    const role = String((req as any).user?.role || '');
    if (role === 'super_admin') return true;
    if (role !== 'reseller') return false;
    const userId = Number((req as any).user?.userId);
    if (!Number.isFinite(userId)) return false;
    const [rows]: any = await queryPublic(`SELECT reseller_id FROM "public"."tenants" WHERE id::text = ? LIMIT 1`, [tenantId]);
    const r = rows?.[0];
    return Number(r?.reseller_id) === userId;
}

let _eventsReady = false;
async function ensurePosInvoiceEventsTable(): Promise<void> {
    if (_eventsReady) return;
    try {
        await queryPublic(`
            CREATE TABLE IF NOT EXISTS "public".pos_invoice_events (
                id SERIAL PRIMARY KEY,
                tenant_id VARCHAR(36) NOT NULL,
                pos_invoice_no VARCHAR(50) NOT NULL,
                order_id INT,
                event_type VARCHAR(40) NOT NULL,
                payload JSONB,
                created_by VARCHAR(100),
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        `);
        _eventsReady = true;
    } catch (e: any) {
        if (e?.code === '42P07') {
            _eventsReady = true;
            return;
        }
        throw e;
    }
}

async function logPosInvoiceEvent(input: {
    tenantId: string;
    posInvoiceNo: string;
    orderId?: number | null;
    eventType: string;
    payload?: any;
    createdBy?: string | null;
}): Promise<void> {
    await ensurePosInvoiceEventsTable();
    await queryPublic(
        `INSERT INTO "public".pos_invoice_events (tenant_id, pos_invoice_no, order_id, event_type, payload, created_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
            input.tenantId,
            input.posInvoiceNo,
            input.orderId ?? null,
            input.eventType,
            input.payload != null ? JSON.stringify(input.payload) : null,
            input.createdBy ?? null,
        ],
    );
}

const listSchema = z.object({
    from: z.string().optional(),
    to: z.string().optional(),
    branchId: z.coerce.number().int().optional(),
    cashierId: z.coerce.number().int().optional(),
    status: z.string().optional(),
    paymentStatus: z.string().optional(),
    paymentMethod: z.string().optional(),
    q: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(300).optional(),
});

export const listPosInvoicesHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = String(req.params.id || '').trim();
        if (!tenantId) return res.status(400).json({ error: 'Tenant id gerekli' });
        if (!(await assertAdminOrResellerOwnsTenant(req, tenantId))) {
            return res.status(403).json({ error: 'Bu tenant için yetkiniz yok' });
        }

        const q = listSchema.parse(req.query);
        const limit = q.limit ?? 200;

        const now = new Date();
        const toDefault = now.toISOString().slice(0, 10);
        const fromDefault = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        const from = (q.from && String(q.from).slice(0, 10)) || fromDefault;
        const to = (q.to && String(q.to).slice(0, 10)) || toDefault;

        const where: string[] = [];
        const params: any[] = [];
        where.push(`o.created_at >= ?::date`);
        params.push(from);
        where.push(`o.created_at <= ?::date + INTERVAL '1 day'`);
        params.push(to);

        if (q.branchId != null) {
            where.push(`o.branch_id = ?`);
            params.push(q.branchId);
        }
        if (q.cashierId != null) {
            where.push(`o.cashier_id = ?`);
            params.push(q.cashierId);
        }
        if (q.status) {
            where.push(`o.status = ?`);
            params.push(String(q.status));
        }
        if (q.paymentStatus) {
            where.push(`o.payment_status = ?`);
            params.push(String(q.paymentStatus));
        }

        const searchTerm = (q.q || '').trim();
        if (searchTerm) {
            const n = Number(searchTerm);
            if (Number.isFinite(n) && Number.isInteger(n)) {
                where.push(`(o.id = ? OR o.offline_id ILIKE ? OR c.phone ILIKE ? OR c.email ILIKE ? OR c.name ILIKE ? OR o.delivery_phone ILIKE ?)`);
                params.push(n, `%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`);
            } else {
                where.push(`(o.offline_id ILIKE ? OR c.phone ILIKE ? OR c.email ILIKE ? OR c.name ILIKE ? OR o.delivery_phone ILIKE ?)`);
                params.push(`%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`);
            }
        }

        const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

        const rows = await withTenant(tenantId, async (conn) => {
            const [r]: any = await conn.query(
                `
                SELECT
                    o.id as order_id,
                    o.created_at,
                    o.branch_id,
                    b.name as branch_name,
                    o.cashier_id,
                    cu.name as cashier_name,
                    o.order_type,
                    o.status,
                    o.payment_status,
                    o.subtotal,
                    o.discount_amount,
                    o.tax_amount,
                    o.total_amount,
                    o.delivery_phone,
                    o.delivery_address,
                    c.name as customer_name,
                    c.phone as customer_phone,
                    c.email as customer_email,
                    COALESCE((
                        SELECT SUM(p.amount)
                        FROM payments p
                        WHERE p.order_id = o.id AND p.status = 'completed'
                    ), 0) as paid_amount,
                    COALESCE((
                        SELECT SUM(p.tip_amount)
                        FROM payments p
                        WHERE p.order_id = o.id AND p.status = 'completed'
                    ), 0) as tip_total,
                    (
                        SELECT string_agg(DISTINCT p.method, ',')
                        FROM payments p
                        WHERE p.order_id = o.id AND p.status = 'completed'
                    ) as methods
                FROM orders o
                LEFT JOIN branches b ON o.branch_id = b.id
                LEFT JOIN users cu ON o.cashier_id = cu.id
                LEFT JOIN customers c ON o.customer_id = c.id
                ${whereSql}
                ORDER BY o.created_at DESC
                LIMIT ?
                `,
                [...params, limit],
            );
            return r as any[];
        });

        const shaped = (rows || []).map((r: any) => {
            const orderId = Number(r.order_id);
            const methods = String(r.methods || '').split(',').map((m) => m.trim()).filter(Boolean);
            const method = methods.length > 1 ? 'mixed' : methods[0] || null;
            return {
                ...r,
                order_id: orderId,
                pos_invoice_no: posInvoiceNoFromOrderId(orderId),
                payment_method: method,
            };
        });

        if (q.paymentMethod) {
            const pm = String(q.paymentMethod).toLowerCase();
            const filtered = shaped.filter((x: any) => String(x.payment_method || '').toLowerCase() === pm);
            return res.json(filtered);
        }

        return res.json(shaped);
    } catch (e: any) {
        if (e instanceof z.ZodError) return res.status(400).json({ error: 'Geçersiz filtre', details: e.issues });
        console.error('listPosInvoicesHandler:', e);
        return res.status(500).json({ error: 'Satış faturaları alınamadı' });
    }
};

const idSchema = z.object({
    posInvoiceNo: z.string().min(1),
});

function parseOrderIdFromPosInvoiceNo(posInvoiceNo: string): number | null {
    const raw = String(posInvoiceNo).trim();
    if (/^\d+$/.test(raw)) return Number(raw);
    const m = raw.match(/^POS-(\d+)$/i);
    if (m) return Number(m[1]);
    return null;
}

async function fetchInvoiceDetail(tenantId: string, orderId: number): Promise<InvoiceDetail | null> {
    return await withTenant(tenantId, async (conn) => {
        const [headRows]: any = await conn.query(
            `
            SELECT
                o.id as order_id,
                o.created_at,
                o.branch_id,
                b.name as branch_name,
                o.cashier_id,
                cu.name as cashier_name,
                o.order_type,
                o.status,
                o.payment_status,
                o.subtotal,
                o.discount_amount,
                o.tax_amount,
                o.total_amount,
                o.delivery_phone,
                o.delivery_address,
                c.name as customer_name,
                c.phone as customer_phone,
                c.email as customer_email,
                COALESCE((
                    SELECT SUM(p.amount)
                    FROM payments p
                    WHERE p.order_id = o.id AND p.status = 'completed'
                ), 0) as paid_amount,
                COALESCE((
                    SELECT SUM(p.tip_amount)
                    FROM payments p
                    WHERE p.order_id = o.id AND p.status = 'completed'
                ), 0) as tip_total,
                (
                    SELECT string_agg(DISTINCT p.method, ',')
                    FROM payments p
                    WHERE p.order_id = o.id AND p.status = 'completed'
                ) as methods
            FROM orders o
            LEFT JOIN branches b ON o.branch_id = b.id
            LEFT JOIN users cu ON o.cashier_id = cu.id
            LEFT JOIN customers c ON o.customer_id = c.id
            WHERE o.id = ?
            LIMIT 1
            `,
            [orderId],
        );
        const head = headRows?.[0];
        if (!head) return null;

        const [itemRows]: any = await conn.query(
            `
            SELECT
                oi.id,
                oi.product_id,
                p.name as product_name,
                oi.variant_id,
                pv.name as variant_name,
                oi.quantity,
                oi.unit_price,
                oi.total_price,
                oi.modifiers,
                oi.notes,
                oi.status
            FROM order_items oi
            LEFT JOIN products p ON oi.product_id = p.id
            LEFT JOIN product_variants pv ON oi.variant_id = pv.id
            WHERE oi.order_id = ?
            ORDER BY oi.id ASC
            `,
            [orderId],
        );

        const [payRows]: any = await conn.query(
            `
            SELECT
                p.*,
                u.name as cashier_name
            FROM payments p
            LEFT JOIN users u ON p.cashier_id = u.id
            WHERE p.order_id = ?
            ORDER BY p.created_at ASC
            `,
            [orderId],
        );

        const orderIdNum = Number(head.order_id);
        const methods = String(head.methods || '').split(',').map((m) => m.trim()).filter(Boolean);
        const method = methods.length > 1 ? 'mixed' : methods[0] || null;

        return {
            ...head,
            order_id: orderIdNum,
            pos_invoice_no: posInvoiceNoFromOrderId(orderIdNum),
            payment_method: method,
            items: (itemRows || []).map((r: any) => ({
                ...r,
                id: Number(r.id),
                product_id: Number(r.product_id),
                variant_id: r.variant_id != null ? Number(r.variant_id) : null,
                quantity: Number(r.quantity),
                unit_price: Number(r.unit_price),
                total_price: Number(r.total_price),
            })),
            payments: (payRows || []).map((r: any) => ({
                id: Number(r.id),
                amount: Number(r.amount),
                method: String(r.method),
                status: r.status != null ? String(r.status) : null,
                tip_amount: Number(r.tip_amount || 0),
                change_amount: Number(r.change_amount || 0),
                received_amount: r.received_amount != null ? Number(r.received_amount) : null,
                reference: r.reference != null ? String(r.reference) : null,
                cashier_id: r.cashier_id != null ? Number(r.cashier_id) : null,
                cashier_name: r.cashier_name != null ? String(r.cashier_name) : null,
                notes: r.notes != null ? String(r.notes) : null,
                created_at: String(r.created_at),
            })),
        } as any;
    });
}

export const getPosInvoiceHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = String(req.params.id || '').trim();
        if (!tenantId) return res.status(400).json({ error: 'Tenant id gerekli' });
        if (!(await assertAdminOrResellerOwnsTenant(req, tenantId))) {
            return res.status(403).json({ error: 'Bu tenant için yetkiniz yok' });
        }
        const { posInvoiceNo } = idSchema.parse(req.params);
        const orderId = parseOrderIdFromPosInvoiceNo(posInvoiceNo);
        if (!orderId) return res.status(400).json({ error: 'Geçersiz fatura numarası' });
        const detail = await fetchInvoiceDetail(tenantId, orderId);
        if (!detail) return res.status(404).json({ error: 'Fatura bulunamadı' });
        return res.json(detail);
    } catch (e: any) {
        if (e instanceof z.ZodError) return res.status(400).json({ error: 'Geçersiz istek', details: e.issues });
        console.error('getPosInvoiceHandler:', e);
        return res.status(500).json({ error: 'Fatura detayı alınamadı' });
    }
};

async function buildPdfBuffer(inv: InvoiceDetail): Promise<Buffer> {
    const doc = new PDFDocument({ margin: 48, size: 'A4' });
    const chunks: Buffer[] = [];
    return await new Promise((resolve, reject) => {
        doc.on('data', (d) => chunks.push(Buffer.from(d)));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        doc.fontSize(18).text('NextPOS — Sales Receipt', { align: 'center' });
        doc.moveDown(0.5);
        doc.fontSize(10).fillColor('#666');
        doc.text(`Receipt: ${inv.pos_invoice_no} · Order: #${inv.order_id}`, { align: 'center' });
        doc.text(`Date: ${String(inv.created_at)}`, { align: 'center' });
        doc.fillColor('#000');
        doc.moveDown(1.2);

        doc.fontSize(12).text('Info', { underline: true });
        doc.moveDown(0.3);
        doc.fontSize(10).text(`Branch: ${inv.branch_name || inv.branch_id || '—'}`);
        doc.text(`Cashier: ${inv.cashier_name || inv.cashier_id || '—'}`);
        doc.text(`Order type: ${inv.order_type || '—'}`);
        doc.text(`Payment status: ${inv.payment_status || '—'}`);
        doc.moveDown(0.8);

        doc.fontSize(12).text('Items', { underline: true });
        doc.moveDown(0.3);
        for (const it of inv.items) {
            const title = `${it.product_name || 'Item'}${it.variant_name ? ` (${it.variant_name})` : ''}`;
            doc.fontSize(10).text(`${it.quantity} × ${title}`);
            doc.fontSize(9).fillColor('#666').text(`Unit: ${Number(it.unit_price).toFixed(2)} · Total: ${Number(it.total_price).toFixed(2)}`);
            doc.fillColor('#000');
            if (it.modifiers) {
                const modStr = typeof it.modifiers === 'string' ? it.modifiers : JSON.stringify(it.modifiers);
                if (modStr && modStr !== 'null' && modStr !== '[]') {
                    doc.fontSize(8).fillColor('#666').text(`Mods: ${modStr}`);
                    doc.fillColor('#000');
                }
            }
            if (it.notes) {
                doc.fontSize(8).fillColor('#666').text(`Note: ${it.notes}`);
                doc.fillColor('#000');
            }
            doc.moveDown(0.2);
        }

        doc.moveDown(0.8);
        doc.fontSize(12).text('Totals', { underline: true });
        doc.moveDown(0.3);
        doc.fontSize(10).text(`Subtotal: ${Number(inv.subtotal || 0).toFixed(2)}`);
        doc.text(`Discount: ${Number(inv.discount_amount || 0).toFixed(2)}`);
        doc.text(`Tax: ${Number(inv.tax_amount || 0).toFixed(2)}`);
        doc.fontSize(12).text(`Total: ${Number(inv.total_amount || 0).toFixed(2)}`);
        doc.moveDown(0.6);

        doc.fontSize(12).text('Payments', { underline: true });
        doc.moveDown(0.3);
        for (const p of inv.payments) {
            doc.fontSize(10).text(`${p.method} · ${Number(p.amount).toFixed(2)}${p.tip_amount ? ` (+tip ${Number(p.tip_amount).toFixed(2)})` : ''}`);
        }
        doc.end();
    });
}

export const getPosInvoicePdfHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = String(req.params.id || '').trim();
        if (!tenantId) return res.status(400).json({ error: 'Tenant id gerekli' });
        if (!(await assertAdminOrResellerOwnsTenant(req, tenantId))) {
            return res.status(403).json({ error: 'Bu tenant için yetkiniz yok' });
        }
        const { posInvoiceNo } = idSchema.parse(req.params);
        const orderId = parseOrderIdFromPosInvoiceNo(posInvoiceNo);
        if (!orderId) return res.status(400).json({ error: 'Geçersiz fatura numarası' });
        const detail = await fetchInvoiceDetail(tenantId, orderId);
        if (!detail) return res.status(404).json({ error: 'Fatura bulunamadı' });
        const buf = await buildPdfBuffer(detail);
        const createdBy = String((req as any).user?.username || (req as any).user?.userId || 'admin');
        await logPosInvoiceEvent({
            tenantId,
            posInvoiceNo: detail.pos_invoice_no,
            orderId,
            eventType: 'POS_INVOICE_PDF_GENERATED',
            payload: { size: buf.length },
            createdBy,
        }).catch(() => {});

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${detail.pos_invoice_no}.pdf"`);
        return res.send(buf);
    } catch (e: any) {
        if (e instanceof z.ZodError) return res.status(400).json({ error: 'Geçersiz istek', details: e.issues });
        console.error('getPosInvoicePdfHandler:', e);
        return res.status(500).json({ error: 'PDF üretilemedi' });
    }
};

const sendMailSchema = z.object({
    to: z.string().email().optional(),
});

export const sendPosInvoiceEmailHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = String(req.params.id || '').trim();
        if (!tenantId) return res.status(400).json({ error: 'Tenant id gerekli' });
        if (!(await assertAdminOrResellerOwnsTenant(req, tenantId))) {
            return res.status(403).json({ error: 'Bu tenant için yetkiniz yok' });
        }
        const { posInvoiceNo } = idSchema.parse(req.params);
        const orderId = parseOrderIdFromPosInvoiceNo(posInvoiceNo);
        if (!orderId) return res.status(400).json({ error: 'Geçersiz fatura numarası' });
        const body = sendMailSchema.parse(req.body || {});

        const detail = await fetchInvoiceDetail(tenantId, orderId);
        if (!detail) return res.status(404).json({ error: 'Fatura bulunamadı' });

        const to = (body.to || detail.customer_email || '').trim();
        if (!to) return res.status(400).json({ error: 'Alıcı e‑posta gerekli' });

        const pdf = await buildPdfBuffer(detail);

        const subject = `NextPOS Satış Faturası — ${detail.pos_invoice_no}`;
        const html = `
            <div style="font-family:Arial,sans-serif">
                <h2>Satış Faturası</h2>
                <div><b>Fatura:</b> ${detail.pos_invoice_no}</div>
                <div><b>Tarih:</b> ${String(detail.created_at)}</div>
                <div><b>Tutar:</b> ${Number(detail.total_amount || 0).toFixed(2)}</div>
                <p>PDF dosyası ektedir.</p>
            </div>
        `;

        const createdBy = String((req as any).user?.username || (req as any).user?.userId || 'admin');
        const r = await trySendMail({
            to,
            subject,
            html,
            attachments: [
                { filename: `${detail.pos_invoice_no}.pdf`, content: pdf, contentType: 'application/pdf' },
            ],
        } as any);

        if (!r.ok) {
            await logPosInvoiceEvent({
                tenantId,
                posInvoiceNo: detail.pos_invoice_no,
                orderId,
                eventType: 'POS_INVOICE_EMAIL_FAILED',
                payload: { to, reason: r.reason },
                createdBy,
            }).catch(() => {});
            return res.status(500).json({ error: r.reason || 'E‑posta gönderilemedi' });
        }

        await logPosInvoiceEvent({
            tenantId,
            posInvoiceNo: detail.pos_invoice_no,
            orderId,
            eventType: 'POS_INVOICE_EMAILED',
            payload: { to },
            createdBy,
        }).catch(() => {});

        return res.json({ ok: true });
    } catch (e: any) {
        if (e instanceof z.ZodError) return res.status(400).json({ error: 'Geçersiz istek', details: e.issues });
        console.error('sendPosInvoiceEmailHandler:', e);
        return res.status(500).json({ error: 'E‑posta gönderilemedi' });
    }
};

const listEventsSchema = z.object({
    posInvoiceNo: z.string().optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    eventType: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
});

export const listPosInvoiceEventsHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = String(req.params.id || '').trim();
        if (!tenantId) return res.status(400).json({ error: 'Tenant id gerekli' });
        if (!(await assertAdminOrResellerOwnsTenant(req, tenantId))) {
            return res.status(403).json({ error: 'Bu tenant için yetkiniz yok' });
        }
        await ensurePosInvoiceEventsTable();
        const q = listEventsSchema.parse(req.query);
        const limit = q.limit ?? 200;

        const where: string[] = [`tenant_id = ?`];
        const params: any[] = [tenantId];
        if (q.posInvoiceNo) {
            where.push(`pos_invoice_no = ?`);
            params.push(String(q.posInvoiceNo));
        }
        if (q.eventType) {
            where.push(`event_type = ?`);
            params.push(String(q.eventType));
        }
        if (q.from) {
            where.push(`created_at >= ?::timestamptz`);
            params.push(String(q.from));
        }
        if (q.to) {
            where.push(`created_at <= ?::timestamptz`);
            params.push(String(q.to));
        }
        const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

        const [rows]: any = await queryPublic(
            `
            SELECT id, tenant_id, pos_invoice_no, order_id, event_type, payload, created_by, created_at
            FROM "public".pos_invoice_events
            ${whereSql}
            ORDER BY created_at DESC
            LIMIT ?
            `,
            [...params, limit],
        );
        return res.json(rows || []);
    } catch (e: any) {
        if (e instanceof z.ZodError) return res.status(400).json({ error: 'Geçersiz filtre', details: e.issues });
        console.error('listPosInvoiceEventsHandler:', e);
        return res.status(500).json({ error: 'Loglar alınamadı' });
    }
};
