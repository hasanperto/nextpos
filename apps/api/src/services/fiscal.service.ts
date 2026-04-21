import crypto from 'crypto';

/**
 * NextPOS Fiscal (TSE) Service — KassenSichV Compliance Layer
 * This service handles the generation of security signatures for orders and payments
 * consistent with German tax law requirements.
 */
export class FiscalService {
    static async syncFiscalSchema(connection: any): Promise<void> {
        try {
            await connection.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS tss_signature TEXT`);
            await connection.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS tss_transaction_no VARCHAR(64)`);
            await connection.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS tss_signed_at TIMESTAMP NULL`);
            await connection.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS tss_signature TEXT`);
            await connection.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS tss_transaction_no VARCHAR(64)`);
            await connection.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS tss_signed_at TIMESTAMP NULL`);
        } catch (e: any) {
            console.warn('⚠️ Fiscal schema sync warning:', e?.message || e);
        }
    }

    private static async appendFiscalAuditLog(
        connection: any,
        action: 'tse_order_signed' | 'tse_payment_signed',
        entityType: 'order' | 'payment',
        entityId: number,
        payload: Record<string, unknown>
    ): Promise<void> {
        try {
            await connection.query(
                `INSERT INTO audit_logs (action, entity_type, entity_id, new_value)
                 VALUES (?, ?, ?, ?::jsonb)`,
                [action, entityType, entityId, JSON.stringify(payload)]
            );
        } catch {
            /* audit_logs tablo/kolon uyumsuz olabilir; imza akışını bozma */
        }
    }

    /**
     * In a production environment, this would call the SDK/API of a certified TSE provider
     * (e.g., Fiskaly, Epson TSE, Swissbit).
     * For current phase, we implement a 'TSE Simulation' that produces compliant hashes.
     */
    static async signOrder(connection: any, orderId: number): Promise<string> {
        await this.syncFiscalSchema(connection);
        const [rows]: any = await connection.query('SELECT * FROM orders WHERE id = ?', [orderId]);
        if (rows.length === 0) throw new Error('Order not found for signing');
        const order = rows[0];

        // KassenSichV usually requires: client_id, start_time, type, data
        const payload = `ORDER_SIGN|${order.branch_id}|${order.created_at}|${order.total_amount}|${order.id}`;
        const signature = crypto.createHmac('sha256', process.env.JWT_SECRET || 'tse-secret').update(payload).digest('base64');
        const txNo = `TX-${order.branch_id}-${Date.now().toString().slice(-8)}`;

        await connection.query(
            `UPDATE orders
             SET tss_signature = ?, tss_transaction_no = ?, tss_signed_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [signature, txNo, orderId]
        );
        await this.appendFiscalAuditLog(connection, 'tse_order_signed', 'order', orderId, {
            signature,
            transactionNo: txNo,
        });

        return signature;
    }

    static async signPayment(connection: any, paymentId: number): Promise<string> {
        await this.syncFiscalSchema(connection);
        const [rows]: any = await connection.query('SELECT * FROM payments WHERE id = ?', [paymentId]);
        if (rows.length === 0) throw new Error('Payment not found for signing');
        const payment = rows[0];

        const payload = `PAYMENT_SIGN|${payment.branch_id}|${payment.created_at}|${payment.amount}|${payment.id}`;
        const signature = crypto.createHmac('sha256', process.env.JWT_SECRET || 'tse-secret').update(payload).digest('base64');
        const txNo = `PY-${payment.branch_id}-${Date.now().toString().slice(-8)}`;

        await connection.query(
            `UPDATE payments
             SET tss_signature = ?, tss_transaction_no = ?, tss_signed_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [signature, txNo, paymentId]
        );
        await this.appendFiscalAuditLog(connection, 'tse_payment_signed', 'payment', paymentId, {
            signature,
            transactionNo: txNo,
        });

        return signature;
    }

    static async signZReport(_connection: any, reportId: number): Promise<string> {
        // Daily closed summary signing
        const payload = `ZREPORT_SIGN|${reportId}|${new Date().toISOString()}`;
        const signature = crypto.createHmac('sha256', process.env.JWT_SECRET || 'tse-secret').update(payload).digest('base64');
        return signature;
    }
}
