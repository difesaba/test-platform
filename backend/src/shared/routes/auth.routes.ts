import { Router } from 'express';
import { AuthController } from '../../features/auth/auth.controller';
import { TorreController } from '../../features/auth/torre.controller';

// Dominio: autenticación / login centralizado (keyC estilo Torre). Rutas públicas.
export function authRoutes(): Router {
    const router = Router();
    const auth  = new AuthController();
    const torre = new TorreController();

    router.get('/auth/session', auth.session);
    router.post('/auth/empresas', auth.getEmpresas);
    router.post('/auth/sucursales', auth.getSucursales);
    router.post('/auth/login', auth.login);
    router.post('/auth/quick-login', auth.quickLogin);
    router.post('/auth/logout', auth.logout);

    router.get('/torre/sso-url', torre.getSsoUrl);

    return router;
}
