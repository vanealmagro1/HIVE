// Recorrido real en navegador (Chrome headless con WebGL por software) y capturas.
// Uso: node verify-browser.mjs http://127.0.0.1:4173/ <carpeta-de-salida>
import { chromium } from 'playwright-core';

const url = process.argv[2] ?? 'http://127.0.0.1:4173/';
const out = process.argv[3] ?? '.';
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
const step = (name) => page.getByRole('button', { name });
const shot = (name) => page.screenshot({ path: `${out}/${name}.png` });

const t0 = Date.now();
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForSelector('canvas', { timeout: 20000 });
await page.waitForTimeout(1500);
console.log('canvas:', await page.locator('canvas').count(), '| 2D:', await page.locator('[data-testid="warehouse-2d"]').count(), '| carga ms:', Date.now() - t0);
console.log('unidades iniciales:', await page.locator('[data-testid="kpi-units"]').textContent());
await shot('01_bodega');

// 1 · Detectar: recepción RFID en vivo por el portal del andén.
await step(/1 · Recibir camión/).click();
await page.waitForTimeout(2600);
await shot('02_recepcion_en_curso');
await page.waitForSelector('[data-testid="receipt-result"]', { timeout: 20000 });
await page.waitForTimeout(600);
console.log('recepción:', (await page.locator('[data-testid="receipt-result"]').textContent()).trim());
console.log('unidades tras recepción:', await page.locator('[data-testid="kpi-units"]').textContent());
await shot('03_recepcion_cerrada');

// 2 · Detectar: conteo del pasillo 4 con lector de mano.
await step(/2 · Contar pasillo 4/).click();
await page.waitForTimeout(2200);
await shot('04_conteo_en_curso');
await page.waitForSelector('[data-testid="alert-alert-demo-001"]', { timeout: 20000 });
await page.waitForTimeout(800);
console.log('alertas:', await page.locator('[data-testid^="alert-alert"]').count(), '| marcador 3D "leído aquí":', await page.locator('.label3d-ghost').count());
await shot('05_alertas');

await step(/Reenviar lectura/).click();
await page.waitForTimeout(300);
console.log('reenvío:', await page.locator('[data-testid="last-message"]').textContent(), '| alertas:', await page.locator('[data-testid^="alert-alert"]').count());

// Clic REAL sobre un pallet en la escena 3D (coordenadas proyectadas desde la escena).
const pt = await page.evaluate(() => window.__hiveProject?.('PAL-002'));
await page.mouse.move(pt.x, pt.y);
await page.waitForTimeout(300);
await page.mouse.click(pt.x, pt.y);
await page.waitForTimeout(800);
console.log('clic 3D abre ficha:', (await page.locator('[data-testid="unit-panel"] h2').textContent().catch(() => '—')));
await shot('06_ficha_3d');

// 3-4 · Priorizar
await step(/4 · Ver predicción/).click();
await page.waitForTimeout(600);
console.log('MOC-001:', (await page.locator('[data-testid="analytics-MOC-001"] .metrics').textContent()));
await shot('07_prediccion');

// 5 · Actuar
await step(/5 · Aprobar acciones/).click();
await page.waitForTimeout(600);
console.log('tareas:', await page.locator('[data-testid^="task-"]').count());
await shot('08_tareas');

// 6 · Medir
await step(/6 · Ver resultados/).click();
await page.waitForTimeout(600);
await shot('09_resultados');

await step(/Reiniciar demo/).click();
await page.waitForTimeout(800);
console.log('tras reset: unidades', await page.locator('[data-testid="kpi-units"]').textContent(), '| marcadores:', await page.locator('.label3d-ghost').count());

await step('Vista 2D').click();
await page.waitForTimeout(400);
await shot('10_vista2d');
console.log('2D activo:', await page.locator('[data-testid="warehouse-2d"]').count());
console.log('errores/avisos de consola:', errors.length ? errors : 'ninguno');
await browser.close();
