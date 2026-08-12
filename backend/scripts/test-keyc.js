/**
 * Prueba aislada del POST keyC a Login.aspx, variando el `usuario`.
 * Navegador VISIBLE para verlo.
 *
 * Uso:
 *   node scripts/test-keyc.js                 -> usa keyC conocida y usuario=admin
 *   node scripts/test-keyc.js <keyC> <usuario>
 *
 * Qué mirar: al final imprime "URL FINAL". Si termina en Seleccion_iv.aspx => ACEPTADO.
 * Si termina en Login_iv.aspx => RECHAZADO.
 */
const { chromium } = require('playwright');

const LOGIN_URL = 'https://www5.sincoerp.com/SincoArchitecture/V3/Marco/Login.aspx';
// keyC observada (estable) — pásala por argumento si tienes una fresca.
const KEYC_DEFAULT = '09D0A422FEC91C85F890A0D70634F70C22C6BBD9X0';
const USU_DOMINIO  = 'sinco\\diego.sanchez';

const keyC    = process.argv[2] || KEYC_DEFAULT;
const usuario = process.argv[3] || 'admin';

(async () => {
  console.log(`\n>>> Probando POST Login.aspx  |  usuario="${usuario}"  keyC=${keyC.slice(0, 8)}...\n`);
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();

  page.on('framenavigated', (f) => { if (f === page.mainFrame()) console.log('  navegó a:', f.url()); });

  await page.goto('about:blank');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 45000 }).catch((e) => console.log('  waitNav:', e.message)),
    page.evaluate((data) => {
      const f = document.createElement('form');
      f.method = 'POST';
      f.action = data.action;
      for (const [k, v] of Object.entries(data.fields)) {
        const i = document.createElement('input');
        i.type = 'hidden'; i.name = k; i.value = String(v);
        f.appendChild(i);
      }
      document.body.appendChild(f);
      f.submit();
    }, { action: LOGIN_URL, fields: { keyC, ingreso: '0', usuDominio: USU_DOMINIO, usuario } }),
  ]);

  await page.waitForTimeout(3500);
  const url = page.url();
  const title = await page.title().catch(() => '');
  console.log('\n================ RESULTADO ================');
  console.log('  usuario  :', usuario);
  console.log('  URL FINAL:', url);
  console.log('  title    :', title);
  if (/Seleccion/i.test(url)) console.log('  >>> ✅ ACEPTADO (llegó a Selección)');
  else if (/Login_iv/i.test(url)) console.log('  >>> ❌ RECHAZADO (rebotó a Login_iv)');
  else console.log('  >>> ⚠️  URL inesperada, revisar');
  console.log('==========================================\n');

  console.log('Dejo el navegador abierto 20s para que lo veas...');
  await page.waitForTimeout(20000);
  await browser.close();
  process.exit(0);
})();
