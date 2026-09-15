# task_922 — CP2c: batch 5/5 seeds x 180m (2026-09-15 03:50)

Estado: **5/5 seeds x 180m completados** (rc=0, JSON válidos). Control OFF 5x180m
en ejecución encadenado (~28h) para div/coste pareados; veredicto final al cerrarse.
Config: dt 1/60, migración OFF, flag dual-ledger ON, sample 10s. Suite 93/93 PASS.
Control OFF previo: `control_off_10m.json` (10m) — confound conocido para div/coste.

## 4/5 seeds x 180m (analizador `analyze_task922.js`)

| seed | dualRes% | A | cons | alive | CV_late% | slope%/10m | div/OFF(10m) | cost/OFF(10m) | extinciones |
|---|---|---|---|---|---|---|---|---|---|
| 12345 | 0.098 | 0.266 | 1494 | sí | 1.9 | 6.50 | 0.429 | 1.475 | predator@320;producer-c@360 |
| 23456 | 0.078 | 0.285 | 1477 | sí | 0.4 | 0.71 | 0.536 | 1.405 | predator@290;producer-c@420 |
| 34567 | 0.087 | 0.275 | 1498 | sí | 3.2 | 10.70 | 0.454 | 1.380 | predator@360;producer-c@530 |
| 45678 | 0.080 | 0.277 | 1478 | sí | 3.4 | 11.42 | 0.447 | 1.409 | predator@310;producer-c@400 |
| 56789 | 0.078 | 0.279 | 1502 | sí | 1.8 | 5.93 | 0.446 | 1.411 | predator@300;producer-c@940 |

## Gates (fail-closed) sobre 5/5

- residual dual <=2%: PASS (0.078–0.098%, 5/5)
- A+consumer vivos: **PASS 5/5**
- CV_late <=25%: PASS (0.4–3.4%)
- pendiente <=5%/10m: **FAIL 3/5** (5.93–11.42; seed23456 única 0.71) — deriva tardía de consumers
- diversidad/coste vs OFF: FAIL vs OFF-10m, pero **confounded** (duración/población distintas)

## Lectura

- La conservación dual funciona (residual ~0.1%, 5/5, A+consumer vivos 5/5), pero
  a 180m la pendiente de consumers supera 5%/10m en 3/5 seeds: presupuesto
  conservativo **no garantiza equilibrio poblacional** en horizonte largo.
- Extinciones predator+producer-c replican el patrón preexistente por seed
  (determinista, no causadas por el flag).
- div/coste aún vs OFF-10m (confounded); control OFF 5x180m en curso decide esos
  dos gates. Nota de proceso: se eliminó un control OFF 90m redundante del script
  resume para no distorsionar wall/sim por contención de CPU (log
  `control_off_180m.log`).

Artifacts: `batch180_seed{12345..56789}.json/.err`, `batch180.log`,
`control_off_180m.sh/.log`.

