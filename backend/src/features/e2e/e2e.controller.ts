import { Request, Response } from 'express';
import { E2eService } from './e2e.service';
import { E2eAiService } from './e2e-ai.service';
import { resolveAutomationEntryUrl, resolveRuntimeUrl } from '../../shared/helpers/runtime-url';
import { auditService } from '../audit/audit.service';

const svc = new E2eService();
const aiSvc = new E2eAiService();

function getSessionContext(req: Request) {
    const sess = req.session as any;
    return {
        urlRaiz: sess?.urlRaiz,
        clienteId: sess?.clienteId,
        empresaId: sess?.empresa?.id,
        sucursalId: sess?.sucursal?.id,
        empresaNombre: sess?.empresa?.nombre ?? sess?.empresaNombre,
        sucursalNombre: sess?.sucursal?.nombre,
        entornoName: sess?.sucursal?.entorno ?? sess?.entorno?.name,
        empNombre: sess?.empNombre,
    };
}

export class E2eController {

    list = async (req: Request, res: Response) => {
        const { module: mod, submodule, page } = req.query as Record<string, string>;
        if (!mod) return res.status(400).json({ error: 'Falta module' });
        res.json(await svc.list(mod, submodule, page));
    };

    create = async (req: Request, res: Response) => {
        const { module: mod, submodule, page } = req.query as Record<string, string>;
        if (!mod) return res.status(400).json({ error: 'Falta module' });
        const sessionUrlRaiz = String((req.session as any)?.urlRaiz ?? '');
        { const _cc = getSessionContext(req); auditService.record({ type: 'structural', action: 'crear', target: 'flujo ' + (req.body?.name ?? '') + ' (' + mod + ')', empresaNombre: _cc.empresaNombre, entorno: _cc.entornoName, urlRaiz: _cc.urlRaiz }); }
        res.status(201).json(await svc.create(mod, {
            ...req.body,
            url: resolveRuntimeUrl(String(req.body?.url ?? ''), sessionUrlRaiz),
        }, submodule, page));
    };

    rename = async (req: Request, res: Response) => {
        const { module: mod, submodule, page } = req.query as Record<string, string>;
        if (!mod) return res.status(400).json({ error: 'Falta module' });
        const { name } = req.body;
        if (!name) return res.status(400).json({ error: 'Falta name' });
        try {
            { const _cr = getSessionContext(req); auditService.record({ type: 'structural', action: 'renombrar', target: 'flujo ' + name + ' (' + mod + ')', empresaNombre: _cr.empresaNombre, entorno: _cr.entornoName, urlRaiz: _cr.urlRaiz }); }
            res.json(await svc.rename(mod, (req.params.id as string), name, submodule, page));
        } catch (e: any) { res.status(500).json({ error: e.message }); }
    };

    setRequirement = async (req: Request, res: Response) => {
        const { module: mod, submodule, page } = req.query as Record<string, string>;
        if (!mod) return res.status(400).json({ error: 'Falta module' });
        const { requirement } = req.body;
        try {
            { const _cr = getSessionContext(req); auditService.record({ type: 'structural', action: 'ligar requisito', target: 'flujo ' + (req.params.id as string) + ' (' + mod + ')', empresaNombre: _cr.empresaNombre, entorno: _cr.entornoName, urlRaiz: _cr.urlRaiz }); }
            res.json(await svc.setRequirement(mod, (req.params.id as string), requirement ?? '', submodule, page));
        } catch (e: any) { res.status(500).json({ error: e.message }); }
    };

    saveAssertions = async (req: Request, res: Response) => {
        const { module: mod, submodule, page } = req.query as Record<string, string>;
        if (!mod) return res.status(400).json({ error: 'Falta module' });
        const { assertions } = req.body;
        try {
            res.json(await svc.saveAssertions(mod, (req.params.id as string), assertions ?? [], submodule, page));
        } catch (e: any) { res.status(500).json({ error: e.message }); }
    };

    remove = async (req: Request, res: Response) => {
        const { module: mod, submodule, page } = req.query as Record<string, string>;
        if (!mod) return res.status(400).json({ error: 'Falta module' });
        try {
            await svc.delete(mod, (req.params.id as string), submodule, page);
            { const _c = getSessionContext(req); auditService.record({ type: 'structural', action: 'eliminar', target: 'flujo ' + (req.params.id as string) + ' (' + mod + ')', empresaNombre: _c.empresaNombre, entorno: _c.entornoName, urlRaiz: _c.urlRaiz }); }
            res.json({ ok: true });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    };

    startRecording = async (req: Request, res: Response) => {
        const { module: mod, submodule, page } = req.query as Record<string, string>;
        if (!mod) return res.status(400).json({ error: 'Falta module' });
        try {
            const sessionUrlRaiz = String((req.session as any)?.urlRaiz ?? '');
            const overrideUrl = resolveRuntimeUrl(String(req.body?.url ?? ''), sessionUrlRaiz) || undefined;
            const adproToken = (req.session as any)?.adproToken;
            await svc.startRecording(mod, (req.params.id as string), submodule, page, overrideUrl, adproToken, getSessionContext(req));
            res.json({ ok: true });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    };

    stopRecording = async (req: Request, res: Response) => {
        const { module: mod, submodule, page } = req.query as Record<string, string>;
        if (!mod) return res.status(400).json({ error: 'Falta module' });
        try {
            await svc.stopRecording(mod, (req.params.id as string), submodule, page);
            res.json({ ok: true });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    };

    run = async (req: Request, res: Response) => {
        const { module: mod, submodule, page } = req.query as Record<string, string>;
        if (!mod) return res.status(400).json({ error: 'Falta module' });
        try {
            const sessionUrlRaiz = String((req.session as any)?.urlRaiz ?? '');
            const overrideUrl = resolveRuntimeUrl(String(req.body?.url ?? ''), sessionUrlRaiz) || undefined;
            const ctx = getSessionContext(req);
            const adproToken = (req.session as any)?.adproToken;
            const result = await svc.run(mod, (req.params.id as string), submodule, page, overrideUrl, ctx.empresaNombre, ctx.sucursalNombre, ctx, adproToken);
            auditService.record({ type: 'execution', action: 'ejecutar', target: 'flujo ' + (req.params.id as string) + ' (' + mod + ')', empresaNombre: ctx.empresaNombre, entorno: ctx.entornoName, urlRaiz: ctx.urlRaiz, meta: { passed: result.passed, failed: result.failed, ok: result.ok } });
            res.json(result);
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    };

    getSpec = async (req: Request, res: Response) => {
        const { module: mod, submodule, page } = req.query as Record<string, string>;
        if (!mod) return res.status(400).json({ error: 'Falta module' });
        res.json({ spec: await svc.getSpec(mod, (req.params.id as string), submodule, page) });
    };

    locatorHealth = async (req: Request, res: Response) => {
        const { module: mod, submodule, page } = req.query as Record<string, string>;
        if (!mod) return res.status(400).json({ error: 'Falta module' });
        try {
            res.json(await svc.locatorHealth(mod, (req.params.id as string), submodule, page));
        } catch (e: any) { res.status(500).json({ error: e.message }); }
    };

    healLocators = async (req: Request, res: Response) => {
        const { module: mod, submodule, page } = req.query as Record<string, string>;
        if (!mod) return res.status(400).json({ error: 'Falta module' });
        try {
            res.json(await svc.healLocators(mod, (req.params.id as string), submodule, page));
        } catch (e: any) { res.status(500).json({ error: e.message }); }
    };

    coverage = async (_req: Request, res: Response) => {
        try {
            res.json(await svc.coverageAll());
        } catch (e: any) { res.status(500).json({ error: e.message }); }
    };

    flaky = async (req: Request, res: Response) => {
        try {
            const { window } = req.query as Record<string, string>;
            res.json(await svc.flakyReport(window ? Number(window) : undefined));
        } catch (e: any) { res.status(500).json({ error: e.message }); }
    };

    history = async (req: Request, res: Response) => {
        try {
            const { days } = req.query as Record<string, string>;
            res.json(await svc.historyReport(days ? Number(days) : undefined));
        } catch (e: any) { res.status(500).json({ error: e.message }); }
    };

    dashboard = async (req: Request, res: Response) => {
        try {
            const { days } = req.query as Record<string, string>;
            res.json(await svc.dashboardSummary(days ? Number(days) : undefined));
        } catch (e: any) { res.status(500).json({ error: e.message }); }
    };

    requirements = async (_req: Request, res: Response) => {
        try {
            res.json(await svc.requirementsReport());
        } catch (e: any) { res.status(500).json({ error: e.message }); }
    };

    alerts = async (_req: Request, res: Response) => {
        try {
            res.json(await svc.alerts());
        } catch (e: any) { res.status(500).json({ error: e.message }); }
    };

    docData = async (req: Request, res: Response) => {
        const { module: mod, submodule, page } = req.query as Record<string, string>;
        if (!mod) return res.status(400).json({ error: 'Falta module' });
        try {
            res.json(await svc.docData(mod, (req.params.id as string), submodule, page));
        } catch (e: any) { res.status(404).json({ error: e.message }); }
    };

    runs = async (req: Request, res: Response) => {
        const { module: mod, submodule, page, flowId, limit } = req.query as Record<string, string>;
        try {
            const rows = await svc.runsHistory({
                mod: mod || undefined,
                sub: submodule || undefined,
                page: page || undefined,
                flowId: flowId || undefined,
                limit: limit ? Number(limit) : undefined,
            });
            res.json(rows);
        } catch (e: any) { res.status(500).json({ error: e.message }); }
    };

    genScreenshots = (req: Request, res: Response) => {
        const { module: mod, submodule, page } = req.query as Record<string, string>;
        if (!mod) return res.status(400).json({ error: 'Falta module' });
        svc.startScreenshotGen(mod, (req.params.id as string), submodule, page);
        res.json({ ok: true, generating: true });
    };

    listScreenshots = async (req: Request, res: Response) => {
        const { module: mod, submodule, page } = req.query as Record<string, string>;
        if (!mod) return res.status(400).json({ error: 'Falta module' });
        const recs = await svc.list(mod, submodule, page);
        const rec = recs.find(r => r.id === (req.params.id as string));
        if (!rec) return res.status(404).json({ error: 'Grabación no encontrada' });
        res.json({ screenshots: rec.lastResult?.screenshots ?? [] });
    };

    servePdf = async (req: Request, res: Response) => {
        const { module: mod, submodule, page } = req.query as Record<string, string>;
        if (!mod) return res.status(400).json({ error: 'Falta module' });
        try {
            const pdfPath = await svc.getPdfPath(mod, (req.params.id as string), submodule, page);
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', 'inline; filename="documentacion.pdf"');
            res.sendFile(pdfPath);
        } catch (e: any) {
            res.status(404).json({ error: e.message });
        }
    };

    serveTrace = async (req: Request, res: Response) => {
        const { module: mod, submodule, page } = req.query as Record<string, string>;
        if (!mod) return res.status(400).json({ error: 'Falta module' });
        try {
            const tracePath = await svc.getTracePath(mod, (req.params.id as string), submodule, page);
            res.setHeader('Content-Type', 'application/zip');
            res.setHeader('Content-Disposition', 'attachment; filename="trace.zip"');
            res.sendFile(tracePath);
        } catch (e: any) {
            res.status(404).json({ error: e.message });
        }
    };

    openTrace = async (req: Request, res: Response) => {
        const { module: mod, submodule, page } = req.query as Record<string, string>;
        if (!mod) return res.status(400).json({ error: 'Falta module' });
        try {
            await svc.openTraceViewer(mod, (req.params.id as string), submodule, page);
            res.json({ ok: true });
        } catch (e: any) {
            res.status(404).json({ error: e.message });
        }
    };

    serveScreenshot = async (req: Request, res: Response) => {
        const { module: mod, submodule, page } = req.query as Record<string, string>;
        if (!mod) return res.status(400).json({ error: 'Falta module' });
        try {
            const filePath = await svc.getScreenshotPath(mod, (req.params.id as string), (req.params.file as string), submodule, page);
            res.sendFile(filePath);
        } catch (e: any) {
            res.status(404).json({ error: e.message });
        }
    };

    enhanceWithAI = async (req: Request, res: Response) => {
        const { module: mod, submodule, page } = req.query as Record<string, string>;
        if (!mod) return res.status(400).json({ error: 'Falta module' });
        try {
            const specContent = await svc.getSpec(mod, (req.params.id as string), submodule, page);
            if (!specContent) return res.status(400).json({ error: 'El flujo no tiene spec grabado aún' });
            const enhancedSpec = await aiSvc.enhanceSpec(specContent, mod);
            res.json({ enhancedSpec, originalSpec: specContent });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    };

    aiSuggest = async (req: Request, res: Response) => {
        const { module: mod, submodule, page } = req.query as Record<string, string>;
        if (!mod) return res.status(400).json({ error: 'Falta module' });
        try {
            const spec = await svc.getSpec(mod, (req.params.id as string), submodule, page);
            if (!spec) return res.status(400).json({ error: 'El flujo no tiene spec grabado aún' });
            const flowName = (req.query.flowName as string) ?? (req.params.id as string);
            const suggestions = await aiSvc.suggestEdgeCases(spec, mod, flowName);
            res.json({ suggestions });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    };

    saveEnhanced = async (req: Request, res: Response) => {
        const { module: mod, submodule, page } = req.query as Record<string, string>;
        if (!mod) return res.status(400).json({ error: 'Falta module' });
        const { enhancedSpec } = req.body ?? {};
        if (!enhancedSpec || typeof enhancedSpec !== 'string') {
            return res.status(400).json({ error: 'Falta enhancedSpec en el body' });
        }
        try {
            await svc.saveEnhancedSpec(mod, (req.params.id as string), enhancedSpec, submodule, page);
            res.json({ ok: true });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    };
}
