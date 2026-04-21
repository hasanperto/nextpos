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

export default qrWebRouter;
