# task_908 — Ledger Dimensional Bidimensional

## Estado: implementado, field PASS, entity parcial

## Commit: 0b49137

## Objetivo (Jared msg_422)

> Primero ledger dimensional: fotosíntesis/extracción separadas + invariante residual ≤2%, 77/77 y smoke 5m. No mult=5/6.6 ni task_283.

## Arquitectura implementada

### Dos dimensiones trackeadas independientemente

#### 1. Field dimension (pool del campo logístico)

El `producerField` es un índice de densidad logística [0, 1.5] por celda. No es energía, pero tiene un budget:
- **Inputs**: photosynthField (crecimiento solar), excretion (mobile→field), carcassToField (carcass→field)
- **Outputs**: graze (field→mobile, masa extraída), fieldClampLoss (capping a 1.5)
- **Neutrales**: difusión (redistribución entre celdas)
- colonyFeed y prodCGraze NO tocan el campo (son entity→entity)

**Invariante field**: Δ(field.total) = (photosynthField + deposits - graze - clampLoss) × dt

**Resultado: residual 0.0%** ✅

#### 2. Entity dimension (pool de entidades: producers + consumers + predators + carcasses)

- **Inputs**: photosynthDirect (B/C fotosintetizan directamente), trophicAmplification (creación neta durante feeding)
- **Outputs**: metabolism, thermal, excretion (→field), deathDecay (45% heat on death), carcassExpire, carcassToField, producerLoss, reproductiveWaste
- **Neutrales**: predation (prey→predator), carcassEat (carcass→mobile), birthGain/reproduction (parent→child)

**Invariante entity**: Δ(entityPool) = (photosynthDirect + trophicAmplification - allOutputs) × dt

**Resultado: residual 8-10% en condiciones normales, 25% durante extinciones** ❌

## Cambios en app.js

1. **fieldClampLoss**: nuevo acumulador que separa el clamp (capping del campo a 1.5) del producerLoss genérico
2. **Sloppy feeding fix**: `addProducerDensity` del sloppy feeding now tracked as `carcassToField` (not `trophicAmplification`), since it goes to the field, not the entity pool

## Cambios en sim-harness.js

1. **Bidimensional residual**: field y entity dimension trackeadas por separado
2. **Field extraction corregida**: solo `graze` extrae del campo (no colonyFeed ni prodCGraze)
3. **Field clamp**: restado del expected delta del campo
4. **Reporte humano**: sección "Field dimension" con FIELD RES max/med/INVARIANTE
5. **Agregación**: `dimensional_invariante` con entity/field residual stats

## Análisis del entity residual

### Comportamiento observado (dt=0.05, 5m, 2 seeds, migración OFF)

- **t=0-60s**: residual 8-10%. Sistema pierde energía, budget roughly correcto.
- **t=60-180s**: residual crece de 10% a 34%. ProducerC declina.
- **t=180-300s**: residual 25-170%. ProducerC extingue, system energy **crece** de 29K a 59K.

### Causa sospechada

El residual crece cuando hay muertes masivas o extinciones. La system energy **sube** cuando debería bajar durante las extinciones, lo que sugiere:

1. **Flujo no trackeado en kill()**: algo añade energía al pool sin registrarse en flowAccum
2. **Carcass processing**: la energía de carcasses puede no cerrar correctamente
3. **mobileEnergySum drift**: el resync cada 60s puede corregir drift acumulado que el ledger no captura

### Próximos pasos sugeridos (para decisión de Jared/Richard)

1. **Instrumentar kill()**: añadir logging fino de energy flows durante muertes
2. **Verificar carcass lifecycle**: crear→eat→expire→toField debe cerrar
3. **Separar trophicAmplification por fuente**: grazing vs predation para aislar el residual

## Gate de Jared

> Gate: solo escalar a 20x5m si runner no duplica semillas y perf <=5%

- **No duplicación de semillas**: ✅ (cada seed produce resultados diferentes)
- **Perf**: speed 3.2x en 5m/2seed (dt=0.05) → sin regresión
- **Smoke 5m**: ❌ (3 extinciones, residual entity FAIL)

## Recomendación

El ledger dimensional **expone claramente** que el problema está en la conversión field→mobile y en los flujos de muerte. La field dimension cierra perfectamente, lo que valida que el campo se trackea bien. El entity residual requiere más investigación para encontrar el flujo faltante (~20 E/s en condiciones normales, más durante extinciones).

**No recomiendo escalar a 20x5m hasta que el entity residual se estabilice bajo 5%.**

## 2026-08-16: CAUSA RAIZ ENCONTRADA Y CERRADA — entity residual 0.01%

### Diagnóstico con RESIDUAL_DEBUG (seed 4242, 60s, migración OFF)

El residual entity coincidía **exactamente** con el flujo `graz` en cada muestra:

| t | diff (exp−dE) E/s | graz E/s |
|---|---|---|
| 20 | 19.65 | 19.65 |
| 30 | 21.76 | 21.72 |
| 40 | 23.66 | 23.61 |
| 50 | 25.75 | 25.71 |
| 60 | 27.59 | 27.69 |

### Explicación dimensional

`systemInputs = photosynthDirect + trophicAmplification` restaba el bite del campo
como salida del sistema de entidades, pero el campo **no está** en E_sys. Para un
evento de grazing de campo, la entrada real al sistema es la ganancia completa:
`g_f = (g_f − bite) [tAmp] + bite [graz]`. Faltaba sumar `graz` como input.

Además, en el edge case mobile-saturado (actualGain < bite), la diferencia iba a
`producerLoss` (output), penalizando dos veces. Ahora tAmp es con signo para fuente
campo: `tAmp += actualGain − bite`, sin producerLoss.

### Cambios

1. `sim-harness.js`: `systemInputs += flows.graze` (contrato: campo fuera de E_sys)
2. `app.js` graze path: tAmp firmado, eliminado else→producerLoss para bites de campo
3. `app.js` kill(): `totalDeathEnergy = energy + leafEnergy` — leafEnergy de ProducerB/C
   entra en carcass (55%) + deathDecay (45%). Antes vanish sin trackear ( visible en
   runs largos con senescencia de producers, no en smoke corto con consumers hambrientos)

### Resultado (seed 4242, 60s, migración OFF)

- entity residual: max **0.011%**, mediana **0.0%** (antes 8-15% creciente)
- field residual: **0.0%**
- tests: **81/81 OK**
- smoke 5m x3 seeds: ver smoke5m_908

### Nota ecológica separada

El verdict "Energy pool drift" (SYSTEM NET ~-300 E/s con consumers muriendo de
hambre, 1 birth/60s) NO es un bug del ledger: es el desbalance ecológico real que
task_908 debe medir. Ahora que la contabilidad cierra a 0.01%, el NET es trustworthy
para decisiones de balance (opciones E-H del análisis de viabilidad).
