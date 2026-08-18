# task_908 — Análisis de causa raíz: boom energético

**Autor:** Bruce Lee  
**Fecha:** 2026-08-12 02:45 CET  
**Veredicto harness:** ❌ FALLO (energy drift 84% en 1m, 623% en 5m; umbral ≤10%)

## Causa raíz identificada

El factor `mult=18` en `grazeProducerField` (app.js:922) es una conversión dimensional implícita que **crea energía neta** del sistema.

### Mecanismo

```
Línea 922: const gain = bite * 18 * densityFactor;
```

1. `field.mass` es un **índice logístico** [0, 1.5], no energía. Crece via fotosíntesis (gratuito).
2. Un consumer extrae `bite` ≈ 0.047 unidades de mass del campo.
3. Gana `bite * 18 * densityFactor` ≈ 0.85 unidades de **energía móvil**.
4. La mass extraída (0.047) se descuenta del campo, pero **no se contabiliza como energía destruida** en ningún flujo.
5. Por cada unidad de mass extraída, se crean ~18 unidades de energía.

### Evidencia numérica (smoke 5m, seed 12345)

| Métrica | T=0 | T=300s | Cambio |
|---|---|---|---|
| Consumers | 720 | 3738 | +5.2x |
| Predators | 30 | 6 | -80% |
| ProducerC | 228 | 4 | -98% |
| E_mobile + field | 38,986 | 282,071 | +623% |
| Births total | 0 | 3061 | — |
| Deaths total | 0 | 291 | — |

Flujos promedio (energy/s):

| Flujo | Valor |
|---|---|
| Grazing (field→mobile) | 4,876 |
| Metabolism (destruido) | 1,836 |
| Reproduction (interno) | 2,083 |
| Excretion (mobile→field) | 14 |
| **SYSTEM_NET** | **+3,061** |

El sistema gana 3,061 energy/s que no provienen de ningún input contabilizado.

### Por qué el campo no se agota

El campo crece logisticamente: `growth = 0.020 * sunEff * t` por step. Con ~17,800 celdas, el campo regenera masa быстрее de lo que los consumers la extraen. La masa es "gratis" y la conversión 18:1 la convierte en energía abundante.

## Por qué 5x30m no aporta valor nuevo

- El boom se confirma en smoke 5m con 1 semilla: drift 623%, NET +3061/s.
- Runs de 30m solo amplificarían el drift (estimado: ~5000%+ en 30m).
- Jared instruyó: "si falla, entrega causa/alternativas y espera decisión".

## Alternativas (sin tuning — solo catalogar para decisión de Jared/Richard)

### A. Ledger dimensional correcto en runtime
Añadir `flowAccum.photosynthesis` que mida la masa total añadida al campo por stepProducerField. El SYSTEM_NET real sería `photosynthesis - metabolism - carcassExpire`. Esto no cambia mecánica, solo medición.

### B. Conversión mass→energía conservativa
Hacer que la energía ganada por grazing sea ≤ la masa extraída × algún factor de eficiencia trofica (<1). En ecología real, la eficiencia trofica es 10-20%. Esto eliminaría la creación de energía pero requiere decisión de Richard sobre el factor correcto.

### C. Presupuesto energético del campo
Tratar field.mass como energía real. Restar del pool energético global la masa consumida por grazing. El campo tendría un "energy budget" que se repone via fotosíntesis y se agota por grazing.

### D. Reducir mult a 1 (neutro)
`gain = bite * densityFactor`. Sin conversión. Los consumers ganarian tanta energía como masa extraen. Probablemente insuficiente para sostener metabolismo — requiere verificación.

## Estado del harness

- 76/76 tests OK
- Harness fiel al loop: dt=1/60, rebuildGrid, compactIfNeeded, flowAccum, migración
- Ledger dimensional corregido (separa inputs/outputs/transferencias internas)
- Veredicto automático funciona: detecta drift >10%

## Commit

bf54ccd — sin cambios de código en este turno. Solo análisis.

## Verificación de viabilidad de alternativas (turno 03:45)

Input fotosintético del campo: ~308 E/s (0.0078/celda/step × 17800 celdas / 0.45s).

| Alternativa | Gain/s (1000 consumers) | Metab/s (activo) | Viabilidad |
|---|---|---|---|
| Actual (mult=18) | 1,231 | 375 | ❌ Crea 856 E/s fantasma |
| D (mult=1) | 68 | 375 | ❌ Insuficiente, consumers mueren |
| B (eff 15%) | 13 | 375 | ❌ Mucho peor |

**Conclusión:** No existe un valor de mult que sea conservativo (1:1) y sostenga el metabolismo actual. El mult=18 compensa un déficit estructural: el metabolismo consume más energía de la que el sistema puede aportar con conversión neutra.

El ajuste correcto requiere decisión de Richard sobre coordenadas múltiples:
- metabolism base / metabFactor
- gain mult
- biteRate
- fotosíntesis (growth rate)

O redefinir dimensionalmente: tratar field.mass como energía real y asegurar que fotosíntesis (input solar) = metabolismo + pérdidas térmicas en equilibrio.

## Análisis cuantitativo de balance (turno 04:25 CET)

Parámetros extraídos del código (app.js + constantes):

| Parámetro | Valor | Fuente |
|---|---|---|
| Field growth rate | 0.020 × sunEff(0.87) per step | app.js:780 |
| Cell count | ~17,800 | field init |
| Field photosynthesis total | **325 mass/s** | growth × cells × 60 |
| Bite rate (consumer típico) | 0.034 mass/evento | app.js:910 |
| Events por consumer/s | 1.82 (cooldown 0.55s) | app.js:923 |
| Mass extraída total (720 consumers) | **44.6 mass/s** | bite × events × N |
| Metabolism base | 0.038 | derivedConsumerStats |
| metabFactor efectivo | 6.5 (activo) | app.js:2129 |
| Metabolismo total (720 consumers) | **178 E/s** | metab × factor × N |

### El problema dimensional completo

El desequilibrio es **estructural**, no solo `mult=18`:

```
Fotosíntesis crea:  325 mass/s  (GRATIS - energía solar)
Grazing extrae:      44.6 mass/s (14% de la producción)
Field acumula:      281 mass/s   (86% sin usar)

En mult=18:  44.6 × 18 × 0.85 = 681 E/s  →  metab 178  →  SUPERÁVIT +503 E/s → BOOM
En mult=5:   44.6 × 5  × 0.85 = 190 E/s  →  metab 178  →  SUPERÁVIT +12 E/s  → estable?
En mult=4:   44.6 × 4  × 0.85 = 152 E/s  →  metab 178  →  DÉFICIT -26 E/s   → declive
En mult=1:   44.6 × 1  × 0.85 =  38 E/s  →  metab 178  →  DÉFICIT -140 E/s  → extinción
```

### Balance matemático

- `mult_balance` (NET≈0) = **4.70** (gain = metab exactamente)
- `mult_sostenible` (surplus +0.10 E/s/consumer, tiempo repro ~170s) = **6.60**
- Con `mult=5`: surplus móvil +12 E/s global → crecimiento lento pero estable

### Espacio de soluciones para decisión

| Opción | Cambio | Pros | Contras |
|---|---|---|---|
| **E: mult=5** | 18→5 | Mínimo cambio. Balance cercano. | Punto frágil: small changes in density/competition inclinan a boom o bust |
| **F: mult=5 + growth 0.012** | mult 18→5, growth 0.020→0.012 | Campo más escaso, balance más robusto | Dos params coordinados |
| **G: mult=1 + metab reescalado** | mult→1, metab×0.21 | Conservación dimensional pura | Cambio dráfico, requiere reescalar maxEnergy, thresholds, etc |
| **H: Ledger conservativo** | Añadir photosynthesis al ledger, mantener mult=18 | Sin cambio mecánico | No resuelve el boom, solo lo explica |

### Recomendación técnica (no ejecutiva)

**Opción E (mult=5)** es el cambio mínimo que acerca el sistema al balance sin reescribir derivados.
Riesgo: poca margen. Si la población sube a 1000+, el surplus se amplifica.
Necesita verificación con 5x30m multi-semilla antes de aceptar.

Si Richard prefiere conservación dimensional estricta, **Opción G** es correcta pero requiere un sprint de reescalado metabólico completo.

## Pendiente de decisión

Jared/Richard deben decidir qué alternativa (A-H) aplicar. Bruce Lee no hace tuning sin autorización.
Datos cuantitativos disponibles en `task_908_viability_analysis.js` y `task_908_viability_2.js`.

## 2026-08-18 03:5x — 30m ON seed 12345 (run_1): energía consumer negativa en vivos

Serie temporal (interval 10s, resumen cada 240s):

| t | pA | pC | cons | pred | consE | graze | metab |
|---|----|----|------|------|-------|-------|-------|
| 0 | 0.143 | 228 | 720 | 30 | 32529 | 0 | 0 |
| 240 | 0.689 | 9 | 755 | 7 | 44769 | 52 | 369 |
| 481 | 0.575 | 7 | 1679 | 4 | 108168 | 107 | 815 |
| 721 | 0.224 | 3 | 2242 | 8 | 78650 | 77 | 1000 |
| 961 | 0.249 | 0 | 2213 | 11 | 18041 | 56 | 572 |
| 1202 | 0.366 | 2 | 2212 | 12 | 9895 | 75 | 682 |
| 1442 | 0.374 | 5 | 2280 | 17 | 11693 | 81 | 755 |
| 1683 | 0.326 | 5 | 2430 | 7 | -3540 | 79 | 799 |
| 1800 | 0.303 | 4 | 2478 | 5 | -17906 | 76 | 793 |

Hallazgos:
1. consE = suma REAL de e.energy de vivos (recalculada en cada sample, no es mobileEnergySum).
   Termina en -17906 => media -7.2 E por consumer VIVO. El kill-check `e.energy<=0` (app.js:2529)
   no se está aplicando a parte de la poblacion.
2. Unico early-return que salta el kill-check: rama dormant de stepMobile (app.js:2319-2335, `return`
   antes del check). Pero su drain es 0.002/s (max ~-3.6 en 1800s), insuficiente para media -7.2.
   => hay otra via de energia negativa persistente sin muerte, pendiente de identificar.
3. Inflacion previa: consE sube a 108168 (3.3x inicial) en t=481 con graze 107 E/s.
4. pC colapsa 228-><10 en 240s; persiste solo por migracion (493 immigrantes pC, 78 predators).
5. Predacion ~0 en toda la serie (max 1.28 E/s agregado): funnel bloqueado en cooldown contacto.

Accion harness (sin tocar reglas): metrica `energy.neg_mobile` {count,sum,min,dormant,dormant_neg}
en cada sample (commit siguiente). Las seeds 3-20 del batch 30m ON la reportaran; con ella
se identifica si los negativos son dormant o no. Probe 2m post-cambio: invariante <=2% PASS,
neg=0, sin cambio de comportamiento.

## 2026-08-18: causa energia negativa en 30m ON (run_1: consE -17906, NET -654 E/s)

Los dormant (consumers y ProducerC) hacen `return` temprano en stepMobile/stepProducer
ANTES del chequeo `e.energy <= 0 -> kill()` del final. Además el consumidor dormant
paga el metabCost completo del step (restado en la linea previa a la rama dormant).
Resultado: criaturas "inmortales" en diapausa cuya energia deriva a negativo sin limite
y el ledger pierde ~-650 E/s a 30m; kill() luego descuenta max(0,energy)=0 => fuga no
recuperada. Primer sintoma ~t=1650s (fuera del horizonte 5m: por eso 5m pre/post-fix
son identicos, NET -311.5 ambos).

Fix (sin tuning, restaura el contrato de muerte existente): kill al agotar reservas
en la rama dormant, tanto consumers como ProducerC. Tests regresion en test.js
(dormant muere, energia nunca negativa): 71/71 funcional. Harness 1x5m seed12345:
sin negativos, sin extinciones, resto identico al pre-fix.

Pendiente separado: drift NET -311 E/s a 5m = amplificacion trofica 419
(grazeProducerDensity gain vs campo-indice), decision de Richard/Jared.
