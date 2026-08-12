import { Router } from 'express';
import { requireAuth } from '../middlewares/session.middleware';
import { AuditController } from '../../features/audit/audit.controller';

export function auditRoutes(): Router {
    const router = Router();
    const audit = new AuditController();
    router.get('/audit', requireAuth, audit.list);
    router.get('/audit/stream', requireAuth, audit.stream);
    return router;
}
