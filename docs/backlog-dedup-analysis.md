# Backlog Dedup Analysis - 2026-07-22

## Resumen ejecutivo

- **BACKLOG total**: 354 tareas
- **Duplicados identificados**: ~300 (85% del backlog)
- **Tras dedup**: ~54 temas únicos reales
- **Fixes ya aplicados (DONE)**: 8 tareas críticas
- **Tareas movidas a TODO**: 10 prioridades post-fix

## Fixes ya aplicados (DONE)

| Task | Fix | Impacto |
|------|-----|---------|
| task_165 | Perception: base 22.5→80, coef doblados | Consumers ven más allá de 1 celda |
| task_172 | Cap poblacional en reproduceMobile (5000) | Frena boom-bust demográfico |
| task_176 | Gape-limitation en predación | Predators no comen presas demasiado grandes |
| task_186 | Graze gain 52x→25x | Reduce amplificación energética del campo |
| task_204 | ProducerC photosintesis boost | Sostiene cadena trófica |
| task_223 | Starvation fertility tras reproduceMobile | Fertility reduction ahora funciona |
| task_366 | MAX_SIM_CHUNKS 7→30, dt clamp 0.1s | Estabilidad a alta velocidad |
| task_371 | Kill energy return 4%→0.5% | Muerte = sumidero energético neto |

## 10 tareas críticas movidas a TODO

### Equilibrio (5)
1. **task_067** - feedConsumer crea energía (gain >> target maxEnergy) — Predator gain sin cap, amplifica 40-90% energía en cada transfer
2. **task_375** - metabFactor adaptive hace depredadores inmortales — Predators con metab 0.5x bajo crisis = casi imposibles de matar
3. **task_226** - Colony ProducerB sin metabolismo — Energía gratis pasiva, ProducerB estrictamente dominante
4. **task_201** - nearestThreat ignora canEatArmored — Consumers huyen de predators que no pueden comerlos
5. **task_049** - ProducerField growth rate insuficiente — Campo no se regenera al ritmo del consumo

### Performance (5)
6. **task_340** - worldToScreen/screenToWorld allocan {x,y} por llamada — Miles de allocs/frame
7. **task_383** - rebuildGrid() en cada simulate chunk — O(n*chunks) por frame
8. **task_183** - Carcass splice O(n) — Swap-and-pop trivial
9. **task_055** - Graph shift/filter O(n) cada segundo — Ring buffer elimina copias
10. **task_040** - torusVector alloc en hot paths — Steer, stepProducer

## Grupos de duplicados principales (354 → ~54 únicos)

| Grupo | Dups | Keep |
|-------|------|------|
| OTHER (únicos sin dup) | 85 | Revisión manual |
| PREDATOR_IMMORTAL | 25 | task_375 |
| PREDATOR_GAIN_AMP | 19 | task_067 |
| MATE_RANGE | 15 | task_098 |
| QUERYNEARBY | 15 | task_038 |
| PERCEPTION_LOW | 14 | task_238 (parcialmente resuelto por task_165) |
| GRAZE_GAIN | 13 | task_231 (parcialmente por task_186) |
| DT_INSTABILITY | 12 | task_366 DONE |
| WORLD2SCREEN | 11 | task_340 |
| FIELD_GROWTH | 10 | task_049 |
| GRAPH_SHIFT | 10 | task_055 |
| CHECKMIGRATION | 9 | task_380 |
| REPRO_ENERGY | 8 | task_302 |
| COMPACT | 8 | task_069 |
| VISIBLE_OFFSETS | 7 | task_053 |
| PRODUCERC_PERCEPTION | 6 | task_070 |
| CARCASS_SPLICE | 5 | task_183 |
| TORUSVECTOR | 5 | task_040 |
| COLONY_COMPETITION | 5 | task_160 |
| CHILDFROM_TORUS | 4 | task_071 |
| CIRCADIAN | 4 | task_092 |
| KLEIBER | 3 | task_015 |
| BOIDS | 3 | task_020 |
| QUORUM | 3 | task_072 |
| ESCAPEHTML | 3 | task_107 |
| COLONY_FREE_ENERGY | 3 | task_226 |
| STEPMOBILE_TEMP | 3 | task_188 |
| MUTATION | 3 | task_159 |
| + 16 grupos más pequeños | | |

## Recomendación

1. **NO crear más tareas nuevas** hasta procesar las existentes
2. **Procesar las 10 TODO** en orden (equilibrio primero, perf después)
3. Cuando una tarea DONE, mover sus duplicados a DONE también
4. Considerar un "archive day" para cerrar los ~250 duplicados restantes de una vez
