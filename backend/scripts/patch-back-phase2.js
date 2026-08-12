/**
 * Fase 2 reestructura backend: mover controllers a controllers/<dominio>/ y
 * sacar la carpeta presentation/ vieja (routes.ts, server.ts, middleware) a _to_delete.
 * Uso: cd C:\testPlatform\backend && node scripts/patch-back-phase2.js
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

const C = 'src/presentation/controllers';
const map = {
  auth:    ['auth', 'torre'],
  catalog: ['environments', 'clients', 'sinco', 'modules'],
  addons:  ['addon'],
  testing: ['apiTests', 'uiTests', 'e2e', 'batchHistory', 'swagger'],
};

for (const [dom, files] of Object.entries(map)) {
  for (const f of files) {
    mv(`${C}/${f}.controller.ts`, `src/controllers/${dom}/${f}.controller.ts`);
  }
}

// Sacar la presentation/ vieja (ya reemplazada por routes/, server.ts, middlewares/)
mv('src/presentation', '_to_delete/presentation-old');

console.log('Fase 2 movimientos listos.');
