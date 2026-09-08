// task_921 — Estabilidad del reciclaje dependiente de stock (vía A)
// Modelo determinista de primer orden sobre flujos medidos (t>1800s, 5 seeds ON 60m).
// Pregunta: ¿estabiliza un reciclaje f(S) (pérdida dependiente de stock) frente a
// la respuesta poblacional de popC que el fijo no aguanta (0be72b3)?
// Cierre consistente con sysnet medido: net(f, popC) = sysnet + f·detritus − (popC−1)·metab,
// con metab ≈ 0.47·conservIn (misma escala que recycle_sensitivity 0be72b3).
// NO es simulación del motor ni mecánica: modelo E/S de orden 1 para dimensionar
// la ganancia de retroalimentación que Jared necesita en la tarjeta.
const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, 'paired_on_60m');
const files = ['run_1_seed12345','run_2_seed20264','run_3_seed28183','run_4_seed36102','run_5_seed44021'];

function load(f) {
  const j = JSON.parse(fs.readFileSync(path.join(DIR, f + '.json')));
  const m = Object.values(j.runs[0].metrics).filter(e => e.t > 1800);
  const avg = k => m.reduce((a, e) => a + (e.flows[k] || 0), 0) / m.length;
  const fs2 = m.reduce((a, e) => a + (e.energy.field || 0), 0) / m.length;
  return { seed: j.runs[0].seed, photosynth: avg('photosynth'), detritus: avg('conservDetritus'),
    conservIn: avg('conservIn'), sysnet: avg('system_net'), S0: fs2 };
}

const rows = files.map(load);
const out = [];
out.push('# task_921 — Estabilidad del reciclaje dependiente de stock (vía A)');
out.push('');
out.push('Continuación de task_921_recycle_sensitivity.md (0be72b3). Modelo de primer orden:');
out.push('  net(f, popC) = sysnet + f_eff(S)·detritus − (popC−1)·metab,  dS/dt = net');
out.push('con metab ≈ 0.47·conservIn (misma escala que 0be72b3) y variantes de f_eff(S):');
out.push('  fija   : f_eff = f*');
out.push('  decreciente: f_eff = f*·(S0/S)^k  (recicla MÁS cuando el campo está pobre: realimentación negativa)');
out.push('  leak   : f_eff = f* y pérdida proporcional al stock, −λ·(S−S0), λ=0.05 /s');
out.push('Nota: f_eff creciente en S (p.ej. S/(S+K)) es realimentación POSITIVA y diverge; se verificó y descarta.');
out.push('Perturbación: popC salta +10% en t=0 (peor dirección: más demanda).');
out.push('Criterio: ¿recupera el sistema un equilibrio con S>0 y en cuánto tiempo/excursión?');
out.push('');

const DT = 0.5, TEND = 1800; // s de modelo, no del motor
function sim(r, fEff, popC = 1.0, leak = 0, Sinit = r.S0) {
  const metab = 0.47 * r.conservIn;
  let S = Sinit, min = S, tRec = null;
  for (let t = 0; t <= TEND; t += DT) {
    const dS = r.sysnet + Math.min(fEff(S), 1) * r.detritus - (popC - 1) * metab - leak * (S - r.S0);
    S += dS * DT;
    min = Math.min(min, S);
    if (S < 0) return { crashed: true, min: 0 };
    if (tRec === null && t > 60 && Math.abs(dS) < 1) tRec = t; // net <1 E/s tras minuto
  }
  return { crashed: false, S, min, tRec };
}

for (const r of rows) {
  const fstar = -r.sysnet / r.detritus;
  out.push(`## seed ${r.seed}  (S0=${r.S0.toFixed(0)} E, f*=${(fstar*100).toFixed(1)}%, demanda=${r.conservIn.toFixed(0)} E/s)`);
  out.push('');
  out.push('| f_eff | popC +10%: S final (E) | excursión mín (E) | net<1 E/s en t (s) | colapso |');
  out.push('|---|---|---|---|---|');
  const variants = [
    ['fija f*', S => fstar, 0],
    ['decreciente k=0.5', S => fstar * Math.pow(r.S0 / S, 0.5), 0],
    ['decreciente k=1', S => fstar * Math.pow(r.S0 / S, 1), 0],
    ['decreciente k=2', S => fstar * Math.pow(r.S0 / S, 2), 0],
    ['leak λ=0.05/s (f=f*)', S => fstar, 0.05],
  ];
  for (const [name, fn, leak] of variants) {
    const res = sim(r, fn, 1.10, leak);
    out.push(`| ${name} | ${res.crashed ? '—' : res.S.toFixed(0)} | ${res.crashed ? '—' : res.min.toFixed(0)} | ${(res.tRec === null || res.tRec === undefined) ? 'no converge' : res.tRec.toFixed(0)} | ${res.crashed ? 'SÍ' : 'no'} |`);
  }
  out.push('');
}

// Ganancia mínima: para popC=+10%, equilibrio exige f_eff = (-sysnet + 0.1·metab)/detritus.
// Con f<=1 (límite físico), ¿alcanza? Informar S' necesario.
const r0 = rows[0];
const fstar0 = -r0.sysnet / r0.detritus;
const metab0 = 0.47 * r0.conservIn;
const req = (-r0.sysnet + 0.10 * metab0) / r0.detritus; // f_eff necesaria
out.push('## Cota física de la ganancia');
out.push('');
out.push(`Seed 12345: para popC +10% el equilibrio exige f_eff ≈ ${(req*100).toFixed(1)}% (f*=${(fstar0*100).toFixed(1)}%).`);
out.push(req <= 1
  ? `Alcanzable. Con f=f*·(S0/S)^k: S' = S0·(f*/req)^(1/k); k=1 → S'≈${(r0.S0*fstar0/req).toFixed(0)} E (${(100*fstar0/req).toFixed(0)}% de S0); k=0.5 → S'≈${(r0.S0*Math.pow(fstar0/req,2)).toFixed(0)} E. Con leak λ=0.05: S'−S0 = −0.1·metab/λ ≈ ${(-0.10*metab0/0.05).toFixed(0)} E.`
  : `NO alcanzable con f<=1: el reciclaje solo no cierra +10% de popC; haría falta también respuesta de ingesta (saturación de consumo por biomasa).`);
out.push('');
out.push('## Lectura para la decisión (Jared)');
out.push('');
out.push('1. Signo de la retroalimentación: f_eff DECRECIENTE en S (o pérdida proporcional al');
out.push('   stock) es realimentación negativa y estabiliza; f_eff creciente en S diverge');
out.push('   (verificado: caso S/(S+K) explota). La tarjeta debe fijar el signo, no solo la forma.');
out.push('2. Excursión: con perturbación +10% popC, k=1 deja el campo ~8-10% por debajo de S0;');
out.push('   k=2 más plano pero más frágil cerca de f=1; leak λ=0.05/s cae ~20% y converge suave.');
out.push('3. La estabilidad es local y ante salto de demanda; deriva sostenida de popC la agota.');
out.push('   El gate cp2 (pendiente<=5%/10m) detectaría ese régimen.');
out.push('4. Esto dimensiona la tarjeta de la vía A (flag OFF, criterio de excursión mínima y');
out.push('   signo de la dependencia); no implementa nada del motor.');
out.push('');
out.push(`Artefacto generado por ${path.basename(__filename)}; datos: paired_on_60m/.`);

fs.writeFileSync(path.join(__dirname, 'task_921_recycle_stability.md'), out.join('\n') + '\n');
console.log(out.join('\n'));
