import { Router } from 'express';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { requireTenantModule } from '../middleware/requireTenantModule.js';
import {
    listCouriersHandler,
    listActiveWaitersHandler,
    listUsersHandler,
    createUserHandler,
    updateUserHandler,
    deleteUserHandler,
    resetUserDeviceHandler,
    resetAllUserDevicesHandler
} from '../controllers/users.controller.js';

export const usersRouter = Router();

usersRouter.use(authMiddleware);
// Personel kendi istatistikleri ve mesai işlemleri
import { getMyStatsHandler, clockInHandler, clockOutHandler } from '../controllers/personnel.controller.js';

usersRouter.get('/my-stats', getMyStatsHandler);
usersRouter.post('/clock-in', clockInHandler);
usersRouter.post('/clock-out', clockOutHandler);

usersRouter.get(
    '/couriers',
    requireTenantModule('courier_module'),
    requireRole('admin', 'cashier', 'waiter', 'kitchen'),
    listCouriersHandler
);

usersRouter.get('/waiters', requireRole('admin', 'cashier'), listActiveWaitersHandler);

// Sadece admin kendi şemasının kullanıcılarını yönetebilir
usersRouter.use(requireRole('admin'));

usersRouter.get('/', listUsersHandler);
usersRouter.post('/', createUserHandler);
usersRouter.put('/:id', updateUserHandler);
usersRouter.delete('/:id', deleteUserHandler);
usersRouter.post('/:id/reset-device', resetUserDeviceHandler);
usersRouter.post('/reset-devices/all', resetAllUserDevicesHandler);

export default usersRouter;
