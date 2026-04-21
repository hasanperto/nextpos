import { Router } from 'express';
import { publicTenantMiddleware } from '../middleware/publicTenant.js';
import {
    resolveTableByQrHandler,
    qrMenuCategoriesHandler,
    qrMenuProductsHandler,
    createQrMenuOrderHandler,
    createQrServiceCallHandler,
    createExternalOrderHandler,
    getPendingExternalOrderCountHandler,
    getExternalOrdersHandler,
    confirmExternalOrderHandler,
    cancelExternalOrderHandler,
    provisionalExternalOrderMembershipHandler,
    trackOrderHandler,
    getCourierStatsHandler,
    qrIdentifyCustomerHandler,
    qrMenuSpotlightHandler,
} from '../controllers/qr.controller.js';

export const qrRouter = Router();

qrRouter.use(publicTenantMiddleware);

qrRouter.get('/tables/:qrCode', resolveTableByQrHandler);
qrRouter.get('/identify', qrIdentifyCustomerHandler);
qrRouter.get('/menu/categories', qrMenuCategoriesHandler);
qrRouter.get('/menu/products', qrMenuProductsHandler);
qrRouter.get('/menu/spotlight', qrMenuSpotlightHandler);
qrRouter.post('/orders', createQrMenuOrderHandler);
qrRouter.post('/service-call', createQrServiceCallHandler);
qrRouter.get('/pending-count', getPendingExternalOrderCountHandler);
qrRouter.post('/external-order', createExternalOrderHandler);
qrRouter.get('/external-orders', getExternalOrdersHandler);
qrRouter.post('/external-orders/:id/confirm', confirmExternalOrderHandler);
qrRouter.post('/external-orders/:id/cancel', cancelExternalOrderHandler);
qrRouter.post('/external-orders/:id/provisional-membership', provisionalExternalOrderMembershipHandler);
qrRouter.get('/track/:id', trackOrderHandler);
qrRouter.get('/courier-stats', getCourierStatsHandler);

export default qrRouter;
