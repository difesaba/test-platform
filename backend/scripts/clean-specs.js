/**
 * Elimina de TODOS los specs E2E grabados cualquier línea que contenga las
 * credenciales de desarrollo (desarrolladorcbr / Desarrolladorcbr2019).
 * En ejecución esas líneas ya se ignoran (el login lo hace el keyC), esto solo
 * las borra del disco (incluida la contraseña en texto plano).
 * Uso:  cd C:\testPlatform\backend  &&  node scripts/clean-specs.js
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve('workspace/modules');
const changed = [];

function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith('.spec.ts')) {
            const orig = fs.readFileSync(p, 'utf8');
            const crlf = orig.includes('\r\n');
            const lines = orig.split(/\r?\n/);
            const kept = lines.filter((l) => !/desarrolladorcbr/i.test(l));
            if (kept.length !== lines.length) {
                fs.writeFileSync(p, kept.join(crlf ? '\r\n' : '\n'));
                changed.push({ file: p, removed: lines.length - kept.length });
            }
        }
    }
}

if (fs.existsSync(root)) walk(root);
console.log('Specs limpiados:', changed.length);
changed.forEach((c) => console.log('  -', c.removed, 'línea(s):', c.file.replace(root, 'workspace/modules')));
