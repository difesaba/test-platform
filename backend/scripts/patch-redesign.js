/**
 * Rediseño auth sin cbr:
 *  - playwright-auth.service.ts : agrega captureAdproToken (token admin keyC, cacheado)
 *  - addon-installer.service.ts : quita NOM_USUARIO/CLAVE_USUARIO de las llamadas
 *  - apiTest.service.ts         : usa captureAdproToken + doble token, quita cbr
 * Maneja CRLF. Uso:  cd C:\testPlatform\backend  &&  node scripts/patch-redesign.js
 */
const fs = require('fs');
const path = require('path');

const read = (p) => fs.readFileSync(path.resolve(p), 'utf8');
const norm = (s) => s.replace(/\r\n/g, '\n');
function save(file, orig, src) {
    const out = orig.includes('\r\n') ? src.replace(/\n/g, '\r\n') : src;
    fs.writeFileSync(file, out);
}
const must = (c, m) => { if (!c) { console.error('ERROR:', m); process.exit(1); } };

// ── 1) playwright-auth.service.ts : append captureAdproToken ──────────────────
{
    const file = path.resolve('src/services/playwright-auth.service.ts');
    const orig = read(file);
    let src = norm(orig);
    if (!src.includes('export async function captureAdproToken')) {
        const append = norm(read('scripts/append-capture.txt')).replace(/\n+$/, '\n');
        src = src.replace(/\n*$/, '\n') + append;
        save(file, orig, src);
        console.log('· playwright-auth: captureAdproToken agregado');
    } else console.log('· playwright-auth: ya tenía captureAdproToken');
}

// ── 2) addon-installer.service.ts : quitar creds ─────────────────────────────
{
    const file = path.resolve('src/services/addon-installer.service.ts');
    const orig = read(file);
    let src = norm(orig);
    const reps = [
        ['authSvc.getEmpresas(base, envs.NOM_USUARIO, envs.CLAVE_USUARIO)', 'authSvc.getEmpresas(base)'],
        ['authSvc.getSucursales(base, envs.NOM_USUARIO, envs.CLAVE_USUARIO, 1, empresaId)', 'authSvc.getSucursales(base, 1, empresaId)'],
        ['authSvc.login(base, envs.NOM_USUARIO, envs.CLAVE_USUARIO, 1, empresaId, sucursales[0].Id)', 'authSvc.login(base, 1, empresaId, sucursales[0].Id)'],
    ];
    let n = 0;
    for (const [a, b] of reps) { if (src.includes(a)) { src = src.split(a).join(b); n++; } }
    save(file, orig, src);
    console.log('· addon-installer: reemplazos', n, '/ 3');
}

// ── 3) apiTest.service.ts : captureAdproToken + doble token ──────────────────
{
    const file = path.resolve('src/services/apiTest.service.ts');
    const orig = read(file);
    let src = norm(orig);

    // import captureAdproToken (una vez)
    if (!src.includes("import { captureAdproToken }")) {
        must(src.includes("import { randomUUID } from 'crypto';"), 'no randomUUID import en apiTest');
        src = src.replace("import { randomUUID } from 'crypto';", "import { randomUUID } from 'crypto';\nimport { captureAdproToken } from './playwright-auth.service';");
    }
    // quitar import encryptPassword (ya no se usa)
    src = src.replace(/\nimport \{ encryptPassword \} from '\.\/crypto\.service';/, '');

    // reemplazar bloque de auth cbr por keyC
    const oldA = norm(read('scripts/apitest-oldauth.txt')).replace(/\n$/, '');
    const newA = norm(read('scripts/apitest-newauth.txt')).replace(/\n$/, '');
    if (src.includes(oldA)) { src = src.replace(oldA, newA); console.log('· apiTest: bloque auth reemplazado'); }
    else must(src.includes('captureAdproToken(`${company.urlRaiz}/Marco/Login.aspx`)'), 'no encontré bloque auth apiTest');

    // authorizationToken junto a authHeader
    if (!src.includes('const authorizationToken')) {
        const a = src.indexOf('const authHeader  = accessToken ?');
        must(a >= 0, 'no authHeader en apiTest');
        const nl = src.indexOf('\n', a);
        src = src.slice(0, nl + 1) + "            const authorizationToken = token?.authorization_token ?? token?.AuthorizationToken ?? '';\n" + src.slice(nl + 1);
    }
    // header X-SincoERP-Authorization junto al Authorization
    if (!src.includes("headers['X-SincoERP-Authorization'] = authorizationToken")) {
        const anchor = "if (authHeader && !headers['Authorization']) headers['Authorization'] = authHeader;";
        const a = src.indexOf(anchor);
        must(a >= 0, 'no header Authorization en apiTest');
        const nl = src.indexOf('\n', a);
        src = src.slice(0, nl + 1) + "                if (authorizationToken && !headers['X-SincoERP-Authorization']) headers['X-SincoERP-Authorization'] = authorizationToken;\n" + src.slice(nl + 1);
    }
    save(file, orig, src);
    const devLeft = (src.match(/envs\.NOM_USUARIO|envs\.CLAVE_USUARIO|encryptPassword/g) || []).length;
    console.log('· apiTest: listo | refs cbr/encrypt restantes:', devLeft);
}

console.log('\nPATCH-REDESIGN OK');
