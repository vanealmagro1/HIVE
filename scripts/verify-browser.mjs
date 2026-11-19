// Recorrido real en navegador (Chrome headless con WebGL por software) y capturas.
import { chromium } from 'playwright-core';

const url = process.argv[2] ?? 'http://127.0.0.1:5173/';
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
const t0 = Date.now();
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForSelector('canvas', { timeout: 20000 });
await page.waitForTimeout(1500);
const has2D = await page.locator('[data-testid="warehouse-2d"]').count();
console.log('canvas:', await page.locator('canvas').count(), '2D fallback:', has2D, 'load ms:', Date.now() - t0);
await page.screenshot({ path: `${out}/01_bodega.png` });

// Clic REAL sobre el pallet en la escena 3D (debajo de su etiqueta, que no captura eventos).
const label = page.locator('.label3d-unit', { hasText: 'PAL-001' }).first();
const box = await label.boundingBox();
await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2 + 28);
await page.waitForTimeout(1200);
const selectedByClick = await page.locator('[data-testid="unit-panel"]').count();
console.log('selección por clic 3D abre ficha:', selectedByClick === 1,
  selectedByClick ? (await page.locator('[data-testid="unit-panel"] h2').textContent()) : '');
if (!selectedByClick) await page.getByRole('button', { name: /1 · Seleccionar PAL-001/ }).click();
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/02_pal001.png` });

await page.getByRole('button', { name: /2 · Ejecutar evento simulado/ }).click();
await page.waitForTimeout(1200);
console.log('alerta:', await page.locator('[data-testid="alert-alert-demo-001"] .prio').textContent());
console.log('ghost 3D:', await page.locator('.label3d-ghost').count());
await page.screenshot({ path: `${out}/03_evento_alerta.png` });

await page.getByRole('button', { name: /Reenviar evento/ }).click();
await page.waitForTimeout(300);
console.log('reenvío:', await page.locator('[data-testid="last-message"]').textContent(), '| alertas:', await page.locator('[data-testid^="alert-alert"]').count());

await page.getByRole('button', { name: /3 · Ver predicción/ }).click();
await page.waitForTimeout(600);
console.log('SKU-A:', (await page.locator('[data-testid="analytics-SKU-A"] .metrics').textContent()));
await page.screenshot({ path: `${out}/04_prediccion.png` });

await page.getByRole('button', { name: /4 · Aprobar recomendación/ }).click();
await page.waitForTimeout(500);
console.log('tarea:', await page.locator('[data-testid="task-task-rec-sku-a"]').count());
await page.screenshot({ path: `${out}/05_tarea.png` });

await page.getByRole('button', { name: /Reiniciar demo/ }).click();
await page.waitForTimeout(800);
console.log('tras reset, ghosts:', await page.locator('.label3d-ghost').count(), 'msg:', await page.locator('[data-testid="last-message"]').textContent());
await page.screenshot({ path: `${out}/06_reset.png` });

// Fallback 2D manual
await page.getByRole('button', { name: 'Vista 2D' }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/07_vista2d.png` });
console.log('2D activo:', await page.locator('[data-testid="warehouse-2d"]').count());
console.log('errores/avisos de consola:', errors.length ? errors : 'ninguno');
await browser.close();
