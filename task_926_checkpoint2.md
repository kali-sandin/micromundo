# task_926 — Gate: agregados Observatorio vs runtime (5 seeds x 10m)

- Harness: `task_926_gate.js` (commit e91eb41; fix x100 en max_flow_rel_err_pct 182af9e)
- Config: seeds 12345/23456/34567/45678/56789, dur 600s sim, dt=1/60, migración OFF, muestreo ~1s.
- Artefacto: `task_926_results/gate_5x10m.json` (+ .err progreso). Ejecución 2026-09-18 02:52–04:07 con contención CPU de task_927 en la misma máquina; métricas son ratios intra-proceso, no afectadas de forma material.

## Resultados

| seed | max_flow_rel_err % | max_stock_rel_err % | obs_cost % |
|------|--------------------|---------------------|------------|
| 12345 | 0.0019 | 0.1586 | 0.0941 |
| 23456 | 0.0014 | 0.1710 | 0.0969 |
| 34567 | 0.0013 | 0.1080 | 0.1218 |
| 45678 | 0.0014 | 0.1564 | 0.0915 |
| 56789 | 0.0017 | 0.1339 | 0.1013 |

Gates: flow ≤2% PASS 5/5 · stock ≤2% PASS 5/5 · coste ≤2% PASS 5/5.

Notas: predators 0 en las 5 seeds (extinción temprana consistente con lotes previos); flujos zero-flow (predation/carcass) con err 0. Stock field_biomass_mass err ~0.1–0.2% proviene de discretización de muestreo, dentro de presupuesto.

## Veredicto

Gate de cierre técnico de task_926 superado: agregados del Observatorio reproducen el runtime con error ≤2% (realmente ≤0.18%) y coste ≤2% (realmente ~0.1%). Pendiente solo validación UX 4/5 novatos (criterio humano, fuera de este gate).

## Addendum: verificación UX/a11y automatizable (2026-09-18 05:0x)

`task_926_results/ux_verify.js` (seed 12345, 180s sim, migr OFF, panel visible):
- Estático 13/13 PASS: toggle button type=button con nombre accesible, panel aria-label, canvas role=img+aria-label, cierre data-energy-close + handler Esc, tabla con caption y th scope, etiquetas de texto (no solo color), tendencias ▲/▼/± en texto, reflow 320px (media query, panel full-width, stocks 1 columna).
- Runtime: p95 updateObservatory 0.006ms/paso, p95 renderObservatory 0.44ms/sample << 16ms.

## Corrección de flake en suite (misma entrega)

Detectado: 3 tests de Observatorio podían fallar de forma no determinista porque
`runObservatoryTests` simulaba sin inicializar mundo (grid vacío; la migración
anti-extinción spawnea consumidores fuera de grid y `queryNearby2` lanza
TypeError). El "106/106" de CP1 fue un pase sujeto a este flake. Fix test-only:
`api.resetWorld()` al inicio de la suite, igual que el resto de suites que
simulan. Suite completa tras fix: 106/106 reproducible.

Pendiente 926: solo validación humana 4/5 novatos (criterio de cierre del kanban).
