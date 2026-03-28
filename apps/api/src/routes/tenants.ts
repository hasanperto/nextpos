// ═══════════════════════════════════════════════════════════════════════════
// NextPOS — Tenant & SaaS Advanced Route'ları
// Restoran yönetimi + Finans + Güvenlik + Raporlama + CRM + Monitoring + Destek
// ═══════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import {
    createTenantHandler,
    getTenantsHandler,
    getTenantByIdHandler,
    updateTenantHandler,
    getSaaSStatsHandler,
    getSystemBackupsHandler,
    createBackupHandler,
    getSupportTicketsHandler,
    updateTicketStatusHandler,
    getSystemSettingsHandler,
    updateSystemSettingsHandler
} from '../controllers/tenants.controller.js';

import {
    // Finans
    getPaymentHistory, createPayment, updatePaymentStatus, getFinancialSummary,
    // Güvenlik
    getAuditLogs, getLoginAttempts, getSecuritySummary,
    getApiKeys, createApiKey, revokeApiKey,
    // Raporlama
    getGrowthReport,
    // Abonelik & Plan
    getSubscriptionPlans, createSubscriptionPlan, updateSubscriptionPlan, deleteSubscriptionPlan,
    getPromoCodes, createPromoCode, togglePromoCode,
    // CRM
    getCustomerNotes, createCustomerNote,
    getContracts, createContract,
    // Monitoring
    getSystemHealth, getAlertRules, createAlertRule, toggleAlertRule,
    // Gelişmiş Destek
    getTicketMessages, createTicketMessage, getTicketDetail, getSupportStats,
    getKnowledgeBase, createKBArticle,
    // Gelişmiş Yedekleme
    createTenantBackup, getBackupStats
} from '../controllers/saas-advanced.controller.js';

import {
    getResellers, createReseller, updateReseller, deleteReseller,
    getResellerPlans, purchaseResellerPlan,
    addResellerPlan, updateResellerPlan, deleteResellerPlan
} from '../controllers/resellers.controller.js';

import { authMiddleware, requireRole } from '../middleware/auth.js';

export const tenantsRouter = Router();

// TÜM TENANT İŞLEMLERİ AUTH GEREKTİRİR
tenantsRouter.use(authMiddleware);

// Yetki Grupları
const requireSuperAdmin = requireRole('super_admin');
const requireAdminOrReseller = requireRole('super_admin', 'reseller');

// ═══════════════════════════════════════
// 1. TEMEL RESTORAN (TENANT) YÖNETİMİ
// ═══════════════════════════════════════
tenantsRouter.get('/stats', requireAdminOrReseller, getSaaSStatsHandler);
tenantsRouter.post('/', requireAdminOrReseller, createTenantHandler);
tenantsRouter.get('/', requireAdminOrReseller, getTenantsHandler);

// ═══════════════════════════════════════
// 2. SİSTEM YÖNETİMİ (Genelde Super Admin)
// ═══════════════════════════════════════
tenantsRouter.get('/system/backups', requireSuperAdmin, getSystemBackupsHandler);
tenantsRouter.post('/system/backups', requireSuperAdmin, createBackupHandler);
tenantsRouter.get('/system/tickets', requireAdminOrReseller, getSupportTicketsHandler); // Reseller kendi biletlerini görebilmeli
tenantsRouter.get('/system/settings', requireAdminOrReseller, getSystemSettingsHandler); // Döviz vb. ayarlar için gerekebilir
tenantsRouter.patch('/system/settings', requireSuperAdmin, updateSystemSettingsHandler);
tenantsRouter.patch('/system/tickets/:id', requireAdminOrReseller, updateTicketStatusHandler);

// ═══════════════════════════════════════
// 3. FİNANS & GELİR MERKEZİ
// ═══════════════════════════════════════
tenantsRouter.get('/finance/payments', requireAdminOrReseller, getPaymentHistory);
tenantsRouter.post('/finance/payments', requireAdminOrReseller, createPayment); // Bayi de ödeme ekleyebilmeli
tenantsRouter.patch('/finance/payments/:id/status', requireAdminOrReseller, updatePaymentStatus); // Bayi ödendi işaretleyebilmeli (kendi müşterisi için)
tenantsRouter.get('/finance/summary', requireAdminOrReseller, getFinancialSummary);

// ═══════════════════════════════════════
// 4. GÜVENLİK & DENETİM (Sadece Super Admin)
// ═══════════════════════════════════════
tenantsRouter.get('/security/audit-logs', requireSuperAdmin, getAuditLogs);
tenantsRouter.get('/security/login-attempts', requireSuperAdmin, getLoginAttempts);
tenantsRouter.get('/security/summary', requireSuperAdmin, getSecuritySummary);
tenantsRouter.get('/security/api-keys', requireSuperAdmin, getApiKeys);
tenantsRouter.post('/security/api-keys', requireSuperAdmin, createApiKey);
tenantsRouter.patch('/security/api-keys/:id/revoke', requireSuperAdmin, revokeApiKey);

// ═══════════════════════════════════════
// 5. BAYİ / PARTNER SİSTEMİ (Sadece Super Admin)
// ═══════════════════════════════════════
tenantsRouter.get('/resellers', requireSuperAdmin, getResellers);
tenantsRouter.post('/resellers', requireSuperAdmin, createReseller);
tenantsRouter.patch('/resellers/:id', requireSuperAdmin, updateReseller);
tenantsRouter.delete('/resellers/:id', requireSuperAdmin, deleteReseller);

// ═══════════════════════════════════════
// NEW: RESELLER STORE (Plan/License Purchase)
// ═══════════════════════════════════════
tenantsRouter.get('/resellers/plans', getResellerPlans); // Reseller or Super Admin
tenantsRouter.post('/resellers/plans', requireSuperAdmin, addResellerPlan);
tenantsRouter.patch('/resellers/plans/:id', requireSuperAdmin, updateResellerPlan);
tenantsRouter.delete('/resellers/plans/:id', requireSuperAdmin, deleteResellerPlan);
tenantsRouter.post('/resellers/plans/purchase', purchaseResellerPlan);


// ═══════════════════════════════════════
// 6. DİĞER MODÜLLER
// ═══════════════════════════════════════
tenantsRouter.get('/reports/growth', requireSuperAdmin, getGrowthReport);
tenantsRouter.get('/plans', requireAdminOrReseller, getSubscriptionPlans); // Bayi planları görmeli
tenantsRouter.post('/plans', requireSuperAdmin, createSubscriptionPlan);
tenantsRouter.patch('/plans/:id', requireSuperAdmin, updateSubscriptionPlan);
tenantsRouter.delete('/plans/:id', requireSuperAdmin, deleteSubscriptionPlan);
tenantsRouter.get('/promos', requireSuperAdmin, getPromoCodes);
tenantsRouter.post('/promos', requireSuperAdmin, createPromoCode);
tenantsRouter.patch('/promos/:id/toggle', requireSuperAdmin, togglePromoCode);

tenantsRouter.get('/crm/notes', requireAdminOrReseller, getCustomerNotes);
tenantsRouter.post('/crm/notes', requireAdminOrReseller, createCustomerNote);
tenantsRouter.get('/crm/contracts', requireAdminOrReseller, getContracts);
tenantsRouter.post('/crm/contracts', requireAdminOrReseller, createContract);

tenantsRouter.get('/monitoring/health', requireSuperAdmin, getSystemHealth);
tenantsRouter.get('/monitoring/alerts', requireSuperAdmin, getAlertRules);
tenantsRouter.post('/monitoring/alerts', requireSuperAdmin, createAlertRule);
tenantsRouter.patch('/monitoring/alerts/:id/toggle', requireSuperAdmin, toggleAlertRule);

tenantsRouter.get('/support/stats', requireAdminOrReseller, getSupportStats);
tenantsRouter.get('/support/tickets/:id', requireAdminOrReseller, getTicketDetail);
tenantsRouter.get('/support/tickets/:ticketId/messages', requireAdminOrReseller, getTicketMessages);
tenantsRouter.post('/support/tickets/:ticketId/messages', requireAdminOrReseller, createTicketMessage);
tenantsRouter.get('/support/kb', requireAdminOrReseller, getKnowledgeBase);
tenantsRouter.post('/support/kb', requireSuperAdmin, createKBArticle);

tenantsRouter.post('/backups/tenant', requireAdminOrReseller, createTenantBackup);
tenantsRouter.get('/backups/stats', requireAdminOrReseller, getBackupStats);

// ═══════════════════════════════════════
// 7. GENERIC TENANT ROUTES (MUST BE LAST)
// ═══════════════════════════════════════
tenantsRouter.get('/:id', requireAdminOrReseller, getTenantByIdHandler);
tenantsRouter.patch('/:id', requireAdminOrReseller, updateTenantHandler);

export default tenantsRouter;
