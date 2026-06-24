// ═══════════════════════════════════════════════════════════════════════════
// NextPOS — Tables Route (Multi-Tenant)
// Masa yönetimi — tenant izole
// ═══════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import {
    getTablesHandler,
    getSectionsHandler,
    getTableStatusHandler,
    openTableHandler,
    transferTableHandler,
    mergeTablesHandler,
    transferItemHandler,
    cancelTableSessionHandler,
    claimTableHandler,
    releaseTableHandler
} from '../controllers/tables.controller.js';

export const tablesRouter = Router();

tablesRouter.use(authMiddleware);

tablesRouter.get('/', getTablesHandler);
tablesRouter.get('/sections', getSectionsHandler);
tablesRouter.get('/:id/status', getTableStatusHandler);
tablesRouter.post('/:id/open', openTableHandler);
tablesRouter.post('/:id/transfer', transferTableHandler);
tablesRouter.post('/:id/merge', mergeTablesHandler);
tablesRouter.post('/:id/cancel', cancelTableSessionHandler);
tablesRouter.post('/:id/claim', claimTableHandler);
tablesRouter.post('/:id/release', releaseTableHandler);
tablesRouter.post('/transfer-item', transferItemHandler);

export default tablesRouter;
