// ═══════════════════════════════════════════════════════════════════════════
// NextPOS — Orders Route (Multi-Tenant)
// Sipariş yönetimi — tenant izole
// ═══════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { requireTenantModule } from '../middleware/requireTenantModule.js';
import {
    getOrdersHandler,
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
} from '../controllers/orders.controller.js';

export const ordersRouter = Router();

ordersRouter.use(authMiddleware);

// 🛡️ Sipariş oluşturma: waiter (QR/masa), cashier, admin
ordersRouter.post('/', requireRole('waiter', 'cashier', 'admin', 'kitchen'), createOrderHandler);

// 🛡️ Ödeme / checkout: sadece cashier ve admin
ordersRouter.post('/checkout', requireRole('admin', 'cashier'), createCheckoutOrderHandler);
ordersRouter.post('/split-checkout', requireRole('admin', 'cashier'), splitCheckoutHandler);
ordersRouter.post('/checkout-session', requireRole('admin', 'cashier'), checkoutSessionHandler);

// 🛡️ Sipariş listeleme: tüm authenticated kullanıcılar (ama branch filtrelemesi controller'da)
ordersRouter.get('/', getOrdersHandler);

// 🛡️ Durum güncelleme: waiter, kitchen, cashier, admin (her biri kendi yetkisinde)
ordersRouter.patch('/:id/status', requireRole('waiter', 'kitchen', 'admin', 'cashier'), updateOrderStatusHandler);

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

export default ordersRouter;
