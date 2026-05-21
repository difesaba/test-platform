import { Router } from 'express';
import { AuthController } from './controllers/auth.controller';
import { EnvironmentsController } from './controllers/environments.controller';
import { ClientsController } from './controllers/clients.controller';
import { requireAuth } from './middleware/session.middleware';
import { ModulesController } from './controllers/modules.controller';
import { ApiTestsController } from './controllers/apiTests.controller';
import { SwaggerController } from './controllers/swagger.controller';
import { UiTestsController } from './controllers/uiTests.controller';
import { E2eController } from './controllers/e2e.controller';

export class AppRoutes {

    static get routes(): Router {
        const router = Router();

        const authController = new AuthController();
        const environmentsController = new EnvironmentsController();
        const clientsController = new ClientsController();
        const modulesController = new ModulesController();
        const apiTestsController  = new ApiTestsController();
        const swaggerController   = new SwaggerController();
        const uiTestsController   = new UiTestsController();
        const e2eController       = new E2eController();

        // Publicos
        router.get('/auth/session', authController.session);
        router.post('/auth/empresas', authController.getEmpresas);
        router.post('/auth/sucursales', authController.getSucursales);
        router.post('/auth/login', authController.login);
        router.post('/auth/logout', authController.logout);

        router.get('/environments', environmentsController.list);
        router.get('/clients', clientsController.list);

        // Protegidos
        router.get('/modules', requireAuth, modulesController.list);
        router.post('/modules', requireAuth, modulesController.create);
        router.delete('/modules/:name', requireAuth, modulesController.remove);
        router.post('/modules/:name/submodules', requireAuth, modulesController.createSubmodule);
        router.post('/modules/:name/pages', requireAuth, modulesController.createPage);
        router.delete('/modules/:name/pages/:pageName', requireAuth, modulesController.removePage);
        router.delete('/modules/:name/submodules/:subName', requireAuth, modulesController.removeSubmodule);
        router.post('/modules/:name/submodules/:subName/pages', requireAuth, modulesController.createSubmodulePage);
        router.delete('/modules/:name/submodules/:subName/pages/:pageName', requireAuth, modulesController.removeSubmodulePage);

        router.get('/swagger-proxy', requireAuth, swaggerController.getSpec);

        router.get('/api-tests', requireAuth, apiTestsController.list);
        router.post('/api-tests', requireAuth, apiTestsController.create);
        router.delete('/api-tests/:id', requireAuth, apiTestsController.remove);
        router.post('/api-tests/:id/run', requireAuth, apiTestsController.run);

        router.get('/ui-tests', requireAuth, uiTestsController.list);
        router.post('/ui-tests/inspect-components', requireAuth, uiTestsController.inspectComponents);
        router.post('/ui-tests/component-picker/start', requireAuth, uiTestsController.startComponentPicker);
        router.get('/ui-tests/component-picker/:id', requireAuth, uiTestsController.componentPickerStatus);
        router.delete('/ui-tests/component-picker/:id', requireAuth, uiTestsController.cancelComponentPicker);
        router.post('/ui-tests', requireAuth, uiTestsController.create);
        router.delete('/ui-tests/:id', requireAuth, uiTestsController.remove);
        router.post('/ui-tests/:id/run', requireAuth, uiTestsController.run);

        router.get('/e2e', requireAuth, e2eController.list);
        router.post('/e2e', requireAuth, e2eController.create);
        router.delete('/e2e/:id', requireAuth, e2eController.remove);
        router.post('/e2e/:id/start', requireAuth, e2eController.startRecording);
        router.post('/e2e/:id/stop', requireAuth, e2eController.stopRecording);
        router.post('/e2e/:id/run', requireAuth, e2eController.run);
        router.get('/e2e/:id/spec', requireAuth, e2eController.getSpec);
        router.post('/e2e/:id/gen-screenshots', requireAuth, e2eController.genScreenshots);
        router.get('/e2e/:id/screenshots', requireAuth, e2eController.listScreenshots);
        router.get('/e2e/:id/screenshots/:file', requireAuth, e2eController.serveScreenshot);
        router.get('/e2e/:id/doc.pdf', requireAuth, e2eController.servePdf);

        return router;
    }
}
