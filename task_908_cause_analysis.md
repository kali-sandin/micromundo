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

## Pendiente de decisión

Jared/Richard deben decidir qué alternativa aplicar. Bruce Lee no hace tuning sin autorización.
