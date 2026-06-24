// ═══════════════════════════════════════════════════════════════════════════
// NextPOS — Tenant & SaaS Advanced Route'ları
// Restoran yönetimi + Finans + Güvenlik + Raporlama + CRM + Monitoring + Destek
// ═══════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import {
    createTenantHandler,
    completeTenantCardDraftHandler,
    getTenantsHandler,
    getTenantByIdHandler,
    resetTenantUserDevicesHandler,
    updateTenantHandler,
    getSaaSStatsHandler, getDashboardOverviewHandler,
    getSystemBackupsHandler,
    createBackupHandler,
    getSupportTicketsHandler,
    updateTicketStatusHandler,
    createSupportTicketHandler,
    postResellerWalletTopupRequestHandler,
    getResellerWalletTopupRequestsHandler,
    getAdminResellerWalletTopupPendingCountHandler,
    getAdminResellerWalletTopupRequestsHandler,
    patchAdminResellerWalletTopupRequestHandler,
    getResellerProfileHandler,
    updateResellerProfileHandler,
    changeResellerPasswordHandler,
    setupResellerAuthenticatorHandler,
    verifyResellerAuthenticatorHandler,
    regenerateResellerBackupCodesHandler,
    getSystemSettingsHandler,
    updateSystemSettingsHandler,
    sendTenantCredentialsHandler,
    changeTenantUserPasswordHandler,
    deleteTenantHandler,
    retryTenantDnsHandler,
} from '../controllers/tenants.controller.js';

import {
    listPosInvoicesHandler,
    getPosInvoiceHandler,
    getPosInvoicePdfHandler,
    sendPosInvoiceEmailHandler,
    listPosInvoiceEventsHandler,
} from '../controllers/pos-invoices.controller.js';

import {
    getPaymentHistory,
    createPayment,
    updatePaymentStatus,
    getFinancialSummary,
    getFinanceInbox,
    sendPaymentDueMail,
    getAccountingUpcoming,
    getAccountingInstallments,
    getAccountingNotifications,
    getAccountingAllPayments,
    getPaymentFinanceDetail,
    getInvoices,
    getInvoiceByNumber,
    recalculateResellerCommissionsHandler,
    getResellerCommissionSummary,
    getResellerZReportsSummary,
    suspendTenantForOverdueInvoice,
    getExpenses,
    createExpense,
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
    getResellerTenants, getResellerPayments,
    getResellerPlans, purchaseResellerPlan, cancelResellerPlanPurchaseHandler,
    addResellerPlan, updateResellerPlan, deleteResellerPlan,
    getResellerFinanceSettings, updateResellerFinanceSettings,
    createResellerWithdrawal, getResellerWithdrawals, recalculateCommissions
} from '../controllers/resellers.controller.js';

import {
    listQrDomainsHandler,
    addQrDomainHandler,
    updateQrDomainHandler,
    deleteQrDomainHandler,
    checkDomainAvailabilityHandler,
} from '../controllers/qr-domains.controller.js';

import { authMiddleware, requireRole } from '../middleware/auth.js';
import { getAllTenantPresenceHandler, getTenantPresenceHandler } from '../controllers/presence.controller.js';
import {
    listSaasAdminsHandler,
    patchSaasAdminActiveHandler,
    resetSaasAdminPasswordHandler,
} from '../controllers/saas-admins-super.controller.js';

export const tenantsRouter = Router();

// TÜM TENANT İŞLEMLERİ AUTH GEREKTİRİR
tenantsRouter.use(authMiddleware);

// Yetki Grupları
const requireSuperAdmin = requireRole('super_admin');
const requireReseller = requireRole('reseller');
const requireAdminOrReseller = requireRole('super_admin', 'reseller');

// ═══════════════════════════════════════
// 1. TEMEL RESTORAN (TENANT) YÖNETİMİ
// ═══════════════════════════════════════
tenantsRouter.get('/stats', requireAdminOrReseller, getSaaSStatsHandler);
tenantsRouter.get('/dashboard/overview', requireAdminOrReseller, getDashboardOverviewHandler);

// SaaS panel giriş hesapları (public.saas_admins) — yalnızca super_admin
tenantsRouter.get('/saas-admins', requireSuperAdmin, listSaasAdminsHandler);
tenantsRouter.patch('/saas-admins/:id/active', requireSuperAdmin, patchSaasAdminActiveHandler);
tenantsRouter.post('/saas-admins/:id/reset-password', requireSuperAdmin, resetSaasAdminPasswordHandler);

tenantsRouter.post('/', requireAdminOrReseller, createTenantHandler);
tenantsRouter.post('/tenant-drafts/:draftId/complete-card', requireReseller, completeTenantCardDraftHandler);
tenantsRouter.get('/', requireAdminOrReseller, getTenantsHandler);
tenantsRouter.post('/:id/reset-user-devices', requireAdminOrReseller, resetTenantUserDevicesHandler);

// POS çevrimiçi personel (Socket ile senkron; REST anlık görüntü)
tenantsRouter.get('/presence', requireSuperAdmin, getAllTenantPresenceHandler);
tenantsRouter.get('/presence/:tenantId', requireSuperAdmin, getTenantPresenceHandler);

// ═══════════════════════════════════════
// 2. SİSTEM YÖNETİMİ (Genelde Super Admin)
// ═══════════════════════════════════════
tenantsRouter.get('/system/backups', requireSuperAdmin, getSystemBackupsHandler);
tenantsRouter.post('/system/backups', requireSuperAdmin, createBackupHandler);
tenantsRouter.get('/system/tickets', requireAdminOrReseller, getSupportTicketsHandler); // Reseller kendi biletlerini görebilmeli
tenantsRouter.get('/system/settings', requireAdminOrReseller, getSystemSettingsHandler); // Döviz vb. ayarlar için gerekebilir
tenantsRouter.patch('/system/settings', requireSuperAdmin, updateSystemSettingsHandler);
tenantsRouter.patch('/system/tickets/:id', requireAdminOrReseller, updateTicketStatusHandler);
tenantsRouter.get('/reseller/profile', requireReseller, getResellerProfileHandler);
tenantsRouter.patch('/reseller/profile', requireReseller, updateResellerProfileHandler);
tenantsRouter.post('/reseller/wallet/topup-request', requireReseller, postResellerWalletTopupRequestHandler);
tenantsRouter.get('/reseller/wallet/topup-requests', requireReseller, getResellerWalletTopupRequestsHandler);
tenantsRouter.get('/reseller/wallet/topup-admin/pending-count', requireSuperAdmin, getAdminResellerWalletTopupPendingCountHandler);
tenantsRouter.get('/reseller/wallet/topup-admin', requireSuperAdmin, getAdminResellerWalletTopupRequestsHandler);
tenantsRouter.patch('/reseller/wallet/topup-requests/:id', requireSuperAdmin, patchAdminResellerWalletTopupRequestHandler);
tenantsRouter.post('/reseller/change-password', requireReseller, changeResellerPasswordHandler);
tenantsRouter.post('/reseller/2fa/authenticator/setup', requireReseller, setupResellerAuthenticatorHandler);
tenantsRouter.post('/reseller/2fa/authenticator/verify', requireReseller, verifyResellerAuthenticatorHandler);
tenantsRouter.post('/reseller/2fa/backup-codes/regenerate', requireReseller, regenerateResellerBackupCodesHandler);

// ═══════════════════════════════════════
// 3. FİNANS & GELİR MERKEZİ
// ═══════════════════════════════════════
tenantsRouter.get('/finance/payments', requireAdminOrReseller, getPaymentHistory);
tenantsRouter.post('/finance/payments', requireSuperAdmin, createPayment); // Sadece super admin ödeme ekleyebilir
tenantsRouter.patch('/finance/payments/:id/status', requireAdminOrReseller, updatePaymentStatus);
tenantsRouter.get('/finance/summary', requireAdminOrReseller, getFinancialSummary);
tenantsRouter.get('/finance/inbox', requireAdminOrReseller, getFinanceInbox);
tenantsRouter.post('/finance/payments/:id/send-mail', requireAdminOrReseller, sendPaymentDueMail);
tenantsRouter.get('/finance/accounting/upcoming', requireAdminOrReseller, getAccountingUpcoming);
tenantsRouter.get('/finance/accounting/installments', requireAdminOrReseller, getAccountingInstallments);
tenantsRouter.get('/finance/accounting/notifications', requireAdminOrReseller, getAccountingNotifications);
tenantsRouter.get('/finance/accounting/all-payments', requireAdminOrReseller, getAccountingAllPayments);
tenantsRouter.get('/finance/payments/:id/detail', requireAdminOrReseller, getPaymentFinanceDetail);
tenantsRouter.get('/finance/invoices', requireAdminOrReseller, getInvoices);
tenantsRouter.get('/finance/invoices/:invoiceNumber', requireAdminOrReseller, getInvoiceByNumber);
    tenantsRouter.post('/finance/recalculate-commissions', requireAdminOrReseller, recalculateResellerCommissionsHandler);
    tenantsRouter.post('/finance/invoices/:id/suspend', requireAdminOrReseller, suspendTenantForOverdueInvoice);
    tenantsRouter.get('/finance/expenses', requireAdminOrReseller, getExpenses);
    tenantsRouter.post('/finance/expenses', requireAdminOrReseller, createExpense);

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
tenantsRouter.get('/resellers/:id/tenants', requireSuperAdmin, getResellerTenants);
tenantsRouter.get('/resellers/:id/payments', requireSuperAdmin, getResellerPayments);
// BUG-2 FIX: Bayi bazlı komisyon kırılım raporu
tenantsRouter.get('/resellers/commission-summary', requireSuperAdmin, getResellerCommissionSummary);
tenantsRouter.get('/resellers/z-reports-summary', requireAdminOrReseller, getResellerZReportsSummary);

// Bayi Finans & Para Çekme işlemleri (Sadece Bayi)
tenantsRouter.get('/resellers/finance/settings', requireReseller, getResellerFinanceSettings);
tenantsRouter.put('/resellers/finance/settings', requireReseller, updateResellerFinanceSettings);
tenantsRouter.post('/resellers/finance/withdraw', requireReseller, createResellerWithdrawal);
tenantsRouter.get('/resellers/finance/withdrawals', requireReseller, getResellerWithdrawals);
tenantsRouter.post('/resellers/finance/recalculate', requireReseller, recalculateCommissions);

// ═══════════════════════════════════════
// Bayi lisans paketleri (liste: süper + bayi; satın alma: sadece bayi)
// ═══════════════════════════════════════
tenantsRouter.get('/resellers/plans', requireAdminOrReseller, getResellerPlans);
tenantsRouter.post('/resellers/plans', requireSuperAdmin, addResellerPlan);
tenantsRouter.patch('/resellers/plans/:id', requireSuperAdmin, updateResellerPlan);
tenantsRouter.delete('/resellers/plans/:id', requireSuperAdmin, deleteResellerPlan);
tenantsRouter.post('/resellers/plans/purchase', requireReseller, purchaseResellerPlan);
tenantsRouter.post('/resellers/plans/purchase/cancel', requireReseller, cancelResellerPlanPurchaseHandler);


// ═══════════════════════════════════════
// 6. DİĞER MODÜLLER
// ═══════════════════════════════════════
tenantsRouter.get('/reports/growth', requireAdminOrReseller, getGrowthReport);
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
tenantsRouter.post('/support/tickets', requireAdminOrReseller, createSupportTicketHandler);
tenantsRouter.get('/support/tickets/:id', requireAdminOrReseller, getTicketDetail);
tenantsRouter.get('/support/tickets/:ticketId/messages', requireAdminOrReseller, getTicketMessages);
tenantsRouter.post('/support/tickets/:ticketId/messages', requireAdminOrReseller, createTicketMessage);
tenantsRouter.get('/support/kb', requireAdminOrReseller, getKnowledgeBase);
tenantsRouter.post('/support/kb', requireSuperAdmin, createKBArticle);

tenantsRouter.post('/backups/tenant', requireAdminOrReseller, createTenantBackup);
tenantsRouter.get('/backups/stats', requireAdminOrReseller, getBackupStats);

// ═══════════════════════════════════════
// 7. QR MENU DOMAIN YÖNETİMİ
// ═══════════════════════════════════════
tenantsRouter.get('/qr-domains/check', requireAdminOrReseller, checkDomainAvailabilityHandler);
tenantsRouter.get('/:id/qr-domains', requireAdminOrReseller, listQrDomainsHandler);
tenantsRouter.post('/:id/qr-domains', requireAdminOrReseller, addQrDomainHandler);
tenantsRouter.patch('/:id/qr-domains/:domainId', requireAdminOrReseller, updateQrDomainHandler);
tenantsRouter.delete('/:id/qr-domains/:domainId', requireAdminOrReseller, deleteQrDomainHandler);

// ═══════════════════════════════════════
// 8. POS SATIŞ FATURALARI (SaaS Admin → Tenant)
// ═══════════════════════════════════════
tenantsRouter.get('/:id/pos-invoices', requireAdminOrReseller, listPosInvoicesHandler);
tenantsRouter.get('/:id/pos-invoices/:posInvoiceNo', requireAdminOrReseller, getPosInvoiceHandler);
tenantsRouter.get('/:id/pos-invoices/:posInvoiceNo/pdf', requireAdminOrReseller, getPosInvoicePdfHandler);
tenantsRouter.post('/:id/pos-invoices/:posInvoiceNo/send-email', requireAdminOrReseller, sendPosInvoiceEmailHandler);
tenantsRouter.get('/:id/pos-invoices-events', requireAdminOrReseller, listPosInvoiceEventsHandler);

tenantsRouter.post('/:id/retry-dns', requireAdminOrReseller, retryTenantDnsHandler);

// ═══════════════════════════════════════
// 9. GENERIC TENANT ROUTES (MUST BE LAST)
// ═══════════════════════════════════════
tenantsRouter.delete('/:id', requireSuperAdmin, deleteTenantHandler);
tenantsRouter.get('/:id', requireAdminOrReseller, getTenantByIdHandler);
tenantsRouter.patch('/:id', requireAdminOrReseller, updateTenantHandler);

// 10. CREDENTIALS EMAIL
tenantsRouter.post('/send-credentials', requireAdminOrReseller, sendTenantCredentialsHandler);
tenantsRouter.post('/change-user-password', requireAdminOrReseller, changeTenantUserPasswordHandler);

export default tenantsRouter;
