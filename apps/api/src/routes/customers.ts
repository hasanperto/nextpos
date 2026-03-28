// ═══════════════════════════════════════════════════════════════════════════
// NextPOS — Customers Route (Multi-Tenant)
// Müşteri CRM — tenant izole
// ═══════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import {
    searchCustomersHandler,
    createCustomerHandler,
    getCustomerByIdHandler
} from '../controllers/customers.controller.js';

export const customersRouter = Router();

customersRouter.use(authMiddleware);

customersRouter.get('/search', searchCustomersHandler);
customersRouter.post('/', createCustomerHandler);
customersRouter.get('/:id', getCustomerByIdHandler);

export default customersRouter;
