/**
 * Verifica la cadena COMPLETA de auth con el token admin (keyC), sin cbr:
 *   1) /API/Cliente/Empresas
 *   2) /API/Cliente/{IdOrigen}/Empresa/{IdEmpresa}/Sucursales
 *   3) /API/Auth/Sesion/IniciarMovil/{IdOrigen}/Empresa/{IdEmpresa}/Sucursal/{IdSucursal}
 * Todo con contexto LIMPIO (solo Bearer + X-SincoERP-Authorization).
 *
 * Uso:  cd C:\testPlatform\backend  &&  node scripts/verify-full-keyc.js [loginUrl] [keyC]
 */
const { chromium } = require('playwright');

const LOGIN_URL   = process.argv[2] || 'https://www5.sincoerp.com/SincoArchitecture/V3/Marco/Login.aspx';
const KEYC        = process.argv[3] || '09D0A422FEC91C85F890A0D70634F70C22C6BBD9X0';
const USUARIO     = process.argv[4] || 'admin';
const USU_DOMINIO = 'sinco\\diego.sanchez';
const urlRaiz     = LOGIN_URL.replace(/\/Marco\/Login\.aspx.*$/i, '');

function unwrap(v) { try { const p = JSON.parse(v); if (typeof p === 'string') return p; } catch {} return v || ''; }

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();

  await page.goto('about:blank');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {}),
    page.evaluate((d) => {
      const f = document.createElement('form'); f.method = 'POST'; f.action = d.action;
      for (const [k, v] of Object.entries(d.fields)) { const i = document.createElement('input'); i.type = 'hidden'; i.name = k; i.value = String(v); f.appendChild(i); }
      document.body.appendChild(f); f.submit();
    }, { action: LOGIN_URL, fields: { keyC: KEYC, ingreso: '0', usuDominio: USU_DOMINIO, usuario: USUARIO } }),
  ]);
  await page.waitForTimeout(3500);
  console.log('\nURL tras keyC:', page.url());
  if (/Login_iv/i.test(page.url())) { console.log('❌ keyC no autenticó.'); await browser.close(); process.exit(1); }

  const store = await page.evaluate(() => { const d = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); d[k] = localStorage.getItem(k); } return d; });
  const bearer  = unwrap(store[Object.keys(store).find((k) => /_token$/i.test(k) && !/_token_auth$/i.test(k))] || '');
  const authTok = unwrap(store[Object.keys(store).find((k) => /_token_auth$/i.test(k))] || '');
  console.log('token     :', bearer ? bearer.slice(0, 40) + '...' : '(ninguno)');
  console.log('token_auth:', authTok ? authTok.slice(0, 30) + '...' : '(ninguno)');

  const clean = await browser.newContext({ ignoreHTTPSErrors: true });
  const req = clean.request;
  const H = { Authorization: bearer, 'X-SincoERP-Authorization': authTok };
  const getJson = async (url) => { const r = await req.get(url, { headers: H }); const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {} return { status: r.status(), text: t, json: j }; };

  // 1) Empresas
  const emp = await getJson(`${urlRaiz}/API/Cliente/Empresas`);
  console.log(`\n1) Empresas        -> ${emp.status} | ${emp.text.slice(0, 120).replace(/\s+/g, ' ')}`);
  if (!emp.json || !emp.json.length) { console.log('   (sin empresas, corto aquí)'); await browser.close(); process.exit(0); }
  const e0 = emp.json[0];
  const origen = e0.IdOrigen, empId = e0.IdEmpresa;
  console.log(`   usando empresa: IdOrigen=${origen}, IdEmpresa=${empId}, "${e0.Nombre}"`);

  // 2) Sucursales
  const suc = await getJson(`${urlRaiz}/API/Cliente/${origen}/Empresa/${empId}/Sucursales`);
  console.log(`\n2) Sucursales      -> ${suc.status} | ${suc.text.slice(0, 160).replace(/\s+/g, ' ')}`);
  const s0 = suc.json && suc.json.length ? suc.json[0] : null;
  const sucId = s0 ? (s0.Id ?? s0.IdSucursal ?? 0) : 0;
  if (s0) console.log(`   usando sucursal: Id=${sucId}, "${s0.Nombre ?? ''}"`);

  // 3) IniciarMovil (token de sesión)
  const ini = await getJson(`${urlRaiz}/API/Auth/Sesion/IniciarMovil/${origen}/Empresa/${empId}/Sucursal/${sucId}`);
  console.log(`\n3) IniciarMovil    -> ${ini.status} | ${ini.text.slice(0, 160).replace(/\s+/g, ' ')}`);

  console.log('\n=== RESUMEN ===');
  console.log('Empresas   :', emp.status === 200 ? '✅' : '❌ ' + emp.status);
  console.log('Sucursales :', suc.status === 200 ? '✅' : '❌ ' + suc.status);
  console.log('IniciarMovil:', ini.status === 200 ? '✅' : '❌ ' + ini.status);

  await clean.close();
  await page.waitForTimeout(5000);
  await browser.close();
  process.exit(0);
})();
