/**
 * Mevcut sipariş kalemlerinden mutfak fişlerini üretir (Ticket Merging - Adisyon Birleştirme Desteğiyle).
 * Eğer aynı masaya/seansa ait bekleyen veya hazırlanan bir fiş varsa, yeni ürünler ona eklenir.
 */
export async function buildKitchenTicketsForOrder(connection: any, orderId: number): Promise<void> {
    const [metaRows]: any = await connection.query(
        `SELECT o.session_id, t.name AS table_name,
                COALESCE(uw.name, uc.name) AS staff_name,
                o.is_urgent AS is_urgent
         FROM orders o
         LEFT JOIN tables t ON o.table_id = t.id
         LEFT JOIN users uw ON o.waiter_id = uw.id
         LEFT JOIN users uc ON o.cashier_id = uc.id
         WHERE o.id = ?`,
        [orderId]
    );
    const meta = metaRows?.[0] || {};
    const sessionId = meta.session_id;

    const [itemRows]: any = await connection.query(
        `SELECT oi.quantity, oi.modifiers, oi.notes,
                p.name AS product_name,
                pv.name AS variant_name,
                COALESCE(NULLIF(TRIM(c.kitchen_station), ''), 'hot') AS kitchen_station
         FROM order_items oi
         JOIN products p ON oi.product_id = p.id
         LEFT JOIN categories c ON p.category_id = c.id
         LEFT JOIN product_variants pv ON oi.variant_id = pv.id
         WHERE oi.order_id = ?`,
        [orderId]
    );

    const normalizeStation = (raw: string | null | undefined): 'hot' | 'bar' | 'cold' => {
        const x = String(raw || 'hot').toLowerCase().trim();
        if (x === 'bar' || x === 'cold') return x;
        return 'hot';
    };

    type Line = {
        product_name: string;
        variant_name: string | null;
        quantity: number;
        modifiers: any;
        notes: string | null;
    };

    const parseModifiers = (raw: any): any[] => {
        if (Array.isArray(raw)) return raw;
        if (typeof raw === 'string') {
            try { return JSON.parse(raw || '[]'); } catch { return []; }
        }
        return [];
    };

    const byStation = new Map<'hot' | 'bar' | 'cold', Line[]>();
    for (const r of itemRows || []) {
        const st = normalizeStation(r.kitchen_station);
        const line: Line = {
            product_name: r.product_name,
            variant_name: r.variant_name || null,
            quantity: Number(r.quantity),
            modifiers: parseModifiers(r.modifiers),
            notes: r.notes || null,
        };
        if (!byStation.has(st)) byStation.set(st, []);
        byStation.get(st)!.push(line);
    }

    const stationOrder: ('hot' | 'bar' | 'cold')[] = ['hot', 'bar', 'cold'];
    for (const station of stationOrder) {
        const newLines = byStation.get(station);
        if (!newLines?.length) continue;

        // 1) Mevcut birleştirilebilir bir fiş (ticket) var mı? (Aynı seans, aynı istasyon, waiting/preparing)
        // Not: 'ready' olanlar birleştirilmez (User: "hazirsa birlestirme").
        let existingTicket: any = null;
        if (sessionId) {
            const [ticketRows]: any = await connection.query(
                `SELECT kt.id, kt.items, kt.status
                 FROM kitchen_tickets kt
                 JOIN orders o ON kt.order_id = o.id
                 WHERE o.session_id = ? AND kt.station = ? AND kt.status = 'waiting'
                 ORDER BY kt.id DESC LIMIT 1`,
                [sessionId, station]
            );
            existingTicket = ticketRows?.[0];
        }

        if (existingTicket) {
            // MERGE MANTIĞI
            const mergedItems: Line[] = parseModifiers(existingTicket.items);
            for (const n of newLines) {
                // Aynı ürün/varyant/not kombinasyonu mu?
                const match = mergedItems.find(x => 
                    x.product_name === n.product_name &&
                    x.variant_name === n.variant_name &&
                    x.notes === n.notes &&
                    JSON.stringify(x.modifiers) === JSON.stringify(n.modifiers)
                );
                if (match) {
                    match.quantity += n.quantity;
                } else {
                    mergedItems.push(n);
                }
            }

            await connection.query(
                `UPDATE kitchen_tickets 
                 SET items = ?::jsonb, is_urgent = ?
                 WHERE id = ?`,
                [JSON.stringify(mergedItems), Boolean(meta.is_urgent), existingTicket.id]
            );
        } else {
            // YENİ TICKET OLUŞTURMA
            const [tnRows]: any = await connection.query(
                `SELECT COALESCE(MAX(ticket_number), 0) AS n FROM kitchen_tickets`
            );
            const nextTicketNum = Number(tnRows?.[0]?.n ?? 0) + 1;

            await connection.query(
                `INSERT INTO kitchen_tickets (order_id, table_name, waiter_name, station, status, is_urgent, ticket_number, items)
                 VALUES (?, ?, ?, ?, 'waiting', ?, ?, ?::jsonb)`,
                [
                    orderId,
                    meta.table_name || null,
                    meta.staff_name || null,
                    station,
                    Boolean(meta.is_urgent),
                    nextTicketNum,
                    JSON.stringify(newLines),
                ]
            );
        }
    }
}
