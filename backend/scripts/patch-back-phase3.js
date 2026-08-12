/**
 * Fase 3 reestructura backend: agrupar services/ por dominio y recablear imports.
 * Uso: cd C:\testPlatform\backend && node scripts/patch-back-phase3.js
 */
const fs = require('fs');
const path = require('path');

function mv(a, b) {
  if (fs.existsSync(a)) {
    fs.mkdirSync(path.dirname(b), { recursive: true });
    fs.renameSync(a, b);
    console.log('mv  ', a, '->', b);
  } else console.log('SKIP (no existe):', a);
}
function edit(f, pairs) {
  if (!fs.existsSync(f)) { console.log('SKIP edit (no existe):', f); return; }
  let s = fs.readFileSync(f, 'utf8'); let n = 0;
  for (const [a, b] of pairs) { if (s.includes(a)) { s = s.split(a).join(b); n++; } }
  fs.writeFileSync(f, s);
  console.log('edit', f, `${n}/${pairs.length}`);
}

const smap = {
  auth:    ['adpro-auth', 'playwright-auth', 'torre'],
  testing: ['apiTest', 'uiTest', 'e2e', 'e2e-ai', 'batchHistory'],
  addons:  ['addon', 'addon-installer'],
  catalog: ['module'],
};

// 1) mover services a su dominio
for (const [dom, files] of Object.entries(smap))
  for (const f of files) mv(`src/services/${f}.service.ts`, `src/services/${dom}/${f}.service.ts`);

// 2) Step A: en cada service movido, '../X' -> '../../X' (config/helpers/models suben 1 nivel)
for (const [dom, files] of Object.entries(smap))
  for (const f of files) {
    const p = `src/services/${dom}/${f}.service.ts`;
    if (!fs.existsSync(p)) continue;
    const s = fs.readFileSync(p, 'utf8').split("from '../").join("from '../../");
    fs.writeFileSync(p, s);
  }
console.log('Step A aplicado (../ -> ../../)');

// 3) Step B: imports ENTRE services que cruzan de dominio (quedaron como './x' pero ahora estan en otro dir)
edit('src/services/addons/addon-installer.service.ts', [["from './adpro-auth.service'", "from '../auth/adpro-auth.service'"]]);
edit('src/services/testing/apiTest.service.ts',       [["from './playwright-auth.service'", "from '../auth/playwright-auth.service'"]]);
edit('src/services/testing/e2e.service.ts',           [["from './torre.service'", "from '../auth/torre.service'"]]);
edit('src/services/testing/uiTest.service.ts',        [["from './torre.service'", "from '../auth/torre.service'"]]);

// 4) Step C: controllers -> services/<dominio>
edit('src/controllers/addons/addon.controller.ts', [
  ["'../../services/addon.service'", "'../../services/addons/addon.service'"],
  ["'../../services/addon-installer.service'", "'../../services/addons/addon-installer.service'"],
]);
edit('src/controllers/auth/auth.controller.ts', [
  ["'../../services/adpro-auth.service'", "'../../services/auth/adpro-auth.service'"],
  ["'../../services/playwright-auth.service'", "'../../services/auth/playwright-auth.service'"],
]);
edit('src/controllers/auth/torre.controller.ts', [["'../../services/torre.service'", "'../../services/auth/torre.service'"]]);
edit('src/controllers/catalog/modules.controller.ts', [["'../../services/module.service'", "'../../services/catalog/module.service'"]]);
edit('src/controllers/testing/apiTests.controller.ts', [
  ["'../../services/apiTest.service'", "'../../services/testing/apiTest.service'"],
  ["'../../services/batchHistory.service'", "'../../services/testing/batchHistory.service'"],
]);
edit('src/controllers/testing/batchHistory.controller.ts', [["'../../services/batchHistory.service'", "'../../services/testing/batchHistory.service'"]]);
edit('src/controllers/testing/e2e.controller.ts', [
  ["'../../services/e2e.service'", "'../../services/testing/e2e.service'"],
  ["'../../services/e2e-ai.service'", "'../../services/testing/e2e-ai.service'"],
]);
edit('src/controllers/testing/uiTests.controller.ts', [["'../../services/uiTest.service'", "'../../services/testing/uiTest.service'"]]);

// 5) Step D: app.ts
edit('src/app.ts', [["'./services/torre.service'", "'./services/auth/torre.service'"]]);

// 6) limpiar src/utils vacio
mv('src/utils', '_to_delete/utils-empty');

console.log('Fase 3 lista.');
