/**
 * Importa menús con anidamiento REAL (N niveles) desde un arreglo de rutas completas
 * ["Modulo/Sub/SubSub/.../Pagina", ...]. Construye module.json recursivo y crea carpetas
 * con la convención submodules/<A>/submodules/<B>/pages/<pagina>. Idempotente.
 * Uso: node scripts/importar-menus-rec.js [rutasJson] [modulesDir]
 */
const fs = require('fs');
const path = require('path');

const ROUTES_PATH = process.argv[2] || path.join(__dirname, '..', '..', 'cbr-rutas-crudas.json');
const MODULES_DIR = process.argv[3] || path.join(__dirname, '..', 'workspace', 'modules');

const INVALID = /[\\/:*?"<>|]/g;
const safe = (s) => String(s).replace(INVALID, '').replace(/\s+/g, ' ').trim().slice(0, 120) || 'sin-nombre';
const now = () => new Date().toISOString();

// nodo: { name, folderPath, createdAt, pages:[], submodules:[] }
function newNode(name, folderPath) { return { name, folderPath, createdAt: now(), pages: [], submodules: [] }; }
function childSub(node, name, folderPath) {
  let c = node.submodules.find(s => s.name === name);
  if (!c) { c = newNode(name, folderPath); node.submodules.push(c); }
  return c;
}


const routes0 = JSON.parse(fs.readFileSync(ROUTES_PATH, 'utf-8'));
// Pass 1: mapa canónico (sin acentos, mayúsculas) -> display (prefiere variante acentuada)
const canon = (x) => String(x).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().trim();
const hasAcc = (x) => /[áéíóúÁÉÍÓÚñÑ]/.test(x);
const canonMap = {};
for (const r of routes0) for (const seg of String(r).split('/')) {
  const raw = seg.trim(); if(!raw) continue; const k = canon(raw);
  if (!canonMap[k]) canonMap[k] = raw; else if (hasAcc(raw) && !hasAcc(canonMap[k])) canonMap[k] = raw;
}
const disp = (x) => canonMap[canon(x)] || x;

const routes = routes0;
const modules = {}; // name -> rootModule {name, submodules:[], pages:[]}

for (const raw of routes) {
  const seg = String(raw).split('/').map(s => safe(disp(s))).filter(Boolean);
  if (seg.length < 2) continue;
  const modName = seg[0];
  const modPath = path.join(MODULES_DIR, modName);
  if (!modules[modName]) modules[modName] = { name: modName, description: 'Importado del menú SINCO (recursivo)', folderPath: modPath, createdAt: now(), submodules: [], pages: [] };
  const mod = modules[modName];
  const page = seg[seg.length - 1];
  const subPath = seg.slice(1, seg.length - 1); // niveles intermedios
  if (subPath.length === 0) {
    if (!mod.pages.find(p => p.name === page)) mod.pages.push({ name: page, url: raw, folderPath: path.join(modPath, 'pages', page), createdAt: now() });
    continue;
  }
  let node = mod, acc = modPath;
  for (const s of subPath) { acc = path.join(acc, 'submodules', s); node = childSub(node, s, acc); }
  const pagePath = path.join(acc, 'pages', page);
  if (!node.pages.find(p => p.name === page)) node.pages.push({ name: page, url: raw, folderPath: pagePath, createdAt: now() });
}

// 1) escribir module.json (instantáneo) — merge si ya existe
function countPages(node){ let c=(node.pages||[]).length; for(const s of (node.submodules||[])) c+=countPages(s); return c; }
for (const name of Object.keys(modules)) {
  const modPath = path.join(MODULES_DIR, name);
  ['api','ui','e2e'].forEach(d => fs.mkdirSync(path.join(modPath, d), { recursive: true }));
  const jf = path.join(modPath, 'module.json');
  fs.writeFileSync(path.join(modPath,'api','tests.json'), fs.existsSync(path.join(modPath,'api','tests.json'))?fs.readFileSync(path.join(modPath,'api','tests.json')):'[]');
  fs.writeFileSync(jf, JSON.stringify(modules[name], null, 2));
  console.log(`module.json ${name}: ${modules[name].submodules.length} submódulos raíz, ${countPages(modules[name])} páginas`);
}

// 2) crear carpetas físicas idempotente
let created = 0, skipped = 0;
function scaffold(base){
  ['api','ui','e2e'].forEach(d => fs.mkdirSync(path.join(base, d), { recursive: true }));
  const a=path.join(base,'api','tests.json'); if(!fs.existsSync(a)) fs.writeFileSync(a,'[]');
  const u=path.join(base,'ui','tests.json'); if(!fs.existsSync(u)) fs.writeFileSync(u,'[]');
  const e=path.join(base,'e2e','recordings.json'); if(!fs.existsSync(e)) fs.writeFileSync(e,'[]');
}
function makeFolders(node){
  for (const p of (node.pages||[])) {
    if (fs.existsSync(p.folderPath)) { skipped++; } else { scaffold(p.folderPath); created++; }
  }
  for (const s of (node.submodules||[])) {
    if (!fs.existsSync(s.folderPath)) scaffold(s.folderPath);
    makeFolders(s);
  }
}
for (const name of Object.keys(modules)) makeFolders(modules[name]);
console.log(`LISTO carpetas: creadas=${created} saltadas=${skipped}`);
