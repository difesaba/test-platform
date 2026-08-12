import { Router } from 'express';
import { requireAuth } from '../middlewares/session.middleware';
import { EnvironmentsController } from '../../features/catalog/environments.controller';
import { ClientsController } from '../../features/catalog/clients.controller';
import { SincoController } from '../../features/catalog/sinco.controller';
import { ModulesController } from '../../features/catalog/modules.controller';
import { MenuController } from '../../features/catalog/menu.controller';

// Dominio: catálogo (entornos, clientes/empresas y módulos de prueba).
export function catalogRoutes(): Router {
    const router = Router();
    const environments = new EnvironmentsController();
    const clients      = new ClientsController();
    const sinco        = new SincoController();
    const modules      = new ModulesController();
    const menu         = new MenuController();

    // Públicos
    router.get('/environments', environments.list);
    router.get('/clients', clients.list);
    router.get('/clients/sinco', sinco.list);

    // Protegidos
    router.get('/modules', requireAuth, modules.list);
    router.post('/modules', requireAuth, modules.create);
    router.delete('/modules/:name', requireAuth, modules.remove);
    router.post('/modules/:name/submodules', requireAuth, modules.createSubmodule);
    router.post('/modules/:name/pages', requireAuth, modules.createPage);
    router.delete('/modules/:name/pages/:pageName', requireAuth, modules.removePage);
    router.delete('/modules/:name/submodules/:subName', requireAuth, modules.removeSubmodule);
    router.post('/modules/:name/submodules/:subName/pages', requireAuth, modules.createSubmodulePage);
    router.delete('/modules/:name/submodules/:subName/pages/:pageName', requireAuth, modules.removeSubmodulePage);

    // Operaciones por ruta (N niveles)
    router.post('/modules/:name/tree/submodules', requireAuth, modules.createSubmoduleTree);
    router.post('/modules/:name/tree/pages', requireAuth, modules.createPageTree);
    router.post('/modules/:name/tree/delete-submodule', requireAuth, modules.deleteSubmoduleTree);
    router.post('/modules/:name/tree/delete-page', requireAuth, modules.deletePageTree);

    router.post('/modules/:name/rename', requireAuth, modules.renameModule);
    router.post('/modules/:name/swagger', requireAuth, modules.setSwagger);
    router.post('/modules/:name/tree/rename-submodule', requireAuth, modules.renameSubmoduleTree);
    router.post('/modules/:name/tree/rename-page', requireAuth, modules.renamePageTree);

    // Menús del ERP (diagnóstico de estructura)
    router.get('/menus/dump', requireAuth, menu.dump);

    return router;
}
