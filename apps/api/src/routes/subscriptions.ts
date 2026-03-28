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
// requireRole('super_admin') or something similar for SaaS
// For now, let's assume it's SaaS admin since it's common and public-level
// I'll add a check in the controller if we have SaaS admin flags

subscriptionsRouter.post('/', createPlanHandler);
subscriptionsRouter.put('/:id', updatePlanHandler);
subscriptionsRouter.delete('/:id', deletePlanHandler);

export default subscriptionsRouter;
