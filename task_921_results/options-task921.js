#!/usr/bin/env node
// task_921 — cuantificación de opciones de equilibrio energético (post-refutación)
// Sin cambios de runtime. Lee los 5 runs ON 60m y calcula el punto de
// equilibrio de las 3 opciones planteadas, sobre la ventana estable t>1800s.
'use strict';
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, 'paired_on_60m');
const files = fs.readdirSync(DIR).filter(f => /^run_\d+_seed\d+\.json$/.test(f)).sort();

const rows = [];
for (const f of files) {
  const d = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
  const run = d.runs[0];
  const samples = run.metrics.filter(s => s.t > 1800 && s.flows);
  const n = samples.length;
  const mean = k => samples.reduce((a, s) => a + (s.flows[k] || 0), 0) / n;
  const photosynth = mean('photosynth');
  const detritus = mean('conservDetritus');
  const metab = mean('metabolism');
  const net = mean('system_net');
  const pop = samples.reduce((a, s) => a + (s.populations.consumers, 0), 0) / n;
  const popC = samples.reduce((a, s) => a + s.populations.consumers, 0) / n;
  // Opción A: reciclar fracción f del detrito conservativo al campo A
  const fRecycle = -net / detritus;
  // Opción B: multiplicador de input solar m (1 = actual)
  const mSolar = 1 + (-net / photosynth);
  // Opción C: reducción relativa de metabolismo consumer
  const rMetab = -net / metab;
  rows.push({
    seed: run.seed, n,
    photosynth: +photosynth.toFixed(1),
    detritus: +detritus.toFixed(1),
    metab: +metab.toFixed(1),
    net: +net.toFixed(1),
    popC: Math.round(popC),
    metabPerC: +(metab / popC).toFixed(3),
    fRecycle: +fRecycle.toFixed(3),
    mSolar: +mSolar.toFixed(2),
    rMetab: +rMetab.toFixed(3),
  });
}

const fmt = r =>
  `| ${r.seed} | ${r.n} | ${r.photosynth} | ${r.detritus} | ${r.metab} | ${r.net} | ${r.popC} | ${r.metabPerC} | ${(r.fRecycle*100).toFixed(0)}% | ${r.mSolar}x | ${(r.rMetab*100).toFixed(0)}% |`;

const lo = k => Math.min(...rows.map(r => r[k]));
const hi = k => Math.max(...rows.map(r => r[k]));

let md = `# task_921 — Opciones de equilibrio energético (análisis de consolidación)

Post-refutación cp2. Pregunta: ¿qué magnitud necesita cada opción para que
\`system_net ≈ 0\` en ON (flag conservativo activo)?

Método: media de flujos en ventana estable t>1800s de los 5 runs ON 60m
(dt 1/60, migr OFF, eta .5, conversión 18 E/mass). Sin simulaciones nuevas:
aritmética de primer orden sobre flujos medidos. Interacciones de segundo
orden (respuestas poblacionales) NO están incluidas: son cotas de arranque,
no predicciones.

| seed | n | photosynth | detritus | metab | net | popC | metab/C | f reciclar detrito | m solar | r metab |
|---|---|---|---|---|---|---|---|---|---|---|
${rows.map(fmt).join('\n')}

Rangos entre seeds:
- **Opción A — reciclar detrito al campo A**: fracción necesaria
  ${(lo('fRecycle')*100).toFixed(0)}–${(hi('fRecycle')*100).toFixed(0)}%
  del detrito conservativo (~${Math.round(lo('detritus'))}–${Math.round(hi('detritus'))} E/s).
  Con reciclaje total el net sería ≈ +${Math.round(lo('detritus') + lo('net'))} E/s (exceso; el
  stock del campo lo amortiza). Es la única opción que cierra el ciclo sin
  tocar la escala del input ni del metabolismo. Riesgo: convierte eta en un
  parámetro casi neutro (todo vuelve) y puede necesitar pérdida de reciclaje
  documentada para no recrear creación neta encubierta.
- **Opción B — subir input solar**: multiplicador ${(lo('mSolar')).toFixed(1)}–${(hi('mSolar')).toFixed(1)}x
  sobre photosynth (~${Math.round(lo('photosynth'))}–${Math.round(hi('photosynth'))} E/s actuales
  → ~${Math.round(lo('photosynth')*lo('mSolar'))}–${Math.round(hi('photosynth')*hi('mSolar'))} E/s).
  Cambia el régimen ecológico global (productividad primaria ~7x) y arrastra
  re-tuning de productores.
- **Opción C — bajar demanda consumer**: reducción de ~${(lo('rMetab')*100).toFixed(0)}–${(hi('rMetab')*100).toFixed(0)}%
  del metabolismo aggregate (~${Math.round(lo('metab'))}–${Math.round(hi('metab'))} E/s,
  ~${lo('metabPerC').toFixed(2)}–${hi('metabPerC').toFixed(2)} E/s por consumer con popC
  ${Math.round(lo('popC'))}–${Math.round(hi('popC'))}). Equivalente: misma reducción vía menos
  population (cap/regulación) con metab igual.

Nota transversal: conservIn (~1.3–1.5k E/s) sigue siendo ~15x el input solar;
cualquiera de las tres opciones deja el sistema dependiendo de stock del campo
A a corto plazo y de la opción elegida a largo. La opción A es la de menor
impacto lateral y la única que conserva el dimensionamiento actual.

Artefacto generado por options-task921.js; datos: task_921_results/paired_on_60m/.
`;
fs.writeFileSync(path.join(__dirname, 'task_921_options_analysis.md'), md);
console.log(md);
