/**
 * Captura el flujo real de Torre al entrar a una empresa (v2).
 * Uso:  cd C:\testPlatform\backend  &&  node scripts/capturar-torre.js
 *
 * Novedad v2: intercepta a nivel de contexto TODAS las peticiones a
 * www5.sincoerp.com (incluida la 1ª navegación de la pestaña nueva),
 * para capturar el METODO (GET/POST), la URL completa y el CUERPO (postData)
 * del Login.aspx que hace el ingreso centralizado.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = path.join(process.cwd(), 'captura-torre.txt');
const log = [];

function esAsset(u) {
  return /\.(css|js|mjs|png|jpe?g|gif|svg|webp|woff2?|ttf|eot|ico|map)(\?|$)/i.test(u);
}
function hora() { return new Date().toISOString().slice(11, 19); }
function push(line) { console.log(line); log.push(line); }

function attach(page, label) {
  page.on('request', (req) => {
    const u = req.url();
    if (esAsset(u) || !/sincoerp\.com/i.test(u)) return;
    let body = '';
    try { body = req.postData() || ''; } catch {}
    push(`${hora()} [${label}] ${req.method()} ${u}${body ? '\n        PAYLOAD: ' + body.slice(0, 1500) : ''}`);
  });
  page.on('response', (res) => {
    const u = res.url();
    if (esAsset(u) || !/sincoerp\.com/i.test(u)) return;
    const st = res.status();
    if (st >= 300 && st < 400) {
      push(`${hora()} [${label}] <-- ${st} REDIRECT ${u}  ->  Location: ${res.headers()['location'] || ''}`);
    }
  });
}

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });

  // --- INTERCEPTOR CLAVE: todo lo que vaya a www5 (incluida la 1ª navegación del popup) ---
  await context.route('**://www5.sincoerp.com/**', async (route) => {
    const req = route.request();
    const u = req.url();
    if (!esAsset(u)) {
      let body = '';
      try { body = req.postData() || ''; } catch {}
      const h = req.headers();
      push(`${hora()} [WWW5] ${req.method()} ${u}`);
      if (body) push(`        POSTDATA: ${body.slice(0, 2000)}`);
      push(`        content-type: ${h['content-type'] || '-'} | referer: ${h['referer'] || '-'}`);
    }
    await route.continue();
  });

  context.on('page', (p) => {
    push(`\n${hora()} >>> PESTAÑA NUEVA: ${p.url()}`);
    attach(p, 'pestaña-nueva');
  });

  const page = await context.newPage();
  attach(page, 'principal');

  await page.goto('https://core.sincoerp.com/SincoSoporte/Torre.html', { waitUntil: 'domcontentloaded' }).catch(() => {});

  console.log('\n==================================================================');
  console.log('  1) Inicia sesión en Torre.');
  console.log('  2) ENTRA a una empresa (abre el ERP del cliente de verdad).');
  console.log('  3) Cuando cargue la pantalla de selección/empresa, cierra el navegador.');
  console.log('  Tienes 5 minutos. Todo queda en: ' + OUT);
  console.log('==================================================================\n');

  const timeout = new Promise((r) => setTimeout(r, 5 * 60 * 1000));
  const closed  = new Promise((r) => browser.on('disconnected', r));
  await Promise.race([timeout, closed]);

  try { fs.writeFileSync(OUT, log.join('\n') + '\n'); } catch {}
  console.log('\nCaptura guardada en: ' + OUT);
  try { await browser.close(); } catch {}
  process.exit(0);
})();
