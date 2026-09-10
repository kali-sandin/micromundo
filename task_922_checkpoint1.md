# task_922 — Checkpoint 1: dual ledger masa/E (shadow, flag OFF por defecto)

Corte: implementación shadow reversible en `sim-harness.js`, activable solo con
`--conserve=dual-ledger=on`. Sin cambios de conducta ni mecánica.

## Qué mide

Invariante dual en unidades E comunes: `E_valued = entidades + carcasses + 18*field.total`
(conversión documentada 18 E/mass de task_920).

```
dE_valued = solar(18*photoField + photoDirect)
          - destruccion(metab+thermal+deathDecay+carcExp+prodLossE+reproWaste+18*clamp)
          + grazeAmp(tAmp + bite*(1-18))
          + depositAmp(17*(excretion+carcassToField))
```

Sin términos xfer extra: carcassEat/birthGain ya cancelan con carcassExpire/reproWaste.

## Evidencia CP1

- Suite: **93/93 PASS** (commit base 83ed182 + dual ledger; flag OFF por defecto).
- Paridad OFF: run 2m OFF sin dual (idéntico a base) y control OFF 10m seed 12345:
  pop 913→1996, misma trayectoria que run ON (el flag solo añade contabilidad).
- Smoke dual 10m seed 12345 (`--conserve=dual-ledger=on`):
  - residual dual **max 0.098%**, mediana 0.027% (umbral ≤2%) ✅
- Coste: OFF 600s wall=726s vs dual ON wall=737s → **+1.5%** (≤5%) ✅

Artefactos: `task_922_results/` (parity_off_2m.json, smoke_dual_10m*.json, control_off_10m.json).

## Siguiente

Corte 2: 5 seeds x90m dt=1/60, migr OFF, sample 10s, dual ON; ampliar a 180m si
pendiente >5%/10m; CP2 con resultados.
