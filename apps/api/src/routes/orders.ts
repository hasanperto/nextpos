// ═══════════════════════════════════════════════════════════════════════════
// NextPOS — Orders Route (Multi-Tenant)
// Sipariş yönetimi — tenant izole
// ═══════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { requireTenantModule } from '../middleware/requireTenantModule.js';
import {
    getOrdersHandler,
    getOrderByIdHandler,
    createOrderHandler,
    createCheckoutOrderHandler,
    updateOrderStatusHandler,
    assignCourierHandler,
    assignCourierDirectHandler,
    pickupOrderHandler,
    payReadyTakeawayOrderHandler,
    approveQrOrderHandler,
    rejectQrOrderHandler,
    splitCheckoutHandler,
    checkoutSessionHandler,
    applyLoyaltyHandler,
} from '../controllers/orders.controller.js';

export const ordersRouter = Router();

ordersRouter.use(authMiddleware);

// 🛡️ Sipariş oluşturma: waiter (QR/masa), cashier, admin
ordersRouter.post('/', requireRole('waiter', 'cashier', 'admin', 'kitchen'), createOrderHandler);

// 🛡️ Ödeme / checkout: sadece cashier ve admin
ordersRouter.post('/checkout', requireRole('admin', 'cashier'), createCheckoutOrderHandler);
ordersRouter.post('/split-checkout', requireRole('admin', 'cashier'), splitCheckoutHandler);
ordersRouter.post('/checkout-session', requireRole('admin', 'cashier', 'waiter'), checkoutSessionHandler);

// 🛡️ Sipariş listeleme & Detay: tüm authenticated kullanıcılar
ordersRouter.get('/', getOrdersHandler);
ordersRouter.get('/:id', getOrderByIdHandler);

// 🛡️ Durum güncelleme: waiter, kitchen, courier, cashier, admin (her biri kendi yetkisinde)
ordersRouter.patch('/:id/status', requireRole('waiter', 'kitchen', 'courier', 'admin', 'cashier'), updateOrderStatusHandler);

// 🛡️ Kurye atama
ordersRouter.patch(
    '/:id/courier',
    requireRole('courier', 'admin', 'cashier'),
    requireTenantModule('courier_module'),
    assignCourierHandler
);
ordersRouter.patch(
    '/:id/assign-courier',
    requireRole('admin', 'cashier'),
    requireTenantModule('courier_module'),
    assignCourierDirectHandler
);

// 🛡️ Sipariş teslim alma
ordersRouter.post(
    '/:id/pickup',
    requireRole('waiter', 'courier', 'admin', 'cashier'),
    requireTenantModule('courier_module'),
    pickupOrderHandler
);

// 🛡️ Paket sipariş ödemesi
ordersRouter.post('/:id/pay-takeaway', requireRole('admin', 'cashier'), payReadyTakeawayOrderHandler);

// 🛡️ QR sipariş onay/red
ordersRouter.post('/:id/approve-qr', requireRole('waiter', 'admin', 'cashier'), approveQrOrderHandler);
ordersRouter.post('/:id/reject-qr', requireRole('waiter', 'admin', 'cashier'), rejectQrOrderHandler);

// 🛡️ Sadakat puanı uygulama
ordersRouter.post('/:id/apply-loyalty', requireRole('admin', 'cashier', 'waiter'), applyLoyaltyHandler);

export default ordersRouter;
