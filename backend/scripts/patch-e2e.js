/**
 * Cambia el login del E2E (e2e.service.ts) a keyC (estilo Torre, usuario admin),
 * eliminando el uso de NOM_USUARIO/CLAVE_USUARIO. Maneja CRLF.
 * Uso:  cd C:\testPlatform\backend  &&  node scripts/patch-e2e.js
 */
const fs = require('fs');
const path = require('path');

const file     = path.resolve('src/services/e2e.service.ts');
const preamble = fs.readFileSync(path.resolve('scripts/e2e-keyc-preamble.txt'), 'utf8').replace(/\r\n/g, '\n').replace(/\n+$/, '');
const newTwl   = fs.readFileSync(path.resolve('scripts/e2e-newtwl.txt'), 'utf8').replace(/\r\n/g, '\n').replace(/\n+$/, '');

const orig = fs.readFileSync(file, 'utf8');
const crlf = orig.includes('\r\n');
let src = orig.replace(/\r\n/g, '\n');
fs.writeFileSync(file + '.bak3', orig);

const steps = [];
const must = (c, m) => { if (!c) { console.error('ERROR:', m); process.exit(1); } };

// A) import torreService
if (!src.includes("import { torreService } from './torre.service';")) {
    must(src.includes("import { envs } from '../config/envs';"), 'no envs import');
    src = src.replace("import { envs } from '../config/envs';", "import { envs } from '../config/envs';\nimport { torreService } from './torre.service';");
    steps.push('import');
}

// B) buildRunSpec -> async
const sigOld = "    private buildRunSpec(specContent: string, ctx: AdproSessionContext, targetUrl?: string, adproToken?: any): string {";
const sigNew = "    private async buildRunSpec(specContent: string, ctx: AdproSessionContext, targetUrl?: string, adproToken?: any): Promise<string> {";
if (src.includes(sigOld)) { src = src.replace(sigOld, sigNew); steps.push('sig async'); }
else must(src.includes(sigNew), 'no buildRunSpec sig');

// C) caller -> await
const callOld = "            specSrc = this.buildRunSpec(specSrc, sessionContext, targetUrl, adproToken);";
const callNew = "            specSrc = await this.buildRunSpec(specSrc, sessionContext, targetUrl, adproToken);";
if (src.includes(callOld)) { src = src.replace(callOld, callNew); steps.push('caller await'); }
else must(src.includes(callNew), 'no caller');

// D) reemplazar preamble de credenciales por keyC
if (!src.includes('Auth preamble keyC (TestPlatform')) {
    const dStart = "        const nomUsuario   = JSON.stringify(envs.NOM_USUARIO);";
    const dEnd   = "        ].join('\\n');";
    const s = src.indexOf(dStart); must(s >= 0, 'no dStart (nomUsuario)');
    const e = src.indexOf(dEnd, s); must(e >= 0, 'no dEnd');
    src = src.slice(0, s) + preamble + src.slice(e + dEnd.length);
    steps.push('preamble keyC');
} else steps.push('preamble ya');

// E) reemplazar tryWebLogin por keyC
if (!src.includes('[E2E Playwright] Ingreso keyC (Torre)')) {
    const twStart = "async function tryWebLogin(page: Page): Promise<void> {";
    const s = src.indexOf(twStart); must(s >= 0, 'no tryWebLogin');
    const close = src.indexOf('\n}\n', s); must(close >= 0, 'no cierre tryWebLogin');
    src = src.slice(0, s) + newTwl + '\n' + src.slice(close + 2);
    steps.push('tryWebLogin keyC');
} else steps.push('tryWebLogin ya');

const dev = (src.match(/envs\.NOM_USUARIO|envs\.CLAVE_USUARIO/g) || []).length;
const out = crlf ? src.replace(/\n/g, '\r\n') : src;
fs.writeFileSync(file, out);
console.log('LISTO:', steps.join(', '), '| credenciales dev restantes:', dev, '| bytes:', out.length);
