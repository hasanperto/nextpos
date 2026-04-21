/**
 * Masa tableti ilk kurulum — lisans + masa eşlemesi (JWT yok).
 * POST /api/v1/public/kiosk/bootstrap — cihaz kodu üretir ve şube ayarına kaydeder.
 * POST /api/v1/public/kiosk/session — kayıtlı cihaz kodu ile oturum doğrular.
 */
import { randomBytes } from 'crypto';
import { Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { withTenant, withTenantTransaction } from '../lib/db.js';
import { effectiveTableQrCode } from '../lib/tableQr.js';
import { getEffectiveMaxDevices, migrateBillingTables } from '../services/billing.service.js';

type BranchSettings = {
    integrations?: {
        kiosk?: {
            pairingSecret?: string;
            allowSelfRegistration?: boolean;
            linkedDevices?: LinkedDeviceEntry[];
        };
    };
};

export type LinkedDeviceEntry = {
    deviceCode: string;
    tableId: number;
    tableQrCode: string;
    tableName: string;
    sectionName?: string | null;
    label?: string;
    createdAt: string;
    lastSeenAt?: string;
};

function newDeviceCode(): string {
    return `ks_${randomBytes(12).toString('hex')}`;
}

function parseSettings(raw: unknown): Record<string, unknown> {
    if (!raw) return {};
    if (typeof raw === 'string') {
        try {
            return JSON.parse(raw) as Record<string, unknown>;
        } catch {
            return {};
        }
    }
    return raw as Record<string, unknown>;
}

function appendLinkedDevice(
    settings: Record<string, unknown>,
    entry: Omit<LinkedDeviceEntry, 'lastSeenAt'>,
): Record<string, unknown> {
    const integrations = { ...(settings.integrations as Record<string, unknown> | undefined) };
    const kiosk = { ...(integrations.kiosk as Record<string, unknown> | undefined) };
    const prev = Array.isArray(kiosk.linkedDevices) ? [...(kiosk.linkedDevices as LinkedDeviceEntry[])] : [];
    prev.push({ ...entry, lastSeenAt: new Date().toISOString() });
    integrations.kiosk = {
        ...kiosk,
        linkedDevices: prev,
    };
    return { ...settings, integrations };
}

export const kioskBootstrapHandler = async (req: Request, res: Response) => {
    try {
        const licenseKey = String(req.body?.licenseKey ?? '').trim();
        const tableIdentifier = String(req.body?.tableNameOrQr ?? req.body?.tableIdentifier ?? '').trim();
        const pairingSecret = String(req.body?.pairingSecret ?? '').trim();

        if (!licenseKey || !tableIdentifier) {
            return res.status(400).json({ error: 'Lisans numarası ve masa adı / QR kodu gerekli' });
        }

        const tenant = await prisma.tenant.findFirst({
            where: {
                status: 'active',
                OR: [{ id: licenseKey }, { specialLicenseKey: licenseKey }],
            },
        });

        if (!tenant) {
            return res.status(404).json({ error: 'Kurum bulunamadı veya lisans geçersiz' });
        }

        if (tenant.licenseExpiresAt && tenant.licenseExpiresAt < new Date()) {
            return res.status(403).json({ error: 'Lisans süresi dolmuş' });
        }

        const tenantId = tenant.id;

        const fullBranchSettings = await withTenant(tenantId, async (connection) => {
            const [rows]: any = await connection.query(
                'SELECT settings FROM branches ORDER BY id ASC LIMIT 1',
            );
            const raw = rows?.[0]?.settings;
            return parseSettings(raw) as BranchSettings;
        });

        const kioskCfg = fullBranchSettings?.integrations?.kiosk;
        if (kioskCfg?.allowSelfRegistration === false) {
            return res.status(403).json({ error: 'Kiosk kurulumu yönetici tarafından kapatılmış' });
        }
        const requiredSecret = kioskCfg?.pairingSecret?.trim();
        if (requiredSecret && pairingSecret !== requiredSecret) {
            return res.status(403).json({ error: 'Eşleştirme kodu hatalı veya eksik' });
        }

        try {
            await migrateBillingTables();
            const { total: maxDev } = await getEffectiveMaxDevices(tenantId);
            const linked = Array.isArray(kioskCfg?.linkedDevices) ? kioskCfg.linkedDevices.length : 0;
            if (linked >= maxDev) {
                return res.status(403).json({
                    error: `Kayıtlı cihaz kotası doldu (en fazla ${maxDev}). Plan yükseltmesi veya «Ek Cihaz» modülü gerekir.`,
                });
            }
        } catch (e) {
            console.warn('kioskBootstrapHandler device quota:', e);
        }

        const row = await withTenant(tenantId, async (connection) => {
            const q = tableIdentifier;
            const [exactQr]: any = await connection.query(
                `SELECT t.id, t.name, t.qr_code, s.name AS section_name
                 FROM tables t
                 LEFT JOIN sections s ON s.id = t.section_id
                 WHERE LOWER(TRIM(t.qr_code)) = LOWER(TRIM(?))
                 LIMIT 1`,
                [q],
            );
            if (exactQr?.[0]) return exactQr[0];
            const [byName]: any = await connection.query(
                `SELECT t.id, t.name, t.qr_code, s.name AS section_name
                 FROM tables t
                 LEFT JOIN sections s ON s.id = t.section_id
                 WHERE LOWER(TRIM(t.name)) = LOWER(TRIM(?))
                 LIMIT 2`,
                [q],
            );
            if (!byName?.length) return null;
            if (byName.length > 1) {
                throw new Error('AMBIGUOUS_TABLE');
            }
            return byName[0];
        });

        if (row === null) {
            return res.status(404).json({ error: 'Masa bulunamadı. Salon planında masa adı veya QR kodunu kontrol edin.' });
        }

        const deviceCode = newDeviceCode();
        const sectionName = row.section_name ?? null;
        const tableQrEffective = effectiveTableQrCode(row);

        await withTenantTransaction(tenantId, async (connection) => {
            const [branches]: any = await connection.query(
                'SELECT id, settings FROM branches ORDER BY id ASC LIMIT 1',
            );
            const b = branches?.[0];
            if (!b) throw new Error('NO_BRANCH');
            const base = parseSettings(b.settings);
            const merged = appendLinkedDevice(base, {
                deviceCode,
                tableId: Number(row.id),
                tableQrCode: tableQrEffective,
                tableName: String(row.name ?? ''),
                sectionName,
                label: `Kiosk · ${String(row.name ?? '')}`,
                createdAt: new Date().toISOString(),
            });
            await connection.query('UPDATE branches SET settings = ? WHERE id = ?', [JSON.stringify(merged), b.id]);
        });

        return res.json({
            tenantId,
            venueName: tenant.name,
            tableId: row.id,
            tableName: row.name,
            tableQrCode: tableQrEffective,
            sectionName,
            deviceCode,
        });
    } catch (e: any) {
        if (e?.message === 'AMBIGUOUS_TABLE') {
            return res.status(409).json({ error: 'Aynı isimde birden fazla masa var; QR kodunu girin.' });
        }
        console.error('kioskBootstrapHandler', e);
        res.status(500).json({ error: 'Kurulum doğrulanamadı' });
    }
};

/** Kayıtlı cihaz kodu + tenant ile masa bilgisini yeniler (index açılışında). */
export const kioskSessionHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = String(req.body?.tenantId ?? '').trim();
        const deviceCode = String(req.body?.deviceCode ?? '').trim();

        if (!tenantId || !deviceCode) {
            return res.status(400).json({ error: 'tenantId ve deviceCode gerekli' });
        }

        const tenant = await prisma.tenant.findFirst({
            where: { id: tenantId, status: 'active' },
        });
        if (!tenant) {
            return res.status(404).json({ error: 'Kurum bulunamadı' });
        }
        if (tenant.licenseExpiresAt && tenant.licenseExpiresAt < new Date()) {
            return res.status(403).json({ error: 'Lisans süresi dolmuş' });
        }

        const dcNorm = deviceCode.toLowerCase();

        const result = await withTenantTransaction(tenantId, async (connection) => {
            const [branches]: any = await connection.query(
                'SELECT id, settings FROM branches ORDER BY id ASC LIMIT 1',
            );
            const b = branches?.[0];
            if (!b) return { ok: false as const, reason: 'NO_BRANCH' };

            const base = parseSettings(b.settings);
            const integrations = (base.integrations as Record<string, unknown> | undefined) || {};
            const kiosk = (integrations.kiosk as Record<string, unknown> | undefined) || {};
            const linked = Array.isArray(kiosk.linkedDevices) ? (kiosk.linkedDevices as LinkedDeviceEntry[]) : [];
            const idx = linked.findIndex((x) => String(x.deviceCode).toLowerCase() === dcNorm);
            if (idx < 0) return { ok: false as const, reason: 'UNKNOWN_DEVICE' };

            const entry = linked[idx];
            const [trows]: any = await connection.query(
                `SELECT t.id, t.name, t.qr_code, s.name AS section_name
                 FROM tables t
                 LEFT JOIN sections s ON s.id = t.section_id
                 WHERE t.id = ?
                 LIMIT 1`,
                [entry.tableId],
            );
            const trow = trows?.[0];
            if (!trow) return { ok: false as const, reason: 'TABLE_GONE' };

            const qrEff = effectiveTableQrCode(trow);

            linked[idx] = {
                ...entry,
                tableQrCode: qrEff,
                tableName: String(trow.name ?? entry.tableName),
                sectionName: trow.section_name ?? entry.sectionName,
                lastSeenAt: new Date().toISOString(),
            };
            integrations.kiosk = { ...kiosk, linkedDevices: linked };
            base.integrations = integrations;
            await connection.query('UPDATE branches SET settings = ? WHERE id = ?', [JSON.stringify(base), b.id]);

            return {
                ok: true as const,
                tenantId,
                venueName: tenant.name,
                tableId: trow.id,
                tableName: trow.name,
                tableQrCode: qrEff,
                sectionName: trow.section_name ?? null,
                deviceCode: entry.deviceCode,
            };
        });

        if (!result.ok) {
            const msg =
                result.reason === 'TABLE_GONE'
                    ? 'Masa artık geçerli değil; cihazı yeniden eşleyin.'
                    : 'Cihaz kaydı bulunamadı veya iptal edildi.';
            return res.status(404).json({ error: msg, code: result.reason });
        }

        return res.json({
            tenantId: result.tenantId,
            venueName: result.venueName,
            tableId: result.tableId,
            tableName: result.tableName,
            tableQrCode: result.tableQrCode,
            sectionName: result.sectionName,
            deviceCode: result.deviceCode,
        });
    } catch (e) {
        console.error('kioskSessionHandler', e);
        res.status(500).json({ error: 'Oturum doğrulanamadı' });
    }
};

/** Kiosk: cihaz bağlantısını kaldırmadan önce yönetici PIN (6 hane) — JWT yok. */
export const kioskVerifyAdminPinHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = String(req.body?.tenantId ?? '').trim();
        const pinCode = String(req.body?.pinCode ?? '').trim();
        if (!tenantId || !/^\d{6}$/.test(pinCode)) {
            return res.status(400).json({ error: 'Geçersiz istek' });
        }

        const tenant = await prisma.tenant.findFirst({
            where: { id: tenantId, status: 'active' },
        });
        if (!tenant) {
            return res.status(404).json({ error: 'Kurum bulunamadı' });
        }
        if (tenant.licenseExpiresAt && tenant.licenseExpiresAt < new Date()) {
            return res.status(403).json({ error: 'Lisans süresi dolmuş' });
        }

        const admin = await withTenant(tenantId, async (connection) => {
            const [rows]: any = await connection.query(
                "SELECT id FROM users WHERE pin_code = ? AND role = 'admin' AND status = 'active'",
                [pinCode],
            );
            return rows?.[0] || null;
        });

        if (!admin) {
            return res.status(401).json({ error: 'PIN hatalı' });
        }

        res.json({ ok: true });
    } catch (e) {
        console.error('kioskVerifyAdminPinHandler', e);
        res.status(500).json({ error: 'Doğrulama yapılamadı' });
    }
};
