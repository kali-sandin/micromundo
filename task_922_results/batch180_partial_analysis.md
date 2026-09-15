# task_922 — CP2b: batch 5x180m resultados parciales (2026-09-15 02:00)

Estado: 4/5 seeds x 180m completados (seed56789 en ejecución, ETA ~03:40).
Config: dt 1/60, migración OFF, flag dual-ledger ON, sample 10s. Suite 93/93 PASS.
Control OFF previo: `control_off_10m.json` (10m) — confound conocido para div/coste.

## 4/5 seeds x 180m (analizador `analyze_task922.js`)

| seed | dualRes% | A | cons | alive | CV_late% | slope%/10m | div/OFF(10m) | cost/OFF(10m) | extinciones |
|---|---|---|---|---|---|---|---|---|---|
| 12345 | 0.098 | 0.266 | 1494 | sí | 1.9 | 6.50 | 0.429 | 1.475 | predator@320;producer-c@360 |
| 23456 | 0.078 | 0.285 | 1477 | sí | 0.4 | 0.71 | 0.536 | 1.405 | predator@290;producer-c@420 |
| 34567 | 0.087 | 0.275 | 1498 | sí | 3.2 | 10.70 | 0.454 | 1.380 | predator@360;producer-c@530 |
| 45678 | 0.080 | 0.277 | 1478 | sí | 3.4 | 11.42 | 0.447 | 1.409 | predator@310;producer-c@400 |

## Gates (fail-closed) sobre 4/5

- residual dual <=2%: PASS (0.078–0.098%)
- A+consumer vivos: 4/4 (gate 5/5 incompleto, falta seed56789)
- CV_late <=25%: PASS (0.4–3.4%)
- pendiente <=5%/10m: **FAIL** (6.50–11.42 en 3/4 seeds; crece vs ventana 90m 0.01–4.33) — nuevo: deriva tardía de consumers con el horizonte
- diversidad/coste vs OFF: FAIL vs OFF-10m, pero **confounded** (duración/población distintas)

## Lectura provisional

- La conservación dual funciona (residual ~0.1%), pero a 180m emerge deriva de
  consumers >5%/10m en 3/4 seeds: el presupuesto conservativo no garantiza
  equilibrio poblacional en horizonte largo.
- Extinciones predator+producer-c idénticas al patrón OFF misma seed (determinista,
  preexistente, no causadas por el flag).
- div/coste exigen control OFF emparejado a 180m: lanzado
  `control_off_180m.sh` (5 seeds x 180m OFF encadenados tras el runner ON);
  veredicto final al completarse.

Artifacts: `batch180_seed{12345,23456,34567,45678}.json/.err`, `batch180.log`,
`control_off_180m.sh`.
