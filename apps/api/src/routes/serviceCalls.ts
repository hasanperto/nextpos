import { Router } from 'express';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import {
    listServiceCallsHandler,
    createCashierServiceCallHandler,
    patchServiceCallStatusHandler,
} from '../controllers/serviceCalls.controller.js';

export const serviceCallsRouter = Router();

serviceCallsRouter.use(authMiddleware);
serviceCallsRouter.use(requireRole('admin', 'cashier', 'waiter'));

serviceCallsRouter.get('/', listServiceCallsHandler);
serviceCallsRouter.post('/from-cashier', requireRole('admin', 'cashier'), createCashierServiceCallHandler);
serviceCallsRouter.patch('/:id/status', patchServiceCallStatusHandler);

export default serviceCallsRouter;
