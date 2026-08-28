# task_912 — Spike reversible: emboscada sit-and-pursue en vegetación

Fecha: 2026-08-28 · Agente: bruce-lee · Estado: **FALLO (hipótesis refutada)** · Flag `pred-ambush` queda **OFF**.

## Hipótesis
La emboscada (ocultación/reposo en vegetación + lunge corto 2.1x/0.9s) eleva contacto e ingreso del predator sin colapsar consumers.

## Implementación (reversible, flag OFF por defecto)
- `pred-ambush` flag en app.js: estado hide/reposo cuando el predator está en celda con vegetación y presa fuera de rango de revelado; reveal + lunge cuando la presa entra en rango corto.
- Sin queries nuevas: reutiliza grids/listas existentes.
- Sin tocar gains, metabolismo ni genética.

## Protocolo
Pareado 5 seeds x 10m OFF/ON (seeds 12345, 20264, 28183, 36102, 44021), dt 1/60, migración off, muestreo 10s, harness sim-harness.js. Tests 88/88 pass.

## Resultados (ON vs OFF)
| métrica | OFF | ON | criterio | veredicto |
|---|---|---|---|---|
| predators vivos | 0/5 (ext 270–380s) | 0/5 (ext 270–320s) | >=4/5 | FALLO |
| ratio ingreso/metab | 0.021–0.059 | 0.021–0.059 | 0.8–1.2 | FALLO |
| contacto/preyNear medio | 0.270% | 0.270% | >=1% | FALLO |
| consumers ON/OFF final | — | 100.5% | >=70% | OK |
| CV consumers ON | — | 0.397 | <=0.25 | FALLO |
| coste wall/sim ON vs OFF | — | −0.18% | <=5% | OK |

## Causa del fallo
El mecanismo casi no dispara: hide total 0–8.6s por run de 600s y lunge 0–0.2s (3/5 seeds sin un solo evento). El predator rara vez coincide con vegetación densa + presa cercana antes de morir por déficit energético basal (ratio ~0.03–0.06, igual que baseline task_910/911). La emboscada no cambia el funnel: el problema es estructural (ingreso de captura insuficiente), no de táctica de caza.

Rescates ON: 4 (estabilidad de consumers comparable a OFF).

## Conclusión
Hipótesis refutada con protocolo completo. Tres estrategias conductuales probadas (persecución continua, burst-coast, emboscada) no salvan al predator: la viabilidad requiere rediseño (Jared). Flag OFF; sin cambios de reglas ni coste perceptible.

Artefactos: `task_912_results/` (10 runs JSON + batch.log), `analyze-task912.js`, `run-task912-batch.sh`.
