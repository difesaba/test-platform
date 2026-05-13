import { Request, Response } from 'express';
import { ModuleService } from '../../services/module.service';

const moduleService = new ModuleService();

export class ModulesController {

    list = (_req: Request, res: Response) => {
        try {
            const modules = moduleService.listModules();
            res.json(modules);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    };

    create = async (req: Request, res: Response) => {
        try {
            const { name, description } = req.body;
            if (!name) return res.status(400).json({ error: 'El nombre del módulo es requerido' });
            const mod = await moduleService.createModule(name, description);
            res.status(201).json(mod);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    };

    remove = (req: Request, res: Response) => {
        try {
            const { name } = req.params;
            moduleService.deleteModule(name);
            res.json({ ok: true });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    };

    removePage = (req: Request, res: Response) => {
        try {
            moduleService.deletePage(req.params.name, req.params.pageName);
            res.json({ ok: true });
        } catch (e: any) { res.status(500).json({ error: e.message }); }
    };

    removeSubmodule = (req: Request, res: Response) => {
        try {
            moduleService.deleteSubmodule(req.params.name, req.params.subName);
            res.json({ ok: true });
        } catch (e: any) { res.status(500).json({ error: e.message }); }
    };

    createPage = async (req: Request, res: Response) => {
        try {
            const { name: moduleName } = req.params;
            const { name: pageName, url } = req.body;
            if (!pageName || !url) return res.status(400).json({ error: 'Faltan name y url' });
            const page = await moduleService.createPage(moduleName, pageName, url);
            res.status(201).json(page);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    };

    createSubmodule = async (req: Request, res: Response) => {
        try {
            const { name: moduleName } = req.params;
            const { name: subName } = req.body;
            if (!subName) return res.status(400).json({ error: 'El nombre del submódulo es requerido' });
            const sub = await moduleService.createSubmodule(moduleName, subName);
            res.status(201).json(sub);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    };
}
