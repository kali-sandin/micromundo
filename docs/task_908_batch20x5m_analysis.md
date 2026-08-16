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
