# task_921 — Checkpoint 1: ledger runtime conservativo, flag OFF

## Cambio
- `app.js` (`grazeProducerDensity`): transferencia trofica conservativa A->consumer
  activa SOLO con `globalThis.__CONSERVE.trophicA` (OFF por defecto, inerte en navegador).
  - ON: conversion documentada 18 E/mass (920: conv=18), sin densityFactor;
    eta 0.5 asimilada por el consumer; TODO lo no asimilado (fraccion (1-eta) y
    saturacion por maxEnergy) va a detrito. El paso A->consumer no crea energia neta.
  - Nuevos acumuladores `flowAccum`: `conservIn`, `conservAssim`, `conservDetritus`,
    `conservStarved` (starved = parte pedida y no otorgada; subconjunto diagnostico).
- `sim-harness.js`: flag `--conserve=trophic-a=on|off`, ctx `__CONSERVE`, metricas
  `conserv*` (E/s) y echo de flags en meta/config/aggregate.
- `test.js`: suite task_921 (3 tests):
  1. flag OFF: conserv* == 0 con grazing activo (inercia por defecto).
  2. flag ON: cierre exacto del ledger `in = assim + detritus` (tol 1e-9).
  3. flag ON: eta 0.5 exacto sin saturacion (assim == detritus, starved ~0).

## Verificacion
- `node test.js functional`: 80/80 PASS.
- Paridad OFF exacta vs baseline_off_60m (4919c0f, seed 12345, dt 1/60 exacto,
  migr off, 2m): consumers/producerC identicos en t=10..120 (maxdiff 0); conserv* = 0.
- Nota de protocolo: dt redondeado (0.0166667) induce deriva numerica;
  usar siempre `--dt=0.016666666666666666` (como run.sh del baseline).

## Siguiente (gate ON 5x10m)
`node sim-harness.js --duration=10 --seeds=5 --dt=0.016666666666666666
 --interval=10 --migration=off --conserve=trophic-a=on`
Gates: 5/5 stock>0, residual<=2%, ratio .8-1.2, A+consumer vivos, coste<=5%.
