/**
 * Parchea src/services/uiTest.service.ts para que el ingreso del E2E use el
 * keyC estilo Torre (usuario ERP, ej: admin) ANTES del login web con credenciales dev.
 * Uso:  cd C:\testPlatform\backend  &&  node scripts/patch-uitest.js
 */
const fs = require('fs');
const path = require('path');

const file  = path.resolve('src/services/uiTest.service.ts');
const block = fs.readFileSync(path.resolve('scripts/keyc-block.txt'), 'utf8').replace(/\r\n/g, '\n');

let src = fs.readFileSync(file, 'utf8');
let changes = 0;

// Respaldo
fs.writeFileSync(file + '.bak', src);
console.log('Backup:', file + '.bak');

// 1) import torreService
if (src.includes("import { torreService } from './torre.service';")) {
    console.log('· import torreService: ya estaba');
} else {
    const impFind = "import { envs } from '../config/envs';";
    if (!src.includes(impFind)) { console.error('ERROR: no encontré el import de envs'); process.exit(1); }
    src = src.replace(impFind, impFind + "\nimport { torreService } from './torre.service';");
    changes++;
    console.log('· import torreService: agregado');
}

// 2) insertar bloque keyC antes del login web (respaldo)
if (src.includes('Ingreso keyC (Torre)')) {
    console.log('· bloque keyC: ya estaba');
} else {
    const anchor = "    console.log('[UI Playwright] Attempting web login');\n\n    const roots = [page.mainFrame(),";
    if (!src.includes(anchor)) { console.error('ERROR: no encontré el ancla del login web'); process.exit(1); }
    const replacement = block.replace(/\n$/, '') +
        "\n\n    console.log('[UI Playwright] Attempting web login (respaldo)');\n\n    const roots = [page.mainFrame(),";
    src = src.replace(anchor, replacement);
    changes++;
    console.log('· bloque keyC: insertado');
}

fs.writeFileSync(file, src);
console.log('LISTO. Cambios aplicados:', changes, '| tamaño final:', src.length, 'bytes');
