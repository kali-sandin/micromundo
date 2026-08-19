#!/usr/bin/env node
/**
 * task_908: offline decomposition of residual_throughput vs migration injections.
 * Findings (ON 20x30m batch, batch_30m_results):
 *  - 100% of intervals with residual_throughput_pct > 1% contain migration
 *    energy injections (rates.migration_per_interval.energy).
 *  - Gap (deltaSystem - expectedDelta) correlates with PREDATOR migration energy,
 *    but not 1:1: ~154 intervals with predator migration balance (gap~0),
 *    ~106 do not (gap between 0.3x and 1x of migE). Mixed.
 *  - Mechanism hypothesis: migration books child energy into flowAccum.birthGain;
 *    systemOutputs uses reproductiveWaste = reproduction - birthGain, so migration
 *    energy is partially netted against normal-birth accounting. Not a clean
 *    system input => per-interval residual artifact in ON runs only.
 *  - Naive fix (add migEnergyTotal to systemInputs) double-counts balanced
 *    intervals: worst residual 6.09% -> 3.10% but creates ~2-3% error elsewhere.
 *    Reverted. Needs per-channel bookkeeping (separate migration birthGain from
 *    reproductive birthGain in flowAccum) before touching the invariant.
 *  - OFF runs (migration=off) are unaffected: no injections.
 * Usage: node task_908_residual_migration.js [dir=batch_30m_results]
 */
const fs = require('fs');
const dir = process.argv[2] || 'batch_30m_results';
let worstOld = 0, worstNew = 0, bal = 0, unbal = 0, mixed = 0, hiRes = 0, hiResWithMig = 0;
for (const f of fs.readdirSync(dir)) {
  const j = JSON.parse(fs.readFileSync(`${dir}/${f}`, 'utf8'));
  const run = j.runs ? j.runs[0] : j;
  const m = run.metrics;
  for (let i = 1; i < m.length; i++) {
    const s = m[i], p = m[i - 1], fl = s.flows;
    if (s.t === 0) continue;
    if (fl.residual_throughput_pct > 1) {
      hiRes++;
      const me = (s.rates.migration_per_interval || {}).energy || {};
      if (Object.values(me).some(v => v > 0)) hiResWithMig++;
    }
    const dSys = fl.system_energy - p.flows.system_energy;
    const inp = (fl.photosynthDirect || 0) + (fl.trophicAmplification || 0) + (fl.graze || 0);
    const out = (fl.metabolism || 0) + (fl.thermal || 0) + (fl.excretion || 0) + (fl.deathDecay || 0)
      + (fl.carcassExpire || 0) + (fl.carcassToField || 0) + (fl.producerLoss || 0) + (fl.reproductiveWaste || 0);
    const me = (s.rates.migration_per_interval || {}).energy || {};
    const mig = Object.values(me).reduce((a, b) => a + b, 0);
    const thr0 = Math.abs(dSys - (inp - out) * 10) / (((inp + out) * 10) || 1) * 100;
    const thr1 = Math.abs(dSys - (inp + mig / 10 - out) * 10) / (((inp + mig / 10 + out) * 10) || 1) * 100;
    if (thr0 > worstOld) worstOld = thr0;
    if (thr1 > worstNew) worstNew = thr1;
    if (mig > 0) {
      const gap = dSys - (inp - out) * 10;
      if (Math.abs(gap - mig) < mig * 0.3) unbal++;
      else if (Math.abs(gap) < mig * 0.3) bal++;
      else mixed++;
    }
  }
}
console.log({ hiRes, hiResWithMig, worstOld: +worstOld.toFixed(2), worstWithNaiveFix: +worstNew.toFixed(2), migBalanced: bal, migUnbalanced: unbal, mixed });
