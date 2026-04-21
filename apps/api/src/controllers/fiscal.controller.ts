import { Request, Response } from 'express';
import { withTenant } from '../lib/db.js';
import { createObjectCsvWriter } from 'csv-writer';
import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import { FiscalService } from '../services/fiscal.service.js';

/**
 * DSFinV-K Export Logic (Phase 12 Modernization)
 * This controller generates fiscal audit files according to German tax law (KassensicherheitsV).
 * Includes: Business Transactions, Master Data, and Technical Journal logs.
 */
export const exportDSFinVK = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const { startDate, endDate } = req.query;

        if (!startDate || !endDate) {
            return res.status(400).json({ error: 'Denetim dönemi (tarih aralığı) belirtilmelidir.' });
        }

        const exportDir = path.join(process.cwd(), 'tmp', `export_${tenantId}_${Date.now()}`);
        if (!fs.existsSync(exportDir)) fs.mkdirSync(exportDir, { recursive: true });

        await withTenant(tenantId, async (connection) => {
            await FiscalService.syncFiscalSchema(connection);
            // 1. Export Transactions (Bon-Daten)
            const [transactions]: any = await connection.query(`
                SELECT
                    o.id,
                    o.created_at,
                    o.total_amount,
                    o.status,
                    o.tax_amount,
                    o.tss_signature,
                    o.tss_transaction_no,
                    p.method as payment_method,
                    p.tss_signature as payment_tss_signature,
                    p.tss_transaction_no as payment_tss_transaction_no
                FROM orders o
                LEFT JOIN payments p ON o.id = p.order_id
                WHERE o.created_at BETWEEN ? AND ?
            `, [startDate, endDate]);

            const txCsv = path.join(exportDir, 'transactions.csv');
            const csvWriter = createObjectCsvWriter({
                path: txCsv,
                header: [
                    { id: 'id', title: 'TX_ID' },
                    { id: 'created_at', title: 'TIMESTAMP' },
                    { id: 'total_amount', title: 'TOTAL' },
                    { id: 'tax_amount', title: 'TAX' },
                    { id: 'payment_method', title: 'PAYMENT_TYPE' },
                    { id: 'status', title: 'STATUS' },
                    { id: 'tss_transaction_no', title: 'ORDER_TSE_TX' },
                    { id: 'tss_signature', title: 'ORDER_TSE_SIG' },
                    { id: 'payment_tss_transaction_no', title: 'PAY_TSE_TX' },
                    { id: 'payment_tss_signature', title: 'PAY_TSE_SIG' }
                ]
            });
            await csvWriter.writeRecords(transactions);

            // 2. Export Master Data (Stammdaten)
            const [products]: any = await connection.query(`SELECT id, name, base_price as price, tax_rate FROM products`);
            const prodCsv = path.join(exportDir, 'master_data.csv');
            const prodWriter = createObjectCsvWriter({
                path: prodCsv,
                header: [
                    { id: 'id', title: 'ITEM_ID' },
                    { id: 'name', title: 'NAME' },
                    { id: 'price', title: 'UNIT_PRICE' },
                    { id: 'tax_rate', title: 'TAX_RATE' }
                ]
            });
            await prodWriter.writeRecords(products);

            // 3. Technical TSE Logs
            const [tseLogs]: any = await connection.query(`
                SELECT id, action, entity_type, entity_id, ip_address, created_at 
                FROM audit_logs 
                WHERE (action LIKE '%tse%' OR action LIKE '%fiscal%') 
                AND created_at BETWEEN ? AND ?
            `, [startDate, endDate]);
            
            fs.writeFileSync(path.join(exportDir, 'tse_journal.json'), JSON.stringify(tseLogs, null, 2));
        });

        // Create ZIP Archive
        const zipFile = `${exportDir}.zip`;
        const output = fs.createWriteStream(zipFile);
        const archive = archiver('zip', { zlib: { level: 9 } });

        output.on('close', () => {
            res.download(zipFile, `DSFinV-K_Export_${tenantId}.zip`, (err) => {
                // Cleanup
                if (fs.existsSync(exportDir)) fs.rmSync(exportDir, { recursive: true, force: true });
                if (fs.existsSync(zipFile)) fs.unlinkSync(zipFile);
            });
        });

        archive.pipe(output);
        archive.directory(exportDir, false);
        await archive.finalize();

    } catch (error: any) {
        console.error('Fiscal Export Error:', error);
        res.status(500).json({ error: 'DSFinV-K export failed: ' + error.message });
    }
};

/**
 * Technical Security Log Stream (TSE Watch)
 */
export const getTseJournal = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const [logs]: any = await withTenant(tenantId, async (connection) => {
            return connection.query(`
                SELECT * FROM audit_logs 
                WHERE action LIKE '%tse%' OR action LIKE '%fiscal%'
                ORDER BY created_at DESC 
                LIMIT 500
            `);
        });
        res.json(logs);
    } catch (error) {
        res.status(500).json({ error: 'TSE journal could not be retrieved' });
    }
};

/** TSE/KassenSichV entegrasyon sağlık özeti */
export const getFiscalStatus = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const data = await withTenant(tenantId, async (connection: any) => {
            await FiscalService.syncFiscalSchema(connection);
            const [orderSignedRows]: any = await connection.query(
                `SELECT COUNT(*)::int AS c FROM orders WHERE tss_signature IS NOT NULL`
            );
            const [paymentSignedRows]: any = await connection.query(
                `SELECT COUNT(*)::int AS c FROM payments WHERE tss_signature IS NOT NULL`
            );
            const [unsignedOrderRows]: any = await connection.query(
                `SELECT COUNT(*)::int AS c FROM orders WHERE status IN ('pending','preparing','ready','completed') AND tss_signature IS NULL`
            );
            const [unsignedPaymentRows]: any = await connection.query(
                `SELECT COUNT(*)::int AS c FROM payments WHERE tss_signature IS NULL`
            );
            const [recentLogs]: any = await connection.query(
                `SELECT id, action, entity_type, entity_id, created_at
                 FROM audit_logs
                 WHERE action IN ('tse_order_signed','tse_payment_signed')
                 ORDER BY created_at DESC
                 LIMIT 50`
            );

            return {
                order_signed_count: Number(orderSignedRows?.[0]?.c ?? 0),
                payment_signed_count: Number(paymentSignedRows?.[0]?.c ?? 0),
                unsigned_orders: Number(unsignedOrderRows?.[0]?.c ?? 0),
                unsigned_payments: Number(unsignedPaymentRows?.[0]?.c ?? 0),
                recent_tse_logs: Array.isArray(recentLogs) ? recentLogs : [],
            };
        });
        res.json(data);
    } catch (error: any) {
        console.error('Fiscal Status Error:', error);
        res.status(500).json({ error: 'Fiscal status alınamadı: ' + error.message });
    }
};
