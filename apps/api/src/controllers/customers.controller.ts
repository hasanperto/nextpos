import { Request, Response } from 'express';
import { z } from 'zod';
import { withTenant, withTenantTransaction } from '../lib/db.js';

const createCustomerSchema = z.object({
    name: z.string().min(2),
    phone: z.string().optional(),
    email: z.string().email().optional(),
    allergies: z.string().optional(),
    notes: z.string().optional(),
    preferredLanguage: z.string().default('de'),
});

export const searchCustomersHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const { q, phone } = req.query;

        const customers = await withTenant(tenantId, async (connection) => {
            if (phone) {
                const [rows]: any = await connection.query(
                    'SELECT * FROM customers WHERE phone LIKE ? ORDER BY name ASC LIMIT 20',
                    [`%${phone}%`]
                );
                return rows;
            }

            if (q) {
                const [rows]: any = await connection.query(
                    `SELECT * FROM customers 
                     WHERE name LIKE ? OR phone LIKE ? OR email LIKE ? OR customer_code = ?
                     ORDER BY name ASC LIMIT 20`,
                    [`%${q}%`, `%${q}%`, `%${q}%`, q]
                );
                return rows;
            }

            const [rows]: any = await connection.query(
                'SELECT * FROM customers ORDER BY last_visit DESC LIMIT 50'
            );
            return rows;
        });

        res.json(customers);
    } catch (error) {
        console.error('❌ Müşteri arama hatası:', error);
        res.status(500).json({ error: 'Müşteriler aranamadı' });
    }
};

export const createCustomerHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const data = createCustomerSchema.parse(req.body);

        const customer = await withTenant(tenantId, async (connection) => {
            const [result]: any = await connection.query(
                `INSERT INTO customers (name, phone, email, allergies, notes, preferred_language)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [data.name, data.phone || null, data.email || null, data.allergies || null, data.notes || null, data.preferredLanguage]
            );

            const [rows]: any = await connection.query('SELECT * FROM customers WHERE id = ?', [result.insertId]);
            return rows[0];
        });

        res.status(201).json(customer);
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: 'Geçersiz veri', details: error.errors });
        }
        console.error('❌ Müşteri oluşturma hatası:', error);
        res.status(500).json({ error: 'Müşteri oluşturulamadı' });
    }
};

export const getCustomerByIdHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const customerId = Number(req.params.id);

        const customer = await withTenant(tenantId, async (connection) => {
            const [rows]: any = await connection.query(
                `SELECT c.*,
                        (SELECT JSON_ARRAYAGG(JSON_OBJECT(
                                'id', a.id, 'label', a.label, 'address', a.address, 'city', a.city
                           )) FROM customer_addresses a WHERE a.customer_id = c.id) as addresses
                 FROM customers c WHERE c.id = ?`,
                [customerId]
            );
            return rows[0] || null;
        });

        if (!customer) {
            return res.status(404).json({ error: 'Müşteri bulunamadı' });
        }

        res.json(customer);
    } catch (error) {
        console.error('❌ Müşteri detay hatası:', error);
        res.status(500).json({ error: 'Müşteri detayı yüklenemedi' });
    }
};
