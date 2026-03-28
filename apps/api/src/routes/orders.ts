// ═══════════════════════════════════════════════════════════════════════════
// NextPOS — Orders Route (Multi-Tenant)
// Sipariş yönetimi — tenant izole
// ═══════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import {
    getOrdersHandler,
    createOrderHandler,
    updateOrderStatusHandler
} from '../controllers/orders.controller.js';

export const ordersRouter = Router();

ordersRouter.use(authMiddleware);

ordersRouter.get('/', getOrdersHandler);
ordersRouter.post('/', createOrderHandler);
ordersRouter.patch('/:id/status', updateOrderStatusHandler);

export default ordersRouter;
