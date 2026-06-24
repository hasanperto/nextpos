import { Router } from 'express';
import { publicTenantMiddleware } from '../middleware/publicTenant.js';
import { requireTenantModule } from '../middleware/requireTenantModule.js';
import {
    resolveTableByQrHandler,
    qrMenuCategoriesHandler,
    qrMenuProductsHandler,
    createQrMenuOrderHandler,
    createQrServiceCallHandler,
    createExternalOrderHandler,
    getPendingExternalOrderCountHandler,
    trackOrderHandler,
    getCourierStatsHandler,
    qrIdentifyCustomerHandler,
    qrMenuSpotlightHandler,
    qrVerifyRequestHandler,
    qrVerifyCheckHandler,
} from '../controllers/qr.controller.js';

export const qrRouter = Router();

qrRouter.use(publicTenantMiddleware);
qrRouter.use(requireTenantModule('qr_menu'));

qrRouter.get('/tables/:qrCode', resolveTableByQrHandler);
qrRouter.get('/identify', qrIdentifyCustomerHandler);
qrRouter.get('/menu/categories', qrMenuCategoriesHandler);
qrRouter.get('/menu/products', qrMenuProductsHandler);
qrRouter.get('/menu/spotlight', qrMenuSpotlightHandler);
qrRouter.post('/orders', createQrMenuOrderHandler);
qrRouter.post('/service-call', createQrServiceCallHandler);
qrRouter.get('/pending-count', getPendingExternalOrderCountHandler);
qrRouter.post('/external-order', createExternalOrderHandler);
qrRouter.get('/track/:id', trackOrderHandler);
qrRouter.get('/courier-stats', getCourierStatsHandler);
qrRouter.post('/verify-request', qrVerifyRequestHandler);
qrRouter.get('/verify-check', qrVerifyCheckHandler);

export default qrRouter;
