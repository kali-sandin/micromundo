# task_922 — CP2a: batch 5x90m resultados (2026-09-11)

Ejecución: 5 seeds x 90m sim, dt 1/60, migración OFF, flag dual-ledger ON (shadow).
Control OFF: `control_off_10m.json` (10m). Analizador: `analyze_task922.js`.

| seed | dualRes% | A_stock | cons | alive | CV_late% | slope%/10m | div/OFF | cost/OFF | extinciones |
|---|---|---|---|---|---|---|---|---|---|
| 12345 | 0.098 | 0.292 | 1522 | sí | 0.4 | 0.06 | 0.602 | 1.470 | predator@320;producer-c@360 |
| 23456 | 0.078 | 0.288 | 1508 | sí | 1.1 | 1.70 | 0.651 | 1.495 | predator@290;producer-c@420 |
| 34567 | 0.087 | 0.317 | 1510 | sí | 0.2 | 0.01 | 0.633 | 1.305 | predator@360;producer-c@530 |
| 45678 | 0.080 | 0.282 | 1566 | sí | 1.3 | 4.33 | 0.639 | 1.295 | predator@310;producer-c@400 |
| 56789 | 0.078 | 0.284 | 1567 | sí | 0.6 | 0.19 | 0.633 | 1.318 | predator@300;producer-c@940 |

## Gates (fail-closed)

- residual dual <=2%: **PASS** (0.078–0.098%)
- A+consumer vivos 5/5: **PASS**
- CV_late <=25%: **PASS** (0.2–1.3%)
- pendiente <=5%/10m: **PASS** (0.01–4.33) — pero seed45678 roza el límite
- diversidad >=80% OFF: **FAIL** (0.602–0.651)
- coste <=1.05x OFF: **FAIL** (1.295–1.495)
- extinciones: predator y producer-c se pierden en 5/5 (idéntico patrón que OFF)

**OVERALL: FAIL** en diversidad y coste relativos.

## Conocidos/confounds (registrados, no excusa)

1. div/OFF compara diversidad genética final a 90m (ON) vs 10m (OFF): la deriva
   genética decae con el tiempo, así que el ratio subestima ON. Se requiere control
   OFF de 90m para comparación justa; pendiente para CP2 final.
2. cost/OFF compara wall/sim de runs de 10m (OFF, pop pequeña inicial) vs 90m (ON,
   pop ~1500-2300 sostenida): el coste por paso crece con la población, por lo que
   el ratio está inflado por duración/población, no solo por el flag. El incremento
   directo medido en paridad 2m fue +1.5%.

## Decisión (según instrucción de Jared, msg_619)

- Pendiente E final en seed45678 (4.33%/10m, cerca del umbral 5%) y confounds de
  div/coste → extender a **5 seeds x 180m** antes de cerrar CP2 final.
- Sin reciclaje, sin tuning, sin tocar predator/genética.

Artifacts: `batch90_seed*.json/.err`, `batch90.log`.
