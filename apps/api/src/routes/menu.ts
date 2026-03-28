import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import {
    getCategoriesHandler,
    getProductsHandler,
    getProductByIdHandler,
    getModifiersHandler
} from '../controllers/menu.controller.js';
import {
    getProductsAdmin,
    createProduct,
    updateProduct,
    deleteProduct,
    getCategoriesAdmin
} from '../controllers/menu.admin.controller.js';

export const menuRouter = Router();

// Tüm menü route'ları auth gerektirir
menuRouter.use(authMiddleware);

// Public/POS Endpoints
menuRouter.get('/categories', getCategoriesHandler);
menuRouter.get('/products', getProductsHandler);
menuRouter.get('/products/:id', getProductByIdHandler);
menuRouter.get('/modifiers', getModifiersHandler);

// Admin / Dashboard Endpoints
menuRouter.get('/admin/products', getProductsAdmin);
menuRouter.post('/admin/products', createProduct);
menuRouter.put('/admin/products/:id', updateProduct);
menuRouter.delete('/admin/products/:id', deleteProduct);
menuRouter.get('/admin/categories', getCategoriesAdmin);

export default menuRouter;
