/**
 * Fase 1 reestructura backend: mover crypto/runtime-url a helpers/ y recablear imports.
 * Uso: cd C:\testPlatform\backend && node scripts/patch-back-phase1.js
 */
const fs = require('fs');
const path = require('path');

function mv(a, b) {
  if (fs.existsSync(a)) {
    fs.mkdirSync(path.dirname(b), { recursive: true });
    fs.renameSync(a, b);
    console.log('mv  ', a, '->', b);
  } else console.log('SKIP mv (no existe):', a);
}

mv('src/services/crypto.service.ts', 'src/helpers/crypto.ts');
mv('src/utils/runtime-url.ts', 'src/helpers/runtime-url.ts');

const edits = [
  ['src/services/addon.service.ts', "from './crypto.service'", "from '../helpers/crypto'"],
  ['src/services/torre.service.ts', "from './crypto.service'", "from '../helpers/crypto'"],
  ['src/presentation/controllers/e2e.controller.ts', "from '../../utils/runtime-url'", "from '../../helpers/runtime-url'"],
  ['src/presentation/controllers/uiTests.controller.ts', "from '../../utils/runtime-url'", "from '../../helpers/runtime-url'"],
];
for (const [f, a, b] of edits) {
  if (!fs.existsSync(f)) { console.log('SKIP edit (no existe):', f); continue; }
  const s = fs.readFileSync(f, 'utf8');
  if (s.includes(a)) { fs.writeFileSync(f, s.split(a).join(b)); console.log('edit', f); }
  else console.log('SKIP edit (no match):', f);
}
console.log('Fase 1 lista.');
