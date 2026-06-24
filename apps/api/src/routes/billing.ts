import { Router } from 'express';
import {
    getBillingModulesHandler,
    getBillingModulesAdminHandler,
    postBillingModuleHandler,
    patchBillingModuleHandler,
    deleteBillingModuleHandler,
    postQuoteHandler,
    postRecordPaymentHandler,
    getReactivationQuoteHandler,
    getPlanModuleMatrixHandler,
    getTenantEntitlementsHandler,
    putPlanModuleRulesHandler,
    postTenantAddonsHandler,
    getTenantBillingStatusHandler,
    getTenantQrWebDomainHandler,
    postTenantQrWebDomainProvisionHandler,
    postCheckoutLinkHandler,
    getCheckoutCallbackHandler,
    postPayWithResellerWalletHandler,
    postPayWithTenantWalletHandler,
    getTenantWalletTransactionsHandler,
    postDepositTenantWalletHandler,
    postTenantWalletChargeHandler,
    postTransferResellerWalletToTenantHandler,
    postPurchaseModuleHandler,
    postPurchaseBulkPlanHandler,
    getTenantPaymentHistoryHandler,
    getBillingPlansHandler,
} from '../controllers/billing.controller.js';
import { authMiddleware, optionalAuth, requireRole } from '../middleware/auth.js';

export const billingRouter = Router();

const requireSuperAdmin = requireRole('super_admin');
const requireAdminOrReseller = requireRole('super_admin', 'reseller');

/** Önce spesifik path; genel GET /modules ile çakışmasın */
billingRouter.get('/modules/admin', authMiddleware, requireSuperAdmin, getBillingModulesAdminHandler);
billingRouter.post('/modules', authMiddleware, requireSuperAdmin, postBillingModuleHandler);
billingRouter.patch('/modules/:code', authMiddleware, requireSuperAdmin, patchBillingModuleHandler);
billingRouter.delete('/modules/:code', authMiddleware, requireSuperAdmin, deleteBillingModuleHandler);

billingRouter.get('/modules', getBillingModulesHandler);
billingRouter.post('/quote', optionalAuth, postQuoteHandler);
/** Hangi planda modül: included | addon | locked — satış / paket sayfası */
billingRouter.get('/plan-modules/:planCode', getPlanModuleMatrixHandler);

billingRouter.put('/plan-modules/:planCode', authMiddleware, requireSuperAdmin, putPlanModuleRulesHandler);
billingRouter.post('/tenants/:tenantId/record-payment', authMiddleware, requireSuperAdmin, postRecordPaymentHandler);
billingRouter.get('/tenants/:tenantId/reactivation-quote', authMiddleware, requireSuperAdmin, getReactivationQuoteHandler);
/** Restoranın açık modülleri (plan dahili + satın alınan ekler) */
billingRouter.get('/tenants/:tenantId/entitlements', authMiddleware, requireAdminOrReseller, getTenantEntitlementsHandler);
/** Mevcut restorana ek modül (addon) ekleme */
billingRouter.post('/tenants/:tenantId/addons', authMiddleware, requireAdminOrReseller, postTenantAddonsHandler);
billingRouter.get('/tenants/:tenantId/qr-web-domain', authMiddleware, requireSuperAdmin, getTenantQrWebDomainHandler);
billingRouter.post(
    '/tenants/:tenantId/qr-web-domain/provision',
    authMiddleware,
    requireSuperAdmin,
    postTenantQrWebDomainProvisionHandler
);

/** 
 * Ödeme durumu ve uyarı (Kasiyer/Admin)
 * Hem spesifik tenantId ile (SuperAdmin) hem de aktif token'daki tenantId ile (Branch Admin/Cashier) çalışır.
 */
billingRouter.get('/status', authMiddleware, getTenantBillingStatusHandler);
billingRouter.get('/tenants/:tenantId/status', authMiddleware, requireSuperAdmin, getTenantBillingStatusHandler);

billingRouter.get('/payments', authMiddleware, requireRole('admin', 'super_admin'), getTenantPaymentHistoryHandler);
billingRouter.get('/plans', authMiddleware, getBillingPlansHandler);

/** Çevrimiçi Ödeme Rotaları */
billingRouter.post('/payments/:paymentHistoryId/checkout-link', authMiddleware, postCheckoutLinkHandler);
billingRouter.get('/checkout/callback', getCheckoutCallbackHandler);
billingRouter.post('/payments/:paymentHistoryId/pay-with-wallet', authMiddleware, requireRole('reseller'), postPayWithResellerWalletHandler);
billingRouter.post('/payments/:paymentHistoryId/pay-with-tenant-wallet', authMiddleware, requireRole('admin'), postPayWithTenantWalletHandler);

/** 💳 B2B FinTech & Prepaid Tenant Wallet Rotaları */
billingRouter.get('/tenants/:tenantId/wallet/transactions', authMiddleware, getTenantWalletTransactionsHandler);
billingRouter.post('/tenants/:tenantId/wallet/deposit', authMiddleware, postDepositTenantWalletHandler);
billingRouter.post('/tenants/:tenantId/wallet/charge', authMiddleware, requireSuperAdmin, postTenantWalletChargeHandler);
billingRouter.post('/reseller/wallet/transfer', authMiddleware, requireRole('reseller'), postTransferResellerWalletToTenantHandler);
billingRouter.post('/tenants/:tenantId/modules/:moduleCode/purchase', authMiddleware, postPurchaseModuleHandler);
billingRouter.post('/tenants/:tenantId/plans/purchase-bulk', authMiddleware, postPurchaseBulkPlanHandler);

export default billingRouter;
