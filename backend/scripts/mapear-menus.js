/**
 * Vuelca la estructura de menús de un entorno SINCO usando el token admin (keyC).
 * v2: con diagnóstico (URL tras login, token capturado, y prueba de /API/Cliente/Empresas).
 * Uso:  cd C:\testPlatform\backend
 *       node scripts/mapear-menus.js [loginUrl] [keyC]
 */
const { chromium } = require('playwright');
const fs = require('fs');

const LOGIN_URL   = process.argv[2] || 'https://www5.sincoerp.com/SincoArchitecture/V3/Marco/Login.aspx';
const KEYC        = process.argv[3] || '09D0A422FEC91C85F890A0D70634F70C22C6BBD9X0';
const USUARIO     = process.argv[4] || 'admin';
const USU_DOMINIO = 'sinco\\diego.sanchez';
const urlRaiz     = LOGIN_URL.replace(/\/Marco\/Login\.aspx.*$/i, '');

const ENDPOINTS = [
  'API/Cliente/Empresas',          // conocido-bueno (control)
  'API/Menus/Modulos',
  'API/Menus/Aplicacion',
  'API/Menus/GestionConfig',
  'API/Menus/AccesoRapido',
  'API/Menus/TipoEmergente',
];

const unwrap = (v) => { try { const p = JSON.parse(v); if (typeof p === 'string') return p; } catch {} return v || ''; };
function shape(val) {
  if (Array.isArray(val)) return `Array(${val.length})` + (val.length ? ` de ${shape(val[0])}` : '');
  if (val && typeof val === 'object') return `{ ${Object.keys(val).slice(0, 12).join(', ')} }`;
  return typeof val;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();

  // Capturar respuestas de /API/Menus/* que haga la propia SPA (por si el token directo no basta)
  const sniff = {};
  page.on('response', async (res) => {
    const u = res.url();
    if (/\/API\/Menus\//i.test(u) && res.status() === 200) {
      try { sniff[u.split('/API/')[1]] = await res.json(); } catch {}
    }
  });

  await page.goto('about:blank');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {}),
    page.evaluate((d) => {
      const f = document.createElement('form'); f.method = 'POST'; f.action = d.action;
      for (const [k, v] of Object.entries(d.fields)) { const i = document.createElement('input'); i.type = 'hidden'; i.name = k; i.value = String(v); f.appendChild(i); }
      document.body.appendChild(f); f.submit();
    }, { action: LOGIN_URL, fields: { keyC: KEYC, ingreso: '0', usuDominio: USU_DOMINIO, usuario: USUARIO } }),
  ]);
  await page.waitForTimeout(4000);

  console.log('\n================ DIAGNÓSTICO ================');
  console.log('urlRaiz          :', urlRaiz);
  console.log('URL tras keyC    :', page.url());
  const store = await page.evaluate(() => { const d = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); d[k] = localStorage.getItem(k); } return d; });
  const tokKeys = Object.keys(store).filter((k) => /_token(_auth)?$/i.test(k));
  console.log('claves de token  :', tokKeys.length ? tokKeys.join(', ') : '(ninguna)');
  const bearer  = unwrap(store[tokKeys.find((k) => !/_token_auth$/i.test(k))] || '');
  const authTok = unwrap(store[tokKeys.find((k) => /_token_auth$/i.test(k))] || '');
  console.log('token            :', bearer ? bearer.slice(0, 45) + '...' : '(VACÍO)');
  console.log('token_auth       :', authTok ? authTok.slice(0, 35) + '...' : '(VACÍO)');
  console.log('============================================\n');

  const clean = await browser.newContext({ ignoreHTTPSErrors: true });
  const H = { Authorization: bearer, 'X-SincoERP-Authorization': authTok };
  const dump = { urlRaiz, urlTrasLogin: page.url(), token: bearer.slice(0, 20) + '…', endpoints: {} };

  for (const ep of ENDPOINTS) {
    try {
      const r = await clean.request.get(`${urlRaiz}/${ep}`, { headers: H });
      const txt = await r.text();
      let json = null; try { json = JSON.parse(txt); } catch {}
      dump.endpoints[ep] = { status: r.status(), data: json ?? txt.slice(0, 500) };
      console.log(`${ep.padEnd(24)} -> ${r.status()}  ${json ? shape(json) : '(no-json) ' + txt.slice(0, 50)}`);
    } catch (e) {
      dump.endpoints[ep] = { status: 0, error: e.message };
      console.log(`${ep.padEnd(24)} -> ERROR ${e.message}`);
    }
  }

  // Lo que la SPA misma haya cargado de menús (si el token directo falló)
  if (Object.keys(sniff).length) {
    console.log('\n(SPA cargó estos menús por su cuenta):', Object.keys(sniff).join(', '));
    dump.sniffSPA = sniff;
  }

  fs.writeFileSync('menus-dump.json', JSON.stringify(dump, null, 2));
  console.log('\nGuardado completo en: menus-dump.json');
  await clean.close();
  await browser.close();
  process.exit(0);
})();
