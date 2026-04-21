import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { requireTenantModule } from '../middleware/requireTenantModule.js';

/** Restoran admin API — IP başına dakikada sınırlı (PDF/rapor kötüye kullanımına karşı). */
const adminLimiter = rateLimit({
    windowMs: 60_000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Çok fazla istek, lütfen bir süre sonra tekrar deneyin' },
});
import { getDashboardHandler } from '../controllers/admin.dashboard.controller.js';
import { simulateEventHandler } from '../controllers/admin.simulate.controller.js';

import {
    getReportsSummaryHandler,
    getSummaryPdfHandler,
    getZReportHandler,
    getZReportPdfHandler,
    getStaffPerformanceHandler,
    postZDayLockHandler,
    deleteZDayLockHandler,
} from '../controllers/admin.reports.controller.js';
import { getDetailedPersonnelStatsHandler } from '../controllers/personnel.controller.js';
import {
    listSectionsAdmin,
    createSection,
    updateSection,
    deleteSection,
    createTable,
    updateTable,
    deleteTable,
    bulkGenerateTables,
} from '../controllers/tables.admin.controller.js';
import {
    listDeliveryZonesAdmin,
    createDeliveryZoneAdmin,
    updateDeliveryZoneAdmin,
    deleteDeliveryZoneAdmin,
} from '../controllers/delivery-zones.admin.controller.js';
import {
    listReservationsAdmin,
    createReservationAdmin,
    updateReservationAdmin,
    deleteReservationAdmin,
} from '../controllers/admin.reservations.controller.js';
import {
    getSettingsHandler,
    updateSettingsHandler,
    seedDemoContentHandler,
} from '../controllers/admin.settings.controller.js';
import {
    listAccountingTransactions,
    updateTransaction,
    deleteTransaction,
    restoreTransaction,
} from '../controllers/admin.accounting.controller.js';
import {
    getLowStockAlertsHandler,
    getStockConsumptionReportHandler,
} from '../controllers/admin.stock.controller.js';
import {
    listBranchesAdmin,
    createBranchAdmin,
    updateBranchAdmin,
    deleteBranchAdmin,
} from '../controllers/admin.branches.controller.js';

export const adminRouter = Router();

adminRouter.use(adminLimiter);
adminRouter.use(authMiddleware);

// Granular Role Access
adminRouter.get('/reports/z-report', (req, res, next) => {
    console.log(`🔍 [AdminRouter] Request: ${req.method} ${req.path} | Role: ${req.user?.role}`);
    next();
}, requireRole('admin', 'cashier'), getZReportHandler);
adminRouter.get('/reports/z-report/pdf', requireRole('admin', 'cashier'), getZReportPdfHandler);

// allow cashier to view performance and dashboard
adminRouter.get('/dashboard', requireRole('admin', 'cashier'), getDashboardHandler);
adminRouter.get('/reports/staff-performance', requireRole('admin', 'cashier'), requireTenantModule('advanced_reports'), getStaffPerformanceHandler);
adminRouter.get('/reports/personnel-detailed', requireRole('admin', 'cashier'), requireTenantModule('advanced_reports'), getDetailedPersonnelStatsHandler);

// Admin-Only middleware from here on
adminRouter.use(requireRole('admin'));

adminRouter.get('/settings', getSettingsHandler);
adminRouter.put('/settings', updateSettingsHandler);
adminRouter.post('/settings/demo-seed', seedDemoContentHandler);

import {
    listCourierStatsHandler,
    getCourierDetailHandler,
    reconcileCourierCashHandler,
} from '../controllers/admin.couriers.controller.js';

adminRouter.get('/couriers/stats', requireTenantModule('courier_module'), listCourierStatsHandler);
adminRouter.get('/couriers/:id/details', requireTenantModule('courier_module'), getCourierDetailHandler);
adminRouter.post('/couriers/:id/reconcile', requireTenantModule('courier_module'), reconcileCourierCashHandler);

adminRouter.post('/simulate', simulateEventHandler);

adminRouter.get('/reports/summary/pdf', requireTenantModule('advanced_reports'), getSummaryPdfHandler);
adminRouter.get('/reports/summary', requireTenantModule('advanced_reports'), getReportsSummaryHandler);

adminRouter.post('/reports/z-day-lock', postZDayLockHandler);
adminRouter.delete('/reports/z-day-lock/:date', deleteZDayLockHandler);

adminRouter.get('/sections', listSectionsAdmin);
adminRouter.post('/sections', createSection);
adminRouter.put('/sections/:id', updateSection);
adminRouter.delete('/sections/:id', deleteSection);

adminRouter.post('/tables', createTable);
adminRouter.post('/tables/bulk', bulkGenerateTables);
adminRouter.put('/tables/:id', updateTable);
adminRouter.delete('/tables/:id', deleteTable);

adminRouter.get('/branches', listBranchesAdmin);
adminRouter.post('/branches', createBranchAdmin);
adminRouter.put('/branches/:id', updateBranchAdmin);
adminRouter.delete('/branches/:id', deleteBranchAdmin);

adminRouter.get('/delivery-zones', requireTenantModule('courier_module'), listDeliveryZonesAdmin);
adminRouter.post('/delivery-zones', requireTenantModule('courier_module'), createDeliveryZoneAdmin);
adminRouter.put('/delivery-zones/:id', requireTenantModule('courier_module'), updateDeliveryZoneAdmin);
adminRouter.delete('/delivery-zones/:id', requireTenantModule('courier_module'), deleteDeliveryZoneAdmin);

adminRouter.get('/reservations', requireTenantModule('table_reservation'), listReservationsAdmin);
adminRouter.post('/reservations', requireTenantModule('table_reservation'), createReservationAdmin);
adminRouter.put('/reservations/:id', requireTenantModule('table_reservation'), updateReservationAdmin);
adminRouter.delete('/reservations/:id', requireTenantModule('table_reservation'), deleteReservationAdmin);

// Accounting / Muhasebe
adminRouter.get('/accounting', listAccountingTransactions);
adminRouter.put('/accounting/:id', updateTransaction);
adminRouter.delete('/accounting/:id', deleteTransaction);
adminRouter.post('/accounting/:id/delete', deleteTransaction);
adminRouter.post('/accounting/:id/restore', restoreTransaction);

adminRouter.get('/stock/consumption', getStockConsumptionReportHandler);
adminRouter.get('/stock/consumption', requireTenantModule('inventory'), getStockConsumptionReportHandler);
adminRouter.get('/stock/alerts', requireTenantModule('inventory'), getLowStockAlertsHandler);

export default adminRouter;
