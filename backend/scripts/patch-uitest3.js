/**
 * Reemplaza COMPLETA la función tryWebLogin en uiTest.service.ts por una versión
 * que ingresa SOLO por keyC (estilo Torre), sin ningún login con credenciales dev.
 * Uso:  cd C:\testPlatform\backend  &&  node scripts/patch-uitest3.js
 */
const fs = require('fs');
const path = require('path');

const file = path.resolve('src/services/uiTest.service.ts');
const fn   = fs.readFileSync(path.resolve('scripts/newfunc.txt'), 'utf8').replace(/\r\n/g, '\n').replace(/\n+$/, '\n');

const original = fs.readFileSync(file, 'utf8');
const crlf = original.includes('\r\n');
let src = original.replace(/\r\n/g, '\n');

fs.writeFileSync(file + '.bak2', original);
console.log('Backup:', file + '.bak2', '| CRLF:', crlf);

const startMark = 'async function tryWebLogin(page: Page): Promise<void> {';
const endMark   = 'async function applyMarcoSelection';
const s = src.indexOf(startMark);
const e = src.indexOf(endMark);
if (s < 0 || e < 0 || e < s) {
    console.error('ERROR: no encontré límites (tryWebLogin=' + s + ', applyMarcoSelection=' + e + ')');
    process.exit(1);
}

src = src.slice(0, s) + fn.replace(/\n$/, '') + '\n\n' + src.slice(e);

// Asegurar import de torreService
if (!src.includes("import { torreService } from './torre.service';")) {
    src = src.replace(
        "import { envs } from '../config/envs';",
        "import { envs } from '../config/envs';\nimport { torreService } from './torre.service';"
    );
    console.log('· import torreService: agregado');
}

// Verificar que ya no queden credenciales dev en tryWebLogin
const dev = (src.match(/envs\.NOM_USUARIO|envs\.CLAVE_USUARIO/g) || []).length;

const out = crlf ? src.replace(/\n/g, '\r\n') : src;
fs.writeFileSync(file, out);
console.log('LISTO. tryWebLogin ahora es SOLO keyC. Referencias a credenciales dev restantes en el archivo:', dev, '| bytes:', out.length);
