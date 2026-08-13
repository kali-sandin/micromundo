#!/usr/bin/env node
'use strict';
// Quick diagnostic: run 10s sim, print per-interval residual breakdown
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PROJ_DIR = path.resolve(__dirname);
const APP_JS = path.join(PROJ_DIR, 'app.js');
const src = fs.readFileSync(APP_JS, 'utf8');

// Extract SIM namespace
const m = src.match(/const SIM\s*=\s*\{[\s\S]*?\n\};/);
if (!m) { console.error('Cannot find SIM'); process.exit(1); }
const simConst = m[0];

// Extract helper consts
const constMatches = src.match(/(?:const|let)\s+(BASE_DT|SIM_FRAME|FIELD_COLS|FIELD_ROWS|CELL_SIZE|WORLD_W|WORLD_H|MAX_\w+)\s*=\s*[^;]+;/g) || [];
const constPreamble = constMatches.join('\n');

// Extract TYPE
const typeM = src.match(/const\s+TYPE\s*=\s*\{[^}]+\};/);
const typeConst = typeM ? typeM[0] : 'const TYPE = {PRODUCER:0, PRODUCER_B:1, PRODUCER_C:2, CONSUMER:3, PREDATOR:4};';

// Extract functions
function extractFuncs(names) {
  let result = '';
  for (const name of names) {
    // Match function declarations or const = function
    const patterns = [
      new RegExp(`function\\s+${name}\\s*\\([\\s\\S]*?\\n\\}`, 'g'),
      new RegExp(`const\\s+${name}\\s*=\\s*\\([\\s\\S]*?\\);`, 'g'),
      new RegExp(`function\\s+${name}\\s*\\([\\s\\S]*?\\n\\}\\n`, 'g'),
    ];
    for (const p of patterns) {
      const fm = src.match(p);
      if (fm) { result += fm.join('\n') + '\n'; break; }
    }
  }
  return result;
}

const allFuncs = extractFuncs([
  'mulberry32','createSim','initWorld','stepProducerField','stepMobile',
  'grazeProducerDensity','feedConsumer','canEatArmored','reproduceMobile',
  'kill','updateGeneStats','rebuildGrid','compactIfNeeded','queryNearby',
  'stepCarcasses','checkMigration','derivedConsumerStats','derivedPredatorStats',
  'drawCreature','steerCreature','rand','randInt','clamp','lerp','stepProducer',
  'stepProducerB','stepProducerC','worldToScreen','screenToWorld','render',
  'drawCarcasses','updateFieldCanvas','feedProducerC','colonyFeed',
  'updateCamera','handleMouseDown','handleMouseMove','handleMouseUp',
  'handleWheel','handleKeyDown','resizeCanvas','drawSelectionRing',
  'drawStatsOverlay','drawMinimap','animateLoop','produceFieldPrelude',
]);

const setupCode = `
${constPreamble}
${typeConst}
${simConst}
${allFuncs}
`;

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(setupCode, sandbox);

// Init
const api = sandbox;
api.initWorld(api.createSim(), 42);

// Run 20s, sample every 2s
const DT = 1/60;
const INTERVAL = 2.0;
const steps = Math.ceil(20 / DT);
const sampleEvery = Math.ceil(INTERVAL / DT);
let prevMobile = 0;
let prevFlow = {};

function snapshotFlow() {
  const out = {};
  for (const k of Object.keys(api.sim.flowAccum)) {
    out[k] = api.sim.flowAccum[k];
  }
  return out;
}

// Initial
let pe = 0, ce = 0, pre = 0, care = 0;
for (const e of api.sim.entities) {
  if (e.type === api.TYPE.PRODUCER) pe += (e.energy||0) + (e.leafEnergy||0);
  if (e.type === api.TYPE.CONSUMER) ce += (e.energy||0);
  if (e.type === api.TYPE.PREDATOR) pre += (e.energy||0);
}
// Carcasses
for (const c of (api.sim.carcasses||[])) care += (c.energy||0);
prevMobile = pe + ce + pre + care;
prevFlow = snapshotFlow();

console.log('t, ΔE_mobile, photosynthDirect, trophicAmp, graze+colony+prodC, predation, carcassEat, birthGain, metab+thermal+carcassExp+prodLoss+reproWaste+deathDecay+excret+carcassToField, expected, residual%');

for (let s = 1; s <= steps; s++) {
  api.stepProducerField(DT);
  api.stepMobile(DT);
  api.stepCarcasses(DT);
  api.sim.time = s * DT;

  if (s % sampleEvery === 0) {
    // Current energy
    let pe2=0, ce2=0, pre2=0, care2=0;
    for (const e of api.sim.entities) {
      if (e.type === api.TYPE.PRODUCER) pe2 += (e.energy||0) + (e.leafEnergy||0);
      if (e.type === api.TYPE.CONSUMER) ce2 += (e.energy||0);
      if (e.type === api.TYPE.PREDATOR) pre2 += (e.energy||0);
    }
    for (const c of (api.sim.carcasses||[])) care2 += (c.energy||0);
    const curMobile = pe2 + ce2 + pre2 + care2;
    const deltaMobile = curMobile - prevMobile;

    // Flows
    const curFlow = snapshotFlow();
    const dt_real = INTERVAL;
    const f = {};
    for (const k of Object.keys(curFlow)) {
      f[k] = (curFlow[k] - prevFlow[k]) / dt_real;
    }

    const photosynthDirect = f.photosynthDirect || 0;
    const trophicAmp = f.trophicAmplification || 0;
    const grazing = (f.graze||0) + (f.colonyFeed||0) + (f.prodCGraze||0);
    const predation = f.predation || 0;
    const carcassEat = f.carcassEat || 0;
    const birthGain = f.birthGain || 0;
    const reproWaste = Math.max(0, (f.reproduction||0) - (f.birthGain||0));
    const destruction = (f.metabolism||0) + (f.thermal||0) + (f.carcassExpire||0)
      + (f.producerLoss||0) + reproWaste + (f.deathDecay||0) + (f.excretion||0) + (f.carcassToField||0);

    const mobileInputs = photosynthDirect + trophicAmp + grazing + predation + carcassEat + birthGain;
    const expected = (mobileInputs - destruction) * dt_real;
    const residual = Math.abs(deltaMobile - expected);
    const scale = Math.max(Math.abs(expected), Math.abs(deltaMobile), 1);
    const residualPct = (residual / scale) * 100;

    console.log(`${(s*DT).toFixed(1)}, ${deltaMobile.toFixed(1)}, ${photosynthDirect.toFixed(2)}, ${trophicAmp.toFixed(2)}, ${grazing.toFixed(2)}, ${predation.toFixed(2)}, ${carcassEat.toFixed(2)}, ${birthGain.toFixed(2)}, ${destruction.toFixed(2)}, ${expected.toFixed(1)}, ${residualPct.toFixed(1)}%`);

    prevMobile = curMobile;
    prevFlow = curFlow;
  }
}
