# task_908 — Divergencia ON/OFF: análisis seed 12345 (OFF real, run_1)

Fecha: 2026-08-19 03:30. Datos: `batch_30m_results/run_1_seed12345.json` (ON) vs
`batch_30m_results_off/run_1_seed12345.json` (OFF real, `--migration=off`, fix c653f2c).

## Resultado clave

Las trayectorias ON y OFF son **idénticas muestra a muestra hasta t=110.1s**.
Primera divergencia en t=120.2s (producerC 9 OFF vs 10 ON). Causa: `checkMigration`.

## Mecanismo (verificado en código, app.js `checkMigration`)

- Con `--migration=off`, el harness fija `migrationTimer=1e9` → `checkMigration` no se ejecuta nunca.
- `checkMigration` tiene fast-exit: solo consume RNG cuando alguna población < 15 (THRESHOLD).
- Por tanto ON y OFF comparten el flujo RNG exacto mientras todas las poblaciones ≥ 15.
- seed 12345: producerC cae 228→16 (t=100) → 12 (t=110). Entre 110 y 120s ON tira su primer
  `chance(rescueChance(12))` acertado e inyecta producerC; desde ahí los flujos RNG divergen
  permanentemente. **La divergencia ON/OFF es causalmente atribuible solo a migración.**

## Consecuencias OFF (sin rescate, 30m, seed 12345)

- producerC extinto t=280.2s (228→12 en 110s; declive inicial independiente de migración).
- predator extinto t=270.2s (30→0; colapsa tras quedarse sin presa viable).
- consumers boom 720→~2200→~1740; NET energía -449 E/s (metab 424 vs fotosíntesis 81).

## Consecuencias ON (misma seed, 30m)

- producerC sobrevive solo por rescate: **757 inyecciones en 30m** (~25/min); extinciones locales
  en t=590/871/1272/1562 seguidas de recolonización.
- predator: 77 rescates; primer rescate predator en t=270.2s — justo cuando OFF lo pierde.

## Interpretación para task_908

1. La estabilidad del baseline ON es **dependiente de migración**: producerC (y predator)
   no son viables por sí mismos en estas condiciones; `checkMigration` enmascara un déficit
   estructural (pC pierde ~95% de población en 110s desde el arranque).
2. El declive inicial de producerC (228→12 en 110s) ocurre antes de cualquier rescate y es
   idéntico ON/OFF: no es artefacto de migración, es dinámica base del arranque.
3. El batch OFF 20x30m en curso cuantificará si esto es sistemático (todas las seeds) o
   específico de seed 12345. Comparación global: `node compare_on_off.js batch_30m_results batch_30m_results_off`.

## Estado

- OFF batch: run_2/20 en curso (~15-16h ETA). No relanzar nada; runner sano.
- Este análisis no cambia reglas; es evidencia de línea base para Jared/Richard.
