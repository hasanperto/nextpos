import { Router } from 'express';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { requireTenantModule } from '../middleware/requireTenantModule.js';
import { exportDSFinVK, getTseJournal, getFiscalStatus } from '../controllers/fiscal.controller.js';

export const fiscalRouter = Router();

// Protections: Must be authenticated and have super-admin role for fiscal exports
fiscalRouter.use(authMiddleware);
fiscalRouter.use(requireTenantModule('fiscal_tse'));
fiscalRouter.use(requireRole('super-admin'));

/**
 * @route GET /api/v1/fiscal/export
 * @desc Generate and download DSFinV-K compliant ZIP archive
 */
fiscalRouter.get('/export', exportDSFinVK);

/**
 * @route GET /api/v1/fiscal/journal
 * @desc Retrieve technical TSE audit trail
 */
fiscalRouter.get('/journal', getTseJournal);
fiscalRouter.get('/status', getFiscalStatus);

export default fiscalRouter;
