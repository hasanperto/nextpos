// ═══════════════════════════════════════════════════════════════════════════
// NextPOS — Payments Route (Multi-Tenant)
// Ödeme sistemi — parçalı ödeme, Z raporu desteği
// ═══════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import {
    createPaymentHandler,
    getOrderPaymentsHandler,
    createSessionPaymentHandler
} from '../controllers/payments.controller.js';

export const paymentsRouter = Router();

paymentsRouter.use(authMiddleware);

paymentsRouter.post('/', createPaymentHandler);
paymentsRouter.post('/session/:sessionId', createSessionPaymentHandler);
paymentsRouter.get('/order/:orderId', getOrderPaymentsHandler);

export default paymentsRouter;
