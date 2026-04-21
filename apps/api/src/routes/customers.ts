// ═══════════════════════════════════════════════════════════════════════════
// NextPOS — Customers Route (Multi-Tenant)
// Müşteri CRM — tenant izole
// ═══════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { requireTenantModule } from '../middleware/requireTenantModule.js';
import {
    getCustomersHandler,
    searchCustomersHandler,
    createCustomerHandler,
    getCustomerByIdHandler,
    updateCustomerHandler,
    getLoyaltyStatsHandler,
    importCustomersHandler,
    sendCampaignHandler,
    getCustomerReportHandler,
    bulkActionHandler,
    identifyCustomerHandler
} from '../controllers/customers.controller.js';

export const customersRouter = Router();

customersRouter.use(authMiddleware);
customersRouter.use(requireTenantModule('customer_crm'));

customersRouter.get('/', getCustomersHandler);
customersRouter.get('/identify', identifyCustomerHandler);
customersRouter.get('/search', searchCustomersHandler);
customersRouter.get('/stats/loyalty', getLoyaltyStatsHandler);
customersRouter.post('/', createCustomerHandler);
customersRouter.post('/bulk', importCustomersHandler);
customersRouter.post('/campaign', sendCampaignHandler);
customersRouter.post('/bulk-action', bulkActionHandler);
customersRouter.get('/:id', getCustomerByIdHandler);
customersRouter.get('/:id/report', getCustomerReportHandler);
customersRouter.patch('/:id', updateCustomerHandler);

export default customersRouter;
