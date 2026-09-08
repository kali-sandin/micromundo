# task_921 — Estabilidad del reciclaje dependiente de stock (vía A)

Continuación de task_921_recycle_sensitivity.md (0be72b3). Modelo de primer orden:
  net(f, popC) = sysnet + f_eff(S)·detritus − (popC−1)·metab,  dS/dt = net
con metab ≈ 0.47·conservIn (misma escala que 0be72b3) y variantes de f_eff(S):
  fija   : f_eff = f*
  decreciente: f_eff = f*·(S0/S)^k  (recicla MÁS cuando el campo está pobre: realimentación negativa)
  leak   : f_eff = f* y pérdida proporcional al stock, −λ·(S−S0), λ=0.05 /s
Nota: f_eff creciente en S (p.ej. S/(S+K)) es realimentación POSITIVA y diverge; se verificó y descarta.
Perturbación: popC salta +10% en t=0 (peor dirección: más demanda).
Criterio: ¿recupera el sistema un equilibrio con S>0 y en cuánto tiempo/excursión?

## seed 12345  (S0=6289 E, f*=86.4%, demanda=1359 E/s)

| f_eff | popC +10%: S final (E) | excursión mín (E) | net<1 E/s en t (s) | colapso |
|---|---|---|---|---|
| fija f* | — | — | no converge | SÍ |
| decreciente k=0.5 | 5120 | 5120 | 70 | no |
| decreciente k=1 | 5675 | 5675 | 61 | no |
| decreciente k=2 | 5974 | 5974 | 61 | no |
| leak λ=0.05/s (f=f*) | 5012 | 5012 | 83 | no |

## seed 20264  (S0=6483 E, f*=86.6%, demanda=1367 E/s)

| f_eff | popC +10%: S final (E) | excursión mín (E) | net<1 E/s en t (s) | colapso |
|---|---|---|---|---|
| fija f* | — | — | no converge | SÍ |
| decreciente k=0.5 | 5281 | 5281 | 71 | no |
| decreciente k=1 | 5851 | 5851 | 61 | no |
| decreciente k=2 | 6159 | 6159 | 61 | no |
| leak λ=0.05/s (f=f*) | 5198 | 5198 | 83 | no |

## seed 28183  (S0=6162 E, f*=86.7%, demanda=1349 E/s)

| f_eff | popC +10%: S final (E) | excursión mín (E) | net<1 E/s en t (s) | colapso |
|---|---|---|---|---|
| fija f* | — | — | no converge | SÍ |
| decreciente k=0.5 | 5019 | 5019 | 68 | no |
| decreciente k=1 | 5561 | 5561 | 61 | no |
| decreciente k=2 | 5854 | 5854 | 61 | no |
| leak λ=0.05/s (f=f*) | 4894 | 4894 | 82 | no |

## seed 36102  (S0=6182 E, f*=87.2%, demanda=1365 E/s)

| f_eff | popC +10%: S final (E) | excursión mín (E) | net<1 E/s en t (s) | colapso |
|---|---|---|---|---|
| fija f* | — | — | no converge | SÍ |
| decreciente k=0.5 | 5041 | 5041 | 68 | no |
| decreciente k=1 | 5582 | 5582 | 61 | no |
| decreciente k=2 | 5874 | 5874 | 61 | no |
| leak λ=0.05/s (f=f*) | 4899 | 4899 | 83 | no |

## seed 44021  (S0=6327 E, f*=87.1%, demanda=1371 E/s)

| f_eff | popC +10%: S final (E) | excursión mín (E) | net<1 E/s en t (s) | colapso |
|---|---|---|---|---|
| fija f* | — | — | no converge | SÍ |
| decreciente k=0.5 | 5157 | 5157 | 69 | no |
| decreciente k=1 | 5712 | 5712 | 61 | no |
| decreciente k=2 | 6012 | 6012 | 61 | no |
| leak λ=0.05/s (f=f*) | 5038 | 5038 | 83 | no |

## Cota física de la ganancia

Seed 12345: para popC +10% el equilibrio exige f_eff ≈ 95.8% (f*=86.4%).
Alcanzable. Con f=f*·(S0/S)^k: S' = S0·(f*/req)^(1/k); k=1 → S'≈5675 E (90% de S0); k=0.5 → S'≈5120 E. Con leak λ=0.05: S'−S0 = −0.1·metab/λ ≈ -1277 E.

## Lectura para la decisión (Jared)

1. Signo de la retroalimentación: f_eff DECRECIENTE en S (o pérdida proporcional al
   stock) es realimentación negativa y estabiliza; f_eff creciente en S diverge
   (verificado: caso S/(S+K) explota). La tarjeta debe fijar el signo, no solo la forma.
2. Excursión: con perturbación +10% popC, k=1 deja el campo ~8-10% por debajo de S0;
   k=2 más plano pero más frágil cerca de f=1; leak λ=0.05/s cae ~20% y converge suave.
3. La estabilidad es local y ante salto de demanda; deriva sostenida de popC la agota.
   El gate cp2 (pendiente<=5%/10m) detectaría ese régimen.
4. Esto dimensiona la tarjeta de la vía A (flag OFF, criterio de excursión mínima y
   signo de la dependencia); no implementa nada del motor.

Artefacto generado por recycle-stability-task921.js; datos: paired_on_60m/.
