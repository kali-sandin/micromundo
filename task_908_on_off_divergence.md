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

## Consolidación OFF real 3/3 seeds (2026-08-19 04:5x, commit 839c95e)

Extinciones 3/3: predator y producerC extintos entre t=160-390s. Consumidores sobreviven y se estabilizan ~1730-1780.

| seed | ext pC | ext predator | consumers final | NET estimado | residual_max |
|------|--------|--------------|----------------|--------------|--------------|
| 12345 | t=280 | t=270 | 1738 | metab 682 vs fotosint 90 | 26.1% |
| 20264 | t=160 | t=310 | 1730 | metab 706 vs fotosint 91 | 36.5% |
| 28183 | t=270 | t=390 | 1777 | metab 671 vs fotosint 89 | 11.4% |

Estructura final común en OFF: 2 guildas (producerA field + producerB colony + consumers). El sistema ON sostiene 4-5 guildas solo gracias a migración-rescate (77-757 rescates en seed 12345). Conclusión provisional: sin rescate, el déficit energético de niveles tróficos superiores (predator) y el pastoreo insostenible sobre producerC son estructurales; el +43% energía reportado antes era artefacto (OFF previos eran ON). Batch OFF sigue (run_4/20); comparación formal al completar 20/20 con compare_on_off.js.

Métricas exactas tail-30s (media últimos 5 min) por seed en `batch_30m_results_off/summary_off_3seeds.json`: NET -625/-642/-628 E/s, metab 691-705 E/s, fotosint ~90 E/s, maxCons 2187-2261, births 1738-1818 vs deaths 978-1019. Uniformidad inter-seed muy alta (CV NET <1.5%): el colapso OFF 2-guildas es determinista, no estocástico.

## OFF 4/4 seeds (2026-08-19 05:2x)

run_4 seed 36102 confirma el patrón: 2 extinciones (predator+producerC), NET -604.7 E/s (tail mean), metab 647.4 vs fotosint 88.0. `summary_off_4seeds.json`: NET mean -602.5 E/s, CV 1.85%, 4/4 colapso 2-guildas. Con 4/4 idéntico, la probabilidad de que 20/20 OFF cambie de régimen es despreciable; el resto del batch confirma y acota varianza. Batch sigue (run_5/20); decisión ON/OFF para Jared/Richard con esta evidencia.

## Comparativa ON vs OFF emparejada 4 seeds (2026-08-19 05:3x, interim)

`node compare_on_off.js batch_30m_results batch_30m_results_off` (semillas 12345/20264/28183/36102 emparejadas, flows/drift 2ª mitad):

- **Guildas**: OFF pierde predator y producerC en 4/4 (Δ -100% ambos). ON sostiene pred 7-14 y pC 4-17 (aunque pC marginal, 3/4 seeds <15).
- **Energía**: pool final ON 60603 vs OFF 59991 (Δ -1.0%); NET drift 2ª mitad ON 28.1 vs OFF 27.0 E/s (Δ -3.6%); graze y metabolism casi idénticos (Δ <1%).
- **Nota NET**: el NET tail-30 de summary_off_4seeds (-602 E/s) usa ventana de 5 min sobre fase transitoria post-colapso (consumers catabolizando biomasa de boom); el NET de 2ª mitad (27 E/s) refleja el meseta estable. Ambos consistentes: OFF converge a meseta 2-guildas energeticamente neutra.
- **Conclusion clave**: migración-rescate NO cambia el balance energetico global (<1%); su efecto real es **mantener biodiversidad trófica** (5 guildas vs 2). El deficit energetico de niveles superiores es estructural; la migracion solo lo enmascara.
- Pass rate 0/4 en ambos regimenes (criterio >=18/20 con todas las guildas): la vigencia de task_908 sigue siendo decision de Jared/Richard. residual_max ON 168% vs OFF 37% (sintoma del boom-bust con rescates ON).

Interim mientras run_5/20 OFF corre (ETA total batch ~15h desde 02:47). Comparacion formal 20/20 al terminar.

## Actualización (05:50): consolidado 4/4 seeds emparejadas

Extinción OFF (última muestra con población >0; ON 4/4 vivo a t=1800s):

| seed | predator OFF ext | producerC OFF ext | rescates ON (predator/pC) |
|------|------------------|-------------------|---------------------------|
| 12345 | t=260 | t=270 | 77 / 757 |
| 20264 | t=300 | t=150 | 93 / 209 |
| 28183 | t=380 | t=260 | 95 / 128 |
| 36102 | t=300 | t=160 | 103 / 804 |

- 4/4 seeds OFF: predator y producerC extintos t=150–390s; en 3/4 pC cae antes que predator
  (declive autónomo por pastoreo, no colateral).
- Energía tail-30: NET ON -604 a -639 vs OFF -599 a -645 E/s — prácticamente idénticos.
  El colapso de 2 guildas apenas cambia el balance energético global: consumers en meseta
  ~1700-2300 sostienen el déficit metabólico (~700 vs fotosíntesis ~90 E/s) en ambos modos.
- Conclusión reforzada: la viabilidad ON de predator/pC es 100% dependiente de rescate
  (94±10 y 475±300 inyecciones/30m). El déficit energético NET ~-620 E/s existe en ambos
  modos y no es causa de la extinción (pA/pB/consumers persisten con el mismo déficit).
- Batch OFF sigue (run_5/20, t≈1200/1800s). ETA restante ~10-11h.
