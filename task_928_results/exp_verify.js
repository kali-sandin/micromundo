#!/usr/bin/env node
/**
 * task_928 exp_verify.js — Verificación headless de criterios UX/a11y de Expedición/Cuaderno.
 * A) Estático (index.html/styles.css/app.js):
 *   1. toggle button type=button con title y texto accesible.
 *   2. panel section aria-label, oculto por defecto (class hidden), cierre × y Esc.
 *   3. labels for/id en inputs de predicción y conclusión; th scope en tabla comparativa.
 *   4. reflow: media query 340px para .expedition-panel.
 *   5. feature OFF por defecto: panel hidden y sin auto-apertura (no llamada directa en init).
 * B) Runtime (vm, DOM mock): p95 de renderExpedition() con 12 tarjetas en cuaderno, 300 iter.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PROJ_DIR = path.resolve(__dirname, '..');
const APP = fs.readFileSync(path.join(PROJ_DIR, 'app.js'), 'utf8');
const HTML = fs.readFileSync(path.join(PROJ_DIR, 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(PROJ_DIR, 'styles.css'), 'utf8');

const checks = [];
function check(name, ok, detail) { checks.push({ name, ok: !!ok, detail: detail || null }); }

check('toggle Expedición button type=button con title', /<button[^>]*id="expeditionToggle"[^>]*type="button"[^>]*title="[^"]+"/.test(HTML));
check('panel section aria-label', /<section[^>]*id="expeditionPanel"[^>]*aria-label=/.test(HTML));
check('panel oculto por defecto (class hidden)', /<section[^>]*id="expeditionPanel"/.test(HTML) && /class="[^"]*\bhidden\b[^"]*"[^>]*id="expeditionPanel"|id="expeditionPanel"[^>]*class="[^"]*\bhidden/.test(HTML));
check('botón cierre data-expedition-close', /data-expedition-close/.test(HTML));
check('handler Esc cierra panel (app.js)', /expeditionPanel\.classList\.add\('hidden'\)/.test(APP) && /ev\.key === 'Escape'/.test(APP));
check('label predicción con for', /for="expeditionPrediction"/.test(HTML) && /id="expeditionPrediction"/.test(HTML));
check('textarea conclusión con label for', /for="expeditionConclusion"/.test(HTML) && /id="expeditionConclusion"/.test(HTML));
check('tabla comparativa usa th scope', /exp-table/.test(APP) && /th scope="col"/.test(APP) && /th scope="row"/.test(APP));
check('cuaderno import file input hidden con label for', /for="cuadernoImport"/.test(HTML) && /id="cuadernoImport"[^>]*hidden/.test(HTML));
check('reflow 340px expedition-panel', /@media \(max-width: 340px\)[^{]*\{\s*\.expedition-panel/.test(CSS));
check('maxlength en predicción/conclusión', /maxlength="200"/.test(HTML) && /maxlength="400"/.test(HTML));
check('makePanelDraggable aplicado al panel', /makePanelDraggable\(els\.expeditionPanel\)/.test(APP));
check('init no abre el panel automáticamente', !/init\(\)[\s\S]{0,400}expeditionPanel\.classList\.remove\('hidden'\)/.test(APP));

// ── B) Runtime p95 ──────────────────────────────────────────
// Reutiliza el patrón de carga de test.js (app.js es IIFE; inyecta exports).
function loadApp() {
  let src = APP;
  const exportsCode = `
    globalThis.__exp = { renderExpedition, inquiry, cuaderno, buildInquiryCard, validateCuaderno };
  `;
  src = src.replace(/\n  init\(\);\n\}\)\(\);\s*$/, '\n' + exportsCode + '\n})();\n');
  if (!src.includes('globalThis.__exp')) throw new Error('No se pudo inyectar exports');

  const noopCtx = () => {
    const ctx = {
      setTransform() {}, fillRect() {}, clearRect() {},
      getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray((w || 800) * (h || 600) * 4) }),
      putImageData() {}, createImageData: (w, h) => ({ data: new Uint8ClampedArray((w || 800) * (h || 600) * 4), width: w, height: h }),
      save() {}, restore() {}, translate() {}, scale() {}, rotate() {},
      beginPath() {}, closePath() {}, arc() {}, ellipse() {}, fill() {}, stroke() {},
      moveTo() {}, lineTo() {}, fillText() {}, measureText: () => ({ width: 0 }),
      drawImage() {},
    };
    return ctx;
  };
  const worldCtx = noopCtx();
  const fakeCanvas = {
    width: 800, height: 600, getContext: () => worldCtx,
    getBoundingClientRect: () => ({ width: 800, height: 600, left: 0, top: 0 }),
    addEventListener() {}, removeEventListener() {}, style: {},
    setAttribute() {}, getAttribute: () => null, classList: { add() {}, remove() {}, contains: () => false },
  };
  const fakeEl = {
    textContent: '', innerHTML: '', value: '50', style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    appendChild() {}, removeChild() {}, querySelectorAll: () => [], querySelector: () => null,
    addEventListener() {}, removeEventListener() {},
    setAttribute() {}, getAttribute: () => null, removeAttribute() {},
    scrollWidth: 0, scrollHeight: 0, clientWidth: 800, clientHeight: 600,
    offsetWidth: 800, offsetHeight: 600, close() {}, showModal() {}, focus() {},
    hidden: false, disabled: false, files: null,
  };
  const canvasIds = new Set(['world', 'graph', 'geneGraph', 'obsGraph']);
  const doc = {
    getElementById: (id) => (canvasIds.has(id) ? fakeCanvas : fakeEl),
    querySelector: () => fakeEl, querySelectorAll: () => [],
    createElement: (tag) => (tag === 'canvas' ? fakeCanvas : fakeEl), createTextNode: () => fakeEl,
    body: fakeEl, documentElement: fakeEl,
    addEventListener() {}, removeEventListener() {}, readyState: 'complete',
    visibilityState: 'visible', hidden: false,
  };
  const win = {
    innerWidth: 800, innerHeight: 600, devicePixelRatio: 1,
    addEventListener() {}, removeEventListener() {},
    requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
    matchMedia: () => ({ matches: false, addEventListener() {} }),
  };
  class ResizeObserverMock { observe() {} unobserve() {} disconnect() {} }
  const ctx = {
    window: win, document: doc, navigator: { userAgent: 'headless' },
    performance: { now: () => Date.now() },
    requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
    Intl, Number, Math, Date, console,
    setTimeout: () => {}, clearTimeout: () => {}, setInterval: () => {}, clearInterval: () => {},
    ResizeObserver: ResizeObserverMock,
    Float32Array, Uint8ClampedArray, Map, Set, Uint32Array, Uint16Array, Uint8Array, Int32Array,
    Array, Object, String, Boolean, JSON, Error,
    URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
    Blob: class {}, FileReader: class {}, alert() {}, localStorage: undefined,
  };
  win.ResizeObserver = ResizeObserverMock;
  ctx.globalThis = ctx;
  ctx.self = ctx;
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: 'app.js' });
  if (!ctx.__exp) throw new Error('No se pudo extraer __exp');
  return ctx.__exp;
}

let runtime = null;
try {
  const api = loadApp();
  check('runtime carga sin excepción', true);
  const baseCard = () => ({ schema: 'micromundo.inquiry/1', version: 1, id: 'inq_x' + Math.random().toString(36).slice(2), created: new Date().toISOString(), conclusion: 'test', experiment: { seed: 1 } });
  for (let i = 0; i < 12; i += 1) api.cuaderno.cards.push(baseCard());
  const times = [];
  for (let i = 0; i < 300; i += 1) {
    const t0 = process.hrtime.bigint();
    api.renderExpedition();
    times.push(Number(process.hrtime.bigint() - t0) / 1e6);
  }
  times.sort((a, b) => a - b);
  const p95 = times[Math.floor(times.length * 0.95)];
  runtime = { p95_ms: +p95.toFixed(4), max_ms: +times[times.length - 1].toFixed(4), iter: times.length };
  check('p95 renderExpedition < 2ms (12 tarjetas)', p95 < 2, 'p95=' + p95.toFixed(3) + 'ms');
} catch (e) {
  check('runtime carga sin excepción', false, String(e && e.message || e));
}

const ok = checks.every(c => c.ok);
fs.writeFileSync(__dirname + '/exp_verify.json', JSON.stringify({ task: 'task_928', checks, runtime, ok, timestamp: new Date().toISOString() }, null, 2));
for (const c of checks) console.log((c.ok ? 'PASS' : 'FAIL') + ' | ' + c.name + (c.detail ? ' | ' + c.detail : ''));
if (runtime) console.log('runtime:', JSON.stringify(runtime));
console.log(ok ? 'ALL PASS' : 'FAILURES');
process.exit(ok ? 0 : 1);
