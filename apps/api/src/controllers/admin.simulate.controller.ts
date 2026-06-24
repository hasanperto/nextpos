import { Request, Response } from 'express';
import { withTenant } from '../lib/db.js';

export const simulateEventHandler = async (req: any, res: Response) => {
    try {
        const { type, tenantId: targetTenantId } = req.body;
        const tenantId = targetTenantId || req.user?.tenantId;

        if (!tenantId) {
            return res.status(400).json({ error: 'Tenant ID zorunludur' });
        }

        const io = req.app.get('io');
        if (!io) {
            return res.status(500).json({ error: 'Socket sunucusu bulunamadı' });
        }

        console.log(`🧪 [SIMULATION] Type: ${type}, Tenant: ${tenantId}`);

        const asNumber = (v: unknown): number => {
            const n = Number(v);
            return Number.isFinite(n) ? n : 0;
        };

        switch (type) {
            case 'whatsapp':
                {
                    const rawItems = Array.isArray(req.body?.items) ? req.body.items : null;
                    const items = (rawItems && rawItems.length > 0
                        ? rawItems
                        : [
                              { name: 'Klasik Döner', price: 9.5, quantity: 1, notes: 'Bol acılı, soğansız' },
                              { name: 'Lahmacun', price: 4.0, quantity: 2, notes: 'Maydanoz az' },
                              { name: 'Ayran', price: 2.5, quantity: 2 },
                          ]
                    )
                        .map((x: any) => ({
                            productId: 0,
                            name: String(x?.name || 'Ürün'),
                            price: asNumber(x?.price),
                            quantity: Math.max(1, Math.floor(asNumber(x?.quantity) || 1)),
                            notes: x?.notes ? String(x.notes) : undefined,
                        }))
                        .slice(0, 20);

                    const total = items.reduce((a: number, it: any) => a + asNumber(it.price) * asNumber(it.quantity), 0);

                    io.to(`tenant:${tenantId}`).emit('customer:whatsapp_order', {
                        id: `wa-sim-${Date.now()}`,
                        phone: '+49 162 ' + Math.floor(Math.random() * 9000000 + 1000000),
                        customerName: 'Test Simülasyon (WhatsApp)',
                        total: Math.round(total * 100) / 100,
                        receivedAt: new Date().toISOString(),
                        items,
                        address: 'Tübingen Str. 44, 72072 Tübingen',
                        note: 'Zili çalmayın, kapıya bırakın.',
                    });
                }
                break;

            case 'call':
            case 'call_registered':
                await withTenant(tenantId, async (connection) => {
                    const [customerRows]: any = await connection.query(
                        `SELECT c.id, c.name, c.phone,
                                (SELECT address FROM customer_addresses WHERE customer_id = c.id ORDER BY is_default DESC, id DESC LIMIT 1) as address
                         FROM customers c
                         INNER JOIN customer_addresses ca ON ca.customer_id = c.id
                         WHERE ca.address IS NOT NULL AND ca.address != ''
                         LIMIT 1`
                    );

                    let customer = customerRows?.[0] || null;
                    if (!customer) {
                        const [anyCustRows]: any = await connection.query(
                            `SELECT id, name, phone FROM customers LIMIT 1`
                        );
                        customer = anyCustRows?.[0] || null;
                    }

                    if (customer) {
                        io.to(`tenant:${tenantId}`).emit('INCOMING_CALL', {
                            number: customer.phone,
                            name: customer.name,
                            customerId: customer.id,
                            address: customer.address || null,
                            timestamp: new Date().toISOString()
                        });
                    } else {
                        // fallback if absolutely no customers exist in DB
                        io.to(`tenant:${tenantId}`).emit('INCOMING_CALL', {
                            number: '+905321112233',
                            name: 'Hasan Bey (Simüle)',
                            customerId: 9999,
                            address: 'Akcakoyun mah 124 nolu sk no 6',
                            timestamp: new Date().toISOString()
                        });
                    }
                });
                break;

            case 'call_new':
                io.to(`tenant:${tenantId}`).emit('INCOMING_CALL', {
                    number: '+90555' + Math.floor(Math.random() * 9000000 + 1000000),
                    name: 'Bilinmeyen Numara',
                    customerId: null,
                    address: null,
                    timestamp: new Date().toISOString()
                });
                break;

            case 'kitchen':
                io.to(`tenant:${tenantId}`).emit('order:ready', {
                    orderId: `ORD-${Math.floor(Math.random() * 10000)}`,
                    status: 'ready'
                });
                break;

            case 'web_order':
                {
                    const { customerName, phone, address, orderType, paymentMethod, isPaid } = req.body;
                    const rawItems = Array.isArray(req.body?.items) ? req.body.items : null;
                    const items = (rawItems && rawItems.length > 0
                        ? rawItems
                        : [
                              { id: 101, product_name: 'Margherita Pizza', quantity: 1, total_price: 12.5 },
                              { id: 202, product_name: 'Coca-Cola', quantity: 2, total_price: 5.0 },
                              {
                                  id: 303,
                                  product_name: 'Patates Kızartması',
                                  quantity: 1,
                                  total_price: 4.5,
                                  modifiers: JSON.stringify([{ name: 'Ketçap' }, { name: 'Mayonez' }]),
                              },
                          ]
                    )
                        .map((x: any, i: number) => ({
                            id: Number.isFinite(Number(x?.id)) ? Number(x.id) : i + 1,
                            product_name: String(x?.product_name || x?.name || 'Ürün'),
                            quantity: Math.max(1, Math.floor(asNumber(x?.quantity) || 1)),
                            total_price: Math.max(0, asNumber(x?.total_price || x?.price)),
                            modifiers: x?.modifiers ?? undefined,
                        }))
                        .slice(0, 30);

                    const total = items.reduce((a: number, it: any) => a + asNumber(it.total_price), 0);

                    io.to(`tenant:${tenantId}`).emit('external_order:new', {
                        id: `web-sim-${Date.now()}`,
                        source: 'web',
                        customerName: customerName || 'Web Sipariş Testi',
                        phone: phone || '+49 176 0000 0000',
                        address: address || 'Tübingen Merkez',
                        order_type: orderType || 'delivery',
                        payment_method: paymentMethod || 'cash',
                        payment_status: isPaid ? 'paid' : 'pending',
                        total: Math.round(total * 100) / 100,
                        receivedAt: new Date().toISOString(),
                        items,
                    });
                    break;
                }


            default:
                return res.status(400).json({ error: 'Invalid simulation type' });
        }

        res.json({ success: true, type, tenantId });
    } catch (error: any) {
        console.error('Simulation error:', error);
        res.status(500).json({ error: 'Simulation failed' });
    }
};
