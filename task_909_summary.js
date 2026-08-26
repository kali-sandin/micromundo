#!/usr/bin/env node
// task_909 — resume throughput: parsea progreso stderr (t=Xs wall=Ys) y JSON final
'use strict';
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, 'task_909_results');
const files = fs.readdirSync(dir).sort();
for (const f of files) {
  const p = path.join(dir, f);
  if (f.startsWith('bench_') && f.endsWith('.json')) {
    const r = JSON.parse(fs.readFileSync(p, 'utf8'));
    for (const run of (r.runs || [])) {
      console.log(`${f}: seed=${run.seed} sim=${run.duration_sim_sec}s wall=${(run.wall_time_ms / 1000).toFixed(1)}s ratio=${(run.wall_time_ms / 1000 / run.duration_sim_sec).toFixed(2)}x speed=${run.speed_factor}`);
    }
  } else if (f.startsWith('bench_') && f.endsWith('.time.txt')) {
    const lines = fs.readFileSync(p, 'utf8').split('\n').filter(l => /\[seed/.test(l));
    let prevWall = 0;
    const deltas = lines.map(l => {
      const m = l.match(/t=(\d+)s\/(\d+)s wall=(\d+)s/);
      if (!m) return null;
      const w = +m[3]; const d = w - prevWall; prevWall = w;
      return `sim${m[1]}: ${d}s`;
    }).filter(Boolean);
    console.log(`${f} chunks: ${deltas.join(' | ')}`);
  } else if (f.endsWith('_env.txt')) {
    console.log(`--- ${f}: ${fs.readFileSync(p, 'utf8').trim().replace(/\n/g, ' ; ')}`);
  }
}
