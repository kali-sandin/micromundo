# Análisis: drift energético (-535 E/s) y sostenibilidad del predator con migración ON

Fecha: 2026-09-01 · Run: `analysis_drift/migr_on_seed12345.json` · 10m sim, dt 1/60, seed 12345, migration=on, HEAD 8797d64.

## Veredicto del harness

- FAIL `Energy pool drift <= 10% (max 2.445, avg NET -520.8 E/s)`
- PASS: supervivencia, CV, extinciones, residuales (<=2.6%).

## Hallazgo 1: el "drift" es CREACIÓN de energía, no fuga

Flujos promedio (E/s, 59 muestras):

| flujo | E/s |
|---|---|
| photosynth (field+direct) | +89.2 |
| trophicAmplification (graze mult 18:1) | +674.9 |
| metabolism | −504.6 |
| producerLoss / deathDecay / carcassExpire / reproWaste | −183.9 |
| **system_net (ledger fotosíntesis-only, por diseño)** | **−520.8** |

Cierre dimensional: −520.8 + 674.9 = **+154.1 E/s** vs. crecimiento observado del pool
total ≈ **+150 E/s** (43.0k → 136.1k E en 600s). Residual ≈ 2.6%, dentro del umbral.

Conclusión: el check de drift falla porque el pool **crece 244%** (consumers 720→1942;
mobile 36.4k→126.4k E) al minar biomasa del campo con amplificación 18:1. El
`system_net` negativo es el ledger honesto que señala esa creación, no una pérdida.
La invariante real (ΔE = fotosíntesis + trophicAmp − destrucción) se cumple.

## Hallazgo 2: predator "vivo" con migr ON es artefacto de rescate

Trayectoria seed 12345: predator 30 → 16 (t=200) → 5 (t=250) **sin ningún rescate aún**
(umbral de rescate: count<15). A partir de t≈250 disparan migraciones: 37 predator
migrants en 600s mantienen la población en 5-21. Sin rescate, extinción ≈ t=300.

También producerC colapsa 228→6 y es sostenido por 54 migrantes. El boom de consumers
(715→1942) arranca justo tras el colapso de pC y la subida de density pA (0.14→0.44).

Implicación para 910-916: "migr ON sostiene al predator" NO es viabilidad ecológica;
es el mecanismo de rescate de `checkMigration` (prob 1.0 con count<=3, base 0.03).
Cualquier gate futuro con migración ON debe excluir o contabilizar rescates
(`rates.migration_totals` ya lo expone) — coherente con el criterio "sin rescates"
de las tasks 913-916.

## Recomendaciones (para Jared, sin implementar nada)

1. El check `system_net` debería reportarse como "creación neta vía amplificación"
   (o incluir trophicAmp como input dimensionado) para no leerse como pérdida.
2. Los gates de viabilidad de predator deben correr con `--migration=off` o exigir
   `migration_totals.predators == 0` en la ventana de medición.
3. La causa raíz del funnel predator (910-916) sigue abierta: acercamiento/contacto.
   La migración solo enmascara.

Sin cambios de código en este análisis; artefactos en `analysis_drift/`.
