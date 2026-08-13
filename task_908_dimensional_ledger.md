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
