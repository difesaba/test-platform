# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 4e2dc2c4-9647-417f-8e02-9d9a9ec648da-doc.spec.ts >> test
- Location: 4e2dc2c4-9647-417f-8e02-9d9a9ec648da-doc.spec.ts:3:5

# Error details

```
Error: locator.uncheck: Target page, context or browser has been closed
Call log:
  - waiting for locator('iframe[name="pagina1"]').contentFrame().getByRole('row', { name: 'MOTO' }).getByLabel('')

```

# Test source

```ts
  1  | import { test, expect } from 'playwright/test';
  2  | 
  3  | test('test', async ({ page }) => {
  4  |   // ── External Marco SPA preamble (TestPlatform) ──────────────────────────
  5  |   // Inyectar sesión en localStorage (corre antes de cada página/iframe)
  6  |   await page.addInitScript((d) => {
  7  |     const w = (k, v) => { try { localStorage.setItem(k, v); } catch {} try { sessionStorage.setItem(k, v); } catch {} };
  8  |     w('access_token', d.accessToken);
  9  |     w('accessToken', d.accessToken);
  10 |     w('authorization_token', d.authorizationToken);
  11 |     w('adpro_token', d.serializedToken);
  12 |     w('adproToken', d.serializedToken);
  13 |     w('token', JSON.stringify({ state: { finalToken: d.accessToken, authorizationToken: d.authorizationToken }, version: 0 }));
  14 |     if (d.urlRaiz) w('urlRaiz', d.urlRaiz);
  15 |     if (d.empresaId) w('empresaId', d.empresaId);
  16 |     if (d.sucursalId) w('sucursalId', d.sucursalId);
  17 |     if (d.empresaNombre) w('empresaNombre', d.empresaNombre);
  18 |     if (d.sucursalNombre) w('sucursalNombre', d.sucursalNombre);
  19 |     if (d.entornoName) w('entornoName', d.entornoName);
  20 |     if (d.empNombre) w('empNombre', d.empNombre);
  21 |     try { window.getToken = () => d.accessToken; } catch {}
  22 |     try { window.getTokenAuth = () => d.authorizationToken; } catch {}
  23 |   }, {"accessToken":"sySgPTxXFN6RkpgfYuVzf5Incgr0tApw1mcQ3UBvITLwpCE5NyKIm0NE5CO0uYkLOQ+hvK5Ypor3KOuBtjcXAAqkrKG1YFwmk8cza8jZNIHwzJ2hXcqpkZsvNSeFfymBRqe39Bilbcfbx0tHaW9Eh2bhjfr96oFKq1EK5CbOCeKNtuYHnj/q9/AAFRR2cGgbP8m1B6VU1XXJiVJxX7M3C9zoAcaXbj7+PjF5t3XR3xMe9t2Jx/k2Hr+U4ymooIk6ULmeNqCuyFmE9J/nvq3RFc1Qziw7syGkmE1x/5jmTw1Ighjgyr4KmJP5I25N7I7b5kx1UdS2bJtkqBHEuo0cgxp0Fv+e7XKXFVAW4uL76tel1brlvxU4YH5jWhAt7qIE","authorizationToken":"eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkZXNhcnJvbGxhZG9yY2JyIiwiYXVkIjpbIkdUSCIsIkEmRiIsIkFEUFJPIiwiTSZFIiwiU0dDIiwiQ0JSIiwiRiZDIiwiQ1JNIiwiQUJSIiwiU0dQIiwiU0dEIiwiR0VTIiwiQ0ZHIiwiU1NUIiwiU1JNIl0sInNpZCI6IlVSMnJlU1lCNGY0OW9uMFBHeXdmT3FDaGVLN1Fyam9WZWw3WFNxLUd0ZjQiLCJleHAiOjE3Nzk0MDc5NjYsImlzcyI6IlNpbmNvRVJQLkFQSSJ9.QIRC_4FLTC_cRdbtWWAxwe2zFE95ljskmcI4wspd4a80IVHsY_w4aPvm5L3CJSX_p1-W2QZal8S20SqEJ_eu3IBc73IYlJMirA3tE6oN8tPVlP022mNUrbbUvgK2UaneFd0RjUwhp1DtYpBMlvKOaromxkaVZzIBDvMaXKoST2whO3CA-CghDkHFIjos68yW_Pka_Lf5mhh7RtYLEYkfABjji4waZE6_CcdkjMmPsgQAfLz9M6NVoTrCMePtShYDpwO3r-BY91j0LntNdNPLg_Wjj41QTC0TUFUzvH7d6_SbpdrJubQCpw3zifShQQoBH0OBWkkbzSMSi9Gbz07bLg","bearerValue":"Bearer sySgPTxXFN6RkpgfYuVzf5Incgr0tApw1mcQ3UBvITLwpCE5NyKIm0NE5CO0uYkLOQ+hvK5Ypor3KOuBtjcXAAqkrKG1YFwmk8cza8jZNIHwzJ2hXcqpkZsvNSeFfymBRqe39Bilbcfbx0tHaW9Eh2bhjfr96oFKq1EK5CbOCeKNtuYHnj/q9/AAFRR2cGgbP8m1B6VU1XXJiVJxX7M3C9zoAcaXbj7+PjF5t3XR3xMe9t2Jx/k2Hr+U4ymooIk6ULmeNqCuyFmE9J/nvq3RFc1Qziw7syGkmE1x/5jmTw1Ighjgyr4KmJP5I25N7I7b5kx1UdS2bJtkqBHEuo0cgxp0Fv+e7XKXFVAW4uL76tel1brlvxU4YH5jWhAt7qIE","tokenType":"Bearer","serializedToken":"{\"access_token\":\"sySgPTxXFN6RkpgfYuVzf5Incgr0tApw1mcQ3UBvITLwpCE5NyKIm0NE5CO0uYkLOQ+hvK5Ypor3KOuBtjcXAAqkrKG1YFwmk8cza8jZNIHwzJ2hXcqpkZsvNSeFfymBRqe39Bilbcfbx0tHaW9Eh2bhjfr96oFKq1EK5CbOCeKNtuYHnj/q9/AAFRR2cGgbP8m1B6VU1XXJiVJxX7M3C9zoAcaXbj7+PjF5t3XR3xMe9t2Jx/k2Hr+U4ymooIk6ULmeNqCuyFmE9J/nvq3RFc1Qziw7syGkmE1x/5jmTw1Ighjgyr4KmJP5I25N7I7b5kx1UdS2bJtkqBHEuo0cgxp0Fv+e7XKXFVAW4uL76tel1brlvxU4YH5jWhAt7qIE\",\"token_type\":\"Bearer\",\"expires_in\":86399,\"authorization_token\":\"eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkZXNhcnJvbGxhZG9yY2JyIiwiYXVkIjpbIkdUSCIsIkEmRiIsIkFEUFJPIiwiTSZFIiwiU0dDIiwiQ0JSIiwiRiZDIiwiQ1JNIiwiQUJSIiwiU0dQIiwiU0dEIiwiR0VTIiwiQ0ZHIiwiU1NUIiwiU1JNIl0sInNpZCI6IlVSMnJlU1lCNGY0OW9uMFBHeXdmT3FDaGVLN1Fyam9WZWw3WFNxLUd0ZjQiLCJleHAiOjE3Nzk0MDc5NjYsImlzcyI6IlNpbmNvRVJQLkFQSSJ9.QIRC_4FLTC_cRdbtWWAxwe2zFE95ljskmcI4wspd4a80IVHsY_w4aPvm5L3CJSX_p1-W2QZal8S20SqEJ_eu3IBc73IYlJMirA3tE6oN8tPVlP022mNUrbbUvgK2UaneFd0RjUwhp1DtYpBMlvKOaromxkaVZzIBDvMaXKoST2whO3CA-CghDkHFIjos68yW_Pka_Lf5mhh7RtYLEYkfABjji4waZE6_CcdkjMmPsgQAfLz9M6NVoTrCMePtShYDpwO3r-BY91j0LntNdNPLg_Wjj41QTC0TUFUzvH7d6_SbpdrJubQCpw3zifShQQoBH0OBWkkbzSMSi9Gbz07bLg\"}","urlRaiz":"https://www4.sincoerp.com/SincoComercial_Nueva/v3","empresaId":"1","sucursalId":"0","empresaNombre":"SINCO COMERCIAL 2022","sucursalNombre":"Principal","entornoName":"produccion","empNombre":"Sinco Desarrollo"});
  24 |   // Route único: Marco → fake Marco HTML, resto → headers de auth
  25 |   await page.route('**/*', async (route) => {
  26 |     const _url = route.request().url();
  27 |     if (/\/Marco\/Default_iv\.aspx/i.test(_url)) {
  28 |       await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8',
  29 |         body: `<!DOCTYPE html><html><head><meta charset="utf-8"><style>*{margin:0;padding:0}body,html{width:100%;height:100%;overflow:hidden}</style></head><body><iframe id="pagina1" name="pagina1" src="https://www4.sincoerp.com/SincoComercial_Nueva/V3/CBRConfiguracion/#/configuracion/MediosTransporte" style="width:100%;height:100vh;border:none;display:block;"></iframe></body></html>` });
  30 |       return;
  31 |     }
  32 |     const headers = { ...route.request().headers() };
  33 |     if (!headers['authorization'] || !headers['authorization'].toLowerCase().startsWith('bearer ')) {
  34 |       headers['authorization'] = "Bearer sySgPTxXFN6RkpgfYuVzf5Incgr0tApw1mcQ3UBvITLwpCE5NyKIm0NE5CO0uYkLOQ+hvK5Ypor3KOuBtjcXAAqkrKG1YFwmk8cza8jZNIHwzJ2hXcqpkZsvNSeFfymBRqe39Bilbcfbx0tHaW9Eh2bhjfr96oFKq1EK5CbOCeKNtuYHnj/q9/AAFRR2cGgbP8m1B6VU1XXJiVJxX7M3C9zoAcaXbj7+PjF5t3XR3xMe9t2Jx/k2Hr+U4ymooIk6ULmeNqCuyFmE9J/nvq3RFc1Qziw7syGkmE1x/5jmTw1Ighjgyr4KmJP5I25N7I7b5kx1UdS2bJtkqBHEuo0cgxp0Fv+e7XKXFVAW4uL76tel1brlvxU4YH5jWhAt7qIE";
  35 |     }
  36 |     if (!headers['x-sincoerp-authorization']) {
  37 |       headers['x-sincoerp-authorization'] = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkZXNhcnJvbGxhZG9yY2JyIiwiYXVkIjpbIkdUSCIsIkEmRiIsIkFEUFJPIiwiTSZFIiwiU0dDIiwiQ0JSIiwiRiZDIiwiQ1JNIiwiQUJSIiwiU0dQIiwiU0dEIiwiR0VTIiwiQ0ZHIiwiU1NUIiwiU1JNIl0sInNpZCI6IlVSMnJlU1lCNGY0OW9uMFBHeXdmT3FDaGVLN1Fyam9WZWw3WFNxLUd0ZjQiLCJleHAiOjE3Nzk0MDc5NjYsImlzcyI6IlNpbmNvRVJQLkFQSSJ9.QIRC_4FLTC_cRdbtWWAxwe2zFE95ljskmcI4wspd4a80IVHsY_w4aPvm5L3CJSX_p1-W2QZal8S20SqEJ_eu3IBc73IYlJMirA3tE6oN8tPVlP022mNUrbbUvgK2UaneFd0RjUwhp1DtYpBMlvKOaromxkaVZzIBDvMaXKoST2whO3CA-CghDkHFIjos68yW_Pka_Lf5mhh7RtYLEYkfABjji4waZE6_CcdkjMmPsgQAfLz9M6NVoTrCMePtShYDpwO3r-BY91j0LntNdNPLg_Wjj41QTC0TUFUzvH7d6_SbpdrJubQCpw3zifShQQoBH0OBWkkbzSMSi9Gbz07bLg";
  38 |     }
  39 |     await route.continue({ headers });
  40 |   });
  41 |   const __snap = async (p: string) => { try { await page.waitForTimeout(400); await page.waitForLoadState('networkidle', { timeout: 2500 }).catch(() => {}); if (await page.locator('#pagina1').count()) { await page.locator('#pagina1').screenshot({ path: p, timeout: 3000 }); } else { await page.screenshot({ path: p, timeout: 3000 }); } } catch {} };
  42 |   await page.goto("https://www4.sincoerp.com/SincoComercial_Nueva/v3/Marco/Default_iv.aspx", { waitUntil: 'domcontentloaded', timeout: 30000 });
  43 |   await __snap('C:/testPlatform/backend/workspace/modules/CONFIGURACION/submodules/COMPRADORES/pages/MAESTRO DE TRANSPORTES/e2e/screenshots/step_01.png');
  44 |   await page.waitForLoadState('networkidle').catch(() => {});
  45 |   await page.locator('iframe[name="pagina1"]').contentFrame().locator('#mat-input-0').click();
  46 |   await __snap('C:/testPlatform/backend/workspace/modules/CONFIGURACION/submodules/COMPRADORES/pages/MAESTRO DE TRANSPORTES/e2e/screenshots/step_02.png');
  47 |   await page.locator('iframe[name="pagina1"]').contentFrame().locator('#mat-input-0').fill('CARRO');
  48 |   await __snap('C:/testPlatform/backend/workspace/modules/CONFIGURACION/submodules/COMPRADORES/pages/MAESTRO DE TRANSPORTES/e2e/screenshots/step_03.png');
  49 |   await page.locator('iframe[name="pagina1"]').contentFrame().getByRole('button', { name: 'Guardar' }).click();
  50 |   await __snap('C:/testPlatform/backend/workspace/modules/CONFIGURACION/submodules/COMPRADORES/pages/MAESTRO DE TRANSPORTES/e2e/screenshots/step_04.png');
  51 |   await page.locator('iframe[name="pagina1"]').contentFrame().locator('#mat-input-0').click();
  52 |   await __snap('C:/testPlatform/backend/workspace/modules/CONFIGURACION/submodules/COMPRADORES/pages/MAESTRO DE TRANSPORTES/e2e/screenshots/step_05.png');
  53 |   await page.locator('iframe[name="pagina1"]').contentFrame().locator('#mat-input-0').fill('BICI');
  54 |   await __snap('C:/testPlatform/backend/workspace/modules/CONFIGURACION/submodules/COMPRADORES/pages/MAESTRO DE TRANSPORTES/e2e/screenshots/step_06.png');
  55 |   await page.locator('iframe[name="pagina1"]').contentFrame().getByRole('button', { name: 'Guardar' }).click();
  56 |   await __snap('C:/testPlatform/backend/workspace/modules/CONFIGURACION/submodules/COMPRADORES/pages/MAESTRO DE TRANSPORTES/e2e/screenshots/step_07.png');
  57 |   await page.locator('iframe[name="pagina1"]').contentFrame().getByRole('row', { name: 'CARRO' }).getByLabel('').uncheck();
  58 |   await __snap('C:/testPlatform/backend/workspace/modules/CONFIGURACION/submodules/COMPRADORES/pages/MAESTRO DE TRANSPORTES/e2e/screenshots/step_08.png');
  59 |   await page.locator('iframe[name="pagina1"]').contentFrame().getByRole('row', { name: 'CARRO' }).getByRole('button').click();
  60 |   await __snap('C:/testPlatform/backend/workspace/modules/CONFIGURACION/submodules/COMPRADORES/pages/MAESTRO DE TRANSPORTES/e2e/screenshots/step_09.png');
> 61 |   await page.locator('iframe[name="pagina1"]').contentFrame().getByRole('row', { name: 'MOTO' }).getByLabel('').uncheck();
     |                                                                                                                 ^ Error: locator.uncheck: Target page, context or browser has been closed
  62 |   await __snap('C:/testPlatform/backend/workspace/modules/CONFIGURACION/submodules/COMPRADORES/pages/MAESTRO DE TRANSPORTES/e2e/screenshots/step_10.png');
  63 | });
```