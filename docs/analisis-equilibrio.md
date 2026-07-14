# Análisis de Equilibrio del Ecosistema — Micromundo

**Fecha:** 2026-07-14  
**Commit base:** 2546bf7  
**Script:** `node debug-sim.js 15` (900s simulados, 78.2s wall, 11.5x real-time)

---

## Resumen ejecutivo

El ecosistema **no es estable a medio/largo plazo**. En 15 minutos de simulación:
- La energía total del sistema cae **60%** (120 → 48) sin mecanismo de recuperación.
- Los depredadores colapsan **95%** (108 → 5), extinción estimada ~18-20min.
- ProducerB (colonia) **no se reproduce**: 0 nacimientos en 15min.
- ProducerC (móvil) está **congelado** demográficamente.
- Solo consumidores muestran dinámica activa, pero también declinan tras un pico inicial.

**Conclusión:** el sistema tiene 4 fallos de diseño que impiden el equilibrio. Todos son identificables en código y corregibles sin reescribir la arquitectura.

---

## Datos de la simulación

| Especie | Inicio | Final | Pico | Pico@t | Tendencia |
|---------|--------|-------|------|--------|-----------|
| Prod A (densidad) | 0.11 | 0.07 | 0.11 | 00:00 | ↓ declive lento |
| Prod B (colonia) | 72 | 71 | 72 | 00:00 | → estancado |
| Prod C (móvil) | 420 | 412 | 420 | 00:00 | → congelado |
| Consumidores | 720 | 605 | 887 | 02:05 | ↓ tras pico inicial |
| Depredadores | 108 | 5 | 115 | 02:30 | ↓↓ colapso |

- Energía global: 120.21 → 47.69 (**-60.4%**)
- Nacimientos: 1847 | Muertes: 2074 (net **-227**)

### Genes promedio finales destacados

| Especie | Variable clave | Valor | Problema |
|---------|----------------|-------|----------|
| Prod B | leafCount | 1.55 | Necesita 9 para reproducirse |
| Prod B | radius | 34.22 | leafLimit = floor(2+34/6) = 7 (< 9) |
| Prod C | energy | 17.13 | Umbral repr. = maxEnergy*0.58 ≈ 14 |
| Predator | metabolism | 0.18 | Drain = 0.18*7.5 = 1.35/seg activo |
| Predator | maxEnergy | 1190 | Requiere alimentación constante |

---

## Problema 1: ProducerB no puede reproducirse (CRÍTICO)

**Síntoma:** 72 colonias al inicio, 71 al final. Cero nacimientos.

**Causa raíz:** Doble restricción contradictoria en el código.

```js
// Línea 65:
const COLONY_MIN_LEAVES_TO_REPRODUCE = 9;

// Línea 1039:
const leafLimit = clamp(Math.floor(2 + e.radius / 6), 2, 14);

// Línea 1040-1041:
const leafTarget = clamp(Math.floor(e.leafEnergy / 4), 0, leafLimit);
if (leafTarget > e.leafCount && chance(dt * sun * 0.18)) e.leafCount += 1;
```

Para que ProducerB reproduzca necesita `leafCount >= 9`. Pero:
- `leafLimit` depende de `radius`: `floor(2 + radius/6)`
- Radio inicial: 14-22 → `leafLimit = 4-5`
- Radio necesitado para `leafLimit >= 9`: `radius >= 42`
- Crecimiento de radio: `dt * sun * 0.018` → ~0.018/seg
- Tiempo para llegar de 18 a 42: **~22 minutos** sin interrupción

Además, `leafTarget` se calcula como `floor(leafEnergy / 4)` y `leafEnergy` crece a `dt * sun * 0.095`/seg. Incluso con radius=42+, se necesitarían ~5.5min solo para acumular `leafEnergy = 36` (9*4).

Y los consumidores reducen `leafCount` al comer (`leafCount -= 1` por mordisco).

**Propuesta de fix:**
- Opción A: `COLONY_MIN_LEAVES_TO_REPRODUCE = 4` (alcanzable con radio inicial)
- Opción B: `leafLimit = clamp(Math.floor(3 + e.radius / 3), 3, 18)` (crece más rápido)
- Opción C: Desacoplar `leafLimit` de `radius` completamente: `leafLimit = 12` fijo
- **Recomendada:** B + reducir umbral a 6. Mantiene la mecánica de crecimiento pero la hace alcanzable.

---

## Problema 2: Energía sin reciclar — sink sistémico (CRÍTICO)

**Síntoma:** Energía global cae 60% en 15min. Declive monotónico sin recuperación.

**Causa raíz:** `kill()` no devuelve energía al ecosistema.

```js
// Línea 690:
function kill(e, reason) {
    if (!e || !e.alive) return;
    e.alive = false;
    sim.selectedTrails.delete(creatureKey(e));
    sim.freeIds.push(e.id);
    sim.deaths += 1;
    // ← La energía de la criatura desaparece. No se recicla.
}
```

Cada criatura muere con energía residual (0 a maxEnergy). Esa energía se pierde del sistema permanentemente. Con 2074 muertes, la pérdida acumulada es masiva.

**Propuesta de fix:**
Al morir, devolver ~40% de energía restante al `producerField` en la posición de la criatura:

```js
function kill(e, reason) {
    if (!e || !e.alive) return;
    e.alive = false;
    // Reciclaje: descomposición → campo de productores
    const recycleFraction = 0.4;
    const recycledEnergy = Number(e.energy || 0) * recycleFraction;
    if (recycledEnergy > 0.5) {
        addProducerDensity(e.x, e.y, recycledEnergy * 0.1, 120);
    }
    sim.selectedTrails.delete(creatureKey(e));
    sim.freeIds.push(e.id);
    sim.deaths += 1;
}
```

Esto crea un **ciclo cerrado**: productores → consumidores → depredadores → muerte → descomposición → productores. Estabiliza la energía total del sistema con oscilaciones naturales.

---

## Problema 3: Colapso de depredadores (CRÍTICO)

**Síntoma:** 108 → 5 en 15min (-95%). Extinción estimada ~18-20min.

**Análisis del metabolismo:**
```js
// Línea 1227:
e.energy -= e.metabolism * dt * (resting ? 3.4 : 7.5);
```

- Metabolismo promedio: 0.18
- Drain activo: 0.18 * 7.5 = **1.35 energía/segundo**
- maxEnergy promedio: 1190
- Tiempo de supervivencia sin comer: 1190 / 1.35 ≈ **14.7 minutos**

Pero el depredador necesita encontrar, perseguir y capturar presas. Con consumidores en declive (720→605), la densidad de presas disminuye, creando una espiral de colapso.

El pico de 115 depredadores a los 2:30 sugiere un boom de reproducción inicial seguido de inanición masiva.

**Causas contribuyentes:**
1. Metabolismo demasiado alto relativo a la disponibilidad de presas
2. `resting` solo reduce metabolism x0.45 (3.4/7.5), insuficiente para sobrevivir escasez
3. No hay mecanismo de conservación cuando la población es baja

**Propuesta de fix (combinada):**
```js
// A) Metabolismo adaptativo en stepMobile:
const populationPenalty = e.type === TYPE.PREDATOR && countPredators() < 60 ? 0.5 : 1;
e.energy -= e.metabolism * dt * (resting ? 3.4 : 7.5) * populationPenalty;

// B) Reposo más eficiente cuando hay hambre:
const starvingRest = e.energy < e.maxEnergy * 0.25;
e.energy -= e.metabolism * dt * (resting ? (starvingRest ? 1.5 : 3.4) : 7.5);
```

Esto permite que los depredadores sobrevivan periodos de escasez (respuesta fisiológica al hambre) y estabiliza la población según principios de Lotka-Volterra.

---

## Problema 4: ProducerC demográficamente inerte

**Síntoma:** 420 → 412 en 15min. Genes sin cambio. Sin presión selectiva.

**Causa raíz:**
```js
// Línea 1091:
if (isMobileProducer(e) && e.energy < e.maxEnergy * 0.58) return;
```

- maxEnergy de ProducerC: ~24-30
- Umbral reproductivo: maxEnergy * 0.58 ≈ 14-17
- Energía promedio observada: 17.13 → apenas por encima del umbral
- La mayoría no llega al umbral consistentemente

Además, los consumidores obtienen poco de ProducerC (`gain = 34`) frente a comer ProducerA (grazing) o ProducerB leaves. No hay presión depredadora significativa.

**Propuesta de fix:**
- Reducir umbral reproductivo a `0.42` (≡ ~10-13 energía)
- Aumentar ganancia para consumidores que comen ProducerC a `55` (más atractivo como presa)
- Verificar que `chemosense` de consumidores detecta ProducerC adecuadamente

---

## Problema 5: ProducerA en declive

**Síntoma:** Densidad de campo 0.11 → 0.07 (-36%).

**Causa:** La tasa de crecimiento (`0.010 * sunlight * t`) es inferior a la tasa de consumo por grazing de consumidores. En el pico (887 consumidores), el campo se agota.

**Propuesta:** Aumentar `growth` a `0.016` o acoplarlo a la densidad (crecimiento logístico con capacidad de carga). Alternativa: reducir consumo por grazing.

---

## Problema 6 (opcional): Sin ciclo día/noche

Actualmente `solarEnergy` es fijo a 1.0. Un ciclo sinusoidal (0.4-1.6, periodo 5-10min) crearía:
- Presión selectiva hacia genes `reserves`/`vacuole`
- Oscilaciones naturales tipo Lotka-Volterra
- Periodos de abundancia y escasez que estabilizan poblaciones

---

## Prioridad de implementación sugerida

| Prioridad | Fix | Impacto | Esfuerzo |
|-----------|-----|---------|----------|
| P0 | Reciclaje de energía al morir (#007) | Estabiliza sistema completo | Bajo |
| P0 | Fix ProducerB reproducción (#006) | Activa productor principal | Bajo |
| P1 | Metabolismo adaptativo depredadores (#008) | Evita extinción ápice | Medio |
| P1 | Ajuste ProducerC (#009) | Activa dinámica poblacional | Bajo |
| P2 | Boost crecimiento ProducerA | Sostiene base trófica | Bajo |
| P2 | Ciclo día/noche (#010) | Estabilidad dinámica | Medio |

**Orden recomendado:** P0 fixes primero, re-simular, ajustar, luego P1 y P2.

---

## Metodología

- Script: `debug-sim.js` (headless, sin rendering, 11.5x real-time)
- Commit base: 2546bf7
- Datos completos en: `debug-output/debug-sim-2026-07-14T04-32-19.json`
- Análisis de código: `app.js` líneas 690-1240 (mecánicas core)
- Validación: los fixes propuestos son compatibles con la arquitectura actual sin tocar genes, UI ni rendering
