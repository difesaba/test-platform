import fs from 'fs';
import path from 'path';
import { envs } from '../config/envs';

export interface Submodule {
    name: string;
    folderPath: string;
    createdAt: string;
}

export interface Page {
    name: string;
    url: string;
    folderPath: string;
    createdAt: string;
}

export interface Module {
    name: string;
    description?: string;
    folderPath: string;
    createdAt: string;
    submodules: Submodule[];
    pages: Page[];
}

export class ModuleService {

    private workspacePath(): string {
        return path.join(process.cwd(), envs.WORKSPACE_PATH, 'modules');
    }

    private modulePath(name: string): string {
        return path.join(this.workspacePath(), name);
    }

    private readModuleJson(name: string): Module {
        const file = path.join(this.modulePath(name), 'module.json');
        return JSON.parse(fs.readFileSync(file, 'utf-8'));
    }

    private writeModuleJson(name: string, data: Module): void {
        const file = path.join(this.modulePath(name), 'module.json');
        fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
    }

    listModules(): Module[] {
        const ws = this.workspacePath();
        if (!fs.existsSync(ws)) return [];
        return fs.readdirSync(ws)
            .filter(entry => fs.statSync(path.join(ws, entry)).isDirectory())
            .map(name => {
                try { return this.readModuleJson(name); }
                catch { return null; }
            })
            .filter(Boolean) as Module[];
    }

    async createModule(name: string, description?: string): Promise<Module> {
        const modPath = this.modulePath(name);
        if (fs.existsSync(modPath)) throw new Error(`El módulo "${name}" ya existe`);

        // Crear carpetas
        ['api', 'ui', 'e2e'].forEach(dir => fs.mkdirSync(path.join(modPath, dir), { recursive: true }));

        const mod: Module = {
            name,
            description,
            folderPath: modPath,
            createdAt: new Date().toISOString(),
            submodules: [],
            pages: [],
        };

        this.writeModuleJson(name, mod);

        // Archivos base vacíos para los tests
        fs.writeFileSync(path.join(modPath, 'api', 'tests.json'), JSON.stringify([], null, 2));
        fs.writeFileSync(path.join(modPath, 'ui', 'tests.json'), JSON.stringify([], null, 2));
        fs.writeFileSync(path.join(modPath, 'e2e', 'recordings.json'), JSON.stringify([], null, 2));

        return mod;
    }

    deleteModule(name: string): void {
        const modPath = this.modulePath(name);
        if (!fs.existsSync(modPath)) throw new Error(`El módulo "${name}" no existe`);
        fs.rmSync(modPath, { recursive: true, force: true });
    }

    deletePage(moduleName: string, pageName: string): void {
        const pagePath = path.join(this.modulePath(moduleName), 'pages', pageName);
        if (!fs.existsSync(pagePath)) throw new Error(`Página "${pageName}" no encontrada`);
        fs.rmSync(pagePath, { recursive: true, force: true });
        const mod = this.readModuleJson(moduleName);
        mod.pages = (mod.pages ?? []).filter(p => p.name !== pageName);
        this.writeModuleJson(moduleName, mod);
    }

    deleteSubmodule(moduleName: string, subName: string): void {
        const subPath = path.join(this.modulePath(moduleName), 'submodules', subName);
        if (!fs.existsSync(subPath)) throw new Error(`Submódulo "${subName}" no encontrado`);
        fs.rmSync(subPath, { recursive: true, force: true });
        const mod = this.readModuleJson(moduleName);
        mod.submodules = mod.submodules.filter(s => s.name !== subName);
        this.writeModuleJson(moduleName, mod);
    }

    async createPage(moduleName: string, pageName: string, url: string): Promise<Page> {
        const modPath = this.modulePath(moduleName);
        if (!fs.existsSync(modPath)) throw new Error(`El módulo "${moduleName}" no existe`);

        const pagePath = path.join(modPath, 'pages', pageName);
        if (fs.existsSync(pagePath)) throw new Error(`La página "${pageName}" ya existe`);

        ['api', 'ui', 'e2e'].forEach(dir => fs.mkdirSync(path.join(pagePath, dir), { recursive: true }));
        fs.writeFileSync(path.join(pagePath, 'api', 'tests.json'), JSON.stringify([], null, 2));
        fs.writeFileSync(path.join(pagePath, 'ui', 'tests.json'), JSON.stringify([], null, 2));
        fs.writeFileSync(path.join(pagePath, 'e2e', 'recordings.json'), JSON.stringify([], null, 2));

        const page: Page = { name: pageName, url, folderPath: pagePath, createdAt: new Date().toISOString() };

        const mod = this.readModuleJson(moduleName);
        if (!mod.pages) mod.pages = [];
        mod.pages.push(page);
        this.writeModuleJson(moduleName, mod);

        return page;
    }

    async createSubmodule(moduleName: string, subName: string): Promise<Submodule> {
        const modPath = this.modulePath(moduleName);
        if (!fs.existsSync(modPath)) throw new Error(`El módulo "${moduleName}" no existe`);

        const subPath = path.join(modPath, 'submodules', subName);
        if (fs.existsSync(subPath)) throw new Error(`El submódulo "${subName}" ya existe`);

        ['api', 'ui', 'e2e'].forEach(dir => fs.mkdirSync(path.join(subPath, dir), { recursive: true }));
        fs.writeFileSync(path.join(subPath, 'api', 'tests.json'), JSON.stringify([], null, 2));
        fs.writeFileSync(path.join(subPath, 'ui', 'tests.json'), JSON.stringify([], null, 2));
        fs.writeFileSync(path.join(subPath, 'e2e', 'recordings.json'), JSON.stringify([], null, 2));

        const sub: Submodule = {
            name: subName,
            folderPath: subPath,
            createdAt: new Date().toISOString(),
        };

        const mod = this.readModuleJson(moduleName);
        mod.submodules.push(sub);
        this.writeModuleJson(moduleName, mod);

        return sub;
    }
}
