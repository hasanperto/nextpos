import { Router } from 'express';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import {
    listPlansHandler,
    createPlanHandler,
    updatePlanHandler,
    deletePlanHandler
} from '../controllers/subscriptions.controller.js';

export const subscriptionsRouter = Router();

/**
 * @route GET /api/v1/subscriptions
 * @desc Herkes görebilir
 */
subscriptionsRouter.get('/', listPlansHandler);

/**
 * @route POST /api/v1/subscriptions
 * @desc Sadece SaaS Admins (Super Admin) görebilir ve yönetebilir
 */
subscriptionsRouter.use(authMiddleware);
const requireSuperAdminOnly = requireRole('super_admin');

subscriptionsRouter.post('/', requireSuperAdminOnly, createPlanHandler);
subscriptionsRouter.put('/:id', requireSuperAdminOnly, updatePlanHandler);
subscriptionsRouter.delete('/:id', requireSuperAdminOnly, deletePlanHandler);

export default subscriptionsRouter;
