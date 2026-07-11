(() => {
  'use strict';

  const WORLD = { w: 16000, h: 9000 };
  const CELL = 190;
  const FIELD_CELL = 90;
  const MAX_DEBUG_RANGES = 700;
  const BASE_DT = 1 / 30;
  const MAX_SIM_CHUNKS = 7;

  const TYPE = { PRODUCER: 0, CONSUMER: 1, PREDATOR: 2 };
  const PRODUCER = { A: 0, B: 1, C: 2 };
  const FEEDING = ['grazer', 'filter', 'phagocyte', 'cytostome'];
  const MOVE = ['run-tumble', 'chemotaxis', 'drift', 'spiral'];
  const MOVE_INFO = [
    ['run-tumble', 'Tramos rectos con giros bruscos. Huye bien y explora rápido, pero es menos fino siguiendo alimento.'],
    ['chemotaxis', 'Gira hacia alimento o lejos de amenazas usando percepción química. Favorece persecución y huida dirigida.'],
    ['drift', 'Movimiento suave y barato. Consume menos al girar, pero reacciona peor a depredadores o presas.'],
    ['spiral', 'Búsqueda orbital/ondulante. Cubre área local y combina bien con cilios o alta percepción.']
  ];
  const FEEDING_INFO = [
    ['grazer', 'Pastoreo simple sobre biomasa y contacto directo. Barato y estable.'],
    ['filter', 'Filtrado cercano: cilios aumentan alcance de comida y coste moderado.'],
    ['phagocyte', 'Engullido: pseudópodos mejoran mordida sobre presas/hojas, con más coste de movimiento.'],
    ['cytostome', 'Boca dirigida: eficiente al contactar, más dependiente de persecución y percepción.']
  ];
  const GROUPS = ['producer-a', 'producer-b', 'producer-c', 'consumer', 'predator'];
  const GROUP_LABELS = { 'producer-a': 'Productor Tipo A', 'producer-b': 'Productor Tipo B', 'producer-c': 'Productor Tipo C', consumer: 'Consumidores', predator: 'Depredadores' };
  const GROUP_KEYS = {
    'producer-a': ['densityTotal'],
    'producer-b': ['radius', 'fertility', 'perception', 'energy'],
    'producer-c': ['radius', 'fertility', 'energy', 'leafEnergy', 'leafCount', 'maxAge'],
    consumer: ['size', 'reserves', 'flagella', 'cilia', 'chemosense', 'pseudopodia', 'armor', 'vacuole', 'fertility', 'perception', 'metabolism', 'maxEnergy'],
    predator: ['size', 'reserves', 'flagella', 'cilia', 'chemosense', 'pseudopodia', 'armor', 'vacuole', 'fertility', 'perception', 'metabolism', 'maxEnergy']
  };
  const GENE_COLORS = ['#60d7c2', '#e5bd55', '#54b7f1', '#f05b50', '#a6dd78', '#c38cff', '#f08fb0', '#cfd8dc'];

  const canvas = document.getElementById('world');
  const ctx = canvas.getContext('2d', { alpha: false });
  const graphCanvas = document.getElementById('graph');
  const graphCtx = graphCanvas.getContext('2d');
  const geneCanvas = document.getElementById('geneGraph');
  const geneCtx = geneCanvas.getContext('2d');

  const els = {
    playPause: document.getElementById('playPause'),
    speed: document.getElementById('speed'),
    speedLabel: document.getElementById('speedLabel'),
    systemEnergy: document.getElementById('systemEnergy'),
    systemEnergyLabel: document.getElementById('systemEnergyLabel'),
    addDialog: document.getElementById('addDialog'),
    addForm: document.getElementById('addForm'),
    dynamicFields: document.getElementById('dynamicFields'),
    dialogKindLabel: document.getElementById('dialogKindLabel'),
    dialogTitle: document.getElementById('dialogTitle'),
    confirmAdd: document.getElementById('confirmAdd'),
    statsPanel: document.getElementById('statsPanel'),
    graphPanel: document.getElementById('graphPanel'),
    genePanel: document.getElementById('genePanel'),
    geneSummary: document.getElementById('geneSummary'),
    inspectPanel: document.getElementById('inspectPanel'),
    inspectTitle: document.getElementById('inspectTitle'),
    inspectBody: document.getElementById('inspectBody'),
    closeInspect: document.getElementById('closeInspect'),
    statProducerA: document.getElementById('statProducerA'),
    statProducerB: document.getElementById('statProducerB'),
    statProducerC: document.getElementById('statProducerC'),
    statConsumers: document.getElementById('statConsumers'),
    statPredators: document.getElementById('statPredators'),
    statEnergy: document.getElementById('statEnergy'),
    statSun: document.getElementById('statSun'),
    statBirths: document.getElementById('statBirths'),
    statDeaths: document.getElementById('statDeaths'),
    statTime: document.getElementById('statTime'),
    statFps: document.getElementById('statFps'),
    legendProducerA: document.getElementById('legendProducerA'),
    legendProducerB: document.getElementById('legendProducerB'),
    legendProducerC: document.getElementById('legendProducerC'),
    legendConsumers: document.getElementById('legendConsumers'),
    legendPredators: document.getElementById('legendPredators'),
    worldReadout: document.getElementById('worldReadout')
  };

  const camera = {
    x: WORLD.w * 0.5,
    y: WORLD.h * 0.5,
    zoom: 0.26,
    dragging: false,
    moved: false,
    lastX: 0,
    lastY: 0
  };

  const sim = {
    paused: false,
    debug: false,
    speed: 1,
    solarEnergy: 1,
    time: 0,
    births: 0,
    deaths: 0,
    fps: 0,
    creatures: [],
    freeIds: [],
    grid: new Map(),
    producerField: {
      cols: 0,
      rows: 0,
      mass: new Float32Array(0),
      scratch: new Float32Array(0),
      total: 0,
      accumulator: 0
    },
    graph: [],
    geneHistory: [],
    geneHistoryGroup: 'producer-a',
    populationPxPerSecond: 4,
    genePxPerSecond: 4,
    lastGraphAt: 0,
    lastStatsAt: 0,
    frameCounter: 0,
    fpsAt: performance.now(),
    selectedAddKind: 'producer',
    selectedCreatureId: null
  };

  const fmt = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 });

  function typeName(e) {
    if (!e) return 'Ser';
    if (e.type === TYPE.PREDATOR) return 'Depredador';
    if (e.type === TYPE.CONSUMER) return 'Consumidor';
    if (e.sub === PRODUCER.B) return 'Productor B';
    if (e.sub === PRODUCER.C) return 'Productor C';
    return 'Productor A';
  }

  function groupForType(type) {
    return type === TYPE.PRODUCER ? 'producer' : type === TYPE.CONSUMER ? 'consumer' : 'predator';
  }

  function groupForCreature(e) {
    if (e.type === TYPE.CONSUMER) return 'consumer';
    if (e.type === TYPE.PREDATOR) return 'predator';
    if (e.sub === PRODUCER.B) return 'producer-b';
    if (e.sub === PRODUCER.C) return 'producer-c';
    return 'producer-a';
  }

  function formatValue(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return String(value ?? '-');
    if (Math.abs(value) >= 100) return fmt.format(value);
    return value.toFixed(Math.abs(value) >= 10 ? 1 : 2);
  }

  function movementMaskFromValue(value) {
    if (Array.isArray(value)) {
      let mask = 0;
      for (let i = 0; i < value.length; i += 1) mask |= 1 << Number(value[i]);
      return mask || 2;
    }
    const n = Number(value);
    if (!Number.isFinite(n)) return 2;
    return n || 2;
  }

  function movementMaskFromLegacy(e) {
    if (e.movementMask != null) return movementMaskFromValue(e.movementMask);
    return 1 << clamp(Math.round(Number(e.movement || 0)), 0, MOVE.length - 1);
  }

  function hasMove(e, idx) {
    return Boolean(movementMaskFromLegacy(e) & (1 << idx));
  }

  function movementNames(e) {
    const mask = movementMaskFromLegacy(e);
    return MOVE.filter((_, idx) => mask & (1 << idx)).join(' + ');
  }

  function inheritGene(a, b, key, min, max, integer = false) {
    const av = Number(a[key] ?? 0);
    const bv = Number(b[key] ?? av);
    const low = Math.min(av, bv);
    const high = Math.max(av, bv);
    const span = Math.max(high - low, Math.max(Math.abs((av + bv) * 0.5), 1));
    const value = rand(low - span * 0.2, high + span * 0.2);
    const out = clamp(value, min, max);
    return integer ? Math.round(out) : out;
  }

  function inheritMovementMask(a, b) {
    const ma = movementMaskFromLegacy(a);
    const mb = movementMaskFromLegacy(b);
    const union = ma | mb;
    let child = 0;
    for (let i = 0; i < MOVE.length; i += 1) {
      const bit = 1 << i;
      if (union & bit && chance((ma & bit) && (mb & bit) ? 0.82 : 0.48)) child |= bit;
    }
    if (chance(0.08)) child ^= 1 << Math.floor(rand(0, MOVE.length));
    return child || (chance(0.5) ? ma : mb) || 2;
  }

  function inheritAsexual(e, key, min, max, integer = false) {
    const value = Number(e[key] ?? 0);
    const margin = Math.max(Math.abs(value) * 0.2, 0.05);
    const out = clamp(rand(value - margin, value + margin), min, max);
    return integer ? Math.round(out) : out;
  }

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function chance(p) {
    return Math.random() < p;
  }

  function nowText() {
    const mins = Math.floor(sim.time / 60);
    const secs = Math.floor(sim.time % 60);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  function logEvent() {
    // El log visual se retiró: mantener esta función como no-op evita ramas calientes extra.
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[c]));
  }

  function normalizeAngle(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }

  function wrapInsideWorld(e) {
    if (e.x < 0) e.x += WORLD.w;
    else if (e.x > WORLD.w) e.x -= WORLD.w;
    if (e.y < 0) e.y += WORLD.h;
    else if (e.y > WORLD.h) e.y -= WORLD.h;
  }

  function updateWorldReadout() {
    els.worldReadout.textContent = `${fmt.format(WORLD.w)} x ${fmt.format(WORLD.h)}`;
  }

  function fieldIndex(cx, cy) {
    return cy * sim.producerField.cols + cx;
  }

  function initProducerField(seed = 0.18) {
    const cols = Math.max(4, Math.ceil(WORLD.w / FIELD_CELL));
    const rows = Math.max(4, Math.ceil(WORLD.h / FIELD_CELL));
    sim.producerField.cols = cols;
    sim.producerField.rows = rows;
    sim.producerField.mass = new Float32Array(cols * rows);
    sim.producerField.scratch = new Float32Array(cols * rows);
    sim.producerField.total = 0;
    sim.producerField.accumulator = 0;

    for (let i = 0; i < sim.producerField.mass.length; i += 1) {
      const value = Math.random() < seed ? rand(0.18, 0.85) : rand(0, 0.08);
      sim.producerField.mass[i] = value;
      sim.producerField.total += value;
    }
  }

  function addProducerDensity(x, y, amount = 1, radius = 180) {
    const field = sim.producerField;
    if (!field.mass.length) return;
    const cx = clamp(Math.floor(x / FIELD_CELL), 0, field.cols - 1);
    const cy = clamp(Math.floor(y / FIELD_CELL), 0, field.rows - 1);
    const r = Math.max(1, Math.ceil(radius / FIELD_CELL));
    const gain = Math.max(0.05, amount);
    for (let yy = cy - r; yy <= cy + r; yy += 1) {
      if (yy < 0 || yy >= field.rows) continue;
      for (let xx = cx - r; xx <= cx + r; xx += 1) {
        if (xx < 0 || xx >= field.cols) continue;
        const dx = xx - cx;
        const dy = yy - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 > r * r) continue;
        const idx = fieldIndex(xx, yy);
        const before = field.mass[idx];
        const falloff = 1 - d2 / (r * r + 1);
        const next = clamp(before + gain * falloff * 0.18, 0, 1.8);
        field.mass[idx] = next;
        field.total += next - before;
      }
    }
  }

  function stepProducerField(dt) {
    const field = sim.producerField;
    if (!field.mass.length) return;
    field.accumulator += dt;
    if (field.accumulator < 0.45) return;
    const t = Math.min(field.accumulator, 2.5);
    field.accumulator = 0;

    const cols = field.cols;
    const rows = field.rows;
    const src = field.mass;
    const dst = field.scratch;
    let total = 0;
    const sunlight = clamp(sim.solarEnergy, 0.1, 6);
    const growth = 0.010 * sunlight * t;
    const diffusion = 0.028 * t;

    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        const idx = y * cols + x;
        const m = src[idx];
        const left = x > 0 ? src[idx - 1] : m;
        const right = x < cols - 1 ? src[idx + 1] : m;
        const up = y > 0 ? src[idx - cols] : m;
        const down = y < rows - 1 ? src[idx + cols] : m;
        const avg = (left + right + up + down) * 0.25;
        const grown = m + m * (1 - Math.min(1, m)) * growth;
        const next = clamp(grown + (avg - m) * diffusion, 0, 1.8);
        dst[idx] = next;
        total += next;
      }
    }

    field.mass.set(dst);
    field.total = total;
  }

  function bestProducerDensityTarget(x, y, radius) {
    const field = sim.producerField;
    if (!field.mass.length) return null;
    const cx = clamp(Math.floor(x / FIELD_CELL), 0, field.cols - 1);
    const cy = clamp(Math.floor(y / FIELD_CELL), 0, field.rows - 1);
    const r = clamp(Math.ceil(radius / FIELD_CELL), 1, 6);
    let best = 0.08;
    let bestX = -1;
    let bestY = -1;
    for (let yy = cy - r; yy <= cy + r; yy += 1) {
      if (yy < 0 || yy >= field.rows) continue;
      for (let xx = cx - r; xx <= cx + r; xx += 1) {
        if (xx < 0 || xx >= field.cols) continue;
        const dx = xx - cx;
        const dy = yy - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 > r * r) continue;
        const mass = field.mass[fieldIndex(xx, yy)];
        const score = mass / (1 + d2 * 0.12);
        if (score > best) {
          best = score;
          bestX = xx;
          bestY = yy;
        }
      }
    }
    if (bestX < 0) return null;
    return {
      virtualA: true,
      alive: true,
      sub: PRODUCER.A,
      radius: FIELD_CELL * 0.45,
      x: (bestX + 0.5) * FIELD_CELL,
      y: (bestY + 0.5) * FIELD_CELL,
      density: field.mass[fieldIndex(bestX, bestY)]
    };
  }

  function grazeProducerDensity(e) {
    const field = sim.producerField;
    if (!field.mass.length) return false;
    const cx = clamp(Math.floor(e.x / FIELD_CELL), 0, field.cols - 1);
    const cy = clamp(Math.floor(e.y / FIELD_CELL), 0, field.rows - 1);
    const idx = fieldIndex(cx, cy);
    const mass = field.mass[idx];
    if (mass < 0.035) return false;
    const bite = Math.min(mass, 0.018 + e.size * 0.006 + e.cilia * 0.003 + (e.feeding === 1 ? 0.014 : 0));
    field.mass[idx] = mass - bite;
    field.total -= bite;
    e.energy = Math.min(e.maxEnergy, e.energy + bite * 52);
    return true;
  }

  function createCreature(partial) {
    const id = sim.freeIds.pop() ?? sim.creatures.length;
    const base = {
      id,
      alive: true,
      type: TYPE.PRODUCER,
      sub: PRODUCER.A,
      x: rand(0, WORLD.w),
      y: rand(0, WORLD.h),
      angle: rand(-Math.PI, Math.PI),
      radius: 5,
      speed: 0,
      energy: 1,
      age: 0,
      cooldown: rand(2, 20),
      color: '#76d25d',
      size: 1,
      reserves: 1,
      flagella: 0,
      cilia: 0,
      chemosense: 0,
      pseudopodia: 0,
      armor: 0,
      vacuole: 0,
      feeding: 0,
      movement: 0,
      movementMask: 2,
      perception: 120,
      fertility: 1,
      maxEnergy: 1,
      metabolism: 0,
      leafEnergy: 0,
      leafCount: 0,
      maxRadius: 18,
      maxAge: Infinity
    };
    const e = Object.assign(base, partial);
    sim.creatures[id] = e;
    return e;
  }

  function kill(e, reason) {
    if (!e || !e.alive) return;
    e.alive = false;
    sim.freeIds.push(e.id);
    sim.deaths += 1;
    if (reason && sim.deaths % 20 === 0) logEvent(`${reason}. Muertes acumuladas: ${fmt.format(sim.deaths)}`, 'death');
  }

  function spawnProducer(opts = {}) {
    const sub = opts.sub ?? PRODUCER.A;
    if (sub === PRODUCER.A) {
      addProducerDensity(opts.x ?? rand(0, WORLD.w), opts.y ?? rand(0, WORLD.h), Number(opts.fertility ?? 1), Math.max(120, Number(opts.radius ?? 180)));
      return null;
    }
    const radius = sub === PRODUCER.C ? Number(opts.radius ?? 18) : Number(opts.radius ?? (sub === PRODUCER.B ? 4 : 5));
    const maxRadius = sub === PRODUCER.C ? Math.max(radius + 8, Number(opts.maxRadius ?? radius * 1.9 + 10)) : radius;
    const e = createCreature({
      type: TYPE.PRODUCER,
      sub,
      x: opts.x ?? rand(0, WORLD.w),
      y: opts.y ?? rand(0, WORLD.h),
      radius,
      maxRadius,
      speed: sub === PRODUCER.B ? Number(opts.speed ?? 16) : 0,
      energy: sub === PRODUCER.C ? 18 : 5,
      maxEnergy: sub === PRODUCER.C ? 80 : 18,
      perception: sub === PRODUCER.B ? Number(opts.perception ?? 260) : 160,
      movement: Number(opts.movement ?? Math.floor(rand(0, MOVE.length))),
      movementMask: opts.movementMask != null ? movementMaskFromValue(opts.movementMask) : (opts.movement != null ? 1 << Number(opts.movement) : 2),
      leafEnergy: sub === PRODUCER.C ? rand(8, 18) : 0,
      leafCount: sub === PRODUCER.C ? Math.floor(rand(3, 7)) : 0,
      fertility: Number(opts.fertility ?? (sub === PRODUCER.B ? 0.012 : 0.035)),
      cooldown: rand(sub === PRODUCER.B ? 180 : 12, sub === PRODUCER.C ? 220 : 420),
      maxAge: sub === PRODUCER.C ? Number(opts.maxAge ?? rand(900, 1650)) : Infinity,
      color: sub === PRODUCER.A ? '#78d765' : sub === PRODUCER.B ? '#55d2bb' : '#9fda69'
    });
    return e;
  }

  function derivedConsumerStats(e) {
    const bodyMass = e.size * 1.15 + e.reserves * 0.48 + e.armor * 0.64 + e.vacuole * 0.18;
    const flagellaLoad = Math.pow(Math.max(0, e.flagella), 1.35);
    const locomotion = 16 + e.flagella * 22 + e.cilia * 7 + e.pseudopodia * 4;
    const massDrag = 1 + bodyMass * 0.2 + e.reserves * 0.08 + flagellaLoad * 0.055;
    e.radius = clamp(3.5 + e.size * 1.72 + e.reserves * 0.34, 3, 19);
    e.speed = locomotion / massDrag;
    e.perception = 90 + e.chemosense * 65 + e.cilia * 12;
    const speedCost = Math.pow(Math.max(0, e.speed) / 42, 1.42) * 0.022;
    const tissueCost = e.size * 0.010 + e.reserves * 0.004 + e.armor * 0.007;
    const appendageCost = flagellaLoad * 0.014 + e.cilia * 0.004 + e.pseudopodia * 0.006;
    const vacuoleEfficiency = Math.max(0.82, 1 - e.vacuole * 0.035);
    e.metabolism = (0.014 + speedCost + tissueCost + appendageCost) * vacuoleEfficiency;
    e.maxEnergy = 30 + e.reserves * 16 + e.size * 6.5 + e.vacuole * 3.5;
    return e;
  }

  function spawnConsumer(opts = {}) {
    const e = createCreature({
      type: TYPE.CONSUMER,
      x: opts.x ?? rand(0, WORLD.w),
      y: opts.y ?? rand(0, WORLD.h),
      angle: rand(-Math.PI, Math.PI),
      color: '#54b7f1',
      size: Number(opts.size ?? rand(1, 4)),
      reserves: Number(opts.reserves ?? rand(1, 4)),
      flagella: Number(opts.flagella ?? Math.floor(rand(0, 3.99))),
      cilia: Number(opts.cilia ?? Math.floor(rand(0, 3.99))),
      chemosense: Number(opts.chemosense ?? rand(0.6, 2.4)),
      pseudopodia: Number(opts.pseudopodia ?? rand(0, 2)),
      armor: Number(opts.armor ?? rand(0, 2)),
      vacuole: Number(opts.vacuole ?? rand(0.5, 2.2)),
      feeding: Number(opts.feeding ?? Math.floor(rand(0, FEEDING.length))),
      movement: Number(opts.movement ?? Math.floor(rand(0, MOVE.length))),
      movementMask: opts.movementMask != null ? movementMaskFromValue(opts.movementMask) : (opts.movement != null ? 1 << Number(opts.movement) : 2),
      fertility: Number(opts.fertility ?? 1),
      energy: Number(opts.energy ?? rand(18, 34)),
      cooldown: rand(8, 35)
    });
    return derivedConsumerStats(e);
  }

  function spawnPredator(opts = {}) {
    const e = spawnConsumer({
      ...opts,
      size: opts.size ?? rand(3, 7),
      reserves: opts.reserves ?? rand(2, 5),
      flagella: opts.flagella ?? Math.floor(rand(2, 4.99)),
      cilia: opts.cilia ?? Math.floor(rand(1, 3)),
      chemosense: opts.chemosense ?? rand(1.8, 3.6),
      armor: opts.armor ?? rand(1, 3),
      energy: opts.energy ?? rand(78, 118)
    });
    e.type = TYPE.PREDATOR;
    e.color = '#f05b50';
    e.radius += 1.5;
    e.speed *= 1.28;
    e.perception += 125;
    e.maxEnergy *= 1.55;
    e.metabolism *= 0.98;
    return e;
  }

  function mutate(value, spread, min, max) {
    return clamp(value + rand(-spread, spread), min, max);
  }

  function childFrom(a, b, type) {
    const pick = (key) => chance(0.5) ? a[key] : b[key];
    const opts = {
      x: (a.x + b.x) * 0.5 + rand(-24, 24),
      y: (a.y + b.y) * 0.5 + rand(-24, 24),
      size: inheritGene(a, b, 'size', 0.5, type === TYPE.PREDATOR ? 12 : 9),
      reserves: inheritGene(a, b, 'reserves', 0, 14),
      flagella: inheritGene(a, b, 'flagella', 0, 7, true),
      cilia: inheritGene(a, b, 'cilia', 0, 6, true),
      chemosense: inheritGene(a, b, 'chemosense', 0, 5),
      pseudopodia: inheritGene(a, b, 'pseudopodia', 0, 4),
      armor: inheritGene(a, b, 'armor', 0, 5),
      vacuole: inheritGene(a, b, 'vacuole', 0, 4),
      feeding: chance(0.08) ? Math.floor(rand(0, FEEDING.length)) : pick('feeding'),
      movementMask: inheritMovementMask(a, b),
      fertility: inheritGene(a, b, 'fertility', 0.2, 3),
      energy: type === TYPE.PREDATOR ? 42 : 26
    };
    const child = type === TYPE.PREDATOR ? spawnPredator(opts) : spawnConsumer(opts);
    sim.births += 1;
    return child;
  }

  function cellKey(x, y) {
    return `${Math.floor(x / CELL)},${Math.floor(y / CELL)}`;
  }

  function rebuildGrid() {
    sim.grid.clear();
    for (let i = 0; i < sim.creatures.length; i += 1) {
      const e = sim.creatures[i];
      if (!e || !e.alive) continue;
      const key = cellKey(e.x, e.y);
      let bucket = sim.grid.get(key);
      if (!bucket) {
        bucket = [[], [], []];
        sim.grid.set(key, bucket);
      }
      bucket[e.type].push(e);
    }
  }

  function queryNearby(x, y, radius, type, out) {
    out.length = 0;
    const minX = Math.floor((x - radius) / CELL);
    const maxX = Math.floor((x + radius) / CELL);
    const minY = Math.floor((y - radius) / CELL);
    const maxY = Math.floor((y + radius) / CELL);
    const r2 = radius * radius;
    for (let cy = minY; cy <= maxY; cy += 1) {
      for (let cx = minX; cx <= maxX; cx += 1) {
        const bucket = sim.grid.get(`${cx},${cy}`);
        if (!bucket) continue;
        const list = bucket[type];
        for (let i = 0; i < list.length; i += 1) {
          const e = list[i];
          const dx = e.x - x;
          const dy = e.y - y;
          if (dx * dx + dy * dy <= r2) out.push(e);
        }
      }
    }
    return out;
  }

  function nearestFood(e, candidates) {
    let best = null;
    let bestD2 = Infinity;
    for (let i = 0; i < candidates.length; i += 1) {
      const t = candidates[i];
      if (!t.alive) continue;
      if (e.type === TYPE.CONSUMER && t.sub === PRODUCER.C && e.size < 4.6 && t.leafEnergy <= 0.35) continue;
      const dx = t.x - e.x;
      const dy = t.y - e.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) {
        best = t;
        bestD2 = d2;
      }
    }
    return best;
  }

  const nearby = [];
  const mateCandidates = [];

  function stepProducer(e, dt) {
    e.age += dt;
    e.cooldown -= dt * e.fertility * clamp(sim.solarEnergy, 0.1, 6);

    if (e.sub === PRODUCER.B) {
      queryNearby(e.x, e.y, e.perception || 420, TYPE.CONSUMER, nearby);
      let threat = null;
      let threatD2 = Infinity;
      for (let i = 0; i < nearby.length; i += 1) {
        const c = nearby[i];
        const dx = c.x - e.x;
        const dy = c.y - e.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < threatD2) {
          threat = c;
          threatD2 = d2;
        }
      }
      if (threat) {
        const away = Math.atan2(e.y - threat.y, e.x - threat.x);
        const pull = hasMove(e, 0) ? 0.52 : hasMove(e, 2) ? 0.24 : hasMove(e, 3) ? 0.38 : 0.46;
        e.angle += normalizeAngle(away - e.angle) * pull;
        if (hasMove(e, 0) && chance(0.035)) e.angle += rand(-1.4, 1.4);
      } else {
        const wander = hasMove(e, 2) ? 0.65 : hasMove(e, 3) ? 1.1 : 1.6;
        e.angle += rand(-wander, wander) * dt;
      }
      if (hasMove(e, 3)) e.angle += Math.sin(sim.time * 1.3 + e.id) * 0.02;
      const panic = threat ? (hasMove(e, 2) ? 1.34 : 1.82) : 1;
      e.x += Math.cos(e.angle) * e.speed * panic * dt;
      e.y += Math.sin(e.angle) * e.speed * panic * dt;
      e.energy = Math.min(e.maxEnergy, e.energy + dt * sim.solarEnergy * 0.008);
      wrapInsideWorld(e);
    }

    if (e.sub === PRODUCER.C) {
      const sun = clamp(sim.solarEnergy, 0.1, 6);
      if (e.age > e.maxAge && chance(dt / 90)) {
        kill(e, 'Productor C muere por senescencia');
        return;
      }
      e.energy = Math.min(e.maxEnergy, e.energy + dt * sun * 0.12);
      e.radius = Math.min(e.maxRadius, e.radius + dt * sun * 0.018);
      const leafCap = 8 + e.radius * 0.9;
      e.leafEnergy = Math.min(leafCap, e.leafEnergy + dt * sun * 0.095);
      e.leafCount = Math.max(2, Math.min(14, Math.floor(2 + e.leafEnergy / 4 + e.radius / 8)));
    }

    if (e.cooldown > 0) return;
    e.cooldown = e.sub === PRODUCER.C ? rand(160, 320) : rand(260, 620);

    if (sim.creatures.length - sim.freeIds.length > 50000 && !chance(0.2)) return;

    if (e.sub === PRODUCER.C) {
      queryNearby(e.x, e.y, 900, TYPE.PRODUCER, nearby);
      const hasLargeMate = nearby.some((p) => p !== e && p.sub === PRODUCER.C);
      if (!hasLargeMate || !chance(0.52)) return;
      spawnProducer({
        sub: PRODUCER.C,
        x: clamp(e.x + rand(-720, 720), 0, WORLD.w),
        y: clamp(e.y + rand(-720, 720), 0, WORLD.h),
        radius: inheritAsexual(e, 'radius', 14, 40),
        maxRadius: inheritAsexual(e, 'maxRadius', 28, 72),
        fertility: inheritAsexual(e, 'fertility', 0.03, 0.16),
        maxAge: inheritAsexual(e, 'maxAge', 720, 2100)
      });
      sim.births += 1;
      return;
    }

    const spread = rand(70, 180);
    spawnProducer({
      sub: e.sub,
      x: clamp(e.x + Math.cos(rand(-Math.PI, Math.PI)) * spread, 0, WORLD.w),
      y: clamp(e.y + Math.sin(rand(-Math.PI, Math.PI)) * spread, 0, WORLD.h),
      radius: inheritAsexual(e, 'radius', 3, e.sub === PRODUCER.B ? 8 : 10),
      speed: e.speed ? inheritAsexual(e, 'speed', 6, 52) : 0,
      perception: inheritAsexual(e, 'perception', 80, 520),
      movementMask: chance(0.16) ? inheritMovementMask(e, { movementMask: 1 << Math.floor(rand(0, MOVE.length)) }) : movementMaskFromLegacy(e),
      fertility: inheritAsexual(e, 'fertility', 0.004, 0.45)
    });
    sim.births += 1;
  }

  function steerCreature(e, dt, food) {
    const turnNoise = hasMove(e, 0) ? 2.5 : hasMove(e, 2) ? 1.2 : 0.8;
    e.angle += rand(-turnNoise, turnNoise) * dt;

    if (food && (hasMove(e, 1) || e.chemosense > 1.3)) {
      const desired = Math.atan2(food.y - e.y, food.x - e.x);
      const pull = clamp(e.chemosense * 0.09, 0.04, 0.32);
      e.angle += normalizeAngle(desired - e.angle) * pull;
    }

    if (hasMove(e, 3)) {
      e.angle += Math.sin(sim.time * 0.9 + e.id) * 0.018;
    }

    const ciliaPulse = 1 + Math.sin(sim.time * 5 + e.id) * (e.cilia * 0.015);
    e.x += Math.cos(e.angle) * e.speed * ciliaPulse * dt;
    e.y += Math.sin(e.angle) * e.speed * ciliaPulse * dt;
    wrapInsideWorld(e);
  }

  function feedConsumer(e, target) {
    if (!target || !target.alive) return false;
    if (target.virtualA) return grazeProducerDensity(e);
    const dx = target.x - e.x;
    const dy = target.y - e.y;
    const eatRange = e.radius + target.radius + (e.feeding === 1 ? e.cilia * 2.2 : 3);
    if (dx * dx + dy * dy > eatRange * eatRange) return false;

    if (e.type === TYPE.CONSUMER && target.sub === PRODUCER.C && target.leafEnergy > 0.35) {
      const bite = Math.min(target.leafEnergy, 1.2 + e.size * 0.55 + e.pseudopodia * 0.35 + (e.feeding === 2 ? 0.7 : 0));
      target.leafEnergy -= bite;
      target.leafCount = Math.max(0, Math.floor(target.leafEnergy / 4 + target.radius / 10));
      target.energy = Math.max(0, target.energy - bite * 0.16);
      e.energy = Math.min(e.maxEnergy, e.energy + bite * 9.2);
      return true;
    }

    if (e.type === TYPE.CONSUMER && target.sub === PRODUCER.C && e.size < 4.6) return false;

    const gain = e.type === TYPE.PREDATOR
      ? 70 + target.size * 13 + target.reserves * 5.5
      : target.sub === PRODUCER.C
        ? 54
        : target.sub === PRODUCER.B
          ? 34
          : 7.5;

    e.energy = Math.min(e.maxEnergy, e.energy + gain);
    kill(target, e.type === TYPE.PREDATOR ? 'Depredador consume consumidor' : null);
    return true;
  }

  function reproduceMobile(e, type) {
    if (e.energy < e.maxEnergy * 0.72 || e.cooldown > 0) return;
    queryNearby(e.x, e.y, e.perception * 0.72, type, mateCandidates);
    let mate = null;
    for (let i = 0; i < mateCandidates.length; i += 1) {
      const c = mateCandidates[i];
      if (c !== e && c.alive && c.energy > c.maxEnergy * 0.55 && c.cooldown <= 0) {
        mate = c;
        break;
      }
    }
    if (!mate) return;
    const child = childFrom(e, mate, type);
    e.energy *= 0.58;
    mate.energy *= 0.62;
    e.cooldown = rand(18, 55) / e.fertility;
    mate.cooldown = rand(18, 55) / mate.fertility;
    if (sim.births % 12 === 0) {
      logEvent(`${type === TYPE.PREDATOR ? 'Depredador' : 'Consumidor'} nace por recombinación: tamaño ${child.size.toFixed(1)}, flagelos ${child.flagella}, cilios ${child.cilia}`, 'birth');
    }
  }

  function stepMobile(e, dt) {
    e.age += dt;
    e.cooldown -= dt;
    e.energy -= e.metabolism * dt * 7.5;
    if (e.energy <= 0) {
      kill(e, e.type === TYPE.PREDATOR ? 'Depredador muere por energía' : 'Consumidor muere por energía');
      return;
    }

    let food = null;
    if (e.type === TYPE.PREDATOR) {
      queryNearby(e.x, e.y, e.perception, TYPE.CONSUMER, nearby);
      food = nearestFood(e, nearby);
    } else {
      queryNearby(e.x, e.y, e.perception, TYPE.PRODUCER, nearby);
      const entityFood = nearestFood(e, nearby);
      const fieldFood = bestProducerDensityTarget(e.x, e.y, e.perception);
      food = entityFood;
      if (fieldFood) {
        if (!entityFood) food = fieldFood;
        else {
          const edx = entityFood.x - e.x;
          const edy = entityFood.y - e.y;
          const fdx = fieldFood.x - e.x;
          const fdy = fieldFood.y - e.y;
          if ((fdx * fdx + fdy * fdy) * 0.75 < edx * edx + edy * edy) food = fieldFood;
        }
      }
    }
    steerCreature(e, dt, food);
    if (food) feedConsumer(e, food);
    reproduceMobile(e, e.type);
  }

  function compactIfNeeded() {
    if (sim.freeIds.length < 1200 || sim.freeIds.length < sim.creatures.length * 0.18) return;
    const alive = [];
    const selected = sim.selectedCreatureId == null ? null : sim.creatures[sim.selectedCreatureId];
    for (let i = 0; i < sim.creatures.length; i += 1) {
      const e = sim.creatures[i];
      if (!e || !e.alive) continue;
      e.id = alive.length;
      alive.push(e);
    }
    sim.creatures = alive;
    sim.freeIds = [];
    sim.selectedCreatureId = selected && selected.alive ? selected.id : null;
  }

  function simulate(dt) {
    sim.time += dt;
    stepProducerField(dt);
    rebuildGrid();
    for (let i = 0; i < sim.creatures.length; i += 1) {
      const e = sim.creatures[i];
      if (!e || !e.alive) continue;
      if (e.type === TYPE.PRODUCER) stepProducer(e, dt);
      else stepMobile(e, dt);
    }
    compactIfNeeded();
  }

  function counts() {
    let producerB = 0;
    let producerC = 0;
    let consumers = 0;
    let predators = 0;
    let energy = 0;
    let energyN = 0;
    for (let i = 0; i < sim.creatures.length; i += 1) {
      const e = sim.creatures[i];
      if (!e || !e.alive) continue;
      if (e.type === TYPE.PRODUCER && e.sub === PRODUCER.B) producerB += 1;
      else if (e.type === TYPE.PRODUCER && e.sub === PRODUCER.C) producerC += 1;
      else if (e.type === TYPE.CONSUMER) {
        consumers += 1;
        energy += e.energy;
        energyN += 1;
      } else {
        predators += 1;
        energy += e.energy;
        energyN += 1;
      }
    }
    const producerDensity = sim.producerField.mass.length ? sim.producerField.total / sim.producerField.mass.length : 0;
    return { producerDensity, producerB, producerC, consumers, predators, energyAvg: energyN ? energy / energyN : 0 };
  }

  function recordGeneHistory() {
    const totals = {};
    for (let i = 0; i < GROUPS.length; i += 1) {
      const group = GROUPS[i];
      const keys = GROUP_KEYS[group];
      totals[group] = { n: 0, sums: Object.fromEntries(keys.map((key) => [key, 0])) };
    }

    totals['producer-a'].n = 1;
    totals['producer-a'].sums.densityTotal = sim.producerField.total;

    for (let i = 0; i < sim.creatures.length; i += 1) {
      const e = sim.creatures[i];
      if (!e || !e.alive) continue;
      const group = groupForCreature(e);
      const keys = GROUP_KEYS[group];
      totals[group].n += 1;
      for (let k = 0; k < keys.length; k += 1) {
        const key = keys[k];
        totals[group].sums[key] += Number(e[key] || 0);
      }
    }

    const point = { t: sim.time };
    for (let i = 0; i < GROUPS.length; i += 1) {
      const group = GROUPS[i];
      const keys = GROUP_KEYS[group];
      const n = totals[group].n || 0;
      const avg = {};
      for (let k = 0; k < keys.length; k += 1) {
        const key = keys[k];
        avg[key] = n ? totals[group].sums[key] / n : 0;
      }
      point[group] = { n, avg };
    }
    sim.geneHistory.push(point);
    if (sim.geneHistory.length > 3600) sim.geneHistory.shift();
    drawGeneHistory();
  }

  function resizeCanvasToDisplay(canvasEl, context, fallbackW, fallbackH) {
    const rect = canvasEl.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(fallbackW, Math.floor(rect.width * dpr));
    const h = Math.max(fallbackH, Math.floor(rect.height * dpr));
    if (canvasEl.width !== w || canvasEl.height !== h) {
      canvasEl.width = w;
      canvasEl.height = h;
      context.setTransform(1, 0, 0, 1, 0, 0);
    }
    return { w, h };
  }

  function updateInspector() {
    const id = sim.selectedCreatureId;
    const e = id == null ? null : sim.creatures[id];
    if (!e || !e.alive) {
      sim.selectedCreatureId = null;
      els.inspectPanel.classList.add('hidden');
      return;
    }
    els.inspectTitle.textContent = `${typeName(e)} #${e.id}`;
    let rows = [['tipo', typeName(e)], ['edad', e.age], ['energía', e.energy]];
    if (e.type === TYPE.PRODUCER && e.sub === PRODUCER.B) {
      rows = rows.concat([
        ['radio', e.radius],
        ['percepción', e.perception],
        ['reproducción', e.fertility],
        ['cooldown', e.cooldown],
        ['movimiento', movementNames(e)]
      ]);
    } else if (e.type === TYPE.PRODUCER && e.sub === PRODUCER.C) {
      rows = rows.concat([
        ['radio', e.radius],
        ['radio máx.', e.maxRadius],
        ['hojas', e.leafCount],
        ['energía hojas', e.leafEnergy],
        ['vida máx.', e.maxAge],
        ['reproducción', e.fertility],
        ['cooldown', e.cooldown]
      ]);
    } else {
      rows = rows.concat([
        ['energía máx.', e.maxEnergy],
        ['metabolismo', e.metabolism],
        ['radio', e.radius],
        ['percepción', e.perception],
        ['reproducción', e.fertility],
        ['cooldown', e.cooldown],
        ['movimiento', movementNames(e)],
        ['tamaño', e.size],
        ['reservas', e.reserves],
        ['flagelos', e.flagella],
        ['cilios', e.cilia],
        ['quimiosens.', e.chemosense],
        ['pseudópodos', e.pseudopodia],
        ['armadura', e.armor],
        ['vacuola', e.vacuole],
        ['alimentación', FEEDING[e.feeding] ?? e.feeding]
      ]);
    }
    els.inspectBody.innerHTML = rows
      .filter(([, value]) => value !== undefined && value !== null && value !== '' && !(typeof value === 'number' && Number.isNaN(value)))
      .map(([key, value]) => `<span>${escapeHtml(key)}</span><b>${escapeHtml(formatValue(value))}</b>`)
      .join('');
  }

  function findCreatureAt(screenX, screenY) {
    const pos = screenToWorld(screenX, screenY);
    const worldRadius = clamp(22 / camera.zoom, 18, 360);
    let best = null;
    let bestScreenD2 = Infinity;
    for (let type = 0; type <= 2; type += 1) {
      queryNearby(pos.x, pos.y, worldRadius, type, nearby);
      for (let i = 0; i < nearby.length; i += 1) {
        const e = nearby[i];
        const p = worldToScreen(e.x, e.y);
        const dx = p.x - screenX;
        const dy = p.y - screenY;
        const hit = Math.max(8, e.radius * camera.zoom + 6);
        const d2 = dx * dx + dy * dy;
        if (d2 <= hit * hit && d2 < bestScreenD2) {
          best = e;
          bestScreenD2 = d2;
        }
      }
    }
    return best;
  }

  function resize() {
    const w = Math.floor(window.innerWidth);
    const h = Math.floor(window.innerHeight);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
  }

  function fitWorldZoom() {
    return clamp(Math.min(window.innerWidth / WORLD.w, window.innerHeight / WORLD.h) * 0.82, 0.028, 2.2);
  }

  function centerCamera({ fit = false } = {}) {
    camera.x = WORLD.w * 0.5;
    camera.y = WORLD.h * 0.5;
    if (fit) camera.zoom = fitWorldZoom();
  }

  function screenToWorld(x, y) {
    const cx = window.innerWidth * 0.5;
    const cy = window.innerHeight * 0.5;
    return {
      x: camera.x + (x - cx) / camera.zoom,
      y: camera.y + (y - cy) / camera.zoom
    };
  }

  function worldToScreen(x, y) {
    return {
      x: (x - camera.x) * camera.zoom + window.innerWidth * 0.5,
      y: (y - camera.y) * camera.zoom + window.innerHeight * 0.5
    };
  }

  function clampCamera() {
    const marginX = window.innerWidth / camera.zoom * 0.45;
    const marginY = window.innerHeight / camera.zoom * 0.45;
    camera.x = clamp(camera.x, -marginX, WORLD.w + marginX);
    camera.y = clamp(camera.y, -marginY, WORLD.h + marginY);
  }

  function drawBackground() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#050607';
    ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

    const topLeft = worldToScreen(0, 0);
    const bottomRight = worldToScreen(WORLD.w, WORLD.h);
    const w = bottomRight.x - topLeft.x;
    const h = bottomRight.y - topLeft.y;

    const grad = ctx.createLinearGradient(topLeft.x, topLeft.y, bottomRight.x, bottomRight.y);
    grad.addColorStop(0, '#142018');
    grad.addColorStop(0.5, '#0a1717');
    grad.addColorStop(1, '#17151d');
    ctx.fillStyle = grad;
    ctx.fillRect(topLeft.x, topLeft.y, w, h);

    const fade = clamp(130 * camera.zoom, 18, 90);
    const drawFade = (gradient, x, y, fw, fh) => {
      ctx.fillStyle = gradient;
      ctx.fillRect(x, y, fw, fh);
    };
    let edge = ctx.createLinearGradient(topLeft.x, topLeft.y, topLeft.x, topLeft.y + fade);
    edge.addColorStop(0, 'rgba(0,0,0,0.44)');
    edge.addColorStop(1, 'rgba(0,0,0,0)');
    drawFade(edge, topLeft.x, topLeft.y, w, fade);
    edge = ctx.createLinearGradient(topLeft.x, bottomRight.y, topLeft.x, bottomRight.y - fade);
    edge.addColorStop(0, 'rgba(0,0,0,0.44)');
    edge.addColorStop(1, 'rgba(0,0,0,0)');
    drawFade(edge, topLeft.x, bottomRight.y - fade, w, fade);
    edge = ctx.createLinearGradient(topLeft.x, topLeft.y, topLeft.x + fade, topLeft.y);
    edge.addColorStop(0, 'rgba(0,0,0,0.38)');
    edge.addColorStop(1, 'rgba(0,0,0,0)');
    drawFade(edge, topLeft.x, topLeft.y, fade, h);
    edge = ctx.createLinearGradient(bottomRight.x, topLeft.y, bottomRight.x - fade, topLeft.y);
    edge.addColorStop(0, 'rgba(0,0,0,0.38)');
    edge.addColorStop(1, 'rgba(0,0,0,0)');
    drawFade(edge, bottomRight.x - fade, topLeft.y, fade, h);

    ctx.fillStyle = 'rgba(0,0,0,0.48)';
    ctx.fillRect(0, 0, window.innerWidth, Math.max(0, topLeft.y));
    ctx.fillRect(0, bottomRight.y, window.innerWidth, Math.max(0, window.innerHeight - bottomRight.y));
    ctx.fillRect(0, topLeft.y, Math.max(0, topLeft.x), h);
    ctx.fillRect(bottomRight.x, topLeft.y, Math.max(0, window.innerWidth - bottomRight.x), h);
  }

  function drawProducerField() {
    const field = sim.producerField;
    if (!field.mass.length) return;
    const cols = field.cols;
    const rows = field.rows;
    const start = screenToWorld(-FIELD_CELL, -FIELD_CELL);
    const end = screenToWorld(window.innerWidth + FIELD_CELL, window.innerHeight + FIELD_CELL);
    const minX = clamp(Math.floor(start.x / FIELD_CELL), 0, cols - 1);
    const maxX = clamp(Math.ceil(end.x / FIELD_CELL), 0, cols - 1);
    const minY = clamp(Math.floor(start.y / FIELD_CELL), 0, rows - 1);
    const maxY = clamp(Math.ceil(end.y / FIELD_CELL), 0, rows - 1);
    const size = Math.max(1, FIELD_CELL * camera.zoom + 0.6);

    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const mass = field.mass[fieldIndex(x, y)];
        if (mass < 0.035) continue;
        const p = worldToScreen(x * FIELD_CELL, y * FIELD_CELL);
        const a = clamp(mass * 0.28, 0.035, 0.34);
        ctx.fillStyle = `rgba(118, 210, 93, ${a})`;
        ctx.fillRect(p.x, p.y, size, size);
      }
    }
  }

  function drawDebugRange(e) {
    if (!sim.debug) return;
    const p = worldToScreen(e.x, e.y);
    const range = e.type === TYPE.PRODUCER
      ? e.sub === PRODUCER.C
        ? Math.max(e.radius + (e.leafCount || 0) * 1.8, 120)
        : e.perception || e.radius * 8
      : e.perception;
    const r = range * camera.zoom;
    if (r < 2) return;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.strokeStyle = e.type === TYPE.PREDATOR
      ? 'rgba(240,91,80,0.16)'
      : e.type === TYPE.CONSUMER
        ? 'rgba(84,183,241,0.14)'
        : 'rgba(118,210,93,0.16)';
    ctx.lineWidth = 1;
    ctx.stroke();
    if (e.type === TYPE.PRODUCER && e.sub === PRODUCER.C) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 900 * camera.zoom, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(166,221,120,0.08)';
      ctx.stroke();
    }
  }

  function drawCreature(e) {
    const p = worldToScreen(e.x, e.y);
    const r = Math.max(1, e.radius * camera.zoom);
    if (p.x < -20 || p.y < -20 || p.x > window.innerWidth + 20 || p.y > window.innerHeight + 20) return;

    ctx.fillStyle = e.color;
    if (r <= 2.2) {
      ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
      return;
    }

    if (e.type === TYPE.PRODUCER && e.sub === PRODUCER.C) {
      const leaves = Math.min(14, Math.max(0, e.leafCount || 0));
      ctx.fillStyle = '#7fd867';
      for (let i = 0; i < leaves; i += 1) {
        const a = e.angle + (i / Math.max(1, leaves)) * Math.PI * 2 + Math.sin(sim.time * 0.12 + e.id) * 0.18;
        const leafR = Math.max(1, r * 0.34);
        const lx = p.x + Math.cos(a) * r * 1.18;
        const ly = p.y + Math.sin(a) * r * 1.18;
        ctx.beginPath();
        ctx.ellipse(lx, ly, leafR * 1.45, leafR * 0.72, a, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = e.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(225, 255, 190, 0.28)';
      ctx.beginPath();
      ctx.arc(p.x - r * 0.25, p.y - r * 0.25, r * 0.42, 0, Math.PI * 2);
      ctx.fill();
      if (sim.selectedCreatureId === e.id) drawSelectionRing(p, r, '#a6dd78');
      return;
    }

    if (e.type === TYPE.PREDATOR) {
      ctx.beginPath();
      ctx.moveTo(p.x + Math.cos(e.angle) * r * 1.8, p.y + Math.sin(e.angle) * r * 1.8);
      ctx.lineTo(p.x + Math.cos(e.angle + 2.45) * r * 1.35, p.y + Math.sin(e.angle + 2.45) * r * 1.35);
      ctx.lineTo(p.x + Math.cos(e.angle - 2.45) * r * 1.35, p.y + Math.sin(e.angle - 2.45) * r * 1.35);
      ctx.closePath();
      ctx.fill();
      if (sim.selectedCreatureId === e.id) drawSelectionRing(p, r, '#f05b50');
      return;
    }

    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();

    if (e.type === TYPE.CONSUMER && camera.zoom > 0.05) {
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - Math.cos(e.angle) * r * (1.6 + e.flagella * 0.5), p.y - Math.sin(e.angle) * r * (1.6 + e.flagella * 0.5));
      ctx.stroke();
    }
    if (sim.selectedCreatureId === e.id) drawSelectionRing(p, r, e.type === TYPE.PRODUCER ? '#7fd867' : '#54b7f1');
  }

  function drawSelectionRing(p, r, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r + 5, 0, Math.PI * 2);
    ctx.stroke();
  }

  function render() {
    resize();
    drawBackground();
    drawProducerField();

    let debugDrawn = 0;
    for (let i = 0; i < sim.creatures.length; i += 1) {
      const e = sim.creatures[i];
      if (!e || !e.alive) continue;
      if (sim.debug && debugDrawn < MAX_DEBUG_RANGES) {
        drawDebugRange(e);
        debugDrawn += 1;
      }
      drawCreature(e);
    }
  }

  function updateStats(force = false) {
    if (!force && sim.time - sim.lastStatsAt < 0.35) return;
    sim.lastStatsAt = sim.time;
    const c = counts();
    els.statProducerA.textContent = c.producerDensity.toFixed(3);
    els.statProducerB.textContent = fmt.format(c.producerB);
    els.statProducerC.textContent = fmt.format(c.producerC);
    els.statConsumers.textContent = fmt.format(c.consumers);
    els.statPredators.textContent = fmt.format(c.predators);
    els.statEnergy.textContent = c.energyAvg.toFixed(1);
    els.statSun.textContent = `x${sim.solarEnergy.toFixed(sim.solarEnergy < 2 ? 1 : 0)}`;
    els.statBirths.textContent = fmt.format(sim.births);
    els.statDeaths.textContent = fmt.format(sim.deaths);
    els.statTime.textContent = `${String(Math.floor(sim.time / 60)).padStart(3, '0')}m ${String(Math.floor(sim.time % 60)).padStart(2, '0')}s`;
    els.statFps.textContent = String(Math.round(sim.fps));
    els.legendProducerA.textContent = c.producerDensity.toFixed(3);
    els.legendProducerB.textContent = fmt.format(c.producerB);
    els.legendProducerC.textContent = fmt.format(c.producerC);
    els.legendConsumers.textContent = fmt.format(c.consumers);
    els.legendPredators.textContent = fmt.format(c.predators);

    if (sim.time - sim.lastGraphAt >= 1) {
      sim.lastGraphAt = sim.time;
      sim.graph.push({ t: sim.time, ...c });
      if (sim.graph.length > 3600) sim.graph.shift();
      drawGraph();
      recordGeneHistory();
    }
    if (!els.inspectPanel.classList.contains('hidden')) updateInspector();
  }

  function drawGraph() {
    if (els.graphPanel.classList.contains('hidden')) return;
    const { w, h } = resizeCanvasToDisplay(graphCanvas, graphCtx, 420, 160);
    graphCtx.clearRect(0, 0, w, h);
    graphCtx.fillStyle = 'rgba(255,255,255,0.035)';
    graphCtx.fillRect(0, 0, w, h);
    graphCtx.strokeStyle = 'rgba(255,255,255,0.10)';
    graphCtx.lineWidth = 1;
    for (let y = 20; y < h; y += 35) {
      graphCtx.beginPath();
      graphCtx.moveTo(0, y);
      graphCtx.lineTo(w, y);
      graphCtx.stroke();
    }
    const pxPerSecond = sim.populationPxPerSecond;
    const visibleCount = Math.max(8, Math.floor(w / pxPerSecond));
    const points = sim.graph.slice(-visibleCount);
    const max = Math.max(10, ...points.flatMap((p) => [p.producerDensity * 1000, p.producerB, p.producerC, p.consumers, p.predators]));
    const drawLine = (key, color) => {
      graphCtx.beginPath();
      graphCtx.strokeStyle = color;
      graphCtx.lineWidth = 2;
      for (let i = 0; i < points.length; i += 1) {
        const x = w - (points.length - 1 - i) * pxPerSecond - 5;
        const raw = key === 'producerDensity' ? points[i][key] * 1000 : points[i][key];
        const y = h - (raw / max) * (h - 12) - 6;
        if (i === 0) graphCtx.moveTo(x, y);
        else graphCtx.lineTo(x, y);
      }
      graphCtx.stroke();
    };
    drawLine('producerDensity', '#76d25d');
    drawLine('producerB', '#55d2bb');
    drawLine('producerC', '#9fda69');
    drawLine('consumers', '#54b7f1');
    drawLine('predators', '#f05b50');
  }

  function drawGeneHistory() {
    if (els.genePanel.classList.contains('hidden')) return;
    const { w, h } = resizeCanvasToDisplay(geneCanvas, geneCtx, 520, 180);
    geneCtx.clearRect(0, 0, w, h);
    geneCtx.fillStyle = 'rgba(255,255,255,0.035)';
    geneCtx.fillRect(0, 0, w, h);
    geneCtx.strokeStyle = 'rgba(255,255,255,0.10)';
    geneCtx.lineWidth = 1;
    for (let y = 24; y < h; y += 42) {
      geneCtx.beginPath();
      geneCtx.moveTo(0, y);
      geneCtx.lineTo(w, y);
      geneCtx.stroke();
    }

    const group = sim.geneHistoryGroup;
    const keys = GROUP_KEYS[group].slice(0, 8);
    const pxPerSecond = sim.genePxPerSecond;
    const visibleCount = Math.max(8, Math.floor(w / pxPerSecond));
    const points = sim.geneHistory.filter((p) => p[group]?.n > 0).slice(-visibleCount);
    if (!points.length) {
      els.geneSummary.textContent = 'Sin histórico todavía.';
      return;
    }

    const max = Math.max(1, ...points.flatMap((p) => keys.map((key) => p[group].avg[key] || 0)));
    keys.forEach((key, idx) => {
      geneCtx.beginPath();
      geneCtx.strokeStyle = GENE_COLORS[idx % GENE_COLORS.length];
      geneCtx.lineWidth = 1.8;
      for (let i = 0; i < points.length; i += 1) {
        const x = w - (points.length - 1 - i) * pxPerSecond - 5;
        const y = h - ((points[i][group].avg[key] || 0) / max) * (h - 24) - 12;
        if (i === 0) geneCtx.moveTo(x, y);
        else geneCtx.lineTo(x, y);
      }
      geneCtx.stroke();
    });

    const latest = points[points.length - 1][group];
    const labels = keys.map((key, idx) => `<span style="--gene-color:${GENE_COLORS[idx % GENE_COLORS.length]}">${escapeHtml(key)} <b>${formatValue(latest.avg[key])}</b></span>`);
    els.geneSummary.innerHTML = `<strong>${GROUP_LABELS[group]} · n=${fmt.format(latest.n)}</strong>${labels.join('')}`;
  }

  function animationLoop(ts) {
    sim.frameCounter += 1;
    if (ts - sim.fpsAt >= 700) {
      sim.fps = sim.frameCounter * 1000 / (ts - sim.fpsAt);
      sim.frameCounter = 0;
      sim.fpsAt = ts;
    }

    if (!sim.lastFrame) sim.lastFrame = ts;
    const elapsed = Math.min(0.08, (ts - sim.lastFrame) / 1000);
    sim.lastFrame = ts;

    if (!sim.paused) {
      const scaled = elapsed * sim.speed;
      const chunks = Math.max(1, Math.min(MAX_SIM_CHUNKS, Math.ceil(scaled / BASE_DT)));
      const dt = scaled / chunks;
      for (let i = 0; i < chunks; i += 1) simulate(dt);
    }

    render();
    updateStats();
    requestAnimationFrame(animationLoop);
  }

  function speedFromSlider(value) {
    const t = Number(value) / 100;
    if (t < 0.34) return 0.2 + (t / 0.34) * 0.8;
    const u = (t - 0.34) / 0.66;
    return 1 + Math.pow(u, 2.15) * 99;
  }

  function setSpeed() {
    sim.speed = speedFromSlider(els.speed.value);
    els.speedLabel.textContent = sim.speed < 1 ? `/${Math.round(1 / sim.speed)}` : `x${sim.speed.toFixed(sim.speed < 10 ? 1 : 0)}`;
  }

  function energyFromSlider(value) {
    const t = Number(value) / 100;
    if (t < 0.5) return 0.1 + (t / 0.5) * 0.9;
    return 1 + Math.pow((t - 0.5) / 0.5, 1.65) * 5;
  }

  function setSystemEnergy() {
    sim.solarEnergy = energyFromSlider(els.systemEnergy.value);
    els.systemEnergyLabel.textContent = `x${sim.solarEnergy.toFixed(sim.solarEnergy < 2 ? 1 : 0)}`;
    updateStats(true);
  }

  function setPaused(paused) {
    sim.paused = paused;
    els.playPause.innerHTML = paused ? '<span class="btn-icon">▶</span><span>Play</span>' : '<span class="btn-icon">⏸</span><span>Pausa</span>';
    els.playPause.classList.toggle('active', paused);
  }

  function resetWorld() {
    sim.creatures = [];
    sim.freeIds = [];
    sim.grid.clear();
    initProducerField();
    sim.time = 0;
    sim.births = 0;
    sim.deaths = 0;
    sim.graph = [];
    sim.geneHistory = [];
    sim.selectedCreatureId = null;
    els.inspectPanel.classList.add('hidden');
    seedWorld();
    recordGeneHistory();
    logEvent('Ecosistema reiniciado', 'info');
    updateStats(true);
  }

  function seedWorld() {
    const areaFactor = clamp((WORLD.w * WORLD.h) / (4000 * 2250), 0.35, 6);
    for (let i = 0; i < Math.round(70 * areaFactor); i += 1) spawnProducer({ sub: PRODUCER.B });
    for (let i = 0; i < Math.round(12 * areaFactor); i += 1) spawnProducer({ sub: PRODUCER.C });
    for (let i = 0; i < Math.round(120 * areaFactor); i += 1) spawnConsumer();
    for (let i = 0; i < Math.round(18 * areaFactor); i += 1) spawnPredator();
    logEvent('Seed inicial: biomasa base, consumidores y depredadores');
  }

  function numberField(name, label, value, min, max, step = 1, hint = '') {
    return `
      <div class="field">
        <label for="${name}">${label}${hint ? `<span class="tip" tabindex="0" data-tip="${escapeHtml(hint)}">?</span>` : ''}</label>
        <input id="${name}" name="${name}" type="number" value="${value}" min="${min}" max="${max}" step="${step}">
      </div>
    `;
  }

  function rangeField(name, label, value, min, max, step = 1, hint = '') {
    return `
      <div class="field range-field">
        <label for="${name}">${label}${hint ? `<span class="tip" tabindex="0" data-tip="${escapeHtml(hint)}">?</span>` : ''}</label>
        <div class="range-row">
          <input id="${name}" name="${name}" type="range" value="${value}" min="${min}" max="${max}" step="${step}" data-range-output="${name}Out">
          <output id="${name}Out" for="${name}">${value}</output>
        </div>
      </div>
    `;
  }

  function segmentedField(name, label, value, options, hint = '') {
    const opts = options.map((opt, idx) => {
      const val = Array.isArray(opt) ? opt[0] : idx;
      const text = Array.isArray(opt) ? opt[1] : opt;
      const tip = Array.isArray(opt) ? opt[2] : '';
      return `<label class="segment" title="${escapeHtml(tip || text)}"><input type="radio" name="${name}" value="${val}" ${String(val) === String(value) ? 'checked' : ''}><span>${escapeHtml(text)}</span></label>`;
    }).join('');
    return `
      <div class="field wide">
        <label>${label}${hint ? `<span class="tip" tabindex="0" data-tip="${escapeHtml(hint)}">?</span>` : ''}</label>
        <div class="segments">${opts}</div>
      </div>
    `;
  }

  function selectField(name, label, value, options, hint = '') {
    const opts = options.map((opt, idx) => {
      const val = Array.isArray(opt) ? opt[0] : idx;
      const text = Array.isArray(opt) ? opt[1] : opt;
      return `<option value="${val}" ${String(val) === String(value) ? 'selected' : ''}>${escapeHtml(text)}</option>`;
    }).join('');
    return `
      <div class="field">
        <label for="${name}">${label}${hint ? `<span class="tip" tabindex="0" data-tip="${escapeHtml(hint)}">?</span>` : ''}</label>
        <select id="${name}" name="${name}">${opts}</select>
      </div>
    `;
  }

  function movementField(name, label, selectedMask, hint = '') {
    const opts = MOVE_INFO.map(([move, text], idx) => {
      const bit = 1 << idx;
      return `<label class="segment" title="${escapeHtml(text)}"><input type="checkbox" name="${name}" value="${idx}" ${(selectedMask & bit) ? 'checked' : ''}><span>${escapeHtml(move)}</span></label>`;
    }).join('');
    return `
      <div class="field wide">
        <label>${label}${hint ? `<span class="tip" tabindex="0" data-tip="${escapeHtml(hint)}">?</span>` : ''}</label>
        <div class="segments multi">${opts}</div>
      </div>
    `;
  }

  function bindDynamicFields() {
    els.dynamicFields.querySelectorAll('input[type="range"][data-range-output]').forEach((input) => {
      const out = document.getElementById(input.dataset.rangeOutput);
      const update = () => { if (out) out.textContent = input.value; };
      input.addEventListener('input', update);
      update();
    });
  }

  function openAddDialog(kind) {
    sim.selectedAddKind = kind;
    const title = kind === 'producer' ? 'Añadir productores' : kind === 'consumer' ? 'Añadir consumidores' : 'Añadir depredadores';
    els.dialogKindLabel.textContent = 'Configuración inicial';
    els.dialogTitle.textContent = title;
    const common = rangeField('amount', 'Cantidad', kind === 'producer' ? 120 : kind === 'consumer' ? 40 : 12, 1, 5000, 1, 'Número de entidades a crear repartidas por todo el ecosistema. Valores altos pueden afectar al rendimiento.');
    if (kind === 'producer') {
      const renderProducerForm = (sub = 0) => {
        els.dynamicFields.innerHTML = common
          + segmentedField('sub', 'Modelo productor', sub, [[0, 'Tipo A', 'Biomasa fija agregada en el campo de densidades. Escala muy bien.'], [1, 'Tipo B', 'Productor móvil: detecta consumidores y huye.'], [2, 'Tipo C', 'Colonia fija grande: crece, genera hojas comestibles y muere por edad.']], 'Tipo A no crea entidades individuales; B y C sí entran en la rejilla espacial.')
          + rangeField('radius', 'Tamaño base', sub === 2 ? 18 : 5, 2, 40, 0.5, 'Radio inicial. En Tipo C aumenta con el sol hasta su radio máximo; en Tipo B afecta a contacto y visibilidad.')
          + rangeField('fertility', 'Reproducción', sub === 1 ? 0.012 : 1, 0.004, 3, 0.001, 'Multiplica la velocidad del cooldown reproductivo; también escala con la energía solar. En Tipo B conviene mantenerlo bajo.')
          + (sub === 1
            ? rangeField('speed', 'Velocidad Tipo B', 16, 0, 80, 1, 'Velocidad de productores móviles. Más velocidad ayuda a huir, pero captar sol en movimiento es lento y reproducirse cuesta más.')
              + rangeField('perception', 'Percepción Tipo B', 260, 60, 650, 10, 'Rango para detectar consumidores cercanos y huir antes de ser alcanzado. Demasiada percepción hace que invadan el mapa.')
              + movementField('movementBits', 'Movimientos Tipo B', 2, 'Puede tener varios algoritmos simultáneos. En reproducción se recombinan los bits de ambos padres.')
            : '')
          + (sub === 2
            ? rangeField('maxAge', 'Vida máxima', 1300, 720, 2400, 10, 'Tiempo medio largo antes de morir por senescencia. Se hereda con margen controlado.')
            : '');
        bindDynamicFields();
        els.dynamicFields.querySelectorAll('input[name="sub"]').forEach((input) => {
          input.addEventListener('change', () => renderProducerForm(Number(input.value)));
        });
      };
      renderProducerForm(0);
    } else {
      els.dynamicFields.innerHTML = common
        + rangeField('size', 'Tamaño', kind === 'predator' ? 5 : 2.4, 0.5, 12, 0.1, 'Aumenta radio, energía máxima y capacidad de comer Tipo C, pero sube masa, coste basal y reduce velocidad.')
        + rangeField('flagella', 'Flagelos', kind === 'predator' ? 3 : 1, 0, 7, 1, 'Aumentan impulso, pero ahora tienen coste no lineal: muchos flagelos añaden rozamiento, masa funcional y gasto energético alto.')
        + rangeField('cilia', 'Cilios', kind === 'predator' ? 1 : 2, 0, 6, 1, 'Aumentan micropropulsión, percepción cercana y alcance de filtrado, con coste moderado.')
        + rangeField('reserves', 'Reservas', kind === 'predator' ? 5 : 3, 0, 14, 0.1, 'Amplían energía máxima y supervivencia, pero añaden masa y hacen al ser más lento.')
        + rangeField('chemosense', 'Quimiosensibilidad', kind === 'predator' ? 2.4 : 1.6, 0, 5, 0.1, 'Mejora atracción hacia alimento/presa y orientación si tiene movimiento quimiotáctico.')
        + rangeField('pseudopodia', 'Pseudópodos', kind === 'predator' ? 0.8 : 1.2, 0, 4, 0.1, 'Mejoran mordida y consumo de hojas/presas, pero aportan coste y rozamiento.')
        + rangeField('armor', 'Película / armadura', kind === 'predator' ? 2 : 0.6, 0, 5, 0.1, 'Aumenta masa y coste; queda preparada para ventajas defensivas futuras.')
        + rangeField('vacuole', 'Vacuola contráctil', 1.2, 0, 4, 0.1, 'Reduce parcialmente el metabolismo efectivo, compensando algo el coste de tamaño y movilidad.')
        + segmentedField('feeding', 'Alimentación', 0, FEEDING_INFO.map((item, idx) => [idx, item[0], item[1]]), 'Modo de alimentación: modifica alcance, mordida y eficiencia al comer biomasa, hojas o presas.')
        + movementField('movementBits', 'Movimientos', 2, 'Puede combinar varios algoritmos. La reproducción mezcla los algoritmos activos de ambos padres.')
        + rangeField('fertility', 'Fertilidad', 1, 0.2, 3, 0.1, 'Reduce cooldown reproductivo cuando hay energía suficiente. Los hijos heredan dentro del rango parental ±20%.');
      bindDynamicFields();
    }
    els.addDialog.showModal();
  }

  function openWorldDialog() {
    sim.selectedAddKind = 'world';
    els.dialogKindLabel.textContent = 'Tamaño del ecosistema';
    els.dialogTitle.textContent = 'Configurar mundo 16:9';
    els.dynamicFields.innerHTML =
      selectField('preset', 'Preset', 'custom', [
        ['4000x2250', '1/4 · 4.000 x 2.250'],
        ['8000x4500', '1/2 · 8.000 x 4.500'],
        ['16000x9000', 'Completo por defecto · 16.000 x 9.000'],
        ['custom', 'Personalizado']
      ], 'Cambiar el tamaño reinicia el ecosistema.')
      + numberField('width', 'Ancho', WORLD.w, 1000, 32000, 100)
      + numberField('height', 'Alto', WORLD.h, 563, 18000, 100, 'Se fuerza proporción 16:9 al aplicar.');
    const preset = document.getElementById('preset');
    const width = document.getElementById('width');
    const height = document.getElementById('height');
    preset.addEventListener('change', () => {
      if (preset.value === 'custom') return;
      const [w, h] = preset.value.split('x').map(Number);
      width.value = w;
      height.value = h;
    });
    width.addEventListener('input', () => {
      preset.value = 'custom';
      height.value = Math.round(Number(width.value || WORLD.w) * 9 / 16);
    });
    height.addEventListener('input', () => {
      preset.value = 'custom';
      width.value = Math.round(Number(height.value || WORLD.h) * 16 / 9);
    });
    els.addDialog.showModal();
  }

  function applyWorldSizeFromForm(form) {
    const width = clamp(Math.round(Number(form.get('width') || WORLD.w)), 1000, 32000);
    WORLD.w = width;
    WORLD.h = Math.round(width * 9 / 16);
    updateWorldReadout();
    centerCamera({ fit: true });
    resetWorld();
    logEvent(`Tamaño del ecosistema: ${fmt.format(WORLD.w)} x ${fmt.format(WORLD.h)}`);
  }

  function addFromForm() {
    const form = new FormData(els.addForm);
    if (sim.selectedAddKind === 'world') {
      applyWorldSizeFromForm(form);
      return;
    }
    const amount = clamp(Number(form.get('amount') || 1), 1, 5000);
    const opts = {};
    for (const [key, value] of form.entries()) {
      if (key !== 'amount' && key !== 'movementBits') opts[key] = Number(value);
    }
    const movementBits = form.getAll('movementBits');
    if (movementBits.length) opts.movementMask = movementMaskFromValue(movementBits);
    let lastCreated = null;
    for (let i = 0; i < amount; i += 1) {
      const local = {
        ...opts,
        x: rand(0, WORLD.w),
        y: rand(0, WORLD.h)
      };
      if (sim.selectedAddKind === 'producer') lastCreated = spawnProducer(local) || lastCreated;
      else if (sim.selectedAddKind === 'consumer') lastCreated = spawnConsumer(local);
      else lastCreated = spawnPredator(local);
    }
    if (sim.selectedAddKind !== 'producer') {
      sim.births += amount;
      const label = sim.selectedAddKind === 'consumer' ? 'consumidores' : 'depredadores';
      logEvent(`Añadidos ${fmt.format(amount)} ${label} desde el popup`, 'birth');
    }
    if (amount === 1 && lastCreated) {
      sim.selectedCreatureId = lastCreated.id;
      els.inspectPanel.classList.remove('hidden');
      updateInspector();
    }
    updateStats(true);
  }

  function togglePanel(button, panel) {
    panel.classList.toggle('hidden');
    button.classList.toggle('active', !panel.classList.contains('hidden'));
    requestAnimationFrame(() => {
      drawGraph();
      drawGeneHistory();
    });
  }

  function closeInspector() {
    sim.selectedCreatureId = null;
    els.inspectPanel.classList.add('hidden');
  }

  function makePanelDraggable(panel) {
    const handle = panel.querySelector('.drag-handle') || panel;
    handle.addEventListener('pointerdown', (ev) => {
      if (ev.target.closest('button, input, select')) return;
      const rect = panel.getBoundingClientRect();
      const startX = ev.clientX;
      const startY = ev.clientY;
      const offsetX = startX - rect.left;
      const offsetY = startY - rect.top;
      panel.style.left = `${rect.left}px`;
      panel.style.top = `${rect.top}px`;
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
      panel.setPointerCapture(ev.pointerId);
      const move = (moveEv) => {
        const x = clamp(moveEv.clientX - offsetX, 4, window.innerWidth - Math.min(120, rect.width));
        const y = clamp(moveEv.clientY - offsetY, 62, window.innerHeight - 44);
        panel.style.left = `${x}px`;
        panel.style.top = `${y}px`;
      };
      const up = () => {
        panel.releasePointerCapture(ev.pointerId);
        panel.removeEventListener('pointermove', move);
        panel.removeEventListener('pointerup', up);
        panel.removeEventListener('pointercancel', up);
      };
      panel.addEventListener('pointermove', move);
      panel.addEventListener('pointerup', up);
      panel.addEventListener('pointercancel', up);
    });
  }

  function stretchTimeAxis(ev, key, drawFn) {
    ev.preventDefault();
    const current = sim[key];
    const next = ev.deltaY > 0 ? current / 1.22 : current * 1.22;
    sim[key] = clamp(next, 0.18, 24);
    drawFn();
  }

  function bindEvents() {
    window.addEventListener('resize', resize);
    window.addEventListener('resize', () => {
      drawGraph();
      drawGeneHistory();
    });
    els.speed.addEventListener('input', setSpeed);
    els.systemEnergy.addEventListener('input', setSystemEnergy);
    els.playPause.addEventListener('click', () => setPaused(!sim.paused));
    document.getElementById('toggleStats').addEventListener('click', (ev) => {
      els.statsPanel.classList.toggle('hidden');
      ev.currentTarget.classList.toggle('active', !els.statsPanel.classList.contains('hidden'));
    });
    document.getElementById('toggleGraphs').addEventListener('click', (ev) => togglePanel(ev.currentTarget, els.graphPanel));
    document.getElementById('toggleGenes').addEventListener('click', (ev) => {
      if (!sim.geneHistory.length) recordGeneHistory();
      togglePanel(ev.currentTarget, els.genePanel);
    });
    document.querySelectorAll('[data-gene-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        sim.geneHistoryGroup = btn.dataset.geneTab;
        document.querySelectorAll('[data-gene-tab]').forEach((tab) => tab.classList.toggle('active', tab === btn));
        drawGeneHistory();
      });
    });
    document.getElementById('toggleDebug').addEventListener('click', (ev) => {
      sim.debug = !sim.debug;
      ev.currentTarget.classList.toggle('active', sim.debug);
      ev.currentTarget.title = sim.debug ? `Rangos activos (máx. ${MAX_DEBUG_RANGES})` : 'Visualizar rangos';
    });
    document.getElementById('resetWorld').addEventListener('click', () => {
      if (!window.confirm('¿Reiniciar el ecosistema y perder la simulación actual?')) return;
      resetWorld();
    });
    els.worldReadout.addEventListener('click', openWorldDialog);
    els.closeInspect.addEventListener('click', closeInspector);
    window.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && !els.inspectPanel.classList.contains('hidden') && !els.addDialog.open) closeInspector();
    });
    makePanelDraggable(els.graphPanel);
    makePanelDraggable(els.genePanel);
    makePanelDraggable(els.inspectPanel);
    makePanelDraggable(els.statsPanel);
    graphCanvas.addEventListener('wheel', (ev) => stretchTimeAxis(ev, 'populationPxPerSecond', drawGraph), { passive: false });
    geneCanvas.addEventListener('wheel', (ev) => stretchTimeAxis(ev, 'genePxPerSecond', drawGeneHistory), { passive: false });
    new ResizeObserver(() => {
      drawGraph();
      drawGeneHistory();
    }).observe(els.graphPanel);
    new ResizeObserver(() => drawGeneHistory()).observe(els.genePanel);

    document.querySelectorAll('[data-add]').forEach((btn) => {
      btn.addEventListener('click', () => openAddDialog(btn.dataset.add));
    });

    els.addForm.addEventListener('submit', (ev) => {
      if (ev.submitter?.value === 'cancel') return;
      ev.preventDefault();
      addFromForm();
      els.addDialog.close();
    });

    canvas.addEventListener('pointerdown', (ev) => {
      camera.dragging = true;
      camera.moved = false;
      camera.lastX = ev.clientX;
      camera.lastY = ev.clientY;
      canvas.classList.add('dragging');
      canvas.setPointerCapture(ev.pointerId);
    });
    canvas.addEventListener('pointermove', (ev) => {
      if (!camera.dragging) return;
      const dx = ev.clientX - camera.lastX;
      const dy = ev.clientY - camera.lastY;
      if (Math.abs(dx) + Math.abs(dy) > 3) camera.moved = true;
      camera.x -= dx / camera.zoom;
      camera.y -= dy / camera.zoom;
      camera.lastX = ev.clientX;
      camera.lastY = ev.clientY;
      clampCamera();
    });
    canvas.addEventListener('pointerup', () => {
      camera.dragging = false;
      canvas.classList.remove('dragging');
    });
    canvas.addEventListener('pointercancel', () => {
      camera.dragging = false;
      canvas.classList.remove('dragging');
    });
    canvas.addEventListener('dblclick', () => {
      centerCamera({ fit: true });
    });
    canvas.addEventListener('click', (ev) => {
      if (camera.moved || ev.detail > 1) return;
      const selected = findCreatureAt(ev.clientX, ev.clientY);
      if (!selected) return;
      sim.selectedCreatureId = selected.id;
      els.inspectPanel.classList.remove('hidden');
      const x = clamp(ev.clientX + 14, 8, window.innerWidth - 300);
      const y = clamp(ev.clientY + 14, 68, window.innerHeight - 220);
      els.inspectPanel.style.left = `${x}px`;
      els.inspectPanel.style.top = `${y}px`;
      els.inspectPanel.style.right = 'auto';
      els.inspectPanel.style.bottom = 'auto';
      updateInspector();
    });
    canvas.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      const before = screenToWorld(ev.clientX, ev.clientY);
      const factor = Math.exp(-ev.deltaY * 0.0012);
      camera.zoom = clamp(camera.zoom * factor, 0.028, 2.2);
      const after = screenToWorld(ev.clientX, ev.clientY);
      camera.x += before.x - after.x;
      camera.y += before.y - after.y;
      clampCamera();
    }, { passive: false });
  }

  function init() {
    setSpeed();
    setSystemEnergy();
    bindEvents();
    resize();
    updateWorldReadout();
    centerCamera({ fit: true });
    initProducerField();
    seedWorld();
    recordGeneHistory();
    updateStats(true);
    requestAnimationFrame(animationLoop);
  }

  init();
})();
