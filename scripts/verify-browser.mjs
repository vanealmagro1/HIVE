// Recorrido real de HIVE UI v1.1 en Chrome headless, con capturas por paso y resolución.
// Uso: node verify-browser.mjs http://127.0.0.1:4173/ <carpeta> 1366x768 [gpu]   (gpu = usar la GPU real)
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
const [url = 'http://127.0.0.1:4174/', out = 'v11', size = '1366x768', gpu] = process.argv.slice(2);
const [w, h] = size.split('x').map(Number);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  channel: 'chrome', headless: true,
  args: gpu ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: w, height: h } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
const shot = (n) => page.screenshot({ path: `${out}/${size}_${n}.png` });
const btn = (name) => page.getByRole('button', { name });
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForSelector('canvas', { timeout: 20000 });
await page.waitForTimeout(2500);
const overflowX = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
console.log(size, '| scroll horizontal:', overflowX, '| unidades:', await page.locator('[data-testid="kpi-units"]').textContent());
await shot('1_inicio');
await btn(/Recibir camión/).click();
await page.waitForTimeout(2500);
await shot('1b_recibiendo');
await page.waitForSelector('[data-testid="receipt-result"]', { timeout: 30000 });
await page.waitForTimeout(1500);
console.log('recepción:', (await page.locator('[data-testid="receipt-result"]').textContent()).trim(), '| unidades:', await page.locator('[data-testid="kpi-units"]').textContent(), '| alertas:', await page.locator('[data-testid="kpi-alerts"]').textContent());
await shot('1c_recibido');
await btn('Paso siguiente').click();
await btn(/Contar pasillo D/).click();
await page.waitForSelector('[data-testid="new-evidence"]', { timeout: 30000 });
await page.waitForTimeout(1800);
await shot('2_detectar');
await btn('Paso siguiente').click();
await page.waitForTimeout(1800);
console.log('alerta:', (await page.locator('[data-testid="loc-compare"]').textContent()));
await shot('3_alertar');
await btn('Paso siguiente').click();
await page.waitForTimeout(1500);
console.log('impacto:', (await page.locator('[data-testid="impact-facts"]').textContent()));
await shot('4_analizar');
await btn('Paso siguiente').click();
await page.waitForTimeout(800);
await btn('Aprobar acción').click();
await page.waitForTimeout(800);
await shot('5_recomendar');
await btn('Paso siguiente').click();
await page.waitForTimeout(1200);
console.log('registro:', (await page.locator('[data-testid="task-summary"]').textContent()));
await shot('6_registrar');
await btn('Ver detalle').click();
await page.waitForTimeout(600);
await shot('7_drawer');
await page.keyboard.press('Escape');
for (const [name, label] of [['inventario', 'Inventario'], ['gemelo', 'Gemelo digital'], ['eventos', 'Eventos'], ['analitica', 'Analítica'], ['reportes', 'Reportes']]) {
  await page.locator('.nav-item', { hasText: label }).click();
  await page.waitForTimeout(name === 'gemelo' ? 1500 : 500);
  await shot(`8_${name}`);
}
console.log('errores/avisos:', errors.length ? errors.slice(0, 6) : 'ninguno');
await browser.close();
