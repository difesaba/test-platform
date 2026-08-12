import fs from 'fs';
import path from 'path';
import { envs } from '../../shared/config/envs';

export interface Submodule {
    name: string;
    folderPath: string;
    createdAt: string;
    pages?: Page[];
    submodules?: Submodule[];
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
    swaggerUrl?: string;
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

    setSwaggerUrl(name: string, swaggerUrl: string): Module {
        const mod = this.readModuleJson(name);
        mod.swaggerUrl = swaggerUrl;
        this.writeModuleJson(name, mod);
        return mod;
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
            pages: [],
        };

        const mod = this.readModuleJson(moduleName);
        mod.submodules.push(sub);
        this.writeModuleJson(moduleName, mod);

        return sub;
    }

    async createSubmodulePage(moduleName: string, subName: string, pageName: string, url: string): Promise<Page> {
        const modPath = this.modulePath(moduleName);
        if (!fs.existsSync(modPath)) throw new Error(`El módulo "${moduleName}" no existe`);

        const subPath = path.join(modPath, 'submodules', subName);
        if (!fs.existsSync(subPath)) throw new Error(`El submódulo "${subName}" no existe`);

        const pagePath = path.join(subPath, 'pages', pageName);
        if (fs.existsSync(pagePath)) throw new Error(`La página "${pageName}" ya existe en el submódulo`);

        ['api', 'ui', 'e2e'].forEach(dir => fs.mkdirSync(path.join(pagePath, dir), { recursive: true }));
        fs.writeFileSync(path.join(pagePath, 'api', 'tests.json'), JSON.stringify([], null, 2));
        fs.writeFileSync(path.join(pagePath, 'ui', 'tests.json'), JSON.stringify([], null, 2));
        fs.writeFileSync(path.join(pagePath, 'e2e', 'recordings.json'), JSON.stringify([], null, 2));

        const page: Page = { name: pageName, url, folderPath: pagePath, createdAt: new Date().toISOString() };

        const mod = this.readModuleJson(moduleName);
        const sub = mod.submodules.find(s => s.name === subName);
        if (!sub) throw new Error(`El submódulo "${subName}" no encontrado en module.json`);
        if (!sub.pages) sub.pages = [];
        sub.pages.push(page);
        this.writeModuleJson(moduleName, mod);

        return page;
    }

    deleteSubmodulePage(moduleName: string, subName: string, pageName: string): void {
        const pagePath = path.join(this.modulePath(moduleName), 'submodules', subName, 'pages', pageName);
        if (!fs.existsSync(pagePath)) throw new Error(`Página "${pageName}" no encontrada en el submódulo`);
        fs.rmSync(pagePath, { recursive: true, force: true });

        const mod = this.readModuleJson(moduleName);
        const sub = mod.submodules.find(s => s.name === subName);
        if (sub?.pages) sub.pages = sub.pages.filter(p => p.name !== pageName);
        this.writeModuleJson(moduleName, mod);
    }

    // ---------- Recursivo por ruta de submódulos (N niveles) ----------

    private subDirForPath(moduleName: string, pathArr: string[]): string {
        let p = this.modulePath(moduleName);
        for (const seg of pathArr) p = path.join(p, 'submodules', seg);
        return p;
    }

    private findNode(mod: Module, pathArr: string[]): Submodule | null {
        let list: Submodule[] = mod.submodules ?? [];
        let node: Submodule | null = null;
        for (const seg of pathArr) {
            node = list.find(s => s.name === seg) ?? null;
            if (!node) return null;
            if (!node.submodules) node.submodules = [];
            list = node.submodules;
        }
        return node;
    }

    async createSubmodulePath(moduleName: string, pathArr: string[]): Promise<Submodule> {
        const modPath = this.modulePath(moduleName);
        if (!fs.existsSync(modPath)) throw new Error(`El módulo "${moduleName}" no existe`);
        const mod = this.readModuleJson(moduleName);
        mod.submodules = mod.submodules ?? [];
        let list: Submodule[] = mod.submodules;
        let node: Submodule | null = null;
        let acc = modPath;
        for (const seg of pathArr) {
            acc = path.join(acc, 'submodules', seg);
            let found = list.find(s => s.name === seg) ?? null;
            if (!found) {
                ['api', 'ui', 'e2e'].forEach(d => fs.mkdirSync(path.join(acc, d), { recursive: true }));
                fs.writeFileSync(path.join(acc, 'api', 'tests.json'), '[]');
                fs.writeFileSync(path.join(acc, 'ui', 'tests.json'), '[]');
                fs.writeFileSync(path.join(acc, 'e2e', 'recordings.json'), '[]');
                found = { name: seg, folderPath: acc, createdAt: new Date().toISOString(), pages: [], submodules: [] };
                list.push(found);
            }
            if (!found.submodules) found.submodules = [];
            node = found;
            list = found.submodules;
        }
        this.writeModuleJson(moduleName, mod);
        if (!node) throw new Error('Ruta de submódulo vacía');
        return node;
    }

    async createPagePath(moduleName: string, pathArr: string[], pageName: string, url: string): Promise<Page> {
        const mod = this.readModuleJson(moduleName);
        const node = this.findNode(mod, pathArr);
        if (!node) throw new Error(`Submódulo "${pathArr.join('/')}" no existe`);
        const base = this.subDirForPath(moduleName, pathArr);
        const pagePath = path.join(base, 'pages', pageName);
        if (fs.existsSync(pagePath)) throw new Error(`La página "${pageName}" ya existe`);
        ['api', 'ui', 'e2e'].forEach(d => fs.mkdirSync(path.join(pagePath, d), { recursive: true }));
        fs.writeFileSync(path.join(pagePath, 'api', 'tests.json'), '[]');
        fs.writeFileSync(path.join(pagePath, 'ui', 'tests.json'), '[]');
        fs.writeFileSync(path.join(pagePath, 'e2e', 'recordings.json'), '[]');
        const page: Page = { name: pageName, url, folderPath: pagePath, createdAt: new Date().toISOString() };
        node.pages = node.pages ?? [];
        node.pages.push(page);
        this.writeModuleJson(moduleName, mod);
        return page;
    }

    deleteSubmodulePath(moduleName: string, pathArr: string[]): void {
        const dir = this.subDirForPath(moduleName, pathArr);
        if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
        const mod = this.readModuleJson(moduleName);
        const parent = pathArr.length > 1 ? this.findNode(mod, pathArr.slice(0, -1)) : null;
        const list: Submodule[] = parent ? (parent.submodules ?? []) : (mod.submodules ?? []);
        const name = pathArr[pathArr.length - 1];
        const idx = list.findIndex(s => s.name === name);
        if (idx >= 0) list.splice(idx, 1);
        this.writeModuleJson(moduleName, mod);
    }

    deletePagePath(moduleName: string, pathArr: string[], pageName: string): void {
        const base = this.subDirForPath(moduleName, pathArr);
        const pagePath = path.join(base, 'pages', pageName);
        if (fs.existsSync(pagePath)) fs.rmSync(pagePath, { recursive: true, force: true });
        const mod = this.readModuleJson(moduleName);
        const node = this.findNode(mod, pathArr);
        if (node?.pages) node.pages = node.pages.filter(p => p.name !== pageName);
        this.writeModuleJson(moduleName, mod);
    }


    // ---------- Renombrar (carpeta + module.json + recomputar rutas) ----------

    private safeName(n: string): string {
        const v = String(n).replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim();
        if (!v) throw new Error('El nombre no puede estar vacío');
        return v;
    }

    private recomputeFolderPaths(mod: Module): void {
        const modPath = this.modulePath(mod.name);
        mod.folderPath = modPath;
        const walkPages = (pages: Page[] | undefined, base: string) => {
            for (const p of pages ?? []) p.folderPath = path.join(base, 'pages', p.name);
        };
        walkPages(mod.pages, modPath);
        const walk = (subs: Submodule[] | undefined, base: string) => {
            for (const s of subs ?? []) {
                const dir = path.join(base, 'submodules', s.name);
                s.folderPath = dir;
                walkPages(s.pages, dir);
                walk(s.submodules, dir);
            }
        };
        walk(mod.submodules, modPath);
    }

    renameModule(oldName: string, rawNew: string): Module {
        const newName = this.safeName(rawNew);
        if (newName === oldName) return this.readModuleJson(oldName);
        const oldPath = this.modulePath(oldName);
        const newPath = this.modulePath(newName);
        if (!fs.existsSync(oldPath)) throw new Error(`El módulo "${oldName}" no existe`);
        if (fs.existsSync(newPath)) throw new Error(`Ya existe un módulo "${newName}"`);
        fs.renameSync(oldPath, newPath);
        const mod = this.readModuleJson(newName);
        mod.name = newName;
        this.recomputeFolderPaths(mod);
        this.writeModuleJson(newName, mod);
        return mod;
    }

    renameSubmodulePath(moduleName: string, pathArr: string[], rawNew: string): void {
        const newName = this.safeName(rawNew);
        const oldName = pathArr[pathArr.length - 1];
        if (newName === oldName) return;
        const parentPath = pathArr.slice(0, -1);
        const mod = this.readModuleJson(moduleName);
        const parent: { submodules?: Submodule[] } = parentPath.length ? (this.findNode(mod, parentPath) as any) : mod;
        if (!parent) throw new Error('Ruta padre no existe');
        const node = (parent.submodules ?? []).find(x => x.name === oldName);
        if (!node) throw new Error(`Submódulo "${oldName}" no existe`);
        const oldDir = this.subDirForPath(moduleName, pathArr);
        const newDir = this.subDirForPath(moduleName, [...parentPath, newName]);
        if (fs.existsSync(newDir)) throw new Error(`Ya existe un submódulo "${newName}"`);
        if (fs.existsSync(oldDir)) fs.renameSync(oldDir, newDir);
        node.name = newName;
        this.recomputeFolderPaths(mod);
        this.writeModuleJson(moduleName, mod);
    }

    renamePagePath(moduleName: string, pathArr: string[], oldPage: string, rawNew: string): void {
        const newName = this.safeName(rawNew);
        if (newName === oldPage) return;
        const mod = this.readModuleJson(moduleName);
        const container: { pages?: Page[] } = pathArr.length ? (this.findNode(mod, pathArr) as any) : mod;
        if (!container) throw new Error('Ruta no existe');
        const base = pathArr.length ? this.subDirForPath(moduleName, pathArr) : this.modulePath(moduleName);
        const oldDir = path.join(base, 'pages', oldPage);
        const newDir = path.join(base, 'pages', newName);
        if (!fs.existsSync(oldDir)) throw new Error(`La página "${oldPage}" no existe`);
        if (fs.existsSync(newDir)) throw new Error(`Ya existe una página "${newName}"`);
        fs.renameSync(oldDir, newDir);
        const pg = (container.pages ?? []).find(p => p.name === oldPage);
        if (pg) { pg.name = newName; pg.folderPath = newDir; }
        this.writeModuleJson(moduleName, mod);
    }

}
