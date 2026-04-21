import { Router } from 'express';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { requireTenantModule } from '../middleware/requireTenantModule.js';
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
    getCategoriesAdmin,
    createCategory,
    updateCategory,
    deleteCategory,
    bulkUpdatePrices,
    listProductVariants,
    createProductVariant,
    updateProductVariant,
    deleteProductVariant,
    setProductModifiers,
    copyProductVariants,
    createModifier,
    copyProductModifiers,
    adjustProductStock,
    listStockMovements,
    getProductRecipe,
    putProductRecipe,
} from '../controllers/menu.admin.controller.js';

export const menuRouter = Router();

// Tüm menü route'ları auth gerektirir
menuRouter.use(authMiddleware);

// Public/POS Endpoints
menuRouter.get('/categories', getCategoriesHandler);
menuRouter.get('/products', getProductsHandler);
menuRouter.get('/products/:id', getProductByIdHandler);
menuRouter.get('/modifiers', getModifiersHandler);

const adminOnly = requireRole('admin');

// Admin / Dashboard Endpoints
menuRouter.get('/admin/products', adminOnly, getProductsAdmin);
menuRouter.post('/admin/products', adminOnly, createProduct);
menuRouter.put('/admin/products/:id', adminOnly, updateProduct);
menuRouter.delete('/admin/products/:id', adminOnly, deleteProduct);
menuRouter.post('/admin/products/bulk-price', adminOnly, bulkUpdatePrices);

menuRouter.get('/admin/categories', adminOnly, getCategoriesAdmin);
menuRouter.post('/admin/categories', adminOnly, createCategory);
menuRouter.put('/admin/categories/:id', adminOnly, updateCategory);
menuRouter.delete('/admin/categories/:id', adminOnly, deleteCategory);

menuRouter.get('/admin/products/:productId/variants', adminOnly, listProductVariants);
menuRouter.post('/admin/products/:productId/variants', adminOnly, createProductVariant);
menuRouter.put('/admin/products/:productId/variants/:variantId', adminOnly, updateProductVariant);
menuRouter.delete('/admin/products/:productId/variants/:variantId', adminOnly, deleteProductVariant);

menuRouter.put('/admin/products/:productId/modifiers', adminOnly, setProductModifiers);
menuRouter.post('/admin/products/copy-variants', adminOnly, copyProductVariants);

menuRouter.post('/admin/modifiers', adminOnly, createModifier);
menuRouter.post('/admin/products/copy-modifiers', adminOnly, copyProductModifiers);
menuRouter.post('/admin/products/:id/stock-adjust', adminOnly, requireTenantModule('inventory'), adjustProductStock);
menuRouter.get('/admin/products/:id/stock-movements', adminOnly, requireTenantModule('inventory'), listStockMovements);
menuRouter.get('/admin/products/:productId/recipe', adminOnly, requireTenantModule('inventory'), getProductRecipe);
menuRouter.put('/admin/products/:productId/recipe', adminOnly, requireTenantModule('inventory'), putProductRecipe);

export default menuRouter;
