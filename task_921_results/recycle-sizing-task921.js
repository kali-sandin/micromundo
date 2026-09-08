// task_921 — Sensibilidad del reciclaje de detrito (opción A)
// Post-refutación cp2 + options analysis. Sin simulaciones nuevas:
// aritmética de primer orden sobre flujos medidos (ventana t>1800s, 5 seeds ON 60m).
// Pregunta: ¿cómo de robusta es la fracción de reciclaje f* ≈ 86-87%?
const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, 'paired_on_60m');
const files = ['run_1_seed12345','run_2_seed20264','run_3_seed28183','run_4_seed36102','run_5_seed44021'];

function load(f) {
  const j = JSON.parse(fs.readFileSync(path.join(DIR, f + '.json')));
  const m = Object.values(j.runs[0].metrics).filter(e => e.t > 1800);
  const avg = k => m.reduce((a, e) => a + (e.flows[k] || 0), 0) / m.length;
  const fs2 = m.reduce((a, e) => a + (e.energy.field || 0), 0) / m.length;
  return {
    seed: j.runs[0].seed, n: m.length,
    photosynth: avg('photosynth'), detritus: avg('conservDetritus'),
    assim: avg('conservAssim'), conservIn: avg('conservIn'),
    sysnet: avg('system_net'), fieldStock: fs2,
  };
}

const rows = files.map(load);
const out = [];
out.push('# task_921 — Sensibilidad del reciclaje de detrito (opción A)');
out.push('');
out.push('Continuación de task_921_options_analysis.md. Misma base: flujos medios en');
out.push('ventana estable t>1800s de los 5 runs ON 60m (dt 1/60, migr OFF, eta .5, 18 E/mass).');
out.push('Primer orden: el reciclaje de fracción f del detrito devuelve f·detritus al campo A;');
out.push('respuestas poblacionales de segundo orden no incluidas.');
out.push('');
out.push('Definición: f* = -system_net / conservDetritus (fracción que anula el déficit).');
out.push('Identidad de cierre: con f = f*, la pérdida residual (1-f)·detritus ≈ input solar,');
out.push('es decir, metabolismo se paga con sol y el resto del ciclo es cerrado.');
out.push('');
out.push('| seed | f* | pérdida residual (E/s) | fotosíntesis (E/s) | retención/ciclo R | stock campo E |');
out.push('|---|---|---|---|---|---|');
for (const r of rows) {
  const f = -r.sysnet / r.detritus;
  const R = r.assim / r.conservIn + f * (1 - r.assim / r.conservIn); // retención efectiva con reciclaje
  out.push(`| ${r.seed} | ${(f * 100).toFixed(1)}% | ${((1 - f) * r.detritus).toFixed(1)} | ${r.photosynth.toFixed(1)} | ${R.toFixed(3)} | ${r.fieldStock.toFixed(0)} |`);
}
out.push('');

// Sensibilidad: variación de metab (respuesta de popC) y de flujo de detrito
out.push('## Sensibilidad (seed 12345 como representante; rango entre seeds <±2%)');
const r0 = rows[0];
const f0 = -r0.sysnet / r0.detritus;
// déficit actual D = -sysnet. Con reciclaje f0: net(f) = -D + f·detritus.
// Perturbaciones: metab ±p (popC ±p) cambia D en ±p·metab; detrito ±q cambia aporte.
const metabApprox = r0.assim + r0.detritus - 0; // conservIn≈assim+detritus; uso conservIn como escala de demanda
out.push('');
out.push('| escenario | net con f*=f0 (E/s) | minutos hasta agotar/inundar stock campo (~6.3k E) |');
out.push('|---|---|---|');
const scen = [
  ['base (f=f*)', 0],
  ['popC +10% (metab +10%)', -0.10 * r0.conservIn * 0.47], // metabolismo ≈ 47% de conservIn≈demanda ingerida
  ['popC -10%', +0.10 * r0.conservIn * 0.47],
  ['detrito -10% (dieta más asimilable)', -0.10 * r0.detritus * f0],
  ['detrito +10%', +0.10 * r0.detritus * f0],
  ['peor caso combinado (+10% popC, -10% detrito)', -0.10 * r0.conservIn * 0.47 - 0.10 * r0.detritus * f0],
];
for (const [name, net] of scen) {
  const mins = net === 0 ? Infinity : Math.abs(r0.fieldStock / net / 60);
  out.push(`| ${name} | ${net >= 0 ? '+' : ''}${net.toFixed(1)} | ${isFinite(mins) ? mins.toFixed(1) : '∞'} |`);
}
out.push('');
out.push('## Lectura para la decisión (Jared)');
out.push('');
out.push('1. f* = 86.4–87.2% entre seeds: fracción estable, no un número mágico por seed.');
out.push('2. Con f=f*, la pérdida residual (1-f)·detritus ≈ 90–92 E/s ≈ input solar (90–97 E/s).');
out.push('   El cierre termodinámico es coherente: entra sol, sale metabolismo, el ciclo interno');
out.push('   retiene R ≈ 0.93 por pasada. Esa R tan alta es el precio de cerrar el ciclo: eta deja');
out.push('   de ser el control principal del sistema (riesgo ya anotado en options analysis).');
out.push('3. Sensibilidad dominante: respuesta poblacional de popC. ±10% de popC mueve el net');
out.push('   ±~64 E/s y agota/inunda el stock del campo (~6.3k E) en solo ~1.6 min de sim. Un f');
out.push('   fijo sin regulación de población NO mantiene el equilibrio: necesitaría pérdida de reciclaje dependiente de');
out.push('   stock (p.ej. saturación del detritívoro) o control de popC, que es mecánica nueva.');
out.push('4. Recomendación: si Jared aprueba la vía A, la tarjeta debe incluir explícitamente el');
out.push('   mecanismo de pérdida en el reciclaje y el criterio de estabilidad bajo respuesta');
out.push('   poblacional (pendiente <=5%/10m ya usado en cp2), con flag OFF por defecto.');
out.push('');
out.push(`Artefacto generado por ${path.basename(__filename)}; datos: paired_on_60m/.`);

fs.writeFileSync(path.join(__dirname, 'task_921_recycle_sensitivity.md'), out.join('\n') + '\n');
console.log(out.join('\n'));
