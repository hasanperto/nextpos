// ═══════════════════════════════════════════════════════════════════════════
// NextPOS — Multi-Tenant SaaS API Server
// MySQL Multi-Tenant Database Architecture
// ═══════════════════════════════════════════════════════════════════════════

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import dotenv from 'dotenv';
import path from 'path';

// Route imports
import { authRouter } from './routes/auth.js';
import { tenantsRouter } from './routes/tenants.js';
import { menuRouter } from './routes/menu.js';
import { tablesRouter } from './routes/tables.js';
import { ordersRouter } from './routes/orders.js';
import { kitchenRouter } from './routes/kitchen.js';
import { paymentsRouter } from './routes/payments.js';
import { customersRouter } from './routes/customers.js';
import { languagesRouter } from './routes/languages.js';
import { usersRouter } from './routes/users.js';
import { subscriptionsRouter } from './routes/subscriptions.js';
import { setupSocketHandlers } from './socket/index.js';

// Database
import { testConnection, closePool } from './lib/db.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);

// ═══════════════════════════════════════
// Socket.io (Multi-Tenant aware)
// ═══════════════════════════════════════

const io = new SocketServer(httpServer, {
    cors: {
        origin: process.env.SOCKET_CORS_ORIGIN || 'http://localhost:5173',
        methods: ['GET', 'POST'],
    },
});

// ═══════════════════════════════════════
// Middleware
// ═══════════════════════════════════════

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/public', express.static(path.join(process.cwd(), 'public')));

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
        name: 'NextPOS API',
        architecture: 'Multi-Tenant SaaS (Schema-per-Tenant)',
        database: 'MySQL (XAMPP)',
    });
});

// ═══════════════════════════════════════
// API Routes
// ═══════════════════════════════════════

// Merkezi (public) route'lar — auth gerekmez
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/languages', languagesRouter);
app.use('/api/v1/subscriptions', subscriptionsRouter);

// SaaS Admin — Tenant yönetimi (ileride superadmin auth eklenecek)
app.use('/api/v1/tenants', tenantsRouter);

// Tenant-specific route'lar — JWT auth + tenant izolasyonu
app.use('/api/v1/menu', menuRouter);
app.use('/api/v1/tables', tablesRouter);
app.use('/api/v1/orders', ordersRouter);
app.use('/api/v1/kitchen', kitchenRouter);
app.use('/api/v1/payments', paymentsRouter);
app.use('/api/v1/customers', customersRouter);
app.use('/api/v1/users', usersRouter);

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

const PORT = process.env.PORT || 3001;
import { initAutomatedBackups } from './services/backup.service.js';

async function startServer() {
    // MySQL bağlantısını test et
    const connected = await testConnection();
    if (!connected) {
        console.error('❌ MySQL bağlantısı kurulamadı. Sunucu başlatılamıyor.');
        process.exit(1);
    }
    
    // Otomatik yedekleme servisini başlat
    initAutomatedBackups();

    httpServer.listen(PORT, () => {
        console.log(`
  ╔══════════════════════════════════════════════════╗
  ║     🚀 NextPOS API Server v2.0                  ║
  ║     Port: ${PORT}                                   ║
  ║     Env: ${(process.env.NODE_ENV || 'development').padEnd(10)}                        ║
  ║     Database: MySQL (XAMPP)                      ║
  ║     Architecture: Multi-Tenant (DB-per-Tenant)   ║
  ║     Socket.io: ✅ Aktif                          ║
  ╚══════════════════════════════════════════════════╝
  `);
    });
}

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('📦 Graceful shutdown başlatılıyor...');
    await closePool();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('📦 Graceful shutdown başlatılıyor...');
    await closePool();
    process.exit(0);
});

startServer();

export { app, io };
