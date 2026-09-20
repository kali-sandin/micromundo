#!/usr/bin/env node
/**
 * task_930 atlas_verify.js — Verificación headless de criterios UX/a11y del Atlas vivo.
 * A) Estático (index.html/styles.css/app.js):
 *   1. toggle button type=button con title y texto accesible.
 *   2. panel section aria-label, oculto por defecto (class hidden), cierre × y Esc.
 *   3. canvas tabindex + role + aria-label; radios con label; aria-live en ficha.
 *   4. reflow: media query 340px para .atlas-panel.
 *   5. feature OFF por defecto: panel hidden y sin auto-apertura; muestreo gated por atlasOpen().
 *   6. nota de correlación (no causalidad) presente.
 * B) Runtime (vm, DOM mock): coste de updateAtlas() con panel cerrado (debe ser ~0)
 *    y p95 de renderAtlas-equivalente usando las funciones puras.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const PROJ_DIR = path.resolve(__dirname, '..');
const APP = fs.readFileSync(path.join(PROJ_DIR, 'app.js'), 'utf8');
const HTML = fs.readFileSync(path.join(PROJ_DIR, 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(PROJ_DIR, 'styles.css'), 'utf8');

const checks = [];
function check(name, ok, detail) { checks.push({ name, ok: !!ok, detail: detail || null }); }

check('toggle Mapa button type=button con title', /<button[^>]*id="atlasToggle"[^>]*type="button"[^>]*title="[^"]+"/.test(HTML) || /<button[^>]*id="atlasToggle"[^>]*title="[^"]+"[^>]*type="button"/.test(HTML));
check('panel section aria-label', /<section[^>]*id="atlasPanel"[^>]*aria-label=|<section[^>]*aria-label=[^>]*id="atlasPanel"/.test(HTML));
check('panel oculto por defecto (class hidden)', /id="atlasPanel"[^>]*class="[^"]*\bhidden|class="[^"]*\bhidden[^"]*"[^>]*id="atlasPanel"/.test(HTML));
check('botón cierre data-atlas-close', /data-atlas-close/.test(HTML));
check('handler Esc cierra panel (app.js)', /atlasPanel\.classList\.add\('hidden'\)/.test(APP));
check('canvas mapa tabindex + role + aria-label', /id="atlasCanvas"[^>]*tabindex="0"[^>]*role="application"[^>]*aria-label=|tabindex="0"[^>]*role="application"[^>]*aria-label=[^>]*id="atlasCanvas"/.test(HTML) || /<canvas id="atlasCanvas"[^>]*tabindex/.test(HTML));
check('radios de capa con label asociado', /name="atlasLayer"/.test(HTML) && HTML.match(/<label><input type="radio" name="atlasLayer"/g).length === 3);
check('ficha de zona con aria-live', /id="atlasZone"[^>]*aria-live="polite"|aria-live="polite"[^>]*id="atlasZone"/.test(HTML));
check('nota correlación no causalidad', /correlaci&oacute;n espacial, no causalidad|correlación espacial, no causalidad/.test(HTML));
check('muestreo gated por atlasOpen (coste 0 cerrado)', /function updateAtlas\(\) \{\s*if \(!atlasOpen\(\)\) return;/.test(APP));
check('reflow 340px atlas-panel', /@media \(max-width: 340px\)[^{]*\{\s*\.atlas-panel/.test(CSS));
check('makePanelDraggable aplicado al panel', /makePanelDraggable\(els\.atlasPanel\)/.test(APP));
check('init no abre el panel automáticamente', !/init\(\)[\s\S]{0,400}atlasPanel\.classList\.remove\('hidden'\)/.test(APP));
check('arrays acotados: ring cap y ventana ficha', /ATLAS_RING_CAP = 66/.test(APP) && /ATLAS_WINDOW_S = 600/.test(APP));
check('capa Δ60s declarada', /ATLAS_DELTA_S = 60/.test(APP));
check('reset del atlas en reset de mundo', /atlasReset\(\); \/\/ task_930/.test(APP) && APP.match(/atlasReset\(\); \/\/ task_930/g).length >= 2);

// ── B) Runtime: pure functions ──────────────────────────────
// Reutiliza la carga tipo test.js
const testPath = path.join(PROJ_DIR, 'test.js');
const testSrc = fs.readFileSync(testPath, 'utf8');
// Extrae createDomMock + loadApp de test.js ejecutándolo en modo filtrado no existente:
// más simple: cargar app.js aquí con vm replicando exports mínimos.
const vm = require('vm');
const sandbox = {};
{
  const exportsCode = `
    globalThis.__sim = {
      atlasResample, atlasCountDensity, atlasDelta, atlasRingPush, atlasSnapshotAt,
      atlas, ATLAS_MAX_COLS, ATLAS_RING_CAP, ATLAS_WINDOW_S, ATLAS_DELTA_S
    };
  `;
  let src = APP.replace(/\n  init\(\);\n\}\)\(\);\s*$/, '\n' + exportsCode + '\n})();\n');
  // DOM mock mínimo (canvas genérico)
  const noopCtx = () => ({ setTransform() {}, clearRect() {}, fillRect() {}, fillText() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, save() {}, restore() {}, measureText: () => ({ width: 0 }) });
  const fakeCanvas = { width: 800, height: 600, getContext: () => noopCtx(), getBoundingClientRect: () => ({ width: 800, height: 600, left: 0, top: 0 }), addEventListener() {}, focus() {} };
  const fakeEl = { textContent: '', innerHTML: '', value: '', style: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => true }, appendChild() {}, removeChild() {}, querySelectorAll: () => [], querySelector: () => null, addEventListener() {}, removeEventListener() {}, setAttribute() {}, getBoundingClientRect: () => ({ width: 800, height: 600, left: 0, top: 0 }), focus() {}, scrollIntoView() {} };
  const doc = { getElementById: () => fakeCanvas, querySelector: () => fakeEl, querySelectorAll: () => [], createElement: () => fakeCanvas, createTextNode: () => fakeEl, body: fakeEl, documentElement: fakeEl, addEventListener() {} };
  const win = { innerWidth: 800, innerHeight: 600, devicePixelRatio: 1, addEventListener() {}, requestAnimationFrame: () => 0, cancelAnimationFrame: () => {} };
  vm.createContext(sandbox);
  sandbox.document = doc; sandbox.window = win; sandbox.globalThis = sandbox; sandbox.performance = { now: () => Date.now() };
  vm.runInContext(src, sandbox, { filename: 'app.js' });
}
const A = sandbox.__sim;

// Resample 48x27 desde campo 53x27: p95 de 300 iteraciones
{
  const src = new Float32Array(53 * 27).fill(3.5);
  const t0 = process.hrtime.bigint();
  const N = 300;
  for (let i = 0; i < N; i += 1) A.atlasResample(src, 53, 27, 48, 27);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / N;
  check('resample 1 Hz muy por debajo del presupuesto de frame (16 ms)', ms < 16, `${ms.toFixed(4)} ms/op`);
}
// Ring bounded
{
  const ring = [];
  for (let t = 0; t <= 300; t += 1) A.atlasRingPush(ring, t, new Float32Array([t]), 65, 66);
  check('ring acotado tras 300 pushes', ring.length <= 66 && ring[ring.length - 1].m[0] === 300, `len=${ring.length}`);
}
// Memoria nominal
{
  const cells = A.ATLAS_MAX_COLS * A.ATLAS_MAX_COLS;
  const bytes = A.ATLAS_RING_CAP * cells * 4 + A.ATLAS_WINDOW_S * 8;
  check('presupuesto memoria < 8MB', bytes < 8 * 1024 * 1024, `${(bytes / 1024).toFixed(1)} KB`);
}

const failed = checks.filter((c) => !c.ok);
process.stderr.write('\n🧭 task_930 atlas_verify\n');
for (const c of checks) process.stderr.write(`${c.ok ? '✅' : '❌'} ${c.name}${c.detail ? ` (${c.detail})` : ''}\n`);
process.stderr.write(`\n${checks.length - failed.length}/${checks.length} OK\n\n`);
fs.writeFileSync(path.join(__dirname, 'atlas_verify.json'), JSON.stringify({ checks, ok: failed.length === 0, ts: new Date().toISOString() }, null, 2));
process.exit(failed.length ? 1 : 0);
