/**
 * Parchea src/services/uiTest.service.ts para que el ingreso del E2E use el
 * keyC estilo Torre (usuario ERP, ej: admin) ANTES del login web con credenciales dev.
 * Maneja CRLF (Windows) correctamente.
 * Uso:  cd C:\testPlatform\backend  &&  node scripts/patch-uitest2.js
 */
const fs = require('fs');
const path = require('path');

const file  = path.resolve('src/services/uiTest.service.ts');
const block = fs.readFileSync(path.resolve('scripts/keyc-block.txt'), 'utf8').replace(/\r\n/g, '\n').replace(/\n$/, '');

const original = fs.readFileSync(file, 'utf8');
const crlf = original.includes('\r\n');
let src = original.replace(/\r\n/g, '\n');   // normalizar a \n para procesar
let changes = 0;

// Respaldo (contenido original tal cual)
fs.writeFileSync(file + '.bak', original);
console.log('Backup:', file + '.bak', '| CRLF:', crlf);

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
    if (!src.includes(anchor)) { console.error('ERROR: no encontré el ancla del login web (tras normalizar)'); process.exit(1); }
    const replacement = block +
        "\n\n    console.log('[UI Playwright] Attempting web login (respaldo)');\n\n    const roots = [page.mainFrame(),";
    src = src.replace(anchor, replacement);
    changes++;
    console.log('· bloque keyC: insertado');
}

// Restaurar el estilo de salto de línea original
const out = crlf ? src.replace(/\n/g, '\r\n') : src;
fs.writeFileSync(file, out);
console.log('LISTO. Cambios aplicados:', changes, '| tamaño final:', out.length, 'bytes');
