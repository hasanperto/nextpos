import { Router } from 'express';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import {
    getSyncPullHandler,
    getSyncStatusHandler,
    postSyncPushHandler,
    postSyncRetryHandler,
} from '../controllers/sync.controller.js';
import { getSettingsHandler } from '../controllers/admin.settings.controller.js';

export const syncRouter = Router();

syncRouter.use(authMiddleware);
syncRouter.get('/status', getSyncStatusHandler);
syncRouter.get('/pull', getSyncPullHandler);
syncRouter.post('/push', postSyncPushHandler);
syncRouter.post('/retry', requireRole('admin', 'cashier'), postSyncRetryHandler);
syncRouter.get('/settings', getSettingsHandler);

export default syncRouter;
