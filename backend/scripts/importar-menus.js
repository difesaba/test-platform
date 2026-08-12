/**
 * Importa un árbol de menús { Modulo: { Submodulo: [pagina,...] } } a workspace/modules,
 * replicando el patrón de ModuleService (api|ui|e2e + module.json). Idempotente.
 * Uso: node scripts/importar-menus.js [rutaJson] [rutaWorkspaceModules]
 */
const fs = require('fs');
const path = require('path');

const JSON_PATH = process.argv[2] || path.join(__dirname, '..', '..', 'sinco-menus-landing.json');
const MODULES_DIR = process.argv[3] || path.join(__dirname, '..', 'workspace', 'modules');

const INVALID = /[\\/:*?"<>|]/g;
const safe = (s) => String(s).replace(INVALID, '').replace(/\s+/g, ' ').trim().slice(0, 120) || 'sin-nombre';
const now = () => new Date().toISOString();
const ensureDir = (p) => fs.mkdirSync(p, { recursive: true });
const writeIfAbsent = (p, c) => { if (!fs.existsSync(p)) fs.writeFileSync(p, c); };

function scaffold(base) { // api/ui/e2e + archivos base
  ['api', 'ui', 'e2e'].forEach(d => ensureDir(path.join(base, d)));
  writeIfAbsent(path.join(base, 'api', 'tests.json'), '[]');
  writeIfAbsent(path.join(base, 'ui', 'tests.json'), '[]');
  writeIfAbsent(path.join(base, 'e2e', 'recordings.json'), '[]');
}

const stats = { modulos: 0, submodulos: 0, paginas: 0, saltadas: 0 };

function importModule(modName, subtree) {
  const name = safe(modName);
  const modPath = path.join(MODULES_DIR, name);
  const jsonFile = path.join(modPath, 'module.json');
  let mod;
  if (fs.existsSync(jsonFile)) {
    mod = JSON.parse(fs.readFileSync(jsonFile, 'utf-8'));
  } else {
    ensureDir(modPath); scaffold(modPath);
    mod = { name, description: 'Importado del menú SINCO', folderPath: modPath, createdAt: now(), submodules: [], pages: [] };
    stats.modulos++;
  }
  mod.submodules = mod.submodules || []; mod.pages = mod.pages || [];

  for (const subName of Object.keys(subtree)) {
    const sName = safe(subName);
    const subPath = path.join(modPath, 'submodules', sName);
    let sub = mod.submodules.find(s => s.name === sName);
    if (!sub) {
      ensureDir(subPath); scaffold(subPath);
      sub = { name: sName, folderPath: subPath, createdAt: now(), pages: [] };
      mod.submodules.push(sub); stats.submodulos++;
    }
    sub.pages = sub.pages || [];
    for (const pag of subtree[subName]) {
      const pName = safe(pag);
      if (sub.pages.find(p => p.name === pName)) { stats.saltadas++; continue; }
      const pagePath = path.join(subPath, 'pages', pName);
      scaffold(pagePath);
      sub.pages.push({ name: pName, url: `${modName}/${subName}/${pag}`, folderPath: pagePath, createdAt: now() });
      stats.paginas++;
    }
  }
  fs.writeFileSync(jsonFile, JSON.stringify(mod, null, 2));
}

const tree = JSON.parse(fs.readFileSync(JSON_PATH, 'utf-8'));
console.log('Importando desde:', JSON_PATH);
console.log('Hacia          :', MODULES_DIR);
for (const modName of Object.keys(tree)) importModule(modName, tree[modName]);
console.log('LISTO:', JSON.stringify(stats));
