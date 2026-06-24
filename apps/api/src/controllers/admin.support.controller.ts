import { Request, Response } from 'express';
import { queryPublic } from '../lib/db.js';

export const listTenantSupportTickets = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const [rows]: any = await queryPublic(
            `SELECT t.*, sa.username as reseller_username, sa.company_name as reseller_company_name,
                    sa.email as reseller_email, sa.mobile_phone as reseller_phone
             FROM \`public\`.support_tickets t
             LEFT JOIN \`public\`.tenants ten ON trim(t.tenant_id::text) = trim(ten.id::text)
             LEFT JOIN \`public\`.saas_admins sa ON ten.reseller_id = sa.id
             WHERE trim(t.tenant_id::text) = trim(?)
             ORDER BY t.created_at DESC`,
            [tenantId]
        );
        res.json(rows || []);
    } catch (error) {
        console.error('[ERROR] listTenantSupportTickets:', error);
        res.status(500).json({ error: 'Talepler alınamadı' });
    }
};

export const createTenantSupportTicket = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const subject = req.body?.subject != null ? String(req.body.subject).trim() : '';
        const message = req.body?.message != null ? String(req.body.message).trim() : '';
        const priority = ['low', 'medium', 'high'].includes(req.body?.priority) ? req.body.priority : 'medium';
        const category = req.body?.category != null ? String(req.body.category).slice(0, 50) : 'general';

        if (subject.length < 2) return res.status(400).json({ error: 'Konu en az 2 karakter olmalı' });
        if (!message) return res.status(400).json({ error: 'Mesaj gerekli' });

        const [result]: any = await queryPublic(
            `INSERT INTO \`public\`.support_tickets (tenant_id, subject, message, status, priority, category)
             VALUES (?, ?, ?, 'open', ?, ?)`,
            [tenantId, subject, message, priority, category]
        );

        const newId = result.insertId;
        if (newId != null) {
            await queryPublic(
                `INSERT INTO \`public\`.ticket_messages (ticket_id, sender_type, sender_name, message) VALUES (?, 'client', ?, ?)`,
                [newId, 'Restaurant Admin', message]
            );
        }

        res.status(201).json({ id: newId, message: 'Talep oluşturuldu' });
    } catch (error) {
        console.error('[ERROR] createTenantSupportTicket:', error);
        res.status(500).json({ error: 'Talep oluşturulamadı' });
    }
};

export const getTenantSupportTicketDetail = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const { id } = req.params;

        const [ticket]: any = await queryPublic(
            `SELECT st.*, t.name as tenant_name,
                    sa.username as reseller_username, sa.company_name as reseller_company_name,
                    sa.email as reseller_email, sa.mobile_phone as reseller_phone
             FROM \`public\`.support_tickets st
             LEFT JOIN \`public\`.tenants t ON trim(st.tenant_id::text) = trim(t.id::text)
             LEFT JOIN \`public\`.saas_admins sa ON t.reseller_id = sa.id
             WHERE st.id = ? AND trim(st.tenant_id::text) = trim(?)`,
            [id, tenantId]
        );

        if (!ticket || ticket.length === 0) {
            return res.status(404).json({ error: 'Talep bulunamadı' });
        }

        const [messages]: any = await queryPublic(
            `SELECT tm.*, 
                    sa.username as reseller_username, 
                    sa.company_name as reseller_company_name,
                    sa.email as reseller_email,
                    sa.mobile_phone as reseller_phone
             FROM \`public\`.ticket_messages tm
             LEFT JOIN \`public\`.support_tickets st ON tm.ticket_id = st.id
             LEFT JOIN \`public\`.tenants ten ON trim(st.tenant_id::text) = trim(ten.id::text)
             LEFT JOIN \`public\`.saas_admins sa ON ten.reseller_id = sa.id
             WHERE tm.ticket_id = ?
             ORDER BY tm.created_at ASC`,
            [id]
        );

        res.json({ ...ticket[0], messages });
    } catch (error) {
        console.error('[ERROR] getTenantSupportTicketDetail:', error);
        res.status(500).json({ error: 'Talep detayları alınamadı' });
    }
};

export const createTenantTicketMessage = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const { ticketId } = req.params;
        const { message } = req.body;

        if (!message) return res.status(400).json({ error: 'Mesaj gerekli' });

        // Verify ownership
        const [check]: any = await queryPublic(
            `SELECT id FROM \`public\`.support_tickets WHERE id = ? AND trim(tenant_id::text) = trim(?) LIMIT 1`,
            [ticketId, tenantId]
        );
        if (!check || check.length === 0) {
            return res.status(403).json({ error: 'Bu talebe yanıt verme yetkiniz yok' });
        }

        const [result]: any = await queryPublic(
            `INSERT INTO \`public\`.ticket_messages (ticket_id, sender_type, sender_name, message)
             VALUES (?, 'client', ?, ?)`,
            [ticketId, 'Restaurant Admin', message]
        );

        await queryPublic(
            `UPDATE \`public\`.support_tickets
             SET updated_at = NOW(), status = 'open'
             WHERE id = ?`,
            [ticketId]
        );

        res.status(201).json({ id: result.insertId, message: 'Mesaj iletildi' });
    } catch (error) {
        console.error('[ERROR] createTenantTicketMessage:', error);
        res.status(500).json({ error: 'Mesaj iletilemedi' });
    }
};
