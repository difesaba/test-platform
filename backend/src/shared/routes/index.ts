import { Router } from 'express';
import { authRoutes } from './auth.routes';
import { catalogRoutes } from './catalog.routes';
import { addonsRoutes } from './addons.routes';
import { testingRoutes } from './testing.routes';
import { auditRoutes } from './audit.routes';

export class AppRoutes {
    static get routes(): Router {
        const router = Router();
        router.use(authRoutes());
        router.use(catalogRoutes());
        router.use(addonsRoutes());
        router.use(testingRoutes());
        router.use(auditRoutes());
        return router;
    }
}
