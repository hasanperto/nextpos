// ═══════════════════════════════════════════════════════════════════════════
// NextPOS — Multi-Tenant SaaS API Server
// PostgreSQL (şema/kiracı) + Prisma (public) + pg havuzu (ham SQL)
// ═══════════════════════════════════════════════════════════════════════════

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import rateLimit from 'express-rate-limit';
import { createClient } from 'redis';
import { createAdapter } from '@socket.io/redis-adapter';
import os from 'os';

// Route imports
import { authRouter } from './routes/auth.js';
import { tenantsRouter } from './routes/tenants.js';
import { menuRouter } from './routes/menu.js';
import { tablesRouter } from './routes/tables.js';
import { ordersRouter } from './routes/orders.js';
import { kitchenRouter } from './routes/kitchen.js';
import { paymentsRouter } from './routes/payments.js';
import { customersRouter } from './routes/customers.js';
import { couponsRouter } from './routes/coupons.js';

import { languagesRouter } from './routes/languages.js';
import { usersRouter } from './routes/users.js';
import { adminRouter } from './routes/admin.js';
import { qrRouter } from './routes/qr.js';
import { subscriptionsRouter } from './routes/subscriptions.js';
import { billingRouter } from './routes/billing.js';
import { syncRouter } from './routes/sync.js';
import { serviceCallsRouter } from './routes/serviceCalls.js';
import integrationsRouter from './routes/integrations.js';
import { fiscalRouter } from './routes/fiscal.js';
import devRouter from './routes/dev.js';
import { setupSocketHandlers } from './socket/index.js';
import { saasPublicRouter } from './routes/saas-public.js';
import { handleStripeWebhook } from './controllers/stripe-webhook.controller.js';
import { publicKioskRouter } from './routes/public-kiosk.js';
import { qrWebRouter } from './routes/qr-web.js';
import { apiAuditLogger } from './middleware/audit.middleware.js';

// Database
import { API_VERSION } from '@nextpos/shared-types';
import { testConnection, closePool } from './lib/db.js';
import { migrateBillingTables, runBillingCron, runAccountingCron } from './services/billing.service.js';
import { runAuditRetentionCleanup } from './services/audit-retention.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env.local'), override: true });
dotenv.config({ path: path.resolve(__dirname, '../.env'), override: true });

function envInt(name: string, fallback: number): number {
    const n = parseInt(process.env[name] ?? '', 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Yerel geliştirme için yaygın portlar; üretimde CORS_ORIGIN ile domain’leri verin */
const DEFAULT_DEV_ORIGINS =
    'http://127.0.0.1:5173,http://localhost:5173,http://localhost:5176,http://localhost:4000,http://localhost:4001,http://localhost:4003,http://0.0.0.0:5173';

/** CORS: tek URL veya virgülle ayrılmış liste */
function parseCorsOrigins(): string | string[] {
    const raw = process.env.CORS_ORIGIN || DEFAULT_DEV_ORIGINS;
    const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
    return parts.length <= 1 ? parts[0] || DEFAULT_DEV_ORIGINS.split(',')[0] : parts;
}

function parseSocketCorsOrigins(): string | string[] {
    const raw = process.env.SOCKET_CORS_ORIGIN || process.env.CORS_ORIGIN || DEFAULT_DEV_ORIGINS;
    const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
    return parts.length <= 1 ? parts[0] || DEFAULT_DEV_ORIGINS.split(',')[0] : parts;
}

const app = express();

if (process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true') {
    app.set('trust proxy', 1);
}

const httpServer = createServer(app);
const INSTANCE_ID = `${os.hostname()}-${process.pid}`;
let redisAdapterReady = false;
let redisAdapterError: string | null = null;

// ═══════════════════════════════════════
// Socket.io (Multi-Tenant aware)
// ═══════════════════════════════════════

const io = new SocketServer(httpServer, {
    cors: {
        origin: parseSocketCorsOrigins(),
        methods: ['GET', 'POST'],
    },
    connectionStateRecovery: {
        maxDisconnectionDuration: 2 * 60 * 1000,
        skipMiddlewares: false,
    },
});

// Redis Adapter (horizontal scale)
const pubClient = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
const subClient = pubClient.duplicate();

pubClient.on('error', (err) => console.error('❌ Redis Pub Error:', err));
subClient.on('error', (err) => console.error('❌ Redis Sub Error:', err));

Promise.all([pubClient.connect(), subClient.connect()]).then(() => {
    io.adapter(createAdapter(pubClient, subClient));
    redisAdapterReady = true;
    redisAdapterError = null;
    console.log('📡 Socket.io: Redis Adapter aktif (Horizontal Scale ready)');
}).catch(err => {
    redisAdapterReady = false;
    redisAdapterError = String(err?.message || err);
    console.warn('⚠️ Socket.io: Redis Adapter bağlantı hatası (Bellekte devam ediliyor):', err.message);
});

// ═══════════════════════════════════════
// Middleware
// ═══════════════════════════════════════

app.use(helmet({ crossOriginResourcePolicy: false }));

const staticCorsOrigins = parseCorsOrigins();
app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        const allowed = Array.isArray(staticCorsOrigins) ? staticCorsOrigins : [staticCorsOrigins];
        if (allowed.includes(origin)) return callback(null, true);
        if (/\.webotonom\.de$/.test(new URL(origin).hostname)) return callback(null, true);
        callback(null, true);
    },
    credentials: true,
}));
/** Stripe webhook imza doğrulaması için ham gövde (express.json'dan önce) */
app.post('/api/v1/saas-public/webhooks/stripe', express.raw({ type: 'application/json' }), (req, res) => {
    void handleStripeWebhook(req, res);
});
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/public', express.static(path.join(process.cwd(), 'public')));

if (process.env.NODE_ENV === 'production') {
    const qrMenuDist = path.resolve(process.cwd(), '..', 'qr-menu', 'dist');
    app.use('/qr-menu-assets', express.static(qrMenuDist));
}

// Socket.io'yu request'e ekle
app.set('io', io);

// ═══════════════════════════════════════
// Health Check
// ═══════════════════════════════════════

app.get('/api/v1/health', (_req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: '2.0.0',
        apiVersion: API_VERSION,
        name: 'NextPOS API',
        architecture: 'Multi-Tenant SaaS (Schema-per-Tenant)',
        database: 'PostgreSQL',
        instanceId: INSTANCE_ID,
        socket: {
            redisAdapterReady,
            redisAdapterError,
            nodeCount: io.of('/').sockets.size,
        },
    });
});

/** Genel API hız limiti (auth hariç brute-force için ayrıca login'de lockout var) */
const apiV1Limiter = rateLimit({
    windowMs: 60_000,
    max: envInt('API_RATE_LIMIT_MAX_PER_MIN', 500),
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.path === '/health' || req.path.endsWith('/health'),
});
app.use('/api/v1', apiV1Limiter);
app.use('/api/v1', apiAuditLogger);

/** Public endpointler için ek katmanlı limitler */
const publicReadLimiter = rateLimit({
    windowMs: 60_000,
    max: envInt('PUBLIC_READ_MAX_PER_MIN', 180),
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Public endpoint limiti aşıldı, lütfen tekrar deneyin' },
});

const integrationWriteLimiter = rateLimit({
    windowMs: 60_000,
    max: envInt('INTEGRATION_MAX_PER_MIN', 90),
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Integration endpoint limiti aşıldı' },
});

const tenantMgmtLimiter = rateLimit({
    windowMs: 60_000,
    max: envInt('TENANT_MGMT_MAX_PER_MIN', 120),
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Tenant yönetim isteği limiti aşıldı' },
});

// ═══════════════════════════════════════
// API Routes
// ═══════════════════════════════════════

// Merkezi (public) route'lar — auth gerekmez
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/languages', languagesRouter);

app.use('/api/v1/subscriptions', subscriptionsRouter);
app.use('/api/v1/billing', billingRouter);

// SaaS Admin — Tenant yönetimi
app.use('/api/v1/tenants', tenantMgmtLimiter, tenantsRouter);
app.use('/api/v1/saas-public', saasPublicRouter);

/** Masa tableti kiosk ilk kurulum — JWT yok */
app.use('/api/v1/public/kiosk', publicReadLimiter, publicKioskRouter);

/** QR müşteri menüsü — JWT yok, x-tenant-id + publicTenantMiddleware */
app.use('/api/v1/qr', publicReadLimiter, qrRouter);

/** QR Web Menü — Domain tabanlı, domainTenantMiddleware */
app.use('/api/v1/qr-web', publicReadLimiter, qrWebRouter);

/** Integrations (Android Caller ID, VoIP Webhooks) — API Key tabanlı */
app.use('/api/v1/integrations', integrationWriteLimiter, integrationsRouter);

/** Dev-only utilities (local): e2e helpers */
app.use('/api/v1/dev', devRouter);

// Tenant-specific route'lar — JWT auth + tenant izolasyonu
app.use('/api/v1/menu', menuRouter);
app.use('/api/v1/tables', tablesRouter);
app.use('/api/v1/orders', ordersRouter);
app.use('/api/v1/kitchen', kitchenRouter);
app.use('/api/v1/payments', paymentsRouter);
app.use('/api/v1/customers', customersRouter);
app.use('/api/v1/coupons', couponsRouter);
app.use('/api/v1/users', usersRouter);
app.use('/api/v1/admin', adminRouter);
app.use('/api/v1/sync', syncRouter);
app.use('/api/v1/service-calls', serviceCallsRouter);
app.use('/api/v1/fiscal', fiscalRouter);

// ═══════════════════════════════════════
// Error Handlers
// ═══════════════════════════════════════

// 404 Handler
app.use((_req, res) => {
    res.status(404).json({ error: 'Endpoint bulunamadı' });
});

// Global Error Handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('❌ Error:', err.message);

    // TenantError özel durumları
    if (err.name === 'TenantError') {
        const code = (err as any).code;
        const statusMap: Record<string, number> = {
            TENANT_NOT_FOUND: 404,
            TENANT_INACTIVE: 403,
            TENANT_SUSPENDED: 403,
            LICENSE_EXPIRED: 403,
        };
        return res.status(statusMap[code] || 500).json({ error: err.message, code });
    }

    res.status(500).json({ error: 'Sunucu hatası', message: err.message });
});

// ═══════════════════════════════════════
// Socket.io Handlers
// ═══════════════════════════════════════

setupSocketHandlers(io);

// ═══════════════════════════════════════
// Start Server
// ═══════════════════════════════════════

const PORT =
    process.env.NODE_ENV === 'production'
        ? process.env.NEXTPOS_API_PORT || process.env.PORT || 3001
        : process.env.NEXTPOS_API_PORT || 3001;
import { initAutomatedBackups } from './services/backup.service.js';

async function startServer() {
    const connected = await testConnection();
    if (!connected) {
        console.error('❌ PostgreSQL bağlantısı kurulamadı. DATABASE_URL ve Docker kontrol edin.');
        process.exit(1);
    }
    
    // Otomatik yedekleme servisini başlat
    initAutomatedBackups();

    await migrateBillingTables();
    runBillingCron();
    runAccountingCron();
    await runAuditRetentionCleanup();
    setInterval(() => {
        runBillingCron();
        runAccountingCron();
        void runAuditRetentionCleanup();
    }, 6 * 60 * 60 * 1000);

    httpServer.listen(PORT, () => {
        console.log(`
  ╔══════════════════════════════════════════════════╗
  ║     🚀 NextPOS API Server v2.0                  ║
  ║     Port: ${PORT}                                   ║
  ║     Env: ${(process.env.NODE_ENV || 'development').padEnd(10)}                        ║
  ║     Database: PostgreSQL + Prisma (public)       ║
  ║     Architecture: Multi-Tenant (schema/tenant)   ║
  ║     Socket.io: ✅ Aktif                          ║
  ╚══════════════════════════════════════════════════╝
  `);
    });
}

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('📦 Graceful shutdown başlatılıyor...');
    try {
        await pubClient.quit();
        await subClient.quit();
    } catch {
        /* ignore */
    }
    await closePool();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('📦 Graceful shutdown başlatılıyor...');
    try {
        await pubClient.quit();
        await subClient.quit();
    } catch {
        /* ignore */
    }
    await closePool();
    process.exit(0);
});

startServer();

export { app, io };
