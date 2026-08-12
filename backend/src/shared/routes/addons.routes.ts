import { Router } from 'express';
import { AddonController } from '../../features/addons/addon.controller';

// Dominio: addons (cola de instalaciones). Rutas públicas.
export function addonsRoutes(): Router {
    const router = Router();
    const addons = new AddonController();

    router.get('/addons', addons.list);
    router.get('/addons/recording-status', addons.recordingStatus);
    router.post('/addons/record', addons.record);
    router.post('/addons/:id/instalar', addons.instalar);

    return router;
}
