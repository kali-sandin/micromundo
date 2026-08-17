# task_908 — Re-run batch 20x5m con fix NaN chase (ec77250)

Estado al escribir: **10/20 en curso**, 9/20 completadas. Checkpoint por seed en
`batch_5m_fix_results/seed_<n>.json`. Cada seed: 300s sim, dt=0.0167, intervalo 10s,
migration=on, mismas 20 seeds que el batch pre-fix (2840024).

## Por qué re-run

El batch 20x5m anterior (commit 2840024) era **PRE-fix NaN chase**: `e.vx/vy`
inexistente en el cálculo de dirección de caza → 0 capturas de consumers por
predators. El fix (ec77250) usa `e.speed` real + funnel detección→contacto→captura
+ media temporal en agregados (hallazgo de Richard). Todo resultado previo del
batch queda invalidado como baseline.

## Resultados seeds completadas (media temporal agregada)

| seed | cons_end | pred_end | B | D | fnlCapture | tAmp E/s | eResMax% | eResMed% | fRes% | speed |
|------|---------|----------|-----|-----|-----------|----------|----------|----------|-------|-------|
| 12345 | 877 | 7 | 208 | 295 | 0.05 | 419.1 | 1.03 | 0.02 | 0 | 1.30x |
| 20264 | 840 | 18 | 211 | 323 | 0.10 | 414.0 | 3.29 | ~0 | 0.001 | 1.30x |
| 28183 | 906 | 14 | 219 | 272 | 0.04 | 428.2 | 0.45 | ~0 | 0 | 1.30x |
| 36102 | 865 | 7 | 208 | 304 | 0.09 | 421.5 | 2.04 | ~0 | 0.001 | 1.20x |
| 44021 | 886 | 15 | 226 | 300 | 0.06 | 419.8 | 3.85 | ~0 | 0 | 1.30x |
| 51940 | 874 | 10 | 212 | 300 | 0.05 | 415.0 | 0.42 | ~0 | 0 | 1.30x |
| 59859 | 840 | 6 | 189 | 317 | 0.07 | 414.0 | 177.07* | 0.5 | 0 | 1.30x |
| 67778 | 871 | ~10 | ~210 | ~300 | >0 | 413.7 | — | — | — | 1.30x |
| 75697 | — | — | — | — | >0 | — | — | — | — | — |

*Ver sección pico residual.

- **fnlCapture > 0 en 9/9** — el fix NaN chase elimina el artefacto predation=0.
- 5 guildas vivas, 0 extinciones, 0 rescates de consumers (siempre >800).
- Perf 1.2–1.3x real-time por seed, sin timeouts.

## Causa reproducible del drift energético (lo que pedía Jared)

**`app.js` grazeProducerDensity** (línea ~944):

```js
const gain = bite * 18 * densityFactor;   // mult 18, comentado 55→22→16→18
```

- `producerField.mass` es un **índice logístico de densidad [0, 1.5]**, no energía
  dimensional. El ledger lo mantiene fuera de E_sys (correcto).
- Cada evento: el campo pierde `bite` (índice) y el consumer gana
  `bite × 18 × densityFactor` (energía móvil). densityFactor ∈ [0.4, 1.0].
- Ratio nominal 18:1; **efectiva medida 8.3:1** (media con densityFactor ~0.46):
  tAmp/(graz+colFeed+prodCG) → gain/src = 8.28–8.47 en las 7 seeds analizadas.
- **tAmp = 414–428 E/s de creación neta**: energía móvil que no existía como
  energía dimensional. Es el input principal que sostiene ~850 consumers con
  B≈210/D≈300, y produce el drift E_sys max ≈ +88%.
- `system_net` (fotosíntesis − destrucción) medio ≈ **−308 E/s**: tras el
  crecimiento inicial el pool drena. El +88% es máximo puntual, no tendencia.

**Conclusión**: el drift no es un bug de contabilidad; es la conversión
dimensional masa-índice→energía del diseño de grazing (herencia de task_907:
mult 16→18 para desbloquear births). El ledger lo aísla correctamente como
`trophicAmplification`. La decisión de reducir mult (o re-dimensionar el campo)
es tuning → Jared/Richard, fuera del alcance actual.

## Pico residual 177% en seed 59859 (t=110): dos causas del instrumento

1. **Denominador de cuasi-equilibrio**: `flowScale = max(|expectedΔ|, |Δ|, 1)`.
   En t=110 el sistema está casi plano: ΔE_sys ≈ +18 E en 10s con ~3565 E de
   flujo bruto. Residual absoluto ≈ 35 E = **0.9% del throughput**, pero
   normalizado por |Δ|≈18 explota a 177%. La mediana (0.5%) refleja el estado
   real; el max es artefacto de normalización.
2. **Migración no contabilizada como input del invariante**: ProducerC (3–10) y
   predators (3–18) están permanentemente bajo THRESHOLD=15 → checkMigration
   hace spawns continuos (`floor(rand(3,9))` criaturas, predators con 30–50 E).
   Estos spawns acumulan en `flowAccum.birthGain` (app.js:2690-2692) sin gasto
   parental: `reproductiveWaste = max(0, repro − birthGain)` los trata como
   transferencia interna cuando son **input externo real** → residual positivo
   persistente pequeño (explica eResMax 2–4% en varias seeds).

Ambas son issues del **instrumento** (harness/ledger), no del juego.

## Fix propuesto (aplicar tras cerrar 20/20, no durante el batch)

- `flowScale = max(|systemInputs|, |systemOutputs|, |expectedΔ|, |Δ|, 1)`:
  residual relativo al throughput; honesto en cuasi-equilibrio.
- Flow `migration` separado en app.js (`flowAccum.migration += spawn energy`) y
  sumarlo a `systemInputs` del invariante. Con esto el birthGain queda limpio
  como transferencia parent→child.
- Re-analizar los mismos JSON offline no es posible para (2) porque birthGain
  mezcla nacimientos + migración; requiere instrumento nuevo o re-run corto.

## Nota sobre B/D vs población

`births_total`/`deaths_total` agregan todos los tipos (incluye spawns de
migración en B). Los 228 ProducerC iniciales mueren casi todos (→4) y sus
respawns de migración contaminan el agregado: el gap aparente consumers
720→840 con B−D=−128 no es paradoja, es mezcla de tipos. Desglose por tipo
queda como mejora del harness si Jared lo pide.

## Pendiente

- [ ] Cerrar 20/20 + CV poblaciones/energía + perf agregado.
- [ ] Decisión tAmp/mult 18 (Jared/Richard).
- [ ] Fix instrumento: normalización flowScale + flow migración (post-batch).
