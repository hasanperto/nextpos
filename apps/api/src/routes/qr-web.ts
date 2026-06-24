import { Router } from 'express';
import { domainTenantMiddleware } from '../middleware/domainTenant.js';
import { requireQrWebMenuModule } from '../middleware/qrWebMenuModule.js';
import {
    qrWebConfigHandler,
    qrWebCategoriesHandler,
    qrWebProductsHandler,
    qrWebResolveTableHandler,
    qrWebCreateOrderHandler,
    qrWebServiceCallHandler,
    qrWebExternalOrderHandler,
    qrWebTrackOrderHandler,
    qrWebIdentifyHandler,
    qrWebSpotlightHandler,
    qrWebGetAddressesHandler,
    qrWebAddAddressHandler,
    qrWebDeleteAddressHandler,
    qrWebSetDefaultAddressHandler,
    qrWebVerifyRequestHandler,
    qrWebVerifyCheckHandler,
} from '../controllers/qr-web.controller.js';

export const qrWebRouter = Router();

qrWebRouter.use(domainTenantMiddleware);
qrWebRouter.use(requireQrWebMenuModule);

qrWebRouter.get('/config', qrWebConfigHandler);
qrWebRouter.get('/categories', qrWebCategoriesHandler);
qrWebRouter.get('/products', qrWebProductsHandler);
qrWebRouter.get('/tables/:qrCode', qrWebResolveTableHandler);
qrWebRouter.post('/orders', qrWebCreateOrderHandler);
qrWebRouter.post('/service-call', qrWebServiceCallHandler);
qrWebRouter.get('/spotlight', qrWebSpotlightHandler);
qrWebRouter.post('/external-order', qrWebExternalOrderHandler);
qrWebRouter.get('/track/:id', qrWebTrackOrderHandler);
qrWebRouter.get('/identify', qrWebIdentifyHandler);
qrWebRouter.post('/verify-request', qrWebVerifyRequestHandler);
qrWebRouter.get('/verify-check', qrWebVerifyCheckHandler);

// Customer Addresses management routes
qrWebRouter.get('/addresses', qrWebGetAddressesHandler);
qrWebRouter.post('/addresses', qrWebAddAddressHandler);
qrWebRouter.delete('/addresses/:id', qrWebDeleteAddressHandler);
qrWebRouter.put('/addresses/:id/default', qrWebSetDefaultAddressHandler);

export default qrWebRouter;
