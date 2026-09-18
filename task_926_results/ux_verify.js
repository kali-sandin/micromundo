#!/usr/bin/env node
/**
 * task_926 ux_verify.js — Verificación headless de criterios UX/a11y del Observatorio.
 *   A) Estático (index.html/styles.css/app.js):
 *      1. toggle es <button type=button> con nombre accesible (title/texto).
 *      2. Panel section aria-label; canvas role="img" + aria-label; botón cierre + Esc.
 *      3. Tabla de flujos con caption, th scope y etiquetas de texto (texto+color, no solo color);
 *         tendencias con signo ▲/▼/± en texto.
 *      4. Reflow 320px: @media (max-width: 320px) ajusta .energy-panel y colapsa stocks a 1 col.
 *   B) Runtime (vm, DOM mock de test.js): panel visible, p95 de
 *      updateObservatory() por paso de sim y p95 de renderObservatory() por sampleo,
 *      sobre 180s sim (dt=1/60, migr OFF, seed 12345). Gate p95 < 16ms.
 * Salida: task_926_results/ux_verify.json + resumen stdout.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PROJ_DIR = path.resolve(__dirname, '..');
const APP_JS = path.join(PROJ_DIR, 'app.js');
const HTML = fs.readFileSync(path.join(PROJ_DIR, 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(PROJ_DIR, 'styles.css'), 'utf8');
const APP = fs.readFileSync(APP_JS, 'utf8');

const checks = [];
function check(name, ok, detail) { checks.push({ name, ok: !!ok, detail: detail || null }); }

// ── A) Estático ──────────────────────────────────────────────
const toggleBtn = /<button[^>]*id="toggleEnergy"[^>]*type="button"/.test(HTML);
const toggleName = /id="toggleEnergy"[^>]*title="[^"]+"/.test(HTML);
check('toggle Energía es button type=button', toggleBtn);
check('toggle tiene nombre accesible (title+texto)', toggleName);

check('panel section con aria-label', /<section[^>]*id="energyPanel"[^>]*aria-label=/.test(HTML));
check('canvas obsGraph role=img + aria-label', /id="obsGraph"[^>]*role="img"[^>]*aria-label=/.test(HTML));
check('botón cierre data-energy-close', /data-energy-close/.test(HTML));
check('handler Esc cierra panel (app.js)', /ev\.key === 'Escape'/.test(APP) && /energyPanel\.classList\.add\('hidden'\)/.test(APP));

check('tabla flujos con caption', /class="obs-flows"[^>]*>\s*<caption/.test(HTML) || /<caption[^>]*>[^<]*fluj/i.test(HTML));
check('tabla flujos usa th scope', /th scope="row"/.test(HTML) && /th scope="rowgroup"/.test(HTML));
check('etiquetas de texto en flujos (no solo color)', /obs-flows.*fotosintesis|Fotosíntesis|fotosintesis/s.test(HTML) && !/<td[^>]*>\s*<i class=/i.test(HTML));
check('tendencias con texto ▲/▼/± (texto+color)', /obsTrendText/.test(APP) && /(▲|▼|±)/.test(APP));

const mq320 = /@media \(max-width: 320px\)/.test(CSS);
const panel320 = /\.energy-panel\s*\{[^}]*left: 6px;/s.test(CSS.split('@media (max-width: 320px)')[1] || '');
const stocks320 = /\.obs-stocks\s*\{\s*grid-template-columns: 1fr;/.test(CSS.split('@media (max-width: 320px)')[1] || '');
check('reflow 320px: media query presente', mq320);
check('reflow 320px: panel a ancho completo', panel320);
check('reflow 320px: stocks colapsan a 1 columna', stocks320);

// ── B) Runtime p95 ───────────────────────────────────────────
function createDomMock() {
  const noopCtx = () => {
    const ctx = { setTransform() {}, fillRect() {}, clearRect() {},
      getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray((w || 800) * (h || 600) * 4) }),
      putImageData() {}, createImageData: (w, h) => ({ data: new Uint8ClampedArray((w || 800) * (h || 600) * 4), width: w, height: h }),
      save() {}, restore() {}, translate() {}, scale() {}, rotate() {},
      beginPath() {}, closePath() {}, arc() {}, ellipse() {}, fill() {}, stroke() {},
      moveTo() {}, lineTo() {}, fillText() {}, measureText: () => ({ width: 0 }), drawImage() {} };
    return ctx;
  };
  const worldCtx = noopCtx();
  const fakeCanvas = { width: 800, height: 600, getContext: () => worldCtx,
    getBoundingClientRect: () => ({ width: 800, height: 600, left: 0, top: 0 }) };
  const fakeEl = { textContent: '', innerHTML: '', value: '50', style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    appendChild() {}, removeChild() {}, querySelectorAll: () => [], querySelector: () => null,
    addEventListener() {}, removeEventListener() {}, setAttribute() {}, getAttribute: () => null,
    removeAttribute() {}, clientWidth: 800, clientHeight: 600, offsetWidth: 800, offsetHeight: 600,
    close() {}, showModal() {}, hidden: false };
  const canvasIds = new Set(['world', 'graph', 'geneGraph', 'obsGraph']);
  const doc = { getElementById: (id) => canvasIds.has(id) ? fakeCanvas : fakeEl,
    querySelector: () => fakeEl, querySelectorAll: () => [], createElement: (tag) => tag === 'canvas' ? fakeCanvas : fakeEl,
    createTextNode: () => fakeEl, body: fakeEl, documentElement: fakeEl,
    addEventListener() {}, removeEventListener() {}, readyState: 'complete' };
  const win = { innerWidth: 800, innerHeight: 600, devicePixelRatio: 1,
    addEventListener() {}, removeEventListener() {}, requestAnimationFrame: () => 0, cancelAnimationFrame: () => {} };
  globalThis.ResizeObserver = globalThis.ResizeObserver || class { observe() {} unobserve() {} disconnect() {} };
  return { document: doc, window: win };
}

function loadApp() {
  let src = APP;
  const exportsCode = `
    globalThis.__sim = {
      simulate, counts, sim, setSeed, resetWorld,
      compactIfNeeded, rebuildGrid, MAX_DT,
      observatory, updateObservatory, renderObservatory, obsReset,
    };
  `;
  src = src.replace(/\n  init\(\);\n\}\)\(\);\s*$/, '\n' + exportsCode + '\n})();\n');
  if (!src.includes('globalThis.__sim')) throw new Error('No se pudo inyectar exports');
  const { document, window } = createDomMock();
  const sandbox = { document, window, console, Math, JSON,
    ResizeObserver: class { observe() {} unobserve() {} disconnect() {} },
    requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
    performance: { now: () => 0 }, setInterval: () => 0, clearInterval: () => {},
    setTimeout: () => 0, clearTimeout: () => {} };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'app.js' });
  return sandbox.globalThis.__sim;
}

function pct(arr, p) { const a = [...arr].sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(p * a.length))]; }

const api = loadApp();
api.sim.seed = 12345 >>> 0;
api.resetWorld();
api.sim.migrationTimer = 1e9; // migracion OFF
api.updateObservatory(); // inicializa baseline
const DT = 1 / 60, T_SIM = 180;
const updT = [], renT = [];
for (let t = 0; t < T_SIM; t += DT) {
  const t0 = process.hrtime.bigint();
  api.updateObservatory();
  const t1 = process.hrtime.bigint();
  if (api.observatory.history.length && (api.observatory.history.length % 1) === 0) {
    // render es 1Hz en UI real; medimos por sample para no inflar por paso
    api.renderObservatory();
    const t2 = process.hrtime.bigint();
    renT.push(Number(t2 - t1) / 1e6);
  }
  updT.push(Number(t1 - t0) / 1e6);
  api.compactIfNeeded();
  api.rebuildGrid();
  api.simulate(DT);
  api.sim.migrationTimer = 1e9;
}

const p95upd = +pct(updT, 0.95).toFixed(4);
const p95ren = +pct(renT, 0.95).toFixed(4);
check('p95 updateObservatory < 16ms (por paso, panel visible)', p95upd < 16, `p95=${p95upd}ms n=${updT.length}`);
check('p95 renderObservatory < 16ms (por sample 1Hz)', p95ren < 16, `p95=${p95ren}ms n=${renT.length}`);

const staticOk = checks.filter(c => !c.name.startsWith('p95')).every(c => c.ok);
const allOk = checks.every(c => c.ok);
const out = { task: 'task_926', when: new Date().toISOString(),
  static_checks: checks.filter(c => !c.name.startsWith('p95')),
  runtime: { seed: 12345, t_sim_s: T_SIM, dt: DT, migration: 'off',
    p95_update_ms: p95upd, p95_render_ms: p95ren,
    samples: api.observatory.history.length },
  gates: { static_ok: staticOk, p95_ok: p95upd < 16 && p95ren < 16, all_ok: allOk } };
fs.writeFileSync(path.join(__dirname, 'ux_verify.json'), JSON.stringify(out, null, 2));
for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.detail ? '  (' + c.detail + ')' : ''}`);
console.log(`\nVERDICT: ${allOk ? 'OK' : 'FAIL'} (p95 upd ${p95upd}ms / ren ${p95ren}ms)`);
process.exit(allOk ? 0 : 1);
