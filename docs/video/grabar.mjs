// Graba y monta los videos de HIVE en MP4 1920×1080 a 30 fps, sin audio (la voz y la música se agregan al editar).
//
//   node grabar.mjs promo   → salida/HIVE_promo_Lucia.mp4      (~90 s, historia de Lucía)
//   node grabar.mjs mvp     → salida/HIVE_MVP_presentacion.mp4 (≤ 75 s, demo del MVP para la presentación)
//
// Requisitos: la app servida (cd frontend && npm run demo → http://127.0.0.1:4173/, o APP_URL), Chrome instalado,
// el paquete playwright-core (variable PW_DIR = carpeta que lo contiene en node_modules) y un ffmpeg con
// codificador H.264 (variable FFMPEG; por defecto el de CapCut, con h264_amf; FFMPEG_ENC para otro codificador).
//
// Cómo graba: las escenas animadas (escenas/escenas.html) se capturan cuadro a cuadro con una línea de tiempo
// determinista; la app se graba en tiempo real con el screencast de Chrome (JPEG por cuadro con su marca de tiempo).
// Todos los cuadros se ordenan en una lista con duraciones y ffmpeg los codifica de una sola vez.
// El rótulo, el cursor y la infografía se dibujan con overlay.js dentro de la página (no tocan la app).
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const require = createRequire(process.env.PW_DIR ? join(process.env.PW_DIR, 'noop.js') : import.meta.url);
const { chromium } = require('playwright-core');
const which = process.argv[2] || 'mvp';
const APP = process.env.APP_URL || 'http://127.0.0.1:4173/';
const FFMPEG = process.env.FFMPEG || join(process.env.LOCALAPPDATA || '', 'CapCut/Apps/8.3.0.3497/ffmpeg.exe');
const ENC = process.env.FFMPEG_ENC || 'h264_amf';
const OUT_DIR = join(HERE, 'salida');
const FRAMES = join(tmpdir(), `hive-video-${which}`);
const FPS = 30;
const DSF = 1920 / 1366; // lienzo lógico 1366×768 → 1920×1080

rmSync(FRAMES, { recursive: true, force: true });
mkdirSync(FRAMES, { recursive: true });
mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: DSF, reducedMotion: 'no-preference' });
const list = []; // { file, dur }
const marks = []; // { t, label } para el guion y los subtítulos
let n = 0;
const clock = () => list.reduce((t, f) => t + f.dur, 0);
let shot = null;
/** Marca de tiempo en el video final (dentro de una toma: inicio de la toma + tiempo transcurrido / velocidad). */
const mark = (label) => { marks.push({ t: shot ? shot.base + (Date.now() / 1000 - shot.t0) / shot.speed : clock(), label }); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Escena animada: cuadro a cuadro a 30 fps. */
async function scene(name, label) {
  mark(label);
  const page = await ctx.newPage();
  await page.goto(pathToFileURL(join(HERE, 'escenas', 'escenas.html')).href + `?s=${name}`);
  await page.evaluate(() => document.fonts.ready);
  const dur = await page.evaluate(() => window.__scene.dur);
  const total = Math.round(dur * FPS);
  for (let i = 0; i < total; i += 1) {
    await page.evaluate((t) => window.__seek(t), i / FPS);
    const file = join(FRAMES, `f${String(n += 1).padStart(6, '0')}.jpg`);
    await page.screenshot({ path: file, type: 'jpeg', quality: 92 });
    list.push({ file, dur: 1 / FPS });
  }
  await page.close();
  console.log(`  escena ${name}: ${dur} s`);
}

// ── app ────────────────────────────────────────────────────────────────────
let app; let cdp;
async function openApp() {
  app = await ctx.newPage();
  await app.goto(APP, { waitUntil: 'networkidle' });
  await app.waitForSelector('canvas', { timeout: 30000 });
  await app.addScriptTag({ content: readFileSync(join(HERE, 'overlay.js'), 'utf8') });
  await app.evaluate(() => window.__film.veilNow('#f5f6fa'));
  await sleep(3500); // el gemelo termina de cargar y encuadrar
  cdp = await ctx.newCDPSession(app);
  cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
    if (!shot) return;
    const file = join(FRAMES, `f${String(n += 1).padStart(6, '0')}.jpg`);
    writeFileSync(file, Buffer.from(data, 'base64'));
    shot.frames.push({ file, ts: metadata.timestamp });
  });
}
/** Toma de la app en tiempo real; `speed` > 1 la acelera en el montaje (p. ej. el traslado del montacargas). */
async function startShot(label, speed = 1) {
  shot = { frames: [], speed, t0: Date.now() / 1000, base: clock() };
  if (label) mark(label);
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 90, maxWidth: 1921, maxHeight: 1080, everyNthFrame: 1 });
}
async function stopShot() {
  await cdp.send('Page.stopScreencast');
  const s = shot; shot = null;
  const end = Date.now() / 1000;
  s.frames.forEach((f, i) => {
    const next = i + 1 < s.frames.length ? s.frames[i + 1].ts : end;
    list.push({ file: f.file, dur: Math.max(0.001, (next - f.ts) / s.speed) });
  });
}
const film = (fn, ...args) => app.evaluate(([f, a]) => window.__film[f](...a), [fn, args]);
/** Mueve el cursor visible al botón, lo "pulsa" y hace el clic real. */
async function press(locator, { hover = 650 } = {}) {
  const b = await locator.boundingBox();
  const x = b.x + b.width / 2; const y = b.y + b.height / 2;
  await film('cursorTo', x, y);
  await sleep(800 + hover);
  await film('pulse', x, y);
  await locator.click();
  await sleep(250);
}
const btn = (name) => app.getByRole('button', { name }).first();
const step = (i) => app.locator('.step-panel h2').filter({ hasText: `Paso ${i} de 6` }).waitFor();

// ── guiones de grabación ───────────────────────────────────────────────────
async function appWalkthrough(mode) {
  const promo = mode === 'promo';
  await openApp();

  // 1 · Visualizar
  await startShot('1 · Visualizar');
  await film('veil', '#f5f6fa', false);
  await sleep(500);
  await film('caption', '1 · Visualizar', promo ? 'Llega el camión: el portal RFID lee cada caja' : 'Recepción con portal RFID', 'Conciliación automática contra la orden de compra');
  await sleep(promo ? 900 : 600);
  await press(btn(/Recibir camión/));
  await stopShot();
  await startShot(null, 1.6); // lecturas del portal, aceleradas en el montaje
  await app.waitForSelector('[data-testid="receipt-result"]', { timeout: 30000 });
  await stopShot();
  await startShot(null);
  await sleep(500);
  await film('sub', '12 cajas esperadas · 11 leídas · falta 1 caja (24 u · USD 86,40)');
  await sleep(promo ? 2600 : 2200);

  // 2 · Detectar
  await press(btn(/^Siguiente/), { hover: 200 });
  await step(2);
  mark('2 · Detectar');
  await film('caption', '2 · Detectar', promo ? 'Conteo con lector de mano en el pasillo D' : 'Conteo cíclico con lector de mano', '');
  await sleep(400);
  await press(btn(/Contar pasillo D/), { hover: 250 });
  await stopShot();
  await startShot(null, 2.5); // recorrido del lector de mano, acelerado en el montaje
  await app.waitForSelector('[data-testid="new-evidence"]', { timeout: 30000 });
  await stopShot();
  await startShot(null);
  await film('sub', 'Mochilas de PAL-001: registradas en B-03-01, detectadas en D-07-02');
  await sleep(promo ? 2600 : 2200);

  // 3 · Alertar
  await press(btn(/^Siguiente/), { hover: 200 });
  await step(3);
  mark('3 · Alertar');
  await film('caption', '3 · Alertar', 'Ubicación por verificar', 'El inventario oficial no cambia sin verificación humana');
  await sleep(promo ? 1800 : 1600);
  if (promo) {
    await press(btn('Ver detalle'), { hover: 200 });
    await sleep(2300);
    await app.keyboard.press('Escape');
    await sleep(400);
  } else await sleep(900);

  // 4 · Analizar (el paso 3 no tiene botón "Siguiente": se usa la flecha del panel)
  await press(btn('Paso siguiente'), { hover: 200 });
  await step(4);
  mark('4 · Analizar');
  await film('caption', '4 · Analizar', 'Por separado: la cobertura de las mochilas', 'Cálculo explicable · sin modelo de IA');
  await film('factsAt', 262, 140);
  await sleep(700);
  await film('fact', '600 u ÷ 10 u/día = <span style="color:#6336e8">60 días</span> <small>de cobertura</small>', 'purple');
  await sleep(1300);
  await film('fact', 'Objetivo: 30 días <small>→ 300 u de exceso</small>', 'warn');
  await sleep(1300);
  await film('fact', '300 u × USD 8 = USD 2.400 <small>exposición estimada</small>', 'warn');
  await sleep(promo ? 3000 : 2600);
  await film('clearFacts');

  // 5 · Recomendar
  await press(btn(/^Siguiente/), { hover: 200 });
  await step(5);
  mark('5 · Recomendar');
  await film('caption', '5 · Recomendar', promo ? 'HIVE recomienda · Lucía decide' : 'HIVE recomienda · una persona aprueba', 'Redistribuir 300 unidades');
  await sleep(900);
  await press(btn('Aprobar acción'), { hover: 700 });
  if (promo) await film('lucia', 'Apruebo.');
  await sleep(1700);
  await film('hideLucia');

  // 6 · Registrar → simular ejecución → confirmar recepción
  await press(btn(/^Siguiente/), { hover: 200 });
  await step(6);
  mark('6 · Registrar y ejecutar');
  await film('caption', '6 · Registrar', 'Tarea creada: traslado a Bodega Quito Sur', 'Pendiente de ejecución · 2 pallets · 300 u');
  await sleep(1400);
  await press(btn(/Simular ejecución/), { hover: 300 });
  await film('hideCursor');
  await film('sub', 'Simulación: el montacargas lleva los pallets al muelle D2');
  await sleep(1300);
  await stopShot();
  await startShot(null, 2.4); // el traslado (~11 s reales) se acelera en el montaje
  await sleep(9800);
  await stopShot();
  await startShot(null);
  await film('sub', 'El destino confirma lo recibido');
  await sleep(500);
  await press(btn(/Confirmar recepción/), { hover: 300 });
  await film('hideCursor');
  await film('caption', '6 · Resultado', 'Norte 30 días · Sur 30 días', 'Total conservado: 690 u · traslado interno, no venta');
  await sleep(promo ? 4200 : 3800);

  if (!promo) {
    // Medir: la analítica ya refleja el traslado.
    await film('hideCaption');
    await app.locator('.nav-item', { hasText: 'Analítica' }).click();
    await sleep(700);
    mark('Medir · analítica');
    await film('caption', 'Medir', 'Analítica actualizada: demanda, stock y cobertura', 'Mismos datos que el gemelo · stock 600 → 300 u en Quito Norte');
    await app.locator('.content').evaluate((c) => c.scrollTo({ top: 150, behavior: 'smooth' }));
    await sleep(2200);
    await sleep(2400);
    await film('hideCursor');
  }
  await film('veil', '#17142f', true);
  await sleep(700);
  await stopShot();
  await app.close();
}

// ── montaje ────────────────────────────────────────────────────────────────
console.log(`Grabando "${which}"…`);
if (which === 'promo') {
  await scene('p1', 'Escena 1 · Lunes 7:40');
  await scene('p2', 'Escena 2 · 13.600 unidades');
  await scene('p3', 'Escena 3 · Fugas');
  await scene('p4', 'Escena 4 · HIVE');
  await appWalkthrough('promo');
  await scene('p5', 'Cierre');
} else {
  await scene('m1', 'Portada');
  await appWalkthrough('mvp');
  await scene('m2', 'Cierre');
}
await browser.close();

const total = clock();
const lines = ['ffconcat version 1.0'];
for (const f of list) lines.push(`file '${f.file.replace(/\\/g, '/')}'`, `duration ${f.dur.toFixed(5)}`);
lines.push(`file '${list.at(-1).file.replace(/\\/g, '/')}'`);
const listFile = join(FRAMES, 'lista.txt');
writeFileSync(listFile, lines.join('\n'));
const name = which === 'promo' ? 'HIVE_promo_Lucia.mp4' : 'HIVE_MVP_presentacion.mp4';
const out = join(OUT_DIR, name);
if (!existsSync(FFMPEG)) throw new Error(`No se encontró ffmpeg en ${FFMPEG} (define FFMPEG).`);
execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', listFile,
  '-vf', `scale=1920:1080:flags=lanczos,fps=${FPS},format=nv12`, '-c:v', ENC,
  ...(ENC === 'h264_amf' ? ['-quality', 'quality', '-rc', 'vbr_peak', '-b:v', '7M', '-maxrate', '12M'] : ['-b:v', '7M']),
  '-movflags', '+faststart', out], { stdio: 'inherit' });
writeFileSync(join(OUT_DIR, name.replace('.mp4', '_marcas.json')), JSON.stringify({ duracion: Number(total.toFixed(2)), marcas: marks.map((m) => ({ t: Number(m.t.toFixed(2)), etiqueta: m.label })) }, null, 2));
rmSync(FRAMES, { recursive: true, force: true });
console.log(`Listo: ${out} · ${total.toFixed(1)} s`);
for (const m of marks) console.log(`  ${m.t.toFixed(1).padStart(5)} s  ${m.label}`);
