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
