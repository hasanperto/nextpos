import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { withTenant } from '../lib/db.js';
import { processPendingSyncQueue } from '../services/sync-process.service.js';

const pushBodySchema = z.object({
    items: z
        .array(
            z.object({
                offlineId: z.string().min(8).max(64),
                entityType: z.string().min(1).max(50),
                action: z.enum(['create', 'update', 'delete']),
                payload: z.record(z.unknown()),
            })
        )
        .min(1)
        .max(200),
});

/** Aynı offlineId tekrar gelirse çift satır oluşmaz; zaten synced ise yok sayılır. */
async function upsertSyncQueueItems(
    tenantId: string,
    items: z.infer<typeof pushBodySchema>['items']
): Promise<{ queued: number; skippedSynced: number }> {
    let queued = 0;
    let skippedSynced = 0;

    for (const item of items) {
        const existing = await prisma.syncQueue.findUnique({
            where: {
                tenantId_entityId: {
                    tenantId,
                    entityId: item.offlineId,
                },
            },
        });

        if (existing?.status === 'synced') {
            skippedSynced++;
            continue;
        }

        if (existing) {
            await prisma.syncQueue.update({
                where: { id: existing.id },
                data: {
                    entityType: item.entityType,
                    action: item.action,
                    payload: item.payload as object,
                    ...(existing.status === 'failed' || existing.status === 'pending'
                        ? { status: 'pending', errorMessage: null }
                        : {}),
                },
            });
        } else {
            await prisma.syncQueue.create({
                data: {
                    tenantId,
                    entityType: item.entityType,
                    entityId: item.offlineId,
                    action: item.action,
                    payload: item.payload as object,
                    status: 'pending',
                },
            });
        }
        queued++;
    }

    return { queued, skippedSynced };
}

/** Offline cihazdan gelen olayları public.sync_queue tablosuna yazar (işleme sonraki sürüm). */
export async function postSyncPushHandler(req: Request, res: Response) {
    try {
        const tenantId = req.tenantId;
        if (!tenantId) {
            return res.status(403).json({ error: 'Offline sync yalnızca tenant oturumu ile kullanılabilir' });
        }

        const data = pushBodySchema.parse(req.body);

        const { queued, skippedSynced } = await upsertSyncQueueItems(tenantId, data.items);

        const syncResult = await processPendingSyncQueue(tenantId, req);

        res.status(201).json({
            accepted: data.items.length,
            queued,
            skippedSynced,
            processed: syncResult.processed,
            failed: syncResult.failed,
            message:
                syncResult.failed > 0
                    ? 'Bazı kayıtlar işlenemedi (sync_queue durumuna bakın)'
                    : 'Kuyruk işlendi',
        });
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: 'Geçersiz gövde', details: error.issues });
        }
        console.error('postSyncPushHandler', error);
        res.status(500).json({ error: 'Senkron kuyruğu yazılamadı' });
    }
}

export async function getSyncStatusHandler(req: Request, res: Response) {
    try {
        const tenantId = req.tenantId;
        if (!tenantId) {
            return res.status(403).json({ error: 'Sadece tenant oturumu' });
        }

        const [pending, failed, synced] = await Promise.all([
            prisma.syncQueue.count({ where: { tenantId, status: 'pending' } }),
            prisma.syncQueue.count({ where: { tenantId, status: 'failed' } }),
            prisma.syncQueue.count({ where: { tenantId, status: 'synced' } }),
        ]);

        res.json({
            pending,
            failed,
            synced,
            serverTime: new Date().toISOString(),
        });
    } catch (error) {
        console.error('getSyncStatusHandler', error);
        res.status(500).json({ error: 'Durum okunamadı' });
    }
}

export async function postSyncRetryHandler(req: Request, res: Response) {
    try {
        const tenantId = req.tenantId;
        if (!tenantId) {
            return res.status(403).json({ error: 'Sadece tenant oturumu' });
        }

        const reset = await prisma.syncQueue.updateMany({
            where: { tenantId, status: 'failed' },
            data: { status: 'pending', errorMessage: null },
        });

        const syncResult = await processPendingSyncQueue(tenantId, req);

        res.json({
            reset: reset.count,
            processed: syncResult.processed,
            failed: syncResult.failed,
            message:
                syncResult.failed > 0
                    ? 'Bazı kayıtlar yine işlenemedi'
                    : 'Başarısız kayıtlar yeniden işlendi',
        });
    } catch (error: any) {
        console.error('postSyncRetryHandler', error);
        res.status(500).json({ error: 'Yeniden deneme başarısız' });
    }
}

/** Menü/masa özet revizyonu — tam delta yok; istemci `menuStale` ile GET /menu ve /tables yeniler. Parmak izleri: salon (`tf`/`sf`), katalog (`cf`/`pf`/`mf`/`vf`/`pmf`). */
export async function getSyncPullHandler(req: Request, res: Response) {
    try {
        const tenantId = req.tenantId;
        if (!tenantId) {
            return res.status(403).json({ error: 'Sadece tenant oturumu' });
        }

        const since = typeof req.query.since === 'string' ? req.query.since : undefined;

        const row = await withTenant(tenantId, async (connection) => {
            const [rows]: any = await connection.query(
                `SELECT
                    COALESCE((SELECT MAX(EXTRACT(EPOCH FROM updated_at))::bigint FROM products), 0) AS pe,
                    (SELECT COUNT(*)::bigint FROM products) AS pc,
                    (SELECT COUNT(*)::bigint FROM categories) AS cc,
                    (SELECT COUNT(*)::bigint FROM tables) AS tc,
                    (SELECT COUNT(*)::bigint FROM sections) AS sc,
                    COALESCE(
                        md5(COALESCE(
                            (SELECT string_agg(
                                concat_ws('|',
                                    t.id::text,
                                    t.section_id::text,
                                    t.name,
                                    t.capacity::text,
                                    COALESCE(t.shape, ''),
                                    COALESCE(t.position_x::text, ''),
                                    COALESCE(t.position_y::text, ''),
                                    COALESCE(t.status::text, ''),
                                    COALESCE(t.qr_code, '')
                                ),
                                E'\\x1E' ORDER BY t.id
                            ) FROM tables t),
                            ''
                        )),
                        ''
                    ) AS tf,
                    COALESCE(
                        md5(COALESCE(
                            (SELECT string_agg(
                                concat_ws('|',
                                    s.id::text,
                                    s.name,
                                    s.floor::text,
                                    COALESCE(s.layout_data::text, ''),
                                    s.sort_order::text,
                                    COALESCE(s.is_active::text, '')
                                ),
                                E'\\x1E' ORDER BY s.id
                            ) FROM sections s),
                            ''
                        )),
                        ''
                    ) AS sf,
                    COALESCE(
                        md5(COALESCE(
                            (SELECT string_agg(
                                concat_ws('|',
                                    c.id::text,
                                    c.name,
                                    COALESCE(c.translations::text, ''),
                                    COALESCE(c.icon, ''),
                                    c.sort_order::text,
                                    COALESCE(c.is_active::text, ''),
                                    COALESCE(c.kitchen_station, ''),
                                    COALESCE(c.branch_id::text, '')
                                ),
                                E'\\x1E' ORDER BY c.id
                            ) FROM categories c),
                            ''
                        )),
                        ''
                    ) AS cf,
                    COALESCE(
                        md5(COALESCE(
                            (SELECT string_agg(
                                concat_ws('|',
                                    p.id::text,
                                    p.category_id::text,
                                    p.name,
                                    COALESCE(p.translations::text, ''),
                                    p.base_price::text,
                                    p.price_takeaway::text,
                                    p.price_delivery::text,
                                    COALESCE(p.is_active::text, ''),
                                    COALESCE(p.image_url, ''),
                                    COALESCE(p.prep_time_min::text, ''),
                                    p.sort_order::text,
                                    COALESCE(p.branch_id::text, '')
                                ),
                                E'\\x1E' ORDER BY p.id
                            ) FROM products p),
                            ''
                        )),
                        ''
                    ) AS pf,
                    COALESCE(
                        md5(COALESCE(
                            (SELECT string_agg(
                                concat_ws('|',
                                    m.id::text,
                                    m.name,
                                    m.price::text,
                                    COALESCE(m.is_active::text, ''),
                                    COALESCE(m.translations::text, ''),
                                    COALESCE(m.category, '')
                                ),
                                E'\\x1E' ORDER BY m.id
                            ) FROM modifiers m),
                            ''
                        )),
                        ''
                    ) AS mf,
                    COALESCE(
                        md5(COALESCE(
                            (SELECT string_agg(
                                concat_ws('|',
                                    v.id::text,
                                    v.product_id::text,
                                    v.name,
                                    v.price::text,
                                    v.sort_order::text,
                                    COALESCE(v.is_default::text, ''),
                                    COALESCE(v.translations::text, '')
                                ),
                                E'\\x1E' ORDER BY v.id
                            ) FROM product_variants v),
                            ''
                        )),
                        ''
                    ) AS vf,
                    COALESCE(
                        md5(COALESCE(
                            (SELECT string_agg(
                                concat_ws('|', pm.product_id::text, pm.modifier_id::text),
                                E'\\x1E' ORDER BY pm.product_id, pm.modifier_id
                            ) FROM product_modifiers pm),
                            ''
                        )),
                        ''
                    ) AS pmf`
            );
            return rows?.[0] ?? {};
        });

        const pe = String(row.pe ?? '0');
        const pc = String(row.pc ?? '0');
        const cc = String(row.cc ?? '0');
        const tc = String(row.tc ?? '0');
        const sc = String(row.sc ?? '0');
        const tf = String(row.tf ?? '');
        const sf = String(row.sf ?? '');
        const cf = String(row.cf ?? '');
        const pf = String(row.pf ?? '');
        const mf = String(row.mf ?? '');
        const vf = String(row.vf ?? '');
        const pmf = String(row.pmf ?? '');
        const menuRevision = `${pe}:${pc}:${cc}:${tc}:${sc}:${tf}:${sf}:${cf}:${pf}:${mf}:${vf}:${pmf}`;
        const menuStale = since != null && since !== '' && since !== menuRevision;

        res.json({
            serverTime: new Date().toISOString(),
            since: since ?? null,
            menuRevision,
            menuStale,
            deltas: [] as unknown[],
            hint: 'menuStale veya menü yenileme: GET /api/v1/menu/*, masalar: GET /api/v1/tables',
        });
    } catch (error) {
        console.error('getSyncPullHandler', error);
        res.status(500).json({ error: 'Pull başarısız' });
    }
}
