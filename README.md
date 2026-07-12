# MicroMundo 3.0

Simulador web de microecosistema. Vanilla HTML/CSS/JS con Canvas 2D, sin build ni dependencias externas.

## Tech stack

- **HTML** único (`index.html`) con un `<canvas>` a pantalla completa y paneles HUD
- **CSS** en `styles.css`: tema oscuro, responsive, paneles flotantes con drag/resize
- **JavaScript** en `app.js` (~3000 líneas, un solo IIFE): sin framework, sin bundler
- Despliegue estático via GitHub Pages

## Estructura del repo

```
micromundo/
├── index.html    # Markup: toolbar, canvas, paneles (stats, gráficas, genes, inspector), diálogo de creación
├── styles.css    # Tema oscuro, layout responsive, paneles movibles, diálogos, previews
├── app.js        # Toda la lógica: simulación, render, input, UI, genes, reproducción
├── .gitignore    # Ignora .DS_Store, node_modules/, dist/, .env
└── README.md     # Este archivo
```

## Mundo y coordenadas

- Mundo toroidal 16:9, por defecto `16000 x 9000` (configurable clicando el readout de tamaño en la toolbar)
- Celda de rejilla espacial: `CELL = 190` para entidades móviles
- Celda de campo de biomasa: `FIELD_CELL = 90` para productores Tipo A
- Cámara con zoom libre, pan por drag, y seguimiento opcional a criatura seleccionada
- Niebla fuera del rectángulo del ecosistema

## Seres y tipos

### Productores

| Tipo | Modelo | Descripción |
|------|--------|-------------|
| **A** | Campo de densidad (`Float32Array`) | Biomasa agregada por celda. No es una entidad individual; escala por área. |
| **B** | Entidad móvil | Detecta consumidores cercanos y huye. Se reproduce lento, capta poca energía solar, más lento para evitar dominancia. |
| **C** | Colonia fija | Crece con el sol, genera hojas/protuberancias comestibles. Puede alimentar consumidores sin morir. Muere por senescencia tras vida larga. |

### Consumidores

- Entidades móviles con genes heredables
- Se reproducen sexualmente: recombinación + mutación de genes numéricos y máscara de movimiento
- Genes: tamaño, reservas, flagelos, cilios, quimiosensibilidad, pseudópodos, armadura, vacuola, fertilidad, percepción, metabolismo, modo de alimentación, movimientos

### Depredadores

- Entidades móviles, más longevos que consumidores
- Más energía inicial/máxima, más rápidos y perceptivos
- Mayor retorno energético al comer consumidores
- Misma estructura genética que consumidores

## Genes y fenotipos

- **Tamaño/reservas**: más tamaño → más energía almacenada, pero menos velocidad y más coste metabólico
- **Flagelos**: aumento de velocidad con coste no lineal (muchos flagelos no son ventaja gratis)
- **Cilios**: aumentan alcance de filtrado de comida
- **Quimiosensibilidad**: percepción química para seguir alimento o huir de amenazas
- **Pseudópodos**: mejoran mordida/engullido sobre presas y hojas
- **Armadura/película**: reduce daño pero penaliza movimiento
- **Vacuola contráctil**: regula osmótica
- **Fertilidad**: frecuencia de reproducción
- **Percepción**: rango de detección
- **Metabolismo**: derivado de otros genes; afecta velocidad y gasto

### Modos de alimentación

`grazer` (pastoreo), `filter` (filtrado con cilios), `phagocyte` (engullido con pseudópodos), `cytostome` (boca dirigida)

### Algoritmos de movimiento (combinables)

`run-tumble`, `chemotaxis`, `drift`, `spiral`, `pause`, `burst`

Los hijos recombinan la máscara de movimientos de ambos padres. La herencia de genes numéricos queda acotada al rango parental ±20%, respetando límites globales.

## Interacción y UI

- **Toolbar superior**: pausa/play, slider de speed (/5 a x100), slider de energía solar, botones de añadir (productor, consumidor, depredador) con rayo ⚡ de añadido rápido
- **Diálogo de creación**: campos dinámicos con sliders para rangos, botones segmentados para opciones discretas, tooltip de ayuda, preview visual de la criatura
- **Panel de estadísticas** (movible): conteos por tipo, energía media, sol, nacimientos, muertes, tiempo de simulación, FPS
- **Panel de gráficas de población** (movible y redimensionable): series separadas para productores A/B/C, consumidores y depredadores; rueda de ratón para zoom temporal
- **Panel de histórico genético** (movible y redimensionable): tabs por tipo, medias móviles por segundo, toggles individuales por gen; rueda de ratón para rango temporal
- **Panel de inspección** (movible): valores del ser seleccionado al hacer click; cerrable con X o Escape
- **Debug de rangos**: muestra rangos de percepción/alimentación/reproducción de entidades (limitado a 700 para no matar FPS)
- **Estelas**: las criaturas seleccionadas dejan estela visible

## Arquitectura y rendimiento

- **Sin framework**: Canvas 2D directo, menos coste y arranque instantáneo
- **Rejilla espacial**: reconstruida por tick solo para entidades móviles/grandes; evita comparar todos contra todos
- **Productor Tipo A como `Float32Array`**: densidad por celda, no entidades individuales
- **Productor Tipo C sin entidades por hoja**: las hojas son energía agregada en la colonia
- **Histórico genético agregado una vez por segundo**: no guarda serie por individuo, solo medias por tipo
- **Speed alto escala delta de simulación**: limita chunks por frame (`MAX_SIM_CHUNKS = 7`) para no tumbar el navegador
- **Base de tiempo**: `BASE_DT = 1/30` (30 fps lógico)

## Controles

| Acción | Control |
|--------|---------|
| Pausar/reanudar | Botón o tecla |
| Velocidad | Slider (0 a x100) |
| Energía solar | Slider (afecta crecimiento de biomasa y reproducción de productores) |
| Añadir ser | Botones de toolbar → diálogo de configuración |
| Rayo ⚡ | Añade lote rápido con valores adaptativos |
| Seleccionar ser | Click sobre criatura |
| Mover cámara | Drag sobre canvas |
| Zoom | Rueda de ratón |
| Reiniciar mundo | Botón ↻ |
| Centrar/seguir criatura | Botones en inspector |
| Escalar gráficas | Rueda de ratón sobre canvas de gráfica/genes |

## Deploy

- **Repo**: `https://github.com/kali-sandin/micromundo`
- **URL pública**: `https://kali-sandin.github.io/micromundo/`
- **Repo local**: `/home/kali/.openclaw/workspace/projects/micromundo`
- Despliegue estático: GitHub Pages

## TheOffice

Proyecto registrado como:

- ID: `micromundo`
- Título: `Micromundo`
- Repo: `/home/kali/.openclaw/workspace/projects/micromundo`
- URL pública: `https://kali-sandin.github.io/micromundo/`
