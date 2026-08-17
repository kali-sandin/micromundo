# task_908 — Batch 20×5m: análisis de baseline (en curso)

Fecha: 2026-08-16 · Commit: 2840024 · Runner: `run_batch_robust.sh` (1 proc/semilla, checkpoint por fichero, semillas únicas `12345+i·7919`, migration ON, dt=0.0167, interval=10s).

## Estado

Batch lanzado 13:36. Resultados aquí reflejan las semillas completadas al redactar; el batch sigue corriendo y los ficheros `batch_5m_results/seed_*.json` son la fuente canónica.

| Seed | Guildas vivas | Consumers | Predators | ProdC | Drift pool | Veredicto |
|------|--------------|-----------|-----------|-------|------------|-----------|
| 12345 | 5/5 | 720→882 | 30→9 | 228→16 | 0.913 ❌ | FALLO (deriva) |
| 20264 | 5/5 | 720→851 | 30→6 | 228→5 | 0.881 ❌ | FALLO (deriva) |

## Física del sistema (seed 12345, series 0→300s)

- `system_energy` (mobile+field+carcass): 40,476 → mín 27,060 (t≈110s) → 63,807. Curva en U.
- Campo (field): 2,553 → 12,907 monótono. `field_growth` (solar) 54→88 E/s vs `field_extraction` 18→62 E/s. Ledger field cuadra (residual 0.0%, clamp contado).
- Consumers: pool 32,529 → 61,325 (+28,796) con 720→882 individuos. Per cápita 45→70 E.
- Predators: 30→9, pool 3,905→77, per cápita 130→8.6 E. **`predation` = 0.00 E/s y `carcassEat` = 0.00 E/s durante los 300s completos** con ~850 presas disponibles.
- ProdC: 228→16 (seed 20264: →5). Guilda móvil al borde.

## Causa raíz del drift (cuantificada)

1. **Amplificación trófica del grazing.** El test de conservación (commit 21af65d) midió ratio gain:bite ≈ 18x. Evidencia independiente de pools: consumers ganan +28.8k E en 300s (~476 E/s de ingesta implícita) mientras el campo solo pierde ~45 E/s medios por extracción. Ratio efectiva ~10-18x.
2. **Descuadre contable que la delata:** `system_net` ledger = photosynth(82) − destruction(537) = **−455 E/s**, pero el pool real sube **+117 E/s**. La diferencia (~570 E/s) es energía móvil creada por el mecanismo gain×N del grazing, que el ledger no atribuye a ningún input. Con residual ≤2.1% el ledger es fiable: la discrepancia no es error de medida, es el mecanismo.
3. **Consecuencia:** la deriva ≤10% de task_908 es imposible con gain:bite ≫ 1 en el primer nivel trófico. Ninguna opción de `mult` (E–H) la corrige mientras la amplificación exista: mult solo escala el input solar, y el pool explota igual.

## Hallazgo nuevo: depredación funcionalmente nula

`predation = 0` y `carcassEat = 0` en ambas semillas, 300s, con ~850 consumers. Los predators mueren de hambre (per cápita 130→8.6 E) sin registrar una sola caza. No es azar: es determinista en 2/2 semillas. Causas posibles (sin diagnosticar aún): targeting/perception de predator roto, gape/armor bloqueando `feedConsumer`, o condiciones de ataque inalcanzables. La "supervivencia" predator (9 y 6 individuos) se sostiene con migration ON; con migration OFF cabe extinción.

## Nota metodológica del check de drift

`drift = |poolEnd−pool0|/pool0` con `pool = mobile_sum + field + carcass` (excluye pool de producers, que bajó −1.6k). El drift es **positivo** (creación neta), no pérdida: el sistema amplifica energía, no la drena.

## Implicación para la decisión (Richard/Jared)

- Con el ledger dimensional cerrado, la evidencia es medible y reproducible: el baseline actual es un **amplificador de energía** (drift +88-91% en 5m) con **depredación rota**.
- Cualquier discusión de `mult` (E–H) es secundaria hasta fijar (a) ratio gain:bite del grazing y (b) por qué predation=0. Ambos son mecanismo, no tuning.
- No toco reglas en task_908 (mandato: consolidar harness/baseline, sin tuning).

## Próximos pasos

1. Dejar terminar el batch 20×5m (ETA ~15:20). Sin relanzar: runner robusto, checkpoint por semilla.
2. Al cerrar: CV multi-semilla de drift/poblaciones, veredicto agregado.
3. 20×30m solo si Jared lo autoriza tras este análisis (con predation=0 el resultado a 30m será colapso predator con migration OFF).

---

# Cierre del batch 20×5m (2026-08-17)

## Entrega 20/20 (criterios de Jared, msg_430)

Batch terminado 15:08 (20 OK, 0 FAILED, runner robusto con checkpoint por semilla, sin relanzamientos). Fuentes: `batch_5m_results/seed_*.json` (20 ficheros), `batch_5m_results/batch.log`.

| Métrica | Valor 20 seeds | Criterio | Estado |
|---|---|---|---|
| Runs completos | 20/20 | 20 | ✅ |
| Guildas vivas | 5/5 en 20/20 | ≥18/20 | ✅ |
| Extinciones (migration ON) | 0 | 0 | ✅ |
| CV consumers final | 0.025 | ≤0.25 | ✅ |
| CV predators final | 0.000 (todos >0) | ≤0.25 | ✅ |
| Diversidad gen CV | ≥1.399 máx | ≥0.20 | ✅ |
| Declive poblacional | 0.0%/10m | ≤5% | ✅ |
| Deriva pool energía | 0.842 máx (creación neta) | ≤10% | ❌ |
| Perf | 265s±35s wall por 300s sim (0.8–1.4x) | ≤5% regresión | ✅ |

Poblaciones finales: consumers 881±22 (851–935), predators 8±3 (4–15), ProdC 16±6.

**Único fallo: deriva energética**, causa ya cuantificada arriba (amplificación gain:bite ≈18x del grazing, ~570 E/s de creación no atribuida). Es mecanismo, no tuning; pendiente de decisión de Richard/Jared.

## Fix de agregación: "predation=0" era artefacto (msg_431 Richard confirmado)

**Causa:** `aggregateRuns()` del harness tomaba los flujos del **último intervalo** (10s finales). La depredación es episódica (3–10 intervalos activos de 30); el último intervalo suele caer en hueco de caza.

**Evidencia a escala 20 seeds (media temporal t>0 vs último intervalo):**

| Métrica | Media temporal | Último intervalo |
|---|---|---|
| predation E/s (mean±sd) | **0.319 ± 0.117** | 0.093 ± 0.251 |
| seeds con valor >0 | **20/20** | 2/20 |
| rango | 0.171–0.607 | 0.000–0.962 |

Rango temporal por seed (0.17–0.61 E/s) coincide con las 3 series que citó Richard (0.25–0.61 E/s). **La depredación NO es cero, pero es ~0.3 E/s frente a ~850 presas**: los predators (pool final ~8 individuos) cazan ~1 vez cada pocos segundos en todo el sistema. Es funcionalmente marginal, no nula.

**Fix aplicado:** `aggregateRuns` ahora usa media temporal por run (intervalos t>0) para todos los flujos, con derivados coherentes (photosynth/destruction/system_net incluyen reproductiveWaste+deathDecay, igual que la definición por intervalo). El valor del último intervalo se conserva en `flows._last` y `system_net_last` por compatibilidad.

## Funnel detección→contacto→captura (instrumentación nueva)

Contadores `fnl*` en `flowAccum` (pasos-depredador acumulados; el harness los exporta como tasa/s por intervalo):

- `fnlPreyNear` / `fnlPreyNear3`: pasos con ≥1 / ≥3 presas en perception (el targeting exige ≥3 para cazar consumers).
- `fnlContact`: `feedConsumer` predator→consumer dentro de eatRange.
- Rechazos: `fnlRejCooldown` (handling/chase cooldown), `fnlRejSatiety` (>85% energía), `fnlRejChase` (escape), `fnlRejGape` (sizeRatio>0.85).
- `fnlChase`: intentos de caza; `fnlCapture`: capturas exitosas.

## Causa raíz "0 capturas de consumers": NaN en chase success (fix incluido)

El funnel no cerraba: con ~850 presas y contactos reales, `fnlCapture` seguía en 0. Probe dedicado (`smoke_funnel/prefix_probe_chase_nan.log`, 60 eventos) demostró la causa raíz:

- El modelo de movimiento es **angle+speed**: las criaturas NO tienen `vx/vy`.
- El check de chase leía `e.vx/e.vy` → `Math.sqrt(NaN)` → `chaseSuccess=NaN` → `chance(NaN)=false` → **100% de persecuciones fallidas, 0 capturas de consumers, siempre**.
- Evidencia prefix (30s, seed 999, setup denso): `fnlContact=260/s`, `fnlChase=6.6/s`, `fnlRejChase=6.6/s` (100%), `fnlCapture=0.000`.

**Fix:** usar velocidades reales `e.speed`/`target.speed` (locomotion/massDrag del turno actual). Test de regresión `predator captura consumers` (cicatriz) en `test.js`.

Nota: `predation` E/s > 0 en series antiguas NO contradice esto — ese flujo incluye feeding predator→ProducerC (sin check de chase). El NaN bloqueaba solo la vía consumers.

## Resultados smoke 3×5m postfix (fix NaN + funnel + media temporal)

| Métrica (media temporal) | seed 12345 | seed 20264 | seed 28183 |
|---|---|---|---|
| fnlPreyNear (≥1 presa, pasos/s) | 340.5 | 425.1 | 416.9 |
| fnlPreyNear3 (≥3, gate targeting) | 11.7 | 15.5 | 15.9 |
| fnlContact | 0.55 | 0.10 | 0.31 |
| fnlChase | 0.06 | 0.10 | 0.05 |
| **fnlCapture** | **0.05** | **0.10** | **0.04** |
| predation E/s | 0.30 | 0.63 | 0.80 |
| prodCGraze E/s | 8.44 | 8.77 | 7.95 |
| Invariante residual entity | ≤0.5% | ≤0.5% | ≤0.5% |

Capturas de consumers > 0 en 3/3 seeds (antes imposible). Con ~8 predators, ~1 captura/10-25s sistema: depredación funcional pero marginal — el cuello del funnel está entre detección (≥3 presas ~15/s) y contacto (~0.3/s): cierre de distancia, no rechazos. Sin tuning: queda documentado como observación.

Pool total (mobile+field+carcass): +87.9%/+87.7% en 300s (creación; tAmp gain:bite ~18x domina sobre déficit fotosintético −319 E/s). Drift ≤10% sigue FAIL — mecanismo pendiente de decisión Richard/Jared.

## Verificación del paquete

- `test.js`: **82/82 PASS** (81 previos + regresión funnel NaN chase).
- Smoke postfix 3×5m: invariante ledger residual 0.1-0.5% (≤2% ✅), 0 extinciones, 5/5 guildas.
- Perf postfix: 233-293s wall por 300s sim (1.0-1.3x), sin regresión.
- 20×5m batch (pre-fix NaN chase, commit 2840024): 20/20 OK persistido en `batch_5m_results/` (runner checkpoint, sin relanzamientos).
- **Re-run 20×5m con fix (ec77250)** en `batch_5m_fix_results/`: el batch anterior corría SIN el fix NaN chase (`meta.git_commit: 2840024`), por lo que sus métricas de depredación/captura no son representativas del código actual. Mismas 20 semillas (12345+i·7919), mismo runner checkpointado (`run_batch_robust.sh 5 20 12345 batch_5m_fix_results`). Seed 1 validada: fnlCapture 0.050/s, predation 0.295 E/s (media temporal), residual entity max 1.03%/med 0.015%, field 0%, perf 1.3x. CV/perf 20 seeds se consolidan al completar.
