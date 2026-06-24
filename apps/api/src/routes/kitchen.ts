// ═══════════════════════════════════════════════════════════════════════════
// NextPOS — Kitchen Route (Multi-Tenant)
// Mutfak ekranı (KDS) — FIFO sıralama, hazır bildirimi
// ═══════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { requireTenantModule } from '../middleware/requireTenantModule.js';
import {
    getKitchenTicketsHandler,
    getCompletedTicketsHandler,
    updateTicketStatusHandler,
    updateTicketItemsHandler
} from '../controllers/kitchen.controller.js';

export const kitchenRouter = Router();

/** Mutfak rotası RBAC — rbac.test.ts ile senkron */
export const KITCHEN_ROUTE_ROLES = ['kitchen', 'admin'] as const;

kitchenRouter.use(authMiddleware);
kitchenRouter.use(requireRole(...KITCHEN_ROUTE_ROLES));
kitchenRouter.use(requireTenantModule('kitchen_display'));

kitchenRouter.get('/tickets', getKitchenTicketsHandler);
kitchenRouter.get('/tickets/completed', getCompletedTicketsHandler);
kitchenRouter.patch('/tickets/:id/status', updateTicketStatusHandler);
kitchenRouter.patch('/tickets/:id/items', updateTicketItemsHandler);

export default kitchenRouter;
