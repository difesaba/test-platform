import { Router } from 'express';
import { requireAuth } from '../middlewares/session.middleware';
import { SwaggerController } from '../../features/swagger/swagger.controller';
import { ApiTestsController } from '../../features/apiTests/apiTests.controller';
import { BatchHistoryController } from '../../features/batch/batchHistory.controller';
import { UiTestsController } from '../../features/uiTests/uiTests.controller';
import { E2eController } from '../../features/e2e/e2e.controller';
import { SuiteController } from '../../features/suites/suite.controller';

// Dominio: testing (API, UI, E2E, batch, swagger). Todas protegidas.
export function testingRoutes(): Router {
    const router = Router();
    const swagger = new SwaggerController();
    const apiTests = new ApiTestsController();
    const batch = new BatchHistoryController();
    const uiTests = new UiTestsController();
    const e2e = new E2eController();
    const suites = new SuiteController();

    router.get('/swagger-proxy', requireAuth, swagger.getSpec);

    // API tests
    router.get('/api-tests', requireAuth, apiTests.list);
    router.post('/api-tests', requireAuth, apiTests.create);
    router.post('/api-tests/batch-run', requireAuth, apiTests.batchRun);
    router.put('/api-tests/:id', requireAuth, apiTests.update);
    router.delete('/api-tests/:id', requireAuth, apiTests.remove);
    router.post('/api-tests/:id/run', requireAuth, apiTests.run);

    // Batch runs
    router.get('/batch-runs', requireAuth, batch.list);
    router.delete('/batch-runs/:id', requireAuth, batch.remove);

    // UI tests
    router.get('/ui-tests', requireAuth, uiTests.list);
    router.post('/ui-tests/inspect-components', requireAuth, uiTests.inspectComponents);
    router.post('/ui-tests/component-picker/start', requireAuth, uiTests.startComponentPicker);
    router.get('/ui-tests/component-picker/:id', requireAuth, uiTests.componentPickerStatus);
    router.delete('/ui-tests/component-picker/:id', requireAuth, uiTests.cancelComponentPicker);
    router.post('/ui-tests', requireAuth, uiTests.create);
    router.delete('/ui-tests/:id', requireAuth, uiTests.remove);
    router.post('/ui-tests/:id/run', requireAuth, uiTests.run);
    router.post('/ui-tests/:id/baseline', requireAuth, uiTests.setBaseline);

    // E2E
    router.get('/e2e', requireAuth, e2e.list);
    router.post('/e2e', requireAuth, e2e.create);
    router.get('/e2e/runs', requireAuth, e2e.runs);
    router.get('/e2e/coverage', requireAuth, e2e.coverage);
    router.get('/e2e/flaky', requireAuth, e2e.flaky);
    router.get('/e2e/history', requireAuth, e2e.history);
    router.get('/e2e/dashboard', requireAuth, e2e.dashboard);
    router.get('/e2e/alerts', requireAuth, e2e.alerts);
    router.get('/e2e/requirements', requireAuth, e2e.requirements);
    router.post('/e2e/:id/rename', requireAuth, e2e.rename);
    router.post('/e2e/:id/requirement', requireAuth, e2e.setRequirement);
    router.post('/e2e/:id/assertions', requireAuth, e2e.saveAssertions);
    router.delete('/e2e/:id', requireAuth, e2e.remove);
    router.post('/e2e/:id/start', requireAuth, e2e.startRecording);
    router.post('/e2e/:id/stop', requireAuth, e2e.stopRecording);
    router.post('/e2e/:id/run', requireAuth, e2e.run);
    router.get('/e2e/:id/spec', requireAuth, e2e.getSpec);
    router.get('/e2e/:id/locators', requireAuth, e2e.locatorHealth);
    router.post('/e2e/:id/locators/heal', requireAuth, e2e.healLocators);
    router.get('/e2e/:id/doc-data', requireAuth, e2e.docData);
    router.post('/e2e/:id/gen-screenshots', requireAuth, e2e.genScreenshots);
    router.get('/e2e/:id/screenshots', requireAuth, e2e.listScreenshots);
    router.get('/e2e/:id/screenshots/:file', requireAuth, e2e.serveScreenshot);
    router.get('/e2e/:id/doc.pdf', requireAuth, e2e.servePdf);
    router.get('/e2e/:id/trace.zip', requireAuth, e2e.serveTrace);
    router.post('/e2e/:id/trace/open', requireAuth, e2e.openTrace);
    router.post('/e2e/:id/enhance-ai', requireAuth, e2e.enhanceWithAI);
    router.post('/e2e/:id/ai-suggest', requireAuth, e2e.aiSuggest);
    router.post('/e2e/:id/save-enhanced', requireAuth, e2e.saveEnhanced);

    // Suites E2E (roadmap #2, Fase 1)
    router.get('/suites', requireAuth, suites.list);
    router.post('/suites', requireAuth, suites.create);
    router.get('/suites/:id', requireAuth, suites.get);
    router.patch('/suites/:id', requireAuth, suites.update);
    router.delete('/suites/:id', requireAuth, suites.remove);
    router.post('/suites/:id/flows', requireAuth, suites.addFlow);
    router.delete('/suites/:id/flows/:flowId', requireAuth, suites.removeFlow);
    router.post('/suites/:id/run', requireAuth, suites.run);
    router.get('/suites/:id/runs', requireAuth, suites.runs);

    return router;
}
