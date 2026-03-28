// ═══════════════════════════════════════════════════════════════════════════
// NextPOS — Kitchen Route (Multi-Tenant)
// Mutfak ekranı (KDS) — FIFO sıralama, hazır bildirimi
// ═══════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import {
    getKitchenTicketsHandler,
    updateTicketStatusHandler
} from '../controllers/kitchen.controller.js';

export const kitchenRouter = Router();

kitchenRouter.use(authMiddleware);

kitchenRouter.get('/tickets', getKitchenTicketsHandler);
kitchenRouter.patch('/tickets/:id/status', updateTicketStatusHandler);

export default kitchenRouter;
