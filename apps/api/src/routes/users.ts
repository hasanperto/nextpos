import { Router } from 'express';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import {
    listUsersHandler,
    createUserHandler,
    updateUserHandler,
    deleteUserHandler
} from '../controllers/users.controller.js';

export const usersRouter = Router();

// Sadece admin kendi şemasının kullanıcılarını yönetebilir
usersRouter.use(authMiddleware);
usersRouter.use(requireRole('admin'));

usersRouter.get('/', listUsersHandler);
usersRouter.post('/', createUserHandler);
usersRouter.put('/:id', updateUserHandler);
usersRouter.delete('/:id', deleteUserHandler);

export default usersRouter;
