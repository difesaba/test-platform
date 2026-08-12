import { Request, Response } from 'express';
import { ModuleService } from './module.service';
import { auditService } from '../audit/audit.service';

const moduleService = new ModuleService();
function actx(req: Request) {
    const s = req.session as any;
    return { empresaNombre: s?.empresa?.nombre ?? s?.empresaNombre, entorno: s?.sucursal?.entorno ?? s?.entorno?.name, urlRaiz: s?.urlRaiz };
}

export class ModulesController {

    list = (_req: Request, res: Response) => {
        try {
            const modules = moduleService.listModules();
            res.json(modules);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    };

    setSwagger = (req: Request, res: Response) => {
        try {
            const { name } = req.params as Record<string, string>;
            const { swaggerUrl } = req.body;
            const mod = moduleService.setSwaggerUrl(name, String(swaggerUrl ?? ''));
            auditService.record({ type: 'structural', action: 'configurar', target: 'swagger de ' + name, ...actx(req) });
            res.json(mod);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    };

    create = async (req: Request, res: Response) => {
        try {
            const { name, description } = req.body;
            if (!name) return res.status(400).json({ error: 'El nombre del módulo es requerido' });
            const mod = await moduleService.createModule(name, description);
            auditService.record({ type: 'structural', action: 'crear', target: 'módulo ' + name, ...actx(req) });
            res.status(201).json(mod);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    };

    remove = (req: Request, res: Response) => {
        try {
            const { name } = req.params as Record<string, string>;
            moduleService.deleteModule(name);
            auditService.record({ type: 'structural', action: 'eliminar', target: 'módulo ' + name, ...actx(req) });
            res.json({ ok: true });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    };

    removePage = (req: Request, res: Response) => {
        try {
            moduleService.deletePage((req.params.name as string), (req.params.pageName as string));
            auditService.record({ type: 'structural', action: 'eliminar', target: 'página ' + (req.params.pageName as string) + ' (' + (req.params.name as string) + ')', ...actx(req) });
            res.json({ ok: true });
        } catch (e: any) { res.status(500).json({ error: e.message }); }
    };

    removeSubmodule = (req: Request, res: Response) => {
        try {
            moduleService.deleteSubmodule((req.params.name as string), (req.params.subName as string));
            auditService.record({ type: 'structural', action: 'eliminar', target: 'submódulo ' + (req.params.subName as string) + ' (' + (req.params.name as string) + ')', ...actx(req) });
            res.json({ ok: true });
        } catch (e: any) { res.status(500).json({ error: e.message }); }
    };

    createPage = async (req: Request, res: Response) => {
        try {
            const { name: moduleName } = req.params as Record<string, string>;
            const { name: pageName, url } = req.body;
            if (!pageName || !url) return res.status(400).json({ error: 'Faltan name y url' });
            const page = await moduleService.createPage(moduleName, pageName, url);
            auditService.record({ type: 'structural', action: 'crear', target: 'página ' + pageName + ' (' + moduleName + ')', ...actx(req) });
            res.status(201).json(page);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    };

    createSubmodule = async (req: Request, res: Response) => {
        try {
            const { name: moduleName } = req.params as Record<string, string>;
            const { name: subName } = req.body;
            if (!subName) return res.status(400).json({ error: 'El nombre del submódulo es requerido' });
            const sub = await moduleService.createSubmodule(moduleName, subName);
            auditService.record({ type: 'structural', action: 'crear', target: 'submódulo ' + subName + ' (' + moduleName + ')', ...actx(req) });
            res.status(201).json(sub);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    };

    createSubmodulePage = async (req: Request, res: Response) => {
        try {
            const { name: moduleName, subName } = req.params as Record<string, string>;
            const { name: pageName, url } = req.body;
            if (!pageName || !url) return res.status(400).json({ error: 'Faltan name y url' });
            const page = await moduleService.createSubmodulePage(moduleName, subName, pageName, url);
            auditService.record({ type: 'structural', action: 'crear', target: 'página ' + pageName + ' (' + moduleName + ' › ' + subName + ')', ...actx(req) });
            res.status(201).json(page);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    };

    removeSubmodulePage = (req: Request, res: Response) => {
        try {
            const { name: moduleName, subName, pageName } = req.params as Record<string, string>;
            moduleService.deleteSubmodulePage(moduleName, subName, pageName);
            auditService.record({ type: 'structural', action: 'eliminar', target: 'página ' + pageName + ' (' + moduleName + ' › ' + subName + ')', ...actx(req) });
            res.json({ ok: true });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    };

    // ---------- Operaciones por RUTA (N niveles) ----------

    createSubmoduleTree = async (req: Request, res: Response) => {
        try {
            const { name } = req.params as Record<string, string>;
            const { path: pathArr } = req.body;
            if (!Array.isArray(pathArr) || !pathArr.length) return res.status(400).json({ error: 'Falta path[]' });
            const sub = await moduleService.createSubmodulePath(name, pathArr);
            auditService.record({ type: 'structural', action: 'crear', target: 'submódulo ' + pathArr.join('/') + ' (' + name + ')', ...actx(req) });
            res.status(201).json(sub);
        } catch (e: any) { res.status(500).json({ error: e.message }); }
    };

    createPageTree = async (req: Request, res: Response) => {
        try {
            const { name } = req.params as Record<string, string>;
            const { path: pathArr, name: pageName, url } = req.body;
            if (!Array.isArray(pathArr)) return res.status(400).json({ error: 'Falta path[]' });
            if (!pageName) return res.status(400).json({ error: 'Falta name' });
            const page = await moduleService.createPagePath(name, pathArr, pageName, url ?? '');
            auditService.record({ type: 'structural', action: 'crear', target: 'página ' + pageName + ' (' + name + '/' + pathArr.join('/') + ')', ...actx(req) });
            res.status(201).json(page);
        } catch (e: any) { res.status(500).json({ error: e.message }); }
    };

    deleteSubmoduleTree = (req: Request, res: Response) => {
        try {
            const { name } = req.params as Record<string, string>;
            const { path: pathArr } = req.body;
            if (!Array.isArray(pathArr) || !pathArr.length) return res.status(400).json({ error: 'Falta path[]' });
            moduleService.deleteSubmodulePath(name, pathArr);
            auditService.record({ type: 'structural', action: 'eliminar', target: 'submódulo ' + pathArr.join('/') + ' (' + name + ')', ...actx(req) });
            res.json({ ok: true });
        } catch (e: any) { res.status(500).json({ error: e.message }); }
    };

    deletePageTree = (req: Request, res: Response) => {
        try {
            const { name } = req.params as Record<string, string>;
            const { path: pathArr, name: pageName } = req.body;
            if (!Array.isArray(pathArr)) return res.status(400).json({ error: 'Falta path[]' });
            moduleService.deletePagePath(name, pathArr, pageName);
            auditService.record({ type: 'structural', action: 'eliminar', target: 'página ' + pageName + ' (' + name + '/' + pathArr.join('/') + ')', ...actx(req) });
            res.json({ ok: true });
        } catch (e: any) { res.status(500).json({ error: e.message }); }
    };


    renameModule = async (req: Request, res: Response) => {
        try {
            const { name } = req.params as Record<string, string>;
            const { newName } = req.body;
            if (!newName) return res.status(400).json({ error: 'Falta newName' });
            const mod = moduleService.renameModule(name, newName);
            auditService.record({ type: 'structural', action: 'renombrar', target: 'módulo ' + name + ' → ' + newName, ...actx(req) });
            res.json(mod);
        } catch (e: any) { res.status(500).json({ error: e.message }); }
    };

    renameSubmoduleTree = (req: Request, res: Response) => {
        try {
            const { name } = req.params as Record<string, string>;
            const { path: pathArr, newName } = req.body;
            if (!Array.isArray(pathArr) || !pathArr.length) return res.status(400).json({ error: 'Falta path[]' });
            if (!newName) return res.status(400).json({ error: 'Falta newName' });
            moduleService.renameSubmodulePath(name, pathArr, newName);
            auditService.record({ type: 'structural', action: 'renombrar', target: 'submódulo ' + pathArr.join('/') + ' → ' + newName + ' (' + name + ')', ...actx(req) });
            res.json({ ok: true });
        } catch (e: any) { res.status(500).json({ error: e.message }); }
    };

    renamePageTree = (req: Request, res: Response) => {
        try {
            const { name } = req.params as Record<string, string>;
            const { path: pathArr, name: oldName, newName } = req.body;
            if (!Array.isArray(pathArr)) return res.status(400).json({ error: 'Falta path[]' });
            if (!oldName || !newName) return res.status(400).json({ error: 'Faltan name y newName' });
            moduleService.renamePagePath(name, pathArr, oldName, newName);
            auditService.record({ type: 'structural', action: 'renombrar', target: 'página ' + oldName + ' → ' + newName + ' (' + name + ')', ...actx(req) });
            res.json({ ok: true });
        } catch (e: any) { res.status(500).json({ error: e.message }); }
    };

}
