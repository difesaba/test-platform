/**
 * Verifica si el token de admin (obtenido por keyC) permite listar empresas
 * SIN usar credenciales cbr (/API/Auth/Usuario).
 *
 * Uso:  cd C:\testPlatform\backend
 *       node scripts/verify-empresas-keyc.js [loginUrl] [keyC] [usuario]
 *
 * Interpretación:
 *  - [cookies]        → sirve la SESIÓN del navegador (keyC) → rediseño usando cookies.
 *  - [bearer+cookies] → sirve el token con la sesión abierta.
 *  - [bearer-limpio]  → sirve SOLO el Bearer sin cookies → rediseño 100% backend (ideal).
 */
const { chromium } = require('playwright');

const LOGIN_URL   = process.argv[2] || 'https://www5.sincoerp.com/SincoArchitecture/V3/Marco/Login.aspx';
const KEYC        = process.argv[3] || '09D0A422FEC91C85F890A0D70634F70C22C6BBD9X0';
const USUARIO     = process.argv[4] || 'admin';
const USU_DOMINIO = 'sinco\\diego.sanchez';
const urlRaiz     = LOGIN_URL.replace(/\/Marco\/Login\.aspx.*$/i, '');
const empresasUrl = `${urlRaiz}/API/Cliente/Empresas`;

function unwrap(v) { try { const p = JSON.parse(v); if (typeof p === 'string') return p; } catch {} return v || ''; }

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();

  // 1) Login keyC (admin)
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
  if (/Login_iv/i.test(page.url())) { console.log('❌ El keyC no autenticó (Login_iv). ¿keyC vieja? Pásala fresca como 2º argumento.'); await browser.close(); process.exit(1); }

  // 2) Capturar tokens reales del storage
  const store = await page.evaluate(() => { const d = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); d[k] = localStorage.getItem(k); } return d; });
  const tokenKey = Object.keys(store).find((k) => /_token$/i.test(k) && !/_token_auth$/i.test(k));
  const authKey  = Object.keys(store).find((k) => /_token_auth$/i.test(k));
  const bearer   = unwrap(tokenKey ? store[tokenKey] : '');   // "Bearer xxx"
  const authTok  = unwrap(authKey ? store[authKey] : '');     // JWT
  console.log('token     :', bearer ? bearer.slice(0, 45) + '...' : '(ninguno)');
  console.log('token_auth:', authTok ? authTok.slice(0, 35) + '...' : '(ninguno)');
  console.log('\nProbando endpoint:', empresasUrl, '\n');

  const show = async (label, res) => {
    const t = await res.text();
    console.log(`[${label}] status ${res.status()} | body: ${t.slice(0, 220).replace(/\s+/g, ' ')}`);
  };

  // Prueba A: sesión del navegador (cookies del keyC)
  try { await show('cookies', await page.request.get(empresasUrl)); }
  catch (e) { console.log('[cookies] error', e.message); }

  // Prueba B: cookies + Bearer + X-SincoERP-Authorization
  try { await show('bearer+cookies', await page.request.get(empresasUrl, { headers: { Authorization: bearer, 'X-SincoERP-Authorization': authTok } })); }
  catch (e) { console.log('[bearer+cookies] error', e.message); }

  // Prueba C: contexto LIMPIO (sin cookies) — solo Bearer. Si sirve, rediseño 100% backend.
  try {
    const clean = await browser.newContext({ ignoreHTTPSErrors: true });
    const cleanReq = clean.request;
    await show('bearer-limpio', await cleanReq.get(empresasUrl, { headers: { Authorization: bearer, 'X-SincoERP-Authorization': authTok } }));
    await clean.close();
  } catch (e) { console.log('[bearer-limpio] error', e.message); }

  console.log('\n(Se cierra en 8s)');
  await page.waitForTimeout(8000);
  await browser.close();
  process.exit(0);
})();
