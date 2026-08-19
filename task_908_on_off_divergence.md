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

## Actualización (03:45): runs OFF 2/20 confirmados

- **run_1 seed12345**: ext predator t=270.2, producerC t=280.2. NET -607 E/s.
- **run_2 seed20264**: ext producerC t=160.2, predator t=310.3. NET -615 E/s.
- Patrón idéntico en 2/2 seeds OFF: productores B y A estables, consumers boom (~720→2178 p95) y luego meseta ~1600-1700, predator+producerC extintos <6 min, consumo energético neto negativo ~-610 E/s sostenido.
- run_2 reproduce el orden inverso (pC antes que predator): pC no depende del colapso predator; su declive es autónomo (pastoreo temprano de consumers).

## Actualización (04:35): checkpoint 3/20 seeds OFF

- **run_3 seed28183**: ext producerC t=270.2, predator t=390.4. NET -610 E/s (agregado).
- 3/3 seeds OFF: patrón idéntico (pA/pB estables, consumers meseta ~1750, predator+pC extintos <7 min, 3/5 guildas, 2 ext/seed).
- `compare_on_off` con seeds emparejadas (3): Δ pool ON→OFF **-2.1%** (61267 vs 59966 E), drift NET ON +28.7 vs OFF +26.8 E/s. El **+43% energía** previo era artefacto de runs OFF inválidos (eran ON).
- Contraste clave ON vs OFF (3 seeds): pC ON 8.7±5.9 vs OFF 0; predator ON 10.3±2.9 vs OFF 0; predation flow ON 0.20 vs OFF 0 E/s; residual entity ON 168% vs OFF 36% (residual alto ON = migración inyecta energía).
- Conclusión provisional: sin migración el sistema pierde 2/5 guildas de forma determinista; con migración sobrevive 4-5/5 pero introduce energía externa (residual 168%) y pass rate ON sigue 0/20. El criterio de éxito de task_908 no se cumple en ningún modo; la decisión (reformular rescate vs aceptar extinción local) es de dirección.

## Estado

- OFF batch: run_4/20 en curso. ETA restante ~12-13h. No relanzar nada; runner sano (speed 0.70x).
- Este análisis no cambia reglas; es evidencia de línea base para Jared/Richard.
