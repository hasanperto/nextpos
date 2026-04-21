import { Request, Response } from 'express';
import { withTenant, withTenantTransaction, queryPublic } from '../lib/db.js';

/** Muhasebe modülü: Satışlar, iptaller ve finansal düzeltmeler */
export const listAccountingTransactions = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const { type, startDate, endDate, limit = '100', offset = '0' } = req.query;

        const result = await withTenant(tenantId, async (connection) => {
            const branchId = req.branchId || 1;
            let hideCancelled = false;
            let hideDeleted = false;
            try {
                const [branchRows]: any = await connection.query('SELECT settings FROM branches WHERE id = ?', [branchId]);
                const raw = branchRows?.[0]?.settings;
                const settings = typeof raw === 'string' ? JSON.parse(raw) : raw || {};
                const v = settings?.accountingVisibility || {};
                hideCancelled = Boolean(v?.hideCancelled);
                hideDeleted = Boolean(v?.hideDeleted);
            } catch {
                hideCancelled = false;
                hideDeleted = false;
            }

            // 1. Get Summary Stats
            const [summaryRows]: any = await connection.query(`
                SELECT 
                    COALESCE(SUM(CASE WHEN DATE(created_at) = CURRENT_DATE AND status != 'cancelled' AND deleted_at IS NULL THEN total_amount ELSE 0 END), 0) as today_turnover,
                    COALESCE(SUM(CASE WHEN status != 'cancelled' AND deleted_at IS NULL THEN total_amount ELSE 0 END), 0) as total_turnover,
                    COALESCE(SUM(CASE WHEN status = 'cancelled' AND deleted_at IS NULL THEN total_amount ELSE 0 END), 0) as total_cancelled,
                    COALESCE(SUM(CASE WHEN status != 'cancelled' AND deleted_at IS NULL THEN discount_amount ELSE 0 END), 0) as total_discount
                FROM orders
            `);

            const kind = String(type || 'sales');
            if ((kind === 'cancelled' && hideCancelled) || (kind === 'deleted' && hideDeleted)) {
                const summary = summaryRows?.[0] || {};
                const sanitized = {
                    ...summary,
                    ...(hideCancelled ? { total_cancelled: 0 } : {}),
                };
                return { transactions: [], summary: sanitized };
            }

            // 2. Get Transaction List
            let listQuery = `
                SELECT o.*, 
                       o.deleted_at,
                       o.deleted_by,
                       o.delete_reason,
                       t.name as table_name,
                       u.name as waiter_name,
                       p.method as payment_method,
                       (SELECT json_agg(json_build_object(
                            'id', oi.id, 
                            'product_name', p.name, 
                            'quantity', oi.quantity, 
                            'unit_price', oi.unit_price, 
                            'total_price', oi.total_price,
                            'status', oi.status
                       )) FROM order_items oi 
                       LEFT JOIN products p ON oi.product_id = p.id
                       WHERE oi.order_id = o.id) as items
                FROM orders o
                LEFT JOIN tables t ON o.table_id = t.id
                LEFT JOIN users u ON o.waiter_id = u.id
                LEFT JOIN payments p ON o.id = p.order_id
                WHERE 1=1
            `;
            const params: any[] = [];

            if (kind === 'sales') {
                listQuery += ` AND o.deleted_at IS NULL AND o.payment_status = 'paid' AND o.status != 'cancelled'`;
            } else if (kind === 'cancelled') {
                listQuery += ` AND o.deleted_at IS NULL AND o.status = 'cancelled'`;
            } else if (kind === 'refund') {
                listQuery += ` AND o.deleted_at IS NULL AND o.payment_status = 'refunded'`;
            } else if (kind === 'deleted') {
                listQuery += ` AND o.deleted_at IS NOT NULL`;
            } else {
                listQuery += ` AND o.deleted_at IS NULL`;
            }

            if (startDate && endDate) {
                listQuery += ` AND o.created_at BETWEEN ? AND ?`;
                params.push(startDate, endDate);
            }

            listQuery += ` ORDER BY o.created_at DESC LIMIT ? OFFSET ?`;
            params.push(Number(limit), Number(offset));

            const [rows]: any = await connection.query(listQuery, params);
            
            return {
                transactions: rows,
                summary: summaryRows[0]
            };
        });

        res.json(result);
    } catch (error) {
        console.error('Accounting Error:', error);
        res.status(500).json({ error: 'Muhasebe verileri yüklenemedi' });
    }
};

/** İşlem düzeltme: Sipariş tutarını veya kalemleri manuel güncelleme */
export const updateTransaction = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const orderId = Number(req.params.id);
        const { total_amount, status, notes } = req.body;

        if (!Number.isFinite(orderId)) {
            return res.status(400).json({ error: 'Geçersiz İşlem ID' });
        }

        await withTenantTransaction(tenantId, async (connection) => {
            const [result]: any = await connection.query(
                `UPDATE orders 
                 SET total_amount = ?, status = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
                 WHERE id = ? AND deleted_at IS NULL`,
                [total_amount, status, notes, orderId]
            );
            if (Number(result?.affectedRows || 0) === 0) {
                throw new Error('NOT_FOUND_OR_DELETED');
            }
        });

        res.json({ message: 'İşlem güncellendi' });
    } catch (error: any) {
        console.error('Update Transaction Error:', error);
        if (String(error?.message) === 'NOT_FOUND_OR_DELETED') {
            return res.status(404).json({ error: 'İşlem bulunamadı veya silinmiş' });
        }
        res.status(500).json({ error: 'Güncelleme başarısız: ' + error.message });
    }
};

/** İşlem silme: Satışı soft-delete eder (muhasebe listesinde görünmez). */
export const deleteTransaction = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const orderId = Number(req.params.id);
        const { reason } = (req.body || {}) as { reason?: string };

        if (!Number.isFinite(orderId)) {
            return res.status(400).json({ error: 'Geçersiz İşlem ID' });
        }

        await withTenantTransaction(tenantId, async (connection) => {
            const [beforeRows]: any = await connection.query(
                `SELECT id, total_amount, status, payment_status, created_at, deleted_at
                 FROM orders WHERE id = ?`,
                [orderId]
            );
            const before = beforeRows?.[0];
            if (!before) throw new Error('NOT_FOUND');
            if (before.deleted_at) throw new Error('ALREADY_DELETED');

            const by = Number(req.user?.userId);
            const deletedBy = Number.isFinite(by) ? by : null;

            const [result]: any = await connection.query(
                `UPDATE orders
                 SET deleted_at = CURRENT_TIMESTAMP,
                     deleted_by = ?,
                     delete_reason = ?,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = ? AND deleted_at IS NULL`,
                [deletedBy, typeof reason === 'string' ? reason.slice(0, 500) : null, orderId]
            );
            if (Number(result?.affectedRows || 0) === 0) throw new Error('NOT_FOUND');

            try {
                await queryPublic(
                    `INSERT INTO \`public\`.audit_logs (user_id, action, entity_type, entity_id, old_value, new_value, ip_address, user_agent)
                     VALUES (?, ?, ?, ?, ?::jsonb, ?::jsonb, ?, ?)`,
                    [
                        String(req.user?.username || req.user?.userId || 'unknown'),
                        'tenant_accounting_order_soft_deleted',
                        'order',
                        String(orderId),
                        JSON.stringify(before || {}),
                        JSON.stringify({
                            deleted_at: new Date().toISOString(),
                            deleted_by: deletedBy,
                            delete_reason: typeof reason === 'string' ? reason.slice(0, 500) : null,
                            tenant_id: tenantId,
                        }),
                        String(req.ip || ''),
                        String(req.headers['user-agent'] || ''),
                    ]
                );
            } catch {
                /* ignore audit failure */
            }
        });

        res.json({ message: 'İşlem silindi (muhasebeden gizlendi)' });
    } catch (error: any) {
        console.error('Delete Transaction Error:', error);
        if (String(error?.message) === 'NOT_FOUND') return res.status(404).json({ error: 'İşlem bulunamadı' });
        if (String(error?.message) === 'ALREADY_DELETED') return res.status(409).json({ error: 'İşlem zaten silinmiş' });
        res.status(500).json({ error: 'Silme işlemi başarısız: ' + error.message });
    }
};

/** Soft-delete geri al: satış muhasebede tekrar görünür. */
export const restoreTransaction = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const orderId = Number(req.params.id);
        if (!Number.isFinite(orderId)) {
            return res.status(400).json({ error: 'Geçersiz İşlem ID' });
        }

        await withTenantTransaction(tenantId, async (connection) => {
            const [beforeRows]: any = await connection.query(
                `SELECT id, total_amount, status, payment_status, created_at, deleted_at, deleted_by, delete_reason
                 FROM orders WHERE id = ?`,
                [orderId]
            );
            const before = beforeRows?.[0];
            if (!before) throw new Error('NOT_FOUND');
            if (!before.deleted_at) throw new Error('NOT_DELETED');

            const [result]: any = await connection.query(
                `UPDATE orders
                 SET deleted_at = NULL,
                     deleted_by = NULL,
                     delete_reason = NULL,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
                [orderId]
            );
            if (Number(result?.affectedRows || 0) === 0) throw new Error('NOT_FOUND');

            try {
                await queryPublic(
                    `INSERT INTO \`public\`.audit_logs (user_id, action, entity_type, entity_id, old_value, new_value, ip_address, user_agent)
                     VALUES (?, ?, ?, ?, ?::jsonb, ?::jsonb, ?, ?)`,
                    [
                        String(req.user?.username || req.user?.userId || 'unknown'),
                        'tenant_accounting_order_soft_restored',
                        'order',
                        String(orderId),
                        JSON.stringify(before || {}),
                        JSON.stringify({ restored_at: new Date().toISOString(), tenant_id: tenantId }),
                        String(req.ip || ''),
                        String(req.headers['user-agent'] || ''),
                    ]
                );
            } catch {
                /* ignore audit failure */
            }
        });

        res.json({ message: 'İşlem geri alındı' });
    } catch (error: any) {
        console.error('Restore Transaction Error:', error);
        if (String(error?.message) === 'NOT_FOUND') return res.status(404).json({ error: 'İşlem bulunamadı' });
        if (String(error?.message) === 'NOT_DELETED') return res.status(409).json({ error: 'İşlem silinmiş değil' });
        res.status(500).json({ error: 'Geri alma başarısız: ' + error.message });
    }
};
