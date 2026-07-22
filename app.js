(() => {
  'use strict';

  const WORLD = { w: 16000, h: 9000 };
  const CELL = 190;
  const FIELD_CELL = 90;
  let GRID_COLS = Math.max(1, Math.ceil(WORLD.w / CELL));
  let GRID_ROWS = Math.max(1, Math.ceil(WORLD.h / CELL));

  function recomputeGridDimensions() {
    GRID_COLS = Math.max(1, Math.ceil(WORLD.w / CELL));
    GRID_ROWS = Math.max(1, Math.ceil(WORLD.h / CELL));
  }
  const MAX_DEBUG_RANGES = 700;
  const BASE_DT = 1 / 30;
  const MAX_SIM_CHUNKS = 30;
  const MAX_DT = BASE_DT * 3; // 0.1s - clamp anti-inestabilidad a alta velocidad

  const TYPE = { PRODUCER: 0, CONSUMER: 1, PREDATOR: 2 };
  const PRODUCER = { A: 0, B: 1, C: 2 };
  const FEEDING = ['grazer', 'filter', 'phagocyte', 'cytostome'];
  const MOVE = ['run-tumble', 'chemotaxis', 'drift', 'spiral', 'pause', 'burst'];
  const MOVE_INFO = [
    ['run-tumble', 'Tramos rectos con giros bruscos. Huye bien y explora rápido, pero es menos fino siguiendo alimento.'],
    ['chemotaxis', 'Gira hacia alimento o lejos de amenazas usando percepción química. Favorece persecución y huida dirigida.'],
    ['drift', 'Movimiento suave y barato. Consume menos al girar, pero reacciona peor a depredadores o presas.'],
    ['spiral', 'Búsqueda orbital/ondulante. Cubre área local y combina bien con cilios o alta percepción.'],
    ['pause', 'Permanece quieto intervalos breves para ahorrar energía cuando no necesita desplazarse.'],
    ['burst', 'Muy de vez en cuando hace un impulso largo: gana distancia rápido, pero gasta mucha energía.']
  ];
  const FEEDING_INFO = [
    ['grazer', 'Pastoreo simple sobre biomasa y contacto directo. Barato y estable.'],
    ['filter', 'Filtrado cercano: cilios aumentan alcance de comida y coste moderado.'],
    ['phagocyte', 'Engullido: pseudópodos mejoran mordida sobre presas/hojas, con más coste de movimiento.'],
    ['cytostome', 'Boca dirigida: eficiente al contactar, más dependiente de persecución y percepción.']
  ];
  const GROUPS = ['producer-a', 'producer-b', 'producer-c', 'consumer', 'predator'];
  const GROUP_LABELS = { 'producer-a': 'Productor Tipo A', 'producer-b': 'Productor Tipo B', 'producer-c': 'Productor Tipo C', consumer: 'Consumidores', predator: 'Depredadores' };
  const GROUP_COLORS = { 'producer-a': '#76d25d', 'producer-b': '#9fda69', 'producer-c': '#48d28d', consumer: '#54b7f1', predator: '#f05b50' };
  const GROUP_KEYS = {
    'producer-a': ['densityTotal'],
    'producer-b': ['radius', 'armor', 'fertility', 'energy', 'leafEnergy', 'leafCount', 'maxAge'],
    'producer-c': ['radius', 'armor', 'fertility', 'perception', 'energy', 'maxAge'],
    consumer: ['size', 'reserves', 'flagella', 'cilia', 'chemosense', 'pseudopodia', 'armor', 'vacuole', 'fertility', 'perception', 'metabolism', 'maxEnergy'],
    predator: ['size', 'reserves', 'flagella', 'cilia', 'chemosense', 'pseudopodia', 'armor', 'vacuole', 'fertility', 'perception', 'metabolism', 'maxEnergy']
  };
  const GENE_COLORS = ['#60d7c2', '#e5bd55', '#54b7f1', '#f05b50', '#a6dd78', '#c38cff', '#f08fb0', '#cfd8dc'];
  const ENERGY_COLOR = '#e5bd55';
  const GENE_COLOR_BY_KEY = {
    densityTotal: '#76d25d',
    radius: '#a6dd78',
    maxRadius: '#9fda69',
    size: '#60d7c2',
    reserves: '#e5bd55',
    flagella: '#54b7f1',
    cilia: '#86d7ff',
    chemosense: '#c38cff',
    pseudopodia: '#f08fb0',
    armor: '#d9e4df',
    vacuole: '#7fd8a6',
    feeding: '#f6cf6b',
    movementBits: '#b2c6ff',
    movement: '#b2c6ff',
    fertility: '#ffb36b',
    perception: '#9bd1ff',
    metabolism: '#ff8d8d',
    maxEnergy: '#ffd071',
    energy: '#ffd071',
    leafEnergy: '#a6dd78',
    leafCount: '#8bcf62',
    maxAge: '#c6d2dd'
  };
  const COLONY_MIN_LEAVES_TO_REPRODUCE = 2;
  const ADD_AMOUNT_DEFAULT = 50;
  const ADD_AMOUNT_MAX = 1000;
  const TRAIL_MAX_POINTS = 440;
  const TRAIL_MIN_STEP = 10;
  const HISTORY_MAX_POINTS = 21600;
  const DEFAULT_HISTORY_PX_PER_SECOND = 0.45;
  const DEFAULT_INITIAL_PERCEPTION = 120;
  const PRODUCER_C_MAX_PERCEPTION = 180;
  const PRODUCER_C_DEFAULT_FERTILITY = 0.026;
  const PRODUCER_C_CROWD_RADIUS = 320;
  const PRODUCER_C_CROWD_LIMIT = 2;

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
    dayNightToggle: document.getElementById('dayNightToggle'),
    addDialog: document.getElementById('addDialog'),
    addForm: document.getElementById('addForm'),
    dynamicFields: document.getElementById('dynamicFields'),
    dialogKindLabel: document.getElementById('dialogKindLabel'),
    dialogTitle: document.getElementById('dialogTitle'),
    confirmAdd: document.getElementById('confirmAdd'),
    quickMix: document.getElementById('quickMix'),
    defaultsAdd: document.getElementById('defaultsAdd'),
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
    time: 0,
    speed: 1,
    solarEnergy: 1,
    solarEnergyBase: 1,
    dayNightEnabled: false,
    dayNightPeriod: 600,
    dayNightPhase: 0,
    births: 0,
    deaths: 0,
    fps: 0,
    creatures: [],
    creatureIndex: new Map(),
    freeIds: [],
    grid: new Map(),
    gridBucketPool: [],
    producerField: {
      cols: 0,
      rows: 0,
      cellW: FIELD_CELL,
      cellH: FIELD_CELL,
      mass: new Float32Array(0),
      scratch: new Float32Array(0),
      total: 0,
      accumulator: 0
    },
    graph: [],
    geneHistory: [],
    geneHistoryGroup: 'producer-a',
    populationPxPerSecond: DEFAULT_HISTORY_PX_PER_SECOND,
    genePxPerSecond: DEFAULT_HISTORY_PX_PER_SECOND,
    lastGraphAt: 0,
    lastStatsAt: 0,
    frameCounter: 0,
    fpsAt: performance.now(),
    selectedAddKind: 'producer',
    selectedCreatureId: null,
    selectedCreatureIds: [],
    selectedTrails: new Map(),
    followCreatureId: null,
    lastCenteredCreatureId: null,
    lastAddValues: {},
    nextCreatureUid: 1,
    populationSeriesVisible: {
      producerDensity: true,
      producerB: true,
      producerC: true,
      consumers: true,
      predators: true
    },
    geneSeriesHidden: {},
    carcasses: [],
    predatorCount: 0,
    predatorCountTimer: 0,
    migrationTimer: 0
  };

  const fmt = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 });

  function creatureKey(e) {
    return e?.uid ?? e?.id;
  }

  function creatureByKey(key) {
    if (key == null) return null;
    const e = sim.creatureIndex.get(Number(key));
    return e && e.alive ? e : null;
  }

  function geneHiddenSet(group) {
    if (!sim.geneSeriesHidden[group]) sim.geneSeriesHidden[group] = new Set();
    return sim.geneSeriesHidden[group];
  }

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

  function isColonyProducer(eOrSub) {
    const sub = typeof eOrSub === 'number' ? eOrSub : eOrSub?.sub;
    return sub === PRODUCER.B;
  }

  function isMobileProducer(eOrSub) {
    const sub = typeof eOrSub === 'number' ? eOrSub : eOrSub?.sub;
    return sub === PRODUCER.C;
  }

  function colorForGroup(group) {
    return GROUP_COLORS[group] || '#d9e4df';
  }

  function colorForCreature(e) {
    return colorForGroup(groupForCreature(e));
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
    if (e._moveMask != null) return e._moveMask;
    const mask = e.movementMask != null
      ? movementMaskFromValue(e.movementMask)
      : 1 << clamp(Math.round(Number(e.movement || 0)), 0, MOVE.length - 1);
    e._moveMask = mask;
    return mask;
  }

  function hasMove(e, idx) {
    const m = e._moveMask;
    return m != null ? (m & (1 << idx)) !== 0 : Boolean(movementMaskFromLegacy(e) & (1 << idx));
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
    const value = rand(low - span * 0.18, high + span * 0.18);
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
    if (chance(0.04)) child ^= 1 << Math.floor(rand(0, MOVE.length));
    return child || (chance(0.5) ? ma : mb) || 2;
  }

  function inheritAsexual(e, key, min, max, integer = false) {
    const value = Number(e[key] ?? 0);
    const margin = Math.max(Math.abs(value) * 0.06, 0.02);
    const out = clamp(rand(value - margin, value + margin), min, max);
    return integer ? Math.round(out) : out;
  }

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function mod(v, max) {
    return ((v % max) + max) % max;
  }

  function torusDelta(delta, size) {
    if (delta > size * 0.5) return delta - size;
    if (delta < -size * 0.5) return delta + size;
    return delta;
  }

  function torusDistance2(a, b) {
    const dx = torusDelta(b.x - a.x, WORLD.w);
    const dy = torusDelta(b.y - a.y, WORLD.h);
    return dx * dx + dy * dy;
  }

  const _scrTV = { dx: 0, dy: 0 };
  function torusVector(from, to) {
    _scrTV.dx = torusDelta(to.x - from.x, WORLD.w);
    _scrTV.dy = torusDelta(to.y - from.y, WORLD.h);
    return _scrTV;
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

  function geneLabelHtml(key, label) {
    const color = GENE_COLOR_BY_KEY[key];
    if (!color) return escapeHtml(label);
    return `<span class="gene-label" style="--gene-color:${color}"><i></i>${escapeHtml(label)}</span>`;
  }

  function labelWithTip(key, label, hint = '') {
    return `${geneLabelHtml(key, label)}${hint ? `<span class="tip" tabindex="0" data-tip="${escapeHtml(hint)}">?</span>` : ''}`;
  }

  function infoRow(label, value, geneKey = '') {
    return { label, value, geneKey };
  }

  function previewKind(data) {
    if (data.type === TYPE.PREDATOR || data.kind === 'predator') return 'predator';
    if (data.type === TYPE.CONSUMER || data.kind === 'consumer') return 'consumer';
    const sub = Number(data.sub ?? PRODUCER.A);
    if (sub === PRODUCER.B) return 'producer-b';
    if (sub === PRODUCER.C) return 'producer-c';
    return 'producer-a';
  }

  function smallAppendages(count, className) {
    const multiplier = className === 'preview-cilium' ? 7 : 1;
    const maxCount = className === 'preview-cilium' ? 42 : 8;
    const n = clamp(Math.round(Number(count || 0) * multiplier), 0, maxCount);
    let html = '';
    for (let i = 0; i < n; i += 1) {
      const angle = className === 'preview-flagellum'
        ? -30 + (n === 1 ? 0 : 60 * i / (n - 1))
        : 360 * i / Math.max(1, n);
      html += `<i class="${className}" style="--i:${i};--n:${Math.max(1, n)};--a:${angle}deg"></i>`;
    }
    return html;
  }

  function energyRatio(e) {
    const max = Math.max(0.001, Number(e?.maxEnergy || 0));
    return clamp(Number(e?.energy || 0) / max, 0, 1);
  }

  function energyBarHtml(e) {
    if (!e || !Number.isFinite(Number(e.energy)) || !Number.isFinite(Number(e.maxEnergy)) || e.maxEnergy <= 0) return '';
    return `<div class="energy-bar" title="Energía ${escapeHtml(formatValue(e.energy))} / ${escapeHtml(formatValue(e.maxEnergy))}"><i style="width:${(energyRatio(e) * 100).toFixed(1)}%"></i></div>`;
  }

  function lifeBarHtml(e) {
    if (!e || !Number.isFinite(Number(e.age)) || !Number.isFinite(Number(e.maxAge)) || e.maxAge <= 0) return '';
    const ratio = clamp(Number(e.age || 0) / Number(e.maxAge), 0, 1);
    return `<div class="life-bar" title="Vida ${escapeHtml(formatValue(e.age))} / ${escapeHtml(formatValue(e.maxAge))}"><i style="width:${(ratio * 100).toFixed(1)}%"></i></div>`;
  }

  function previewHtml(data) {
    const kind = previewKind(data);
    const radius = Number(data.radius ?? (data.size ? 3.5 + Number(data.size) * 1.72 + Number(data.reserves || 0) * 0.34 : 8));
    const size = Number(data.size ?? radius);
    const armor = Number(data.armor || 0);
    const leafCount = Number(data.leafCount ?? (kind === 'producer-b' ? 6 : 0));
    const body = clamp((kind === 'producer-b' ? radius * 1.45 : size * 6.2 + radius * 0.35), 18, 74);
    const isPredator = kind === 'predator';
    const isMobile = kind === 'consumer' || kind === 'predator';
    const leaves = smallAppendages(leafCount, 'preview-leaf');
    const flagella = smallAppendages(data.flagella, 'preview-flagellum');
    const cilia = smallAppendages(data.cilia, 'preview-cilium');
    const metrics = [];
    if (kind === 'producer-a') metrics.push(['Densidad', data.densityTotal ?? data.fertility ?? 1]);
    if (kind === 'producer-b' || kind === 'producer-c') {
      metrics.push(['Radio', radius], ['Armadura', armor]);
      if (kind === 'producer-b') metrics.push(['Hojas', leafCount]);
    }
    if (isMobile) {
      metrics.push(['Tamaño', data.size ?? 0], ['Flagelos', data.flagella ?? 0], ['Cilios', data.cilia ?? 0], ['Armadura', armor]);
    }
    const metricHtml = metrics.map(([label, value]) => `<span>${escapeHtml(label)} <b>${escapeHtml(formatValue(value))}</b></span>`).join('');
    const bodyShape = isPredator ? 'preview-body predator-shape' : 'preview-body';
    return `
      <div class="creature-preview ${kind}" style="--body:${body}px;--armor:${clamp(armor, 0, 5)}">
        ${energyBarHtml(data)}
        ${lifeBarHtml(data)}
        <div class="preview-stage">
          ${kind === 'producer-b' ? leaves : ''}
          ${isMobile ? flagella : ''}
          ${isMobile ? cilia : ''}
          <i class="${bodyShape}"></i>
        </div>
        <div class="preview-metrics">${metricHtml}</div>
      </div>
    `;
  }

  function normalizeAngle(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }

  function wrapInsideWorld(e) {
    e.x = mod(e.x, WORLD.w);
    e.y = mod(e.y, WORLD.h);
  }

  function updateWorldReadout() {
    els.worldReadout.textContent = `${fmt.format(WORLD.w)} x ${fmt.format(WORLD.h)}`;
  }

  function fieldIndex(cx, cy) {
    return cy * sim.producerField.cols + cx;
  }

  function fieldCellX(x) {
    const field = sim.producerField;
    return mod(Math.floor(mod(x, WORLD.w) / field.cellW), field.cols);
  }

  function fieldCellY(y) {
    const field = sim.producerField;
    return mod(Math.floor(mod(y, WORLD.h) / field.cellH), field.rows);
  }

  function fieldCellRadius(radius) {
    const field = sim.producerField;
    return Math.max(1, Math.ceil(radius / Math.max(field.cellW, field.cellH)));
  }

  function smoothProducerFieldSeed(passes = 5) {
    const field = sim.producerField;
    const cols = field.cols;
    const rows = field.rows;
    let src = field.mass;
    let dst = field.scratch;
    for (let pass = 0; pass < passes; pass += 1) {
      let total = 0;
      for (let y = 0; y < rows; y += 1) {
        for (let x = 0; x < cols; x += 1) {
          const idx = y * cols + x;
          const center = src[idx];
          const left = src[y * cols + mod(x - 1, cols)];
          const right = src[y * cols + mod(x + 1, cols)];
          const up = src[mod(y - 1, rows) * cols + x];
          const down = src[mod(y + 1, rows) * cols + x];
          const next = center * 0.58 + (left + right + up + down) * 0.105;
          dst[idx] = next;
          total += next;
        }
      }
      const swap = src;
      src = dst;
      dst = swap;
      field.total = total;
    }
    if (src !== field.mass) field.mass.set(src);
  }

  function initProducerField(seed = 0.18) {
    const cols = Math.max(4, Math.ceil(WORLD.w / FIELD_CELL));
    const rows = Math.max(4, Math.ceil(WORLD.h / FIELD_CELL));
    sim.producerField.cols = cols;
    sim.producerField.rows = rows;
    sim.producerField.cellW = WORLD.w / cols;
    sim.producerField.cellH = WORLD.h / rows;
    sim.producerField.mass = new Float32Array(cols * rows);
    sim.producerField.scratch = new Float32Array(cols * rows);
    sim.producerField.total = 0;
    sim.producerField.accumulator = 0;

    for (let i = 0; i < sim.producerField.mass.length; i += 1) {
      const value = Math.random() < seed ? rand(0.14, 0.52) : rand(0.025, 0.10);
      sim.producerField.mass[i] = value;
      sim.producerField.total += value;
    }
    smoothProducerFieldSeed(7);
  }

  function addProducerDensity(x, y, amount = 1, radius = 90) {
    const field = sim.producerField;
    if (!field.mass.length) return;
    const cx = fieldCellX(x);
    const cy = fieldCellY(y);
    const r = fieldCellRadius(radius);
    const gain = Math.max(0.05, amount);
    for (let yy = cy - r; yy <= cy + r; yy += 1) {
      const wy = mod(yy, field.rows);
      for (let xx = cx - r; xx <= cx + r; xx += 1) {
        const wx = mod(xx, field.cols);
        const dx = xx - cx;
        const dy = yy - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 > r * r) continue;
        const idx = fieldIndex(wx, wy);
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
    const growth = 0.015 * sunlight * t;
    const diffusion = 0.028 * t;

    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        const idx = y * cols + x;
        const m = src[idx];
        const left = src[y * cols + mod(x - 1, cols)];
        const right = src[y * cols + mod(x + 1, cols)];
        const up = src[mod(y - 1, rows) * cols + x];
        const down = src[mod(y + 1, rows) * cols + x];
        const avg = (left + right + up + down) * 0.25;
        const grown = m + m * (1.3 - Math.min(1.3, m)) * growth;
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
    const cx = fieldCellX(x);
    const cy = fieldCellY(y);
    const r = clamp(fieldCellRadius(radius), 1, 6);
    let best = 0.08;
    let bestX = -1;
    let bestY = -1;
    for (let yy = cy - r; yy <= cy + r; yy += 1) {
      const wy = mod(yy, field.rows);
      for (let xx = cx - r; xx <= cx + r; xx += 1) {
        const wx = mod(xx, field.cols);
        const dx = xx - cx;
        const dy = yy - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 > r * r) continue;
        const mass = field.mass[fieldIndex(wx, wy)];
        const score = mass / (1 + d2 * 0.12);
        if (score > best) {
          best = score;
          bestX = wx;
          bestY = wy;
        }
      }
    }
    if (bestX < 0) return null;
    return {
      virtualA: true,
      alive: true,
      sub: PRODUCER.A,
      radius: Math.max(field.cellW, field.cellH) * 0.45,
      x: (bestX + 0.5) * field.cellW,
      y: (bestY + 0.5) * field.cellH,
      density: field.mass[fieldIndex(bestX, bestY)]
    };
  }

  function grazeProducerDensity(e) {
    const field = sim.producerField;
    if (!field.mass.length) return false;
    const cx = fieldCellX(e.x);
    const cy = fieldCellY(e.y);
    const idx = fieldIndex(cx, cy);
    const mass = field.mass[idx];
    if (mass < 0.035) return false;
    const bite = Math.min(mass, 0.018 + e.size * 0.006 + e.cilia * 0.003 + (e.feeding === 1 ? 0.014 : 0));
    field.mass[idx] = mass - bite;
    field.total -= bite;
    e.energy = Math.min(e.maxEnergy, e.energy + bite * 25);
    return true;
  }

  function returnCarcassEnergyToField(car) {
    if (!car || !sim.producerField.mass.length || car.energy <= 0) return;
    const depositRadius = Math.max(90, Math.min(240, car.radius * 12));
    addProducerDensity(car.x, car.y, Math.max(0.18, car.energy * 0.035), depositRadius);
    car.energy = 0;
    car.alive = false;
  }

  function nearestCarcassFood(e, radius) {
    let best = null;
    let bestD2 = Infinity;
    for (let i = 0; i < sim.carcasses.length; i += 1) {
      const car = sim.carcasses[i];
      if (!car || !car.alive || car.energy <= 0) continue;
      const dx = torusDelta(car.x - e.x, WORLD.w);
      const dy = torusDelta(car.y - e.y, WORLD.h);
      const d2 = dx * dx + dy * dy;
      if (d2 <= radius * radius && d2 < bestD2) {
        best = car;
        bestD2 = d2;
      }
    }
    return best;
  }

  function eatCarcass(e, car) {
    if (!car || !car.alive || car.energy <= 0) return false;
    const dx = torusDelta(car.x - e.x, WORLD.w);
    const dy = torusDelta(car.y - e.y, WORLD.h);
    const eatRange = e.radius + car.radius + (e.feeding === 1 ? e.cilia * 2.2 : 4);
    if (dx * dx + dy * dy > eatRange * eatRange) return false;
    const bite = Math.min(car.energy, 0.9 + e.size * 0.58 + e.pseudopodia * 0.38 + (e.feeding === 2 ? 0.8 : 0));
    car.energy -= bite;
    e.energy = Math.min(e.maxEnergy, e.energy + bite * (e.type === TYPE.PREDATOR ? 11 : 6.5));
    if (car.energy <= 0.2) {
      car.energy = 0;
      car.alive = false;
    }
    return true;
  }

  function stepCarcasses(dt) {
    for (let ci = sim.carcasses.length - 1; ci >= 0; ci -= 1) {
      const car = sim.carcasses[ci];
      car.life += dt;
      if (car.life >= car.maxLife) returnCarcassEnergyToField(car);
      if (!car.alive || car.energy <= 0) { sim.carcasses[ci] = sim.carcasses[sim.carcasses.length - 1]; sim.carcasses.pop(); }
    }
  }

  function createCreature(partial) {
    const id = sim.freeIds.pop() ?? sim.creatures.length;
    const base = {
      id,
      uid: sim.nextCreatureUid++,
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
      perception: DEFAULT_INITIAL_PERCEPTION,
      fertility: 1,
      maxEnergy: 1,
      metabolism: 0,
      restUntil: 0,
      restCooldown: 0,
      burstCooldown: 0,
      leafEnergy: 0,
      leafCount: 0,
      maxRadius: 18,
      maxAge: Infinity,
      competitionAt: 0,
      starved: 0
    };
    const e = Object.assign(base, partial);
    sim.creatures[id] = e;
    sim.creatureIndex.set(e.uid, e);
    return e;
  }

  function kill(e, reason) {
    if (!e || !e.alive) return;
    e.alive = false;
    sim.creatureIndex.delete(e.uid);
    sim.selectedTrails.delete(creatureKey(e));
    sim.freeIds.push(e.id);
    sim.deaths += 1;

    // El retorno al campo ocurre al descomponerse; mientras tanto el cadaver se puede comer.
    if (sim.carcasses.length < 400) {
      const storedEnergy = Math.max(1.5, Number(e.energy || 0) * 0.55 + Number(e.radius || 1) * 1.2);
      sim.carcasses.push({
        alive: true,
        virtualCarcass: true,
        x: e.x,
        y: e.y,
        radius: Math.max(2, e.radius * 0.9),
        sourceType: e.type,
        energy: storedEnergy,
        maxEnergy: storedEnergy,
        life: 0,
        maxLife: 8
      });
    }

    if (reason && sim.deaths % 20 === 0) logEvent(`${reason}. Muertes acumuladas: ${fmt.format(sim.deaths)}`, 'death');
  }

  function spawnProducer(opts = {}) {
    const sub = opts.sub ?? PRODUCER.A;
    if (sub === PRODUCER.A) {
      addProducerDensity(opts.x ?? rand(0, WORLD.w), opts.y ?? rand(0, WORLD.h), Number(opts.fertility ?? 1), Math.max(60, Number(opts.radius ?? 90)));
      return null;
    }
    const colony = isColonyProducer(sub);
    const mobile = isMobileProducer(sub);
    const radius = colony ? Number(opts.radius ?? 18) : Number(opts.radius ?? (mobile ? 5 : 5));
    const maxRadius = colony ? Math.max(radius + 8, Number(opts.maxRadius ?? radius * 1.9 + 10)) : radius;
    const chemosense = mobile ? Number(opts.chemosense ?? rand(2.2, 3.4)) : 0;
    const movement = Number(opts.movement ?? Math.floor(rand(0, MOVE.length)));
    const e = createCreature({
      type: TYPE.PRODUCER,
      sub,
      x: opts.x ?? rand(0, WORLD.w),
      y: opts.y ?? rand(0, WORLD.h),
      radius,
      maxRadius,
      speed: mobile ? Number(opts.speed ?? 24) : 0,
      energy: colony ? 18 : 8,
      maxEnergy: colony ? 92 : 24,
      armor: Number(opts.armor ?? (colony ? rand(3.1, 5.4) : mobile ? rand(2.2, 4.0) : rand(1.2, 2.6))),
      chemosense,
      perception: mobile ? clamp(Number(opts.perception ?? DEFAULT_INITIAL_PERCEPTION), 40, PRODUCER_C_MAX_PERCEPTION) : 40,
      movement,
      movementMask: opts.movementMask != null ? movementMaskFromValue(opts.movementMask) : (1 << movement),
      leafEnergy: colony ? rand(8, 18) : 0,
      leafCount: colony ? Math.floor(rand(3, 7)) : 0,
      fertility: Number(opts.fertility ?? (mobile ? PRODUCER_C_DEFAULT_FERTILITY : 0.024)),
      cooldown: rand(mobile ? 30 : 15, colony ? 80 : 60),
      maxAge: colony ? Number(opts.maxAge ?? rand(9000, 16500)) : mobile ? Number(opts.maxAge ?? rand(5200, 9000)) : Infinity,
      competitionAt: sim.time + rand(0.5, 3.5),
      color: sub === PRODUCER.A ? GROUP_COLORS['producer-a'] : sub === PRODUCER.B ? GROUP_COLORS['producer-b'] : GROUP_COLORS['producer-c']
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
    const speedCost = Math.pow(Math.max(0, e.speed) / 42, 1.42) * 0.022;
    const tissueCost = e.size * 0.010 + e.reserves * 0.004 + e.armor * 0.007;
    const appendageCost = flagellaLoad * 0.014 + e.cilia * 0.004 + e.pseudopodia * 0.006;
    if (!Number.isFinite(Number(e.perception)) || e.perception <= 0) e.perception = DEFAULT_INITIAL_PERCEPTION;
    const sensoryCost = e.chemosense * 0.010 + Math.max(0, e.perception - DEFAULT_INITIAL_PERCEPTION) * 0.000075;
    const motionCost = (hasMove(e, 4) ? -0.004 : 0) + (hasMove(e, 5) ? 0.010 : 0);
    const vacuoleEfficiency = Math.max(0.82, 1 - e.vacuole * 0.035);
    e.metabolism = (0.014 + speedCost + tissueCost + appendageCost + sensoryCost + motionCost) * vacuoleEfficiency;
    e.maxEnergy = 30 + e.reserves * 16 + e.size * 6.5 + e.vacuole * 3.5;
    return e;
  }

  function spawnConsumer(opts = {}) {
    const movement = Number(opts.movement ?? Math.floor(rand(0, MOVE.length)));
    const e = createCreature({
      type: TYPE.CONSUMER,
      x: opts.x ?? rand(0, WORLD.w),
      y: opts.y ?? rand(0, WORLD.h),
      angle: rand(-Math.PI, Math.PI),
      color: '#54b7f1',
      size: Number(opts.size ?? rand(1, 4)),
      reserves: Number(opts.reserves ?? rand(2.5, 6)),
      flagella: Number(opts.flagella ?? Math.floor(rand(0, 3.99))),
      cilia: Number(opts.cilia ?? Math.floor(rand(0, 3.99))),
      chemosense: Number(opts.chemosense ?? rand(0.6, 2.4)),
      pseudopodia: Number(opts.pseudopodia ?? rand(0, 2)),
      armor: Number(opts.armor ?? rand(0, 2)),
      vacuole: Number(opts.vacuole ?? rand(0.5, 2.2)),
      feeding: Number(opts.feeding ?? Math.floor(rand(0, FEEDING.length))),
      movement,
      movementMask: opts.movementMask != null ? movementMaskFromValue(opts.movementMask) : (1 << movement),
      perception: Number(opts.perception ?? DEFAULT_INITIAL_PERCEPTION),
      fertility: Number(opts.fertility ?? 1),
      energy: Number(opts.energy ?? rand(32, 58)),
      maxAge: Number(opts.maxAge ?? rand(2800, 4600)),
      cooldown: rand(8, 35)
    });
    const out = derivedConsumerStats(e);
    if (!opts.keepConsumerSpeed) out.speed *= 0.88;
    out.metabolism *= 0.9;
    return out;
  }

  function spawnPredator(opts = {}) {
    const e = spawnConsumer({
      ...opts,
      size: opts.size ?? rand(3, 7),
      reserves: opts.reserves ?? rand(7, 15),
      flagella: opts.flagella ?? Math.floor(rand(2, 4.99)),
      cilia: opts.cilia ?? Math.floor(rand(1, 3)),
      chemosense: opts.chemosense ?? rand(1.8, 3.6),
      armor: opts.armor ?? rand(1, 3),
      energy: opts.energy ?? rand(120, 190),
      keepConsumerSpeed: true
    });
    e.type = TYPE.PREDATOR;
    e.color = '#f05b50';
    e.radius += 1.5;
    e.speed *= 1.28;
    e.maxEnergy *= 4.65;
    if (opts.energy == null) e.energy = rand(e.maxEnergy * 0.38, e.maxEnergy * 0.62);
    e.metabolism *= 0.82;
    e.maxAge = Number(opts.maxAge ?? rand(7200, 11700));
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
      reserves: inheritGene(a, b, 'reserves', 0, type === TYPE.PREDATOR ? 24 : 14),
      flagella: inheritGene(a, b, 'flagella', 0, 7, true),
      cilia: inheritGene(a, b, 'cilia', 0, 6, true),
      chemosense: inheritGene(a, b, 'chemosense', 0, 5),
      pseudopodia: inheritGene(a, b, 'pseudopodia', 0, 4),
      armor: inheritGene(a, b, 'armor', 0, 5),
      vacuole: inheritGene(a, b, 'vacuole', 0, 4),
      feeding: chance(0.08) ? Math.floor(rand(0, FEEDING.length)) : pick('feeding'),
      movementMask: inheritMovementMask(a, b),
      fertility: inheritGene(a, b, 'fertility', 0.2, 3),
      maxAge: inheritGene(a, b, 'maxAge', type === TYPE.PREDATOR ? 5000 : 1800, type === TYPE.PREDATOR ? 15000 : 8000),
      energy: type === TYPE.PREDATOR ? 160 : 26
    };
    const child = type === TYPE.PREDATOR ? spawnPredator(opts) : spawnConsumer(opts);
    sim.births += 1;
    return child;
  }

  function cellKeyInt(x, y) {
    const col = Math.floor(x / CELL);
    const row = Math.floor(y / CELL);
    return row * GRID_COLS + col;
  }

  function acquireBucket() {
    const b = sim.gridBucketPool.pop();
    if (b) { b[0].length = 0; b[1].length = 0; b[2].length = 0; return b; }
    return [[], [], []];
  }

  function rebuildGrid() {
    // Return existing buckets to pool instead of letting GC collect them
    for (const b of sim.grid.values()) sim.gridBucketPool.push(b);
    sim.grid.clear();
    for (let i = 0; i < sim.creatures.length; i += 1) {
      const e = sim.creatures[i];
      if (!e || !e.alive) continue;
      const key = cellKeyInt(e.x, e.y);
      let bucket = sim.grid.get(key);
      if (!bucket) {
        bucket = acquireBucket();
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
        const bucket = sim.grid.get(mod(cy, GRID_ROWS) * GRID_COLS + mod(cx, GRID_COLS));
        if (!bucket) continue;
        const list = bucket[type];
        for (let i = 0; i < list.length; i += 1) {
          const e = list[i];
          const dx = torusDelta(e.x - x, WORLD.w);
          const dy = torusDelta(e.y - y, WORLD.h);
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
      if (e.type === TYPE.PREDATOR && isColonyProducer(t)) continue;
      if (isColonyProducer(t) && ((t.leafCount || 0) <= 0 || t.leafEnergy <= 0.35)) continue;
      if (t.type === TYPE.PRODUCER && t.sub !== PRODUCER.A && !canEatArmored(e, t)) continue;
      const dx = torusDelta(t.x - e.x, WORLD.w);
      const dy = torusDelta(t.y - e.y, WORLD.h);
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) {
        best = t;
        bestD2 = d2;
      }
    }
    return best;
  }

  function feedingPower(e, target) {
    const mode = Number(e.feeding || 0);
    const predatorBonus = e.type === TYPE.PREDATOR ? 2.4 : 0;
    let power = e.size * 0.95 + e.pseudopodia * 0.72 + e.cilia * 0.18 + e.chemosense * 0.16 + predatorBonus;
    if (mode === 1) power += e.cilia * 0.42;
    else if (mode === 2) power += e.pseudopodia * 1.05 + e.size * 0.25;
    else if (mode === 3) power += e.chemosense * 0.35 + e.size * 0.44;
    else power += 0.35;
    if (isColonyProducer(target)) power += -0.15;
    return power;
  }

  function armorResistance(target) {
    if (!target) return 0;
    const plantMass = target.type === TYPE.PRODUCER && !isColonyProducer(target) ? Math.max(0, target.radius - 4) * 0.045 : 0;
    return Number(target.armor || 0) + plantMass;
  }

  function canEatArmored(e, target) {
    if (target?.virtualA) return true;
    if (!target || target.type !== TYPE.PRODUCER) return true;
    if (target.sub === PRODUCER.A) return true;
    const mobileProducerShield = target.sub === PRODUCER.C && e.type === TYPE.CONSUMER ? 0.95 : 0;
    return feedingPower(e, target) >= armorResistance(target) + mobileProducerShield;
  }

  const nearby = [];
  const mateCandidates = [];
  const mateSeekCandidates = [];
  const producerThreats = [];
  const consumerThreats = [];
  const producerCrowd = [];

  function producerCCrowdFactor(e) {
    if (!e || !isMobileProducer(e)) return 1;
    queryNearby(e.x, e.y, PRODUCER_C_CROWD_RADIUS, TYPE.PRODUCER, producerCrowd);
    let close = 0;
    for (let i = 0; i < producerCrowd.length; i += 1) {
      const other = producerCrowd[i];
      if (!other || other === e || !other.alive || !isMobileProducer(other)) continue;
      close += 1;
    }
    if (close <= PRODUCER_C_CROWD_LIMIT) return 1;
    return clamp(1 - (close - PRODUCER_C_CROWD_LIMIT) * 0.22, 0, 1);
  }

  function updateResting(e, dt, pressure = false) {
    if (!hasMove(e, 4)) return false;
    if (pressure && sim.time < e.restUntil) {
      e.restUntil = sim.time;
      return false;
    }
    if (sim.time < e.restUntil) return true;
    if (pressure || sim.time < e.restCooldown) return false;
    const restChance = e.energy < e.maxEnergy * 0.38 ? 0.34 : 0.16;
    if (chance(dt * restChance)) {
      e.restUntil = sim.time + rand(1.8, 4.6);
      e.restCooldown = e.restUntil + rand(4, 10);
      return true;
    }
    return false;
  }

  function burstMultiplier(e, dt, pressure = false) {
    if (!hasMove(e, 5) || sim.time < e.burstCooldown || e.energy < e.maxEnergy * 0.18) return 1;
    const p = pressure ? 0.035 : 0.007;
    if (!chance(dt * p)) return 1;
    e.burstCooldown = sim.time + rand(18, 42);
    e.energy = Math.max(0, e.energy - Math.max(3, e.maxEnergy * 0.045));
    return rand(2.6, 4.2);
  }

  function nearestThreat(e, list) {
    let best = null;
    let bestD2 = Infinity;
    for (let i = 0; i < list.length; i += 1) {
      const t = list[i];
      if (!t || !t.alive || t === e) continue;
      // Skip predators that can't eat this consumer (gape limitation)
      if (e.size / Math.max(1, t.size) > 0.85) continue;
      const d2 = torusDistance2(e, t);
      if (d2 < bestD2) {
        best = t;
        bestD2 = d2;
      }
    }
    return best;
  }

  function consumerThreatRange(e) {
    return Math.min(230, Math.max(55, e.perception * 0.675 + e.chemosense * 13.75 + e.cilia * 3));
  }

  function stepProducer(e, dt) {
    e.age += dt;
    e.cooldown -= dt * e.fertility * clamp(sim.solarEnergy, 0.1, 6) * 5;

    if (isMobileProducer(e)) {
      queryNearby(e.x, e.y, e.perception || 105, TYPE.CONSUMER, nearby);
      let threat = null;
      let threatD2 = Infinity;
      const scanThreats = (list) => {
        for (let i = 0; i < list.length; i += 1) {
          const c = list[i];
          const { dx, dy } = torusVector(e, c);
          const d2 = dx * dx + dy * dy;
          if (d2 < threatD2) {
            threat = { dx, dy };
            threatD2 = d2;
          }
        }
      };
      scanThreats(nearby);
      queryNearby(e.x, e.y, e.perception || 105, TYPE.PREDATOR, producerThreats);
      scanThreats(producerThreats);
      const resting = updateResting(e, dt, Boolean(threat));
      if (threat) {
        const away = Math.atan2(-threat.dy, -threat.dx);
        const pull = hasMove(e, 0) ? 0.52 : hasMove(e, 2) ? 0.24 : hasMove(e, 3) ? 0.38 : 0.46;
        e.angle += normalizeAngle(away - e.angle) * pull;
        if (hasMove(e, 0) && chance(0.035)) e.angle += rand(-1.4, 1.4);
      } else {
        const wander = hasMove(e, 2) ? 0.65 : hasMove(e, 3) ? 1.1 : 1.6;
        e.angle += rand(-wander, wander) * dt;
      }
      if (hasMove(e, 3)) e.angle += Math.sin(sim.time * 1.3 + e.id) * 0.02;
      const panic = threat ? (hasMove(e, 2) ? 1.34 : 1.82) : 1;
      const moveScale = resting ? 0 : burstMultiplier(e, dt, Boolean(threat));
      e.x += Math.cos(e.angle) * e.speed * panic * moveScale * dt;
      e.y += Math.sin(e.angle) * e.speed * panic * moveScale * dt;
      const crowdFactor = producerCCrowdFactor(e);
      const sensoryCost = (Number(e.chemosense || 0) * 0.003 + Math.max(0, Number(e.perception || 0) - 40) * 0.000012) * dt * (resting ? 0.42 : 1);
      const crowdStress = (1 - crowdFactor) * dt * 0.12;
      e.energy = Math.min(e.maxEnergy, e.energy + dt * sim.solarEnergy * 0.12 * crowdFactor - sensoryCost - crowdStress);
      if (Number.isFinite(Number(e.maxAge)) && e.age > e.maxAge && chance(dt / 120)) {
        kill(e, 'Productor C móvil muere por senescencia');
        return;
      }
      if (e.energy <= 0) {
        kill(e, 'Productor C móvil muere por energía');
        return;
      }
      wrapInsideWorld(e);
    }

    if (isColonyProducer(e)) {
      const sun = clamp(sim.solarEnergy, 0.1, 6);
      if (e.age > e.maxAge && chance(dt / 110)) {
        kill(e, 'Productor B muere por senescencia');
        return;
      }
      const respCost = dt * (0.015 + e.radius * 0.0005);
      e.energy = Math.min(e.maxEnergy, e.energy + dt * sun * 0.12 - respCost);
      e.radius = Math.min(e.maxRadius, e.radius + dt * sun * 0.018);
      const leafCap = 8 + e.radius * 0.9;
      e.leafEnergy = Math.min(leafCap, e.leafEnergy + dt * sun * 0.13);
      const leafLimit = clamp(Math.floor(2 + e.radius / 6), 2, 14);
      const leafTarget = clamp(Math.floor(e.leafEnergy / 3), 0, leafLimit);
      if (leafTarget > e.leafCount && chance(dt * sun * 0.6)) e.leafCount += 1;

      if (sim.time >= e.competitionAt) {
        e.competitionAt = sim.time + rand(2.5, 6);
        queryNearby(e.x, e.y, e.radius + e.maxRadius + 8, TYPE.PRODUCER, nearby);
        for (let i = 0; i < nearby.length; i += 1) {
          const other = nearby[i];
          if (other === e || !other.alive || !isColonyProducer(other) || other.id < e.id) continue;
          const minGap = (e.radius + other.radius) * 0.72;
          if (torusDistance2(e, other) > minGap * minGap) continue;
          const winner = e.energy + e.radius + e.armor >= other.energy + other.radius + other.armor ? e : other;
          const loser = winner === e ? other : e;
          const drain = Math.min(loser.energy, 1.2 + winner.radius * 0.08 + winner.armor * 0.35);
          loser.energy -= drain;
          loser.leafEnergy = Math.max(0, loser.leafEnergy - drain * 0.18);
          loser.leafCount = Math.max(0, loser.leafCount - (drain > 1.6 ? 1 : 0));
          winner.energy = Math.min(winner.maxEnergy, winner.energy + drain * 0.35);
          if (loser.energy <= 0.15) kill(loser, 'Productor B pierde competencia por sol');
          if (!e.alive) return;
        }
      }
    }

    if (e.cooldown > 0) return;
    e.cooldown = isColonyProducer(e) ? rand(40, 100) : rand(30, 70);

    if (sim.creatures.length - sim.freeIds.length > 50000 && !chance(0.2)) return;

    if (isColonyProducer(e)) {
      if (e.leafCount < COLONY_MIN_LEAVES_TO_REPRODUCE || e.energy < e.maxEnergy * 0.42) return;
      queryNearby(e.x, e.y, 400, TYPE.PRODUCER, nearby);
      const hasLargeMate = nearby.some((p) => p !== e && isColonyProducer(p));
      if (!hasLargeMate || !chance(0.58)) return;
      e.leafCount = Math.max(0, e.leafCount - COLONY_MIN_LEAVES_TO_REPRODUCE);
      e.leafEnergy = Math.max(0, e.leafEnergy - COLONY_MIN_LEAVES_TO_REPRODUCE * 3.4);
      e.energy *= 0.72;
      spawnProducer({
        sub: PRODUCER.B,
        x: mod(e.x + rand(-720, 720), WORLD.w),
        y: mod(e.y + rand(-720, 720), WORLD.h),
        radius: inheritAsexual(e, 'radius', 14, 40),
        maxRadius: inheritAsexual(e, 'maxRadius', 28, 72),
        armor: inheritAsexual(e, 'armor', 1.2, 7),
        fertility: inheritAsexual(e, 'fertility', 0.012, 0.085),
        maxAge: inheritAsexual(e, 'maxAge', 7500, 21500)
      });
      sim.births += 1;
      return;
    }

    if (isMobileProducer(e)) {
      if (producerCCrowdFactor(e) < 0.85 || e.energy < e.maxEnergy * 0.58) return;
    }
    const spread = rand(70, 180);
    spawnProducer({
      sub: e.sub,
      x: mod(e.x + Math.cos(rand(-Math.PI, Math.PI)) * spread, WORLD.w),
      y: mod(e.y + Math.sin(rand(-Math.PI, Math.PI)) * spread, WORLD.h),
      radius: inheritAsexual(e, 'radius', 3, 10),
      armor: inheritAsexual(e, 'armor', 0, 4),
      speed: e.speed ? inheritAsexual(e, 'speed', 8, 62) : 0,
      perception: inheritAsexual(e, 'perception', 45, PRODUCER_C_MAX_PERCEPTION),
      chemosense: inheritAsexual(e, 'chemosense', 0, 5),
      movementMask: chance(0.04) ? inheritMovementMask(e, { movementMask: 1 << Math.floor(rand(0, MOVE.length)) }) : movementMaskFromLegacy(e),
      fertility: inheritAsexual(e, 'fertility', 0.006, 0.075),
      maxAge: inheritAsexual(e, 'maxAge', 3500, 12000)
    });
    e.energy *= 0.68;
    sim.births += 1;
  }

  function steerCreature(e, dt, food, threat = null) {
    const pressure = Boolean(threat || (food && e.type === TYPE.PREDATOR));
    const resting = updateResting(e, dt, pressure);
    const turnNoise = hasMove(e, 0) ? 2.5 : hasMove(e, 2) ? 1.2 : 0.8;
    e.angle += rand(-turnNoise, turnNoise) * dt;

    if (threat) {
      const { dx, dy } = torusVector(e, threat);
      const desired = Math.atan2(-dy, -dx);
      const distance = Math.sqrt(dx * dx + dy * dy);
      const urgency = clamp(1 - distance / Math.max(1, consumerThreatRange(e)), 0.18, 1);
      const pull = hasMove(e, 1) ? 0.38 : hasMove(e, 0) ? 0.31 : hasMove(e, 3) ? 0.26 : 0.20;
      e.angle += normalizeAngle(desired - e.angle) * pull * (0.75 + urgency * 0.65);
      if (hasMove(e, 0) && chance(0.045)) e.angle += rand(-0.7, 0.7);
    } else if (food && (hasMove(e, 1) || e.chemosense > 1.3)) {
      const { dx, dy } = torusVector(e, food);
      const desired = Math.atan2(dy, dx);
      const pull = clamp(e.chemosense * 0.09, 0.04, 0.32);
      e.angle += normalizeAngle(desired - e.angle) * pull;
    }

    if (hasMove(e, 3)) {
      e.angle += Math.sin(sim.time * 0.9 + e.id) * 0.018;
    }

    if (resting) {
      wrapInsideWorld(e);
      return;
    }

    const ciliaPulse = 1 + Math.sin(sim.time * 5 + e.id) * (e.cilia * 0.015);
    const burst = burstMultiplier(e, dt, pressure);
    const panic = threat ? (hasMove(e, 2) ? 1.16 : hasMove(e, 3) ? 1.28 : 1.46) : 1;
    e.x += Math.cos(e.angle) * e.speed * ciliaPulse * burst * panic * dt;
    e.y += Math.sin(e.angle) * e.speed * ciliaPulse * burst * panic * dt;
    wrapInsideWorld(e);
  }

  function feedConsumer(e, target) {
    if (!target) return false;
    if (target.virtualCarcass) return eatCarcass(e, target);
    if (!target.alive) return false;
    if (target.virtualA) return grazeProducerDensity(e);
    const dx = torusDelta(target.x - e.x, WORLD.w);
    const dy = torusDelta(target.y - e.y, WORLD.h);
    const eatRange = e.radius + target.radius + (e.feeding === 1 ? e.cilia * 2.2 : 3);
    if (dx * dx + dy * dy > eatRange * eatRange) return false;

    if (isColonyProducer(target)) {
      if (e.type === TYPE.PREDATOR) return false;
      if ((target.leafCount || 0) <= 0 || target.leafEnergy <= 0.35 || !canEatArmored(e, target)) return false;
      const bite = Math.min(target.leafEnergy, 1.0 + e.size * 0.48 + e.pseudopodia * 0.32 + (e.feeding === 2 ? 0.7 : 0));
      target.leafEnergy -= bite;
      target.leafCount = Math.max(0, (target.leafCount || 0) - 1);
      target.energy = Math.max(0, target.energy - bite * 0.16);
      e.energy = Math.min(e.maxEnergy, e.energy + bite * 9.2);
      return true;
    }

    if (!canEatArmored(e, target)) return false;

    // Gape-limitation: depredadores no pueden comer presas mucho mas grandes
    let gapeFactor = 1;
    if (e.type === TYPE.PREDATOR && target.type === TYPE.CONSUMER) {
      const sizeRatio = target.size / Math.max(1, e.size);
      if (sizeRatio > 0.85) return false; // presa demasiado grande
      if (sizeRatio > 0.5) gapeFactor = 0.85 / sizeRatio; // penalty progresivo
    }

    const rawGain = e.type === TYPE.PREDATOR
      ? target.type === TYPE.PRODUCER
        ? 62 + target.radius * 3.2 + target.energy * 0.35
        : 92 + target.size * 16 + target.reserves * 7
      : target.sub === PRODUCER.C
          ? Math.max(8, Math.min(target.energy * 1.8, 36))
          : 7.5;
    // Cap gain to prevent energy creation in trophic transfers
    const maxTransfer = e.type === TYPE.PREDATOR
      ? target.type === TYPE.PRODUCER
        ? target.energy * 2.0   // predator->ProducerC: max 2x prey energy
        : target.energy * 1.3   // predator->consumer: max 1.3x (30% ecological loss)
      : target.energy * 1.8;    // consumer->ProducerC already capped above
    const gain = Math.min(rawGain, Math.max(rawGain * 0.5, maxTransfer)) * gapeFactor;

    e.energy = Math.min(e.maxEnergy, e.energy + gain);
    kill(target, e.type === TYPE.PREDATOR ? (target.type === TYPE.PRODUCER ? 'Depredador consume productor' : 'Depredador consume consumidor') : null);
    return true;
  }

  function reproduceMobile(e, type) {
    // Population cap: mismo patron que stepProducer pero mas restrictivo para mobiles
    // Seed ~828 mobiles. 5000 permite ~6x crecimiento, frena explosion boom-bust
    const aliveCount = sim.creatures.length - sim.freeIds.length;
    if (aliveCount > 5000 && !chance(0.2)) return;
    // Umbral reproductivo: depredadores mas bajo (0.60 base, 0.50 en crisis)
    const reproThreshold = type === TYPE.PREDATOR
      ? (sim.predatorCount < 40 ? 0.50 : 0.60)
      : 0.72;
    if (e.energy < e.maxEnergy * reproThreshold || e.cooldown > 0) return;
    const mateRange = type === TYPE.PREDATOR ? Math.min(450, e.perception * 1.2) : e.perception * 0.36;
    queryNearby(e.x, e.y, mateRange, type, mateCandidates);
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

  function findMateTarget(e, type) {
    // Busqueda de pareja: depredadores mas agresivos (0.55 base, 0.45 en crisis)
    const mateSearchThreshold = type === TYPE.PREDATOR
      ? (sim.predatorCount < 40 ? 0.45 : 0.55)
      : 0.68;
    if (e.energy < e.maxEnergy * mateSearchThreshold || e.cooldown > 0) return null;
    const radius = type === TYPE.PREDATOR ? Math.min(550, e.perception * 1.55) : e.perception * 0.5;
    queryNearby(e.x, e.y, radius, type, mateSeekCandidates);
    let best = null;
    let bestD2 = Infinity;
    for (let i = 0; i < mateSeekCandidates.length; i += 1) {
      const c = mateSeekCandidates[i];
      if (c === e || !c.alive || c.energy < c.maxEnergy * 0.50 || c.cooldown > 0) continue;
      const d2 = torusDistance2(e, c);
      if (d2 < bestD2) {
        best = c;
        bestD2 = d2;
      }
    }
    return best;
  }

  function stepMobile(e, dt) {
    e.age += dt;
    e.cooldown -= dt;
    const resting = hasMove(e, 4) && sim.time < e.restUntil;
    // Metabolismo adaptativo: reduccion gradual para depredadores en baja cuenta
    // Antes era *=0.5 binario que hacia preds inmortales (84min sin comer)
    let metabFactor = resting ? 3.4 : 7.5;
    if (e.type === TYPE.PREDATOR) {
      metabFactor *= 0.7 + 0.3 * clamp(sim.predatorCount / 60, 0, 1);
    }
    e.energy -= e.metabolism * dt * metabFactor;
    if (Number.isFinite(Number(e.maxAge)) && e.age > e.maxAge && chance(dt / (e.type === TYPE.PREDATOR ? 150 : 95))) {
      kill(e, e.type === TYPE.PREDATOR ? 'Depredador muere por senescencia' : 'Consumidor muere por senescencia');
      return;
    }
    if (e.energy <= 0) {
      kill(e, e.type === TYPE.PREDATOR ? 'Depredador muere por energía' : 'Consumidor muere por energía');
      return;
    }

    // Starvation progresivo: reduce capacidades con baja energia
    var origSpeed = e.speed;
    var origPerception = e.perception;
    var origFertility = e.fertility;
    var canReproduce = true;
    if (e.energy < e.maxEnergy * 0.05) {
      e.speed *= 0.3;
      e.perception *= 0.7;
      canReproduce = false;
      e.starved = 2;
    } else if (e.energy < e.maxEnergy * 0.15) {
      e.speed *= 0.6;
      e.perception *= 0.8;
      e.fertility *= 0.3;
      e.starved = 1;
    } else {
      e.starved = 0;
    }

    let food = null;
    let steeringTarget = null;
    let threat = null;
    if (e.type === TYPE.PREDATOR) {
      queryNearby(e.x, e.y, e.perception, TYPE.CONSUMER, nearby);
      food = nearestFood(e, nearby);
      if (!food) {
        queryNearby(e.x, e.y, e.perception * 0.72, TYPE.PRODUCER, nearby);
        let bestPlant = null;
        let bestD2 = Infinity;
        for (let i = 0; i < nearby.length; i += 1) {
          const p = nearby[i];
          if (!p.alive || p.sub === PRODUCER.A || isColonyProducer(p) || !canEatArmored(e, p)) continue;
          const d2 = torusDistance2(e, p);
          if (d2 < bestD2) {
            bestPlant = p;
            bestD2 = d2;
          }
        }
        food = bestPlant;
      }
      if (!food) food = nearestCarcassFood(e, e.perception * 0.85);
      steeringTarget = food || findMateTarget(e, TYPE.PREDATOR);
    } else {
      queryNearby(e.x, e.y, consumerThreatRange(e), TYPE.PREDATOR, consumerThreats);
      threat = nearestThreat(e, consumerThreats);
      queryNearby(e.x, e.y, e.perception, TYPE.PRODUCER, nearby);
      const entityFood = nearestFood(e, nearby);
      const fieldFood = bestProducerDensityTarget(e.x, e.y, e.perception);
      food = entityFood;
      if (fieldFood) {
        if (!entityFood) food = fieldFood;
        else {
          const edy = torusDelta(entityFood.y - e.y, WORLD.h);
          const fdx = torusDelta(fieldFood.x - e.x, WORLD.w);
          const fdy = torusDelta(fieldFood.y - e.y, WORLD.h);
          const edx = torusDelta(entityFood.x - e.x, WORLD.w);
          if ((fdx * fdx + fdy * fdy) * 0.75 < edx * edx + edy * edy) food = fieldFood;
        }
      }
      if (!food && e.energy < e.maxEnergy * 0.42) food = nearestCarcassFood(e, e.perception * 0.65);
      steeringTarget = food;
    }
    steerCreature(e, dt, steeringTarget, threat);
    if (food) feedConsumer(e, food);
    // Restaurar tras uso temporal (fertility despues de reproduceMobile)
    e.speed = origSpeed;
    e.perception = origPerception;
    if (canReproduce) reproduceMobile(e, e.type);
    e.fertility = origFertility;
  }

  function compactIfNeeded() {
    if (sim.freeIds.length < 1200 || sim.freeIds.length < sim.creatures.length * 0.18) return;
    const alive = [];
    const selected = sim.selectedCreatureIds.map((key) => creatureByKey(key)).filter((e) => e && e.alive);
    for (let i = 0; i < sim.creatures.length; i += 1) {
      const e = sim.creatures[i];
      if (!e || !e.alive) continue;
      e.id = alive.length;
      alive.push(e);
    }
    sim.creatures = alive;
    sim.freeIds = [];
    sim.selectedCreatureIds = selected.filter((e) => e.alive).map((e) => creatureKey(e));
    sim.selectedTrails.clear();
    for (let i = 0; i < selected.length; i += 1) {
      const e = selected[i];
      if (e && e.alive) sim.selectedTrails.set(creatureKey(e), [{ x: e.x, y: e.y }]);
    }
    sim.selectedCreatureId = sim.selectedCreatureIds[sim.selectedCreatureIds.length - 1] ?? null;
  }

  function updateSelectedTrails() {
    for (const key of sim.selectedCreatureIds) {
      const e = creatureByKey(key);
      if (!e || !e.alive) {
        sim.selectedTrails.delete(key);
        continue;
      }
      let trail = sim.selectedTrails.get(key);
      if (!trail) {
        trail = [{ x: e.x, y: e.y }];
        sim.selectedTrails.set(key, trail);
        continue;
      }
      const prev = trail[trail.length - 1];
      const dx = torusDelta(e.x - mod(prev.x, WORLD.w), WORLD.w);
      const dy = torusDelta(e.y - mod(prev.y, WORLD.h), WORLD.h);
      if (dx * dx + dy * dy < TRAIL_MIN_STEP * TRAIL_MIN_STEP) continue;
      trail.push({ x: prev.x + dx, y: prev.y + dy });
      if (trail.length > TRAIL_MAX_POINTS) trail.splice(0, trail.length - TRAIL_MAX_POINTS);
    }
  }

  function checkMigration() {
    var cB = 0, cC = 0, cM = 0, cP = 0;
    var sB = [], sC = [], sM = [], sP = [];
    for (var i = 0; i < sim.creatures.length; i += 1) {
      var e = sim.creatures[i];
      if (!e || !e.alive) continue;
      if (e.type === TYPE.PRODUCER && e.sub === PRODUCER.B) { cB++; sB.push(e); }
      else if (e.type === TYPE.PRODUCER && e.sub === PRODUCER.C) { cC++; sC.push(e); }
      else if (e.type === TYPE.CONSUMER) { cM++; sM.push(e); }
      else if (e.type === TYPE.PREDATOR) { cP++; sP.push(e); }
    }
    var THRESHOLD = 15;
    var prob = 0.005 * (5 / 60);
    if (cB > 0 && cB < THRESHOLD && chance(prob)) migratePopulation('producerB', cB, sB);
    if (cC > 0 && cC < THRESHOLD && chance(prob)) migratePopulation('producerC', cC, sC);
    if (cM > 0 && cM < THRESHOLD && chance(prob)) migratePopulation('consumers', cM, sM);
    if (cP > 0 && cP < THRESHOLD && chance(prob)) migratePopulation('predators', cP, sP);
  }

  function migratePopulation(type, count, survivors) {
    var n = Math.floor(rand(3, 9));
    var isPredator = type === 'predators';
    var isProducerB = type === 'producerB';
    var isProducerC = type === 'producerC';
    for (var i = 0; i < n; i++) {
      var donor = survivors[Math.floor(rand(0, survivors.length))];
      var edge = Math.floor(rand(0, 4));
      var margin = 80;
      var x, y;
      if (edge === 0) { x = rand(0, WORLD.w); y = margin; }
      else if (edge === 1) { x = WORLD.w - margin; y = rand(0, WORLD.h); }
      else if (edge === 2) { x = rand(0, WORLD.w); y = WORLD.h - margin; }
      else { x = margin; y = rand(0, WORLD.h); }
      var opts = {
        x: x, y: y,
        size: mutate(Number(donor.size), 0.8, 0.5, isPredator ? 12 : 9),
        reserves: mutate(Number(donor.reserves), 1.0, 0, isPredator ? 24 : 14),
        flagella: Math.round(mutate(Number(donor.flagella), 1, 0, 7)),
        cilia: Math.round(mutate(Number(donor.cilia), 1, 0, 6)),
        chemosense: mutate(Number(donor.chemosense), 0.4, 0, 5),
        pseudopodia: mutate(Number(donor.pseudopodia), 0.4, 0, 4),
        armor: mutate(Number(donor.armor), 0.5, 0, 5),
        vacuole: mutate(Number(donor.vacuole), 0.4, 0, 4),
        feeding: chance(0.12) ? Math.floor(rand(0, FEEDING.length)) : Number(donor.feeding || 0),
        movementMask: chance(0.08) ? (1 << Math.floor(rand(0, MOVE.length))) : Number(donor.movementMask || 2),
        fertility: mutate(Number(donor.fertility), 0.1, 0.22, 3),
        maxAge: mutate(Number(donor.maxAge), Number(donor.maxAge) * 0.15, isPredator ? 5000 : 1800, isPredator ? 15000 : 8000)
      };
      if (isProducerB) { opts.sub = PRODUCER.B; spawnProducer(opts); }
      else if (isProducerC) { opts.sub = PRODUCER.C; spawnProducer(opts); }
      else if (type === 'consumers') spawnConsumer(opts);
      else if (isPredator) spawnPredator(opts);
      sim.births += 1;
    }
    var label = isPredator ? 'depredadores' : type === 'consumers' ? 'consumidores' : isProducerB ? 'productores B' : 'productores C';
    logEvent('Migración: ' + n + ' ' + label + ' recoloniaron desde los bordes (pop. previa: ' + count + ')', 'birth');
  }

  function simulate(dt) {
    sim.time += dt;

    // Ciclo dia/noche: solarEnergy oscila sinusoidalmente sobre la base
    if (sim.dayNightEnabled) {
      const phase = (sim.time / sim.dayNightPeriod) * Math.PI * 2;
      sim.dayNightPhase = phase;
      const amp = 0.4;
      sim.solarEnergy = Math.max(0.1, sim.solarEnergyBase + amp * Math.sin(phase));
    }

    // Cache predator count cada ~2s para metabolismo adaptativo
    sim.predatorCountTimer -= dt;
    if (sim.predatorCountTimer <= 0) {
      let pc = 0;
      for (let i = 0; i < sim.creatures.length; i += 1) {
        const e = sim.creatures[i];
        if (e && e.alive && e.type === TYPE.PREDATOR) pc++;
      }
      sim.predatorCount = pc;
      sim.predatorCountTimer = 2.0;
    }

    stepProducerField(dt);
    for (let i = 0; i < sim.creatures.length; i += 1) {
      const e = sim.creatures[i];
      if (!e || !e.alive) continue;
      if (e.type === TYPE.PRODUCER) stepProducer(e, dt);
      else stepMobile(e, dt);
    }
    if (sim.selectedCreatureIds.length) updateSelectedTrails();

    stepCarcasses(dt);

    compactIfNeeded();

    sim.migrationTimer -= dt;
    if (sim.migrationTimer <= 0) {
      sim.migrationTimer = 5.0;
      checkMigration();
    }
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
    if (sim.geneHistory.length > HISTORY_MAX_POINTS) sim.geneHistory.shift();
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

  function isSelectedCreature(e) {
    return Boolean(e && sim.selectedCreatureIds.includes(creatureKey(e)));
  }

  function removeInspectorPanel(key) {
    sim.selectedCreatureIds = sim.selectedCreatureIds.filter((selectedKey) => selectedKey !== key);
    sim.selectedCreatureId = sim.selectedCreatureIds[sim.selectedCreatureIds.length - 1] ?? null;
    sim.selectedTrails.delete(key);
    if (sim.followCreatureId === key) setFollowCreature(key, false);
    const panel = document.querySelector(`.inspect-panel[data-inspect-uid="${key}"]`);
    if (panel && panel !== els.inspectPanel) panel.remove();
    else if (panel) {
      panel.classList.add('hidden');
      panel.removeAttribute('data-inspect-uid');
    }
  }

  function closeInspector(key = null) {
    const targetKey = key ?? sim.selectedCreatureIds[sim.selectedCreatureIds.length - 1];
    if (targetKey == null) return;
    removeInspectorPanel(targetKey);
    updateInspectors();
  }

  function setFollowCreature(key, enabled) {
    sim.followCreatureId = enabled ? key : null;
    if (!enabled && sim.lastCenteredCreatureId === key) sim.lastCenteredCreatureId = null;
    updateFollowButtons();
  }

  function updateFollowButtons() {
    document.querySelectorAll('.inspect-panel[data-inspect-uid]').forEach((panel) => {
      const key = Number(panel.dataset.inspectUid);
      const active = sim.followCreatureId === key;
      const btn = panel.querySelector('.target-inspect');
      if (btn) {
        btn.classList.toggle('active', active);
        btn.title = active ? 'Dejar de seguir' : 'Centrar vista';
      }
    });
  }

  function ensureInspectorPanel(key, index) {
    let panel = index === 0 ? els.inspectPanel : document.querySelector(`.inspect-panel[data-inspect-uid="${key}"]`);
    if (!panel) {
      panel = document.createElement('section');
      panel.className = 'hud panel inspect-panel movable';
      panel.setAttribute('aria-label', 'Valores del ser seleccionado');
      panel.innerHTML = '<header class="panel-head drag-handle"><button class="icon-button target-inspect" type="button" title="Centrar vista">⌖</button><button class="icon-button clone-inspect lightning-button" type="button" title="Crear como este">⚡</button><h2>Ser</h2><button class="icon-button close-inspect" type="button" title="Cerrar">×</button></header><div class="inspect-body"></div>';
      document.querySelector('.world-viewport').appendChild(panel);
      makePanelDraggable(panel);
    }
    const header = panel.querySelector('.panel-head');
    if (header && !header.querySelector('.target-inspect')) {
      header.insertAdjacentHTML('afterbegin', '<button class="icon-button target-inspect" type="button" title="Centrar vista">⌖</button>');
    }
    if (header && !header.querySelector('.clone-inspect')) {
      const targetBtn = header.querySelector('.target-inspect');
      targetBtn?.insertAdjacentHTML('afterend', '<button class="icon-button clone-inspect lightning-button" type="button" title="Crear como este">⚡</button>');
    }
    panel.dataset.inspectUid = String(key);
    panel.classList.remove('hidden');
    const close = panel.querySelector('.close-inspect, .panel-head > .icon-button:last-child');
    if (close && !close.dataset.boundInspectClose) {
      close.dataset.boundInspectClose = '1';
      close.addEventListener('click', () => closeInspector(Number(panel.dataset.inspectUid)));
    }
    const target = panel.querySelector('.target-inspect');
    if (target && !target.dataset.boundInspectTarget) {
      target.dataset.boundInspectTarget = '1';
      target.addEventListener('click', (ev) => {
        ev.stopPropagation();
        centerOnCreature(Number(panel.dataset.inspectUid), true);
      });
    }
    const clone = panel.querySelector('.clone-inspect');
    if (clone && !clone.dataset.boundInspectClone) {
      clone.dataset.boundInspectClone = '1';
      clone.addEventListener('click', (ev) => {
        ev.stopPropagation();
        openCloneDialog(Number(panel.dataset.inspectUid));
      });
    }
    return panel;
  }

  function placeInspectorPanel(panel, screenX, screenY, index) {
    const x = clamp(screenX + 112 + index * 30, 8, window.innerWidth - 420);
    const y = clamp(screenY + 14 + index * 24, 68, window.innerHeight - 240);
    panel.style.left = `${x}px`;
    panel.style.top = `${y}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  }

  function selectCreature(e, screenX = window.innerWidth * 0.5, screenY = window.innerHeight * 0.5) {
    if (!e || !e.alive) return;
    const key = creatureKey(e);
    sim.selectedCreatureIds = sim.selectedCreatureIds.filter((selectedKey) => {
      const selected = creatureByKey(selectedKey);
      return selected && selected.alive && selectedKey !== key;
    });
    sim.selectedCreatureIds.push(key);
    sim.selectedCreatureId = key;
    sim.selectedTrails.set(key, [{ x: e.x, y: e.y }]);
    updateInspectors();
    const panel = document.querySelector(`.inspect-panel[data-inspect-uid="${key}"]`);
    if (panel) placeInspectorPanel(panel, screenX, screenY, sim.selectedCreatureIds.length - 1);
  }

  function centerOnCreature(key, toggleFollow = false) {
    const e = creatureByKey(key);
    if (!e || !e.alive) return;
    camera.x = e.x;
    camera.y = e.y;
    if (toggleFollow) {
      if (sim.followCreatureId === key) setFollowCreature(key, false);
      else if (sim.lastCenteredCreatureId === key) setFollowCreature(key, true);
      else {
        sim.lastCenteredCreatureId = key;
        updateFollowButtons();
      }
    }
    clampCamera();
  }

  function updateCameraFollow() {
    if (sim.followCreatureId == null || camera.dragging) return;
    const e = creatureByKey(sim.followCreatureId);
    if (!e || !e.alive) {
      setFollowCreature(sim.followCreatureId, false);
      return;
    }
    camera.x = e.x;
    camera.y = e.y;
  }

  function inspectorHtml(e) {
    let rows = [infoRow('tipo', typeName(e)), infoRow('energía', e.energy, 'energy')];
    if (e.type === TYPE.PRODUCER && isMobileProducer(e)) {
      rows = rows.concat([
        infoRow('energía máx.', e.maxEnergy, 'maxEnergy'),
        infoRow('percepción', e.perception, 'perception'),
        infoRow('quimiosens.', e.chemosense, 'chemosense'),
        infoRow('reproducción', e.fertility, 'fertility'),
        infoRow('cooldown', e.cooldown),
        infoRow('movimiento', movementNames(e), 'movement')
      ]);
    } else if (e.type === TYPE.PRODUCER && isColonyProducer(e)) {
      rows = rows.concat([
        infoRow('energía máx.', e.maxEnergy, 'maxEnergy'),
        infoRow('energía hojas', e.leafEnergy, 'leafEnergy'),
        infoRow('reproducción', e.fertility, 'fertility'),
        infoRow('cooldown', e.cooldown)
      ]);
    } else {
      rows = rows.concat([
        infoRow('energía máx.', e.maxEnergy, 'maxEnergy'),
        infoRow('metabolismo', e.metabolism, 'metabolism'),
        infoRow('percepción', e.perception, 'perception'),
        infoRow('reproducción', e.fertility, 'fertility'),
        infoRow('cooldown', e.cooldown),
        infoRow('movimiento', movementNames(e), 'movement'),
        infoRow('quimiosens.', e.chemosense, 'chemosense'),
        infoRow('alimentación', FEEDING[e.feeding] ?? e.feeding, 'feeding')
      ]);
    }
    const values = rows
      .filter(({ value }) => value !== undefined && value !== null && value !== '' && !(typeof value === 'number' && Number.isNaN(value)))
      .map(({ label, value, geneKey }) => `<span>${geneLabelHtml(geneKey, label)}</span><b>${escapeHtml(formatValue(value))}</b>`)
      .join('');
    return `<div class="inspect-preview">${previewHtml(e)}</div><div class="inspect-values">${values}</div>`;
  }

  function updateInspectors() {
    sim.selectedCreatureIds = sim.selectedCreatureIds.filter((key) => {
      const e = creatureByKey(key);
      return e && e.alive;
    });
    sim.selectedCreatureId = sim.selectedCreatureIds[sim.selectedCreatureIds.length - 1] ?? null;
    const primaryId = sim.selectedCreatureIds[0];
    document.querySelectorAll('.inspect-panel[data-inspect-uid]').forEach((panel) => {
      const id = Number(panel.dataset.inspectUid);
      if (!sim.selectedCreatureIds.includes(id) || (panel !== els.inspectPanel && id === primaryId)) {
        if (panel === els.inspectPanel) panel.classList.add('hidden');
        else panel.remove();
      }
    });
    if (!sim.selectedCreatureIds.length) {
      els.inspectPanel.classList.add('hidden');
      updateFollowButtons();
      return;
    }
    for (let i = 0; i < sim.selectedCreatureIds.length; i += 1) {
      const key = sim.selectedCreatureIds[i];
      const e = creatureByKey(key);
      if (!e) continue;
      const panel = ensureInspectorPanel(key, i);
      panel.querySelector('h2').innerHTML = `${escapeHtml(typeName(e))} <b class="inspect-id" style="color:${colorForCreature(e)}">#${creatureKey(e)}</b>`;
      panel.querySelector('.inspect-body').innerHTML = inspectorHtml(e);
    }
    updateFollowButtons();
  }

  function findCreatureAt(screenX, screenY) {
    const raw = screenToWorld(screenX, screenY);
    const pos = { x: mod(raw.x, WORLD.w), y: mod(raw.y, WORLD.h) };
    const worldRadius = clamp(22 / camera.zoom, 18, 360);
    let best = null;
    let bestScreenD2 = Infinity;
    for (let type = 0; type <= 2; type += 1) {
      queryNearby(pos.x, pos.y, worldRadius, type, nearby);
      for (let i = 0; i < nearby.length; i += 1) {
        const e = nearby[i];
        const p = nearestScreenPosition(e.x, e.y, screenX, screenY);
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

  function minCameraZoom() {
    return Math.max(window.innerWidth / (WORLD.w * 1.5), window.innerHeight / (WORLD.h * 1.5), 0.028);
  }

  function fitWorldZoom() {
    return clamp(Math.min(window.innerWidth / WORLD.w, window.innerHeight / WORLD.h) * 0.82, minCameraZoom(), 2.2);
  }

  function centerCamera({ fit = false } = {}) {
    camera.x = WORLD.w * 0.5;
    camera.y = WORLD.h * 0.5;
    if (fit) camera.zoom = fitWorldZoom();
  }

  const _scrW2S = { x: 0, y: 0 };
  const _scrS2W = { x: 0, y: 0 };

  function screenToWorld(x, y) {
    const cx = window.innerWidth * 0.5;
    const cy = window.innerHeight * 0.5;
    _scrS2W.x = camera.x + (x - cx) / camera.zoom;
    _scrS2W.y = camera.y + (y - cy) / camera.zoom;
    return _scrS2W;
  }

  function worldToScreen(x, y) {
    _scrW2S.x = (x - camera.x) * camera.zoom + window.innerWidth * 0.5;
    _scrW2S.y = (y - camera.y) * camera.zoom + window.innerHeight * 0.5;
    return _scrW2S;
  }

  function nearestScreenPosition(x, y, screenX, screenY) {
    let bestX = 0, bestY = 0;
    let bestD2 = Infinity;
    for (let oy = -WORLD.h; oy <= WORLD.h; oy += WORLD.h) {
      for (let ox = -WORLD.w; ox <= WORLD.w; ox += WORLD.w) {
        const p = worldToScreen(x + ox, y + oy);
        const dx = p.x - screenX;
        const dy = p.y - screenY;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestD2) {
          bestX = p.x; bestY = p.y;
          bestD2 = d2;
        }
      }
    }
    _scrW2S.x = bestX; _scrW2S.y = bestY;
    return _scrW2S;
  }

  function clampCamera() {
    camera.zoom = clamp(camera.zoom, minCameraZoom(), 2.2);
    camera.x = mod(camera.x, WORLD.w);
    camera.y = mod(camera.y, WORLD.h);
  }

  function visibleTileOffsets(extraWorld = 0) {
    const halfW = window.innerWidth / (camera.zoom * 2) + extraWorld;
    const halfH = window.innerHeight / (camera.zoom * 2) + extraWorld;
    const minTileX = Math.floor((camera.x - halfW) / WORLD.w);
    const maxTileX = Math.floor((camera.x + halfW) / WORLD.w);
    const minTileY = Math.floor((camera.y - halfH) / WORLD.h);
    const maxTileY = Math.floor((camera.y + halfH) / WORLD.h);
    const offsets = [];
    for (let ty = Math.max(-2, minTileY); ty <= Math.min(2, maxTileY); ty += 1) {
      for (let tx = Math.max(-2, minTileX); tx <= Math.min(2, maxTileX); tx += 1) {
        offsets.push({ ox: tx * WORLD.w, oy: ty * WORLD.h });
      }
    }
    return offsets.length ? offsets : [{ ox: 0, oy: 0 }];
  }

  function isCreatureVisible(e, ox = 0, oy = 0, margin = 32) {
    const p = worldToScreen(e.x + ox, e.y + oy);
    const r = Math.max(2, e.radius * camera.zoom);
    return p.x >= -margin - r && p.y >= -margin - r && p.x <= window.innerWidth + margin + r && p.y <= window.innerHeight + margin + r;
  }

  function drawBackground() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0a1010';
    ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

    const offsets = visibleTileOffsets();
    for (let i = 0; i < offsets.length; i += 1) {
      const { ox, oy } = offsets[i];
      const topLeft = worldToScreen(ox, oy);
      const tlx = topLeft.x, tly = topLeft.y;
      const bottomRight = worldToScreen(WORLD.w + ox, WORLD.h + oy);
      const w = bottomRight.x - tlx;
      const h = bottomRight.y - tly;
      ctx.fillStyle = '#0b1413';
      ctx.fillRect(tlx, tly, w + 1, h + 1);
    }
  }

  // LUT precomputed para drawProducerField: elimina string concat por celda por frame
  const _PFIELD_LUT_SIZE = 256;
  const _PFIELD_ALPHA_MIN = 0.035;
  const _PFIELD_ALPHA_MAX = 0.24;
  const _PFIELD_ALPHA_RANGE = _PFIELD_ALPHA_MAX - _PFIELD_ALPHA_MIN;
  const producerFieldFillLUT = (() => {
    const lut = new Array(_PFIELD_LUT_SIZE);
    for (let i = 0; i < _PFIELD_LUT_SIZE; i++) {
      const a = _PFIELD_ALPHA_MIN + (i / (_PFIELD_LUT_SIZE - 1)) * _PFIELD_ALPHA_RANGE;
      lut[i] = `rgba(118, 210, 93, ${a})`;
    }
    return lut;
  })();

  function drawProducerField() {
    const field = sim.producerField;
    if (!field.mass.length) return;
    const cols = field.cols;
    const rows = field.rows;
    const cellW = field.cellW;
    const cellH = field.cellH;
    const offsets = visibleTileOffsets(Math.max(cellW, cellH));

    for (let o = 0; o < offsets.length; o += 1) {
      const { ox, oy } = offsets[o];
      const start = screenToWorld(-cellW, -cellH);
      const sX = start.x, sY = start.y;
      const end = screenToWorld(window.innerWidth + cellW, window.innerHeight + cellH);
      const minX = clamp(Math.floor((sX - ox) / cellW), 0, cols - 1);
      const maxX = clamp(Math.ceil((end.x - ox) / cellW), 0, cols - 1);
      const minY = clamp(Math.floor((sY - oy) / cellH), 0, rows - 1);
      const maxY = clamp(Math.ceil((end.y - oy) / cellH), 0, rows - 1);

      for (let y = minY; y <= maxY; y += 1) {
        for (let x = minX; x <= maxX; x += 1) {
          const mass = field.mass[fieldIndex(x, y)];
          if (mass < 0.035) continue;
          const p0 = worldToScreen(x * cellW + ox, y * cellH + oy);
          const p0x = p0.x, p0y = p0.y;
          const p1 = worldToScreen((x + 1) * cellW + ox, (y + 1) * cellH + oy);
          const sx = Math.round(p0x);
          const sy = Math.round(p0y);
          const sw = Math.max(1, Math.round(p1.x) - sx);
          const sh = Math.max(1, Math.round(p1.y) - sy);
          const a = clamp(0.035 + mass * 0.16, _PFIELD_ALPHA_MIN, _PFIELD_ALPHA_MAX);
          const lutIdx = ((a - _PFIELD_ALPHA_MIN) / _PFIELD_ALPHA_RANGE * (_PFIELD_LUT_SIZE - 1)) | 0;
          ctx.fillStyle = producerFieldFillLUT[lutIdx];
          ctx.fillRect(sx, sy, sw, sh);
        }
      }
    }
  }

  function drawDebugRange(e, ox = 0, oy = 0) {
    if (!sim.debug) return;
    const p = worldToScreen(e.x + ox, e.y + oy);
    const range = e.type === TYPE.PRODUCER
      ? isColonyProducer(e)
        ? Math.max(e.radius + (e.leafCount || 0) * 1.8, 60)
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
    if (e.type === TYPE.PRODUCER && isColonyProducer(e)) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 900 * camera.zoom, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(166,221,120,0.08)';
      ctx.stroke();
    }
  }

  function drawCreature(e, ox = 0, oy = 0) {
    const p = worldToScreen(e.x + ox, e.y + oy);
    // Minimum visible size: mobile creatures need to be visible at any zoom
    const minR = e.type === TYPE.CONSUMER || e.type === TYPE.PREDATOR ? 3 : 1;
    const r = Math.max(minR, e.radius * camera.zoom);
    if (p.x < -20 || p.y < -20 || p.x > window.innerWidth + 20 || p.y > window.innerHeight + 20) return;

    ctx.fillStyle = e.color;
    if (r <= 2.2) {
      ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
      return;
    }

    if (e.type === TYPE.PRODUCER && isColonyProducer(e)) {
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
      if (isSelectedCreature(e)) {
        drawSelectionRing(p, r, colorForCreature(e));
        drawMapEnergyBar(p, r, e);
      }
      return;
    }

    if (e.type === TYPE.PREDATOR) {
      ctx.beginPath();
      ctx.moveTo(p.x + Math.cos(e.angle) * r * 1.8, p.y + Math.sin(e.angle) * r * 1.8);
      ctx.lineTo(p.x + Math.cos(e.angle + 2.45) * r * 1.35, p.y + Math.sin(e.angle + 2.45) * r * 1.35);
      ctx.lineTo(p.x + Math.cos(e.angle - 2.45) * r * 1.35, p.y + Math.sin(e.angle - 2.45) * r * 1.35);
      ctx.closePath();
      ctx.fill();
      if (isSelectedCreature(e)) {
        drawSelectionRing(p, r, '#f05b50');
        drawMapEnergyBar(p, r, e);
      }
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
    if (isSelectedCreature(e)) {
      drawSelectionRing(p, r, e.type === TYPE.PRODUCER ? colorForCreature(e) : '#54b7f1');
      drawMapEnergyBar(p, r, e);
    }
  }

  function drawSelectionRing(p, r, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r + 5, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawMapEnergyBar(p, r, e) {
    if (!Number.isFinite(Number(e.energy)) || !Number.isFinite(Number(e.maxEnergy)) || e.maxEnergy <= 0) return;
    const w = clamp(r * 3.4, 28, 64);
    const h = 5;
    const x = Math.round(p.x - w * 0.5);
    const y = Math.round(p.y - r - 13);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.52)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = ENERGY_COLOR;
    ctx.fillRect(x, y, Math.max(1, w * energyRatio(e)), h);
    ctx.strokeStyle = 'rgba(255,255,255,0.26)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }

  function drawCarcasses() {
    if (!sim.carcasses.length) return;
    const offsets = visibleTileOffsets(900);
    for (let c = 0; c < sim.carcasses.length; c += 1) {
      const car = sim.carcasses[c];
      const t = car.life / car.maxLife;
      const alpha = (1 - t) * 0.6;
      const r = Math.max(1, car.radius * (1 + t * 0.5) * camera.zoom);
      for (let o = 0; o < offsets.length; o += 1) {
        const { ox, oy } = offsets[o];
        const p = worldToScreen(car.x + ox, car.y + oy);
        if (p.x < -20 || p.y < -20 || p.x > canvas.width + 20 || p.y > canvas.height + 20) continue;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#1a1a1a';
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = alpha * 0.5;
        ctx.strokeStyle = car.color || '#444';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 1.4, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawSelectedTrails() {
    if (!sim.selectedTrails.size) return;
    const offsets = visibleTileOffsets(120);
    ctx.save();
    ctx.lineWidth = 1.6;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const [key, trail] of sim.selectedTrails) {
      if (!trail || trail.length < 2) continue;
      const e = creatureByKey(key);
      const color = e ? colorForCreature(e) : '#9fda69';
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.48;
      for (let o = 0; o < offsets.length; o += 1) {
        const { ox, oy } = offsets[o];
        ctx.beginPath();
        for (let i = 0; i < trail.length; i += 1) {
          const p = worldToScreen(trail[i].x + ox, trail[i].y + oy);
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function render() {
    resize();
    clampCamera();
    drawBackground();
    drawProducerField();
    drawCarcasses();
    drawSelectedTrails();

    let debugDrawn = 0;
    const offsets = visibleTileOffsets(900);
    // Pre-compute viewport bounds in world-space (avoids per-creature worldToScreen call)
    const wEps = 50 / camera.zoom;
    const vwMinX = camera.x - window.innerWidth / (2 * camera.zoom) - wEps;
    const vwMaxX = camera.x + window.innerWidth / (2 * camera.zoom) + wEps;
    const vwMinY = camera.y - window.innerHeight / (2 * camera.zoom) - wEps;
    const vwMaxY = camera.y + window.innerHeight / (2 * camera.zoom) + wEps;
    for (let i = 0; i < sim.creatures.length; i += 1) {
      const e = sim.creatures[i];
      if (!e || !e.alive) continue;
      const er = e.radius || 2;
      for (let o = 0; o < offsets.length; o += 1) {
        const ox = offsets[o].ox;
        const oy = offsets[o].oy;
        const wx = e.x + ox;
        const wy = e.y + oy;
        if (wx - er > vwMaxX || wx + er < vwMinX) continue;
        if (wy - er > vwMaxY || wy + er < vwMinY) continue;
        if (sim.debug && debugDrawn < MAX_DEBUG_RANGES) {
          drawDebugRange(e, ox, oy);
          debugDrawn += 1;
        }
        drawCreature(e, ox, oy);
      }
    }

    // Overlay dia/noche: tinta oscuro cuando solarEnergy < base (noche)
    if (sim.dayNightEnabled) {
      const sinPhase = Math.sin(sim.dayNightPhase);
      if (sinPhase < 0) {
        const darkness = (-sinPhase) * 0.35; // 0 a 0.35
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = `rgba(5, 8, 20, ${darkness})`;
        ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
      }
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
    if (sim.dayNightEnabled) {
      const sinP = Math.sin(sim.dayNightPhase);
      const phaseLabel = sinP > 0.5 ? 'Día' : sinP > -0.5 ? 'Atardecer' : 'Noche';
      els.statSun.textContent = `x${sim.solarEnergy.toFixed(sim.solarEnergy < 2 ? 1 : 0)} (${phaseLabel})`;
    } else {
      els.statSun.textContent = `x${sim.solarEnergy.toFixed(sim.solarEnergy < 2 ? 1 : 0)}`;
    }
    els.statBirths.textContent = fmt.format(sim.births);
    els.statDeaths.textContent = fmt.format(sim.deaths);
    els.statTime.textContent = `${String(Math.floor(sim.time / 60)).padStart(3, '0')}m ${String(Math.floor(sim.time % 60)).padStart(2, '0')}s`;
    els.statFps.textContent = String(Math.round(sim.fps));
    els.legendProducerA.textContent = c.producerDensity.toFixed(3);
    els.legendProducerB.textContent = fmt.format(c.producerB);
    els.legendProducerC.textContent = fmt.format(c.producerC);
    els.legendConsumers.textContent = fmt.format(c.consumers);
    els.legendPredators.textContent = fmt.format(c.predators);

    if (force || sim.time - sim.lastGraphAt >= 1) {
      sim.lastGraphAt = sim.time;
      sim.graph.push({ t: sim.time, ...c });
      if (sim.graph.length > HISTORY_MAX_POINTS) sim.graph.shift();
      drawGraph();
      recordGeneHistory();
    }
    if (sim.selectedCreatureIds.length) updateInspectors();
  }

  function drawTimeAxis(context, w, h, pxPerSecond) {
    const maxSeconds = Math.floor((w - 10) / pxPerSecond);
    if (maxSeconds < 5) return;
    const candidates = [10, 15, 30, 60, 120, 300, 600];
    const step = candidates.find((s) => s * pxPerSecond >= 54) || 900;
    context.save();
    context.strokeStyle = 'rgba(255,255,255,0.16)';
    context.fillStyle = 'rgba(220,232,226,0.62)';
    context.lineWidth = 1;
    context.font = '10px system-ui, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'bottom';
    for (let seconds = 0; seconds <= maxSeconds; seconds += step) {
      const x = Math.round(w - 5 - seconds * pxPerSecond) + 0.5;
      context.beginPath();
      context.moveTo(x, h - 14);
      context.lineTo(x, h - 4);
      context.stroke();
      context.fillText(seconds === 0 ? 'ahora' : `-${seconds}s`, x, h - 16);
    }
    context.restore();
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
    const visibleSeconds = Math.max(8, Math.floor((w - 10) / pxPerSecond));
    const minT = Math.max(0, sim.time - visibleSeconds);
    const points = sim.graph.filter((p) => p.t >= minT);
    if (!points.length) return;
    const visible = sim.populationSeriesVisible;
    const valuesForMax = [];
    for (let i = 0; i < points.length; i += 1) {
      const p = points[i];
      if (visible.producerDensity) valuesForMax.push(p.producerDensity * 1000);
      if (visible.producerB) valuesForMax.push(p.producerB);
      if (visible.producerC) valuesForMax.push(p.producerC);
      if (visible.consumers) valuesForMax.push(p.consumers);
      if (visible.predators) valuesForMax.push(p.predators);
    }
    const max = Math.max(10, ...valuesForMax);
    const yForGraphPoint = (p, key) => {
      const raw = key === 'producerDensity' ? p[key] * 1000 : p[key];
      return h - 20 - (raw / max) * (h - 34);
    };
    const xForGraphPoint = (p) => w - (sim.time - p.t) * pxPerSecond - 5;
    const drawDensityArea = () => {
      graphCtx.beginPath();
      for (let i = 0; i < points.length; i += 1) {
        const x = xForGraphPoint(points[i]);
        const y = yForGraphPoint(points[i], 'producerDensity');
        if (i === 0) graphCtx.moveTo(x, h - 20);
        graphCtx.lineTo(x, y);
      }
      const lastX = xForGraphPoint(points[points.length - 1]);
      graphCtx.lineTo(lastX, h - 20);
      graphCtx.closePath();
      const peak = Math.max(...points.map((p) => p.producerDensity * 1000));
      graphCtx.fillStyle = `rgba(118, 210, 93, ${clamp(0.055 + (peak / max) * 0.12, 0.06, 0.18)})`;
      graphCtx.fill();
    };
    const drawLine = (key, color) => {
      graphCtx.beginPath();
      graphCtx.strokeStyle = color;
      graphCtx.lineWidth = 2;
      let lastX = 0;
      let lastY = 0;
      for (let i = 0; i < points.length; i += 1) {
        const x = xForGraphPoint(points[i]);
        const y = yForGraphPoint(points[i], key);
        lastX = x;
        lastY = y;
        if (i === 0) graphCtx.moveTo(x, y);
        else graphCtx.lineTo(x, y);
      }
      graphCtx.stroke();
      if (points.length === 1) {
        graphCtx.fillStyle = color;
        graphCtx.beginPath();
        graphCtx.arc(lastX, lastY, 2.5, 0, Math.PI * 2);
        graphCtx.fill();
      }
    };
    if (visible.producerDensity) drawDensityArea();
    if (visible.producerB) drawLine('producerB', GROUP_COLORS['producer-b']);
    if (visible.producerC) drawLine('producerC', GROUP_COLORS['producer-c']);
    if (visible.consumers) drawLine('consumers', '#54b7f1');
    if (visible.predators) drawLine('predators', '#f05b50');
    drawTimeAxis(graphCtx, w, h, pxPerSecond);
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
    const allKeys = GROUP_KEYS[group].slice(0, 8);
    const hidden = geneHiddenSet(group);
    const keys = allKeys.filter((key) => !hidden.has(key));
    const pxPerSecond = sim.genePxPerSecond;
    const visibleSeconds = Math.max(8, Math.floor((w - 10) / pxPerSecond));
    const minT = Math.max(0, sim.time - visibleSeconds);
    const points = sim.geneHistory.filter((p) => p.t >= minT && p[group]?.n > 0);
    if (!points.length) {
      els.geneSummary.textContent = 'Sin histórico todavía.';
      return;
    }

    const max = Math.max(1, ...points.flatMap((p) => keys.map((key) => p[group].avg[key] || 0)));
    keys.forEach((key, idx) => {
      const colorIndex = allKeys.indexOf(key);
      geneCtx.beginPath();
      geneCtx.strokeStyle = GENE_COLORS[colorIndex % GENE_COLORS.length];
      geneCtx.lineWidth = 1.8;
      let lastX = 0;
      let lastY = 0;
      for (let i = 0; i < points.length; i += 1) {
        const x = w - (sim.time - points[i].t) * pxPerSecond - 5;
        const y = h - 22 - ((points[i][group].avg[key] || 0) / max) * (h - 38);
        lastX = x;
        lastY = y;
        if (i === 0) geneCtx.moveTo(x, y);
        else geneCtx.lineTo(x, y);
      }
      geneCtx.stroke();
      if (points.length === 1) {
        geneCtx.fillStyle = GENE_COLORS[colorIndex % GENE_COLORS.length];
        geneCtx.beginPath();
        geneCtx.arc(lastX, lastY, 2.3, 0, Math.PI * 2);
        geneCtx.fill();
      }
    });

    drawTimeAxis(geneCtx, w, h, pxPerSecond);
    const latest = points[points.length - 1][group];
    const labels = allKeys.map((key, idx) => {
      const disabled = hidden.has(key) ? ' disabled' : '';
      return `<button class="gene-toggle${disabled}" type="button" data-gene-key="${escapeHtml(key)}" style="--gene-color:${GENE_COLORS[idx % GENE_COLORS.length]}">${escapeHtml(key)} <b>${formatValue(latest.avg[key])}</b></button>`;
    });
    els.geneSummary.innerHTML = `<strong>${GROUP_LABELS[group]}: <b style="color:${GROUP_COLORS[group]}">${fmt.format(latest.n)}</b></strong>${labels.join('')}`;
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
      const dt = Math.min(scaled / chunks, MAX_DT);
      rebuildGrid();
      for (let i = 0; i < chunks; i += 1) simulate(dt);
    }

    updateCameraFollow();
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
    sim.solarEnergyBase = energyFromSlider(els.systemEnergy.value);
    if (!sim.dayNightEnabled) sim.solarEnergy = sim.solarEnergyBase;
    els.systemEnergyLabel.textContent = `x${sim.solarEnergyBase.toFixed(sim.solarEnergyBase < 2 ? 1 : 0)}`;
    updateStats(true);
  }

  function toggleDayNight() {
    sim.dayNightEnabled = !sim.dayNightEnabled;
    els.dayNightToggle.classList.toggle('active', sim.dayNightEnabled);
    if (!sim.dayNightEnabled) sim.solarEnergy = sim.solarEnergyBase;
    updateStats(true);
  }

  function stepSlider(input, amount, onChange) {
    const min = Number(input.min || 0);
    const max = Number(input.max || 100);
    input.value = String(clamp(Number(input.value || 0) + amount, min, max));
    onChange();
  }

  function setPaused(paused) {
    sim.paused = paused;
    els.playPause.innerHTML = paused ? '<span class="btn-icon">▶</span><span>Play</span>' : '<span class="btn-icon">⏸</span><span>Pausa</span>';
    els.playPause.classList.toggle('active', paused);
  }

  function resetWorld() {
    sim.creatures = [];
    sim.creatureIndex.clear();
    sim.freeIds = [];
    sim.grid.clear();
    sim.gridBucketPool.length = 0;
    initProducerField();
    sim.time = 0;
    sim.births = 0;
    sim.deaths = 0;
    sim.graph = [];
    sim.geneHistory = [];
    sim.lastGraphAt = -Infinity;
    sim.lastStatsAt = -Infinity;
    sim.selectedCreatureId = null;
    sim.selectedCreatureIds = [];
    sim.selectedTrails.clear();
    sim.followCreatureId = null;
    sim.lastCenteredCreatureId = null;
    sim.nextCreatureUid = 1;
    document.querySelectorAll('.inspect-panel[data-inspect-uid]').forEach((panel) => {
      if (panel === els.inspectPanel) {
        panel.classList.add('hidden');
        panel.removeAttribute('data-inspect-uid');
      } else {
        panel.remove();
      }
    });
    seedWorld();
    recordGeneHistory();
    logEvent('Ecosistema reiniciado', 'info');
    updateStats(true);
  }

  function seedWorld() {
    const areaFactor = clamp((WORLD.w * WORLD.h) / (4000 * 2250), 0.35, 6);
    for (let i = 0; i < Math.round(12 * areaFactor); i += 1) spawnProducer(lightningProducerOptions(PRODUCER.B, i));
    for (let i = 0; i < Math.round(38 * areaFactor); i += 1) spawnProducer(lightningProducerOptions(PRODUCER.C, i));
    for (let i = 0; i < Math.round(120 * areaFactor); i += 1) spawnConsumer(lightningMobileOptions('consumer', i));
    for (let i = 0; i < Math.round(18 * areaFactor); i += 1) spawnPredator(lightningMobileOptions('predator', i));
    logEvent('Seed inicial: biomasa base, consumidores y depredadores');
  }

  function vary(value, ratio = 0.18, min = -Infinity, max = Infinity) {
    return clamp(value * rand(1 - ratio, 1 + ratio), min, max);
  }

  function averageExisting(group, minCount = 6) {
    const keys = GROUP_KEYS[group] || [];
    const sums = Object.fromEntries(keys.map((key) => [key, 0]));
    let n = 0;
    for (let i = 0; i < sim.creatures.length; i += 1) {
      const e = sim.creatures[i];
      if (!e || !e.alive || groupForCreature(e) !== group) continue;
      n += 1;
      for (let k = 0; k < keys.length; k += 1) sums[keys[k]] += Number(e[keys[k]] || 0);
    }
    if (n < minCount) return null;
    const avg = {};
    for (let k = 0; k < keys.length; k += 1) avg[keys[k]] = sums[keys[k]] / n;
    return avg;
  }

  function adaptiveBase(kind, sub = null) {
    if (kind === 'producer') {
      const group = sub === PRODUCER.B ? 'producer-b' : 'producer-c';
      return { ...defaultAddValues(kind, sub), ...(averageExisting(group, isColonyProducer(sub) ? 5 : 12) || {}) };
    }
    return { ...defaultAddValues(kind), ...(averageExisting(kind, kind === 'predator' ? 4 : 12) || {}) };
  }

  function balancedMovementMask(i) {
    const primary = i % MOVE.length;
    let mask = 1 << primary;
    if (chance(0.34)) mask |= 1 << ((primary + 1 + Math.floor(rand(0, MOVE.length - 1))) % MOVE.length);
    return mask;
  }

  function lightningProducerOptions(sub, i) {
    const base = adaptiveBase('producer', sub);
    if (isColonyProducer(sub)) {
      return {
        sub,
        radius: vary(base.radius, 0.22, 12, 34),
        armor: vary(base.armor, 0.18, 2.4, 7),
        fertility: vary(base.fertility, 0.18, 0.012, 0.075),
        maxAge: vary(base.maxAge, 0.28, 8500, 22000)
      };
    }
    return {
      sub,
      radius: vary(base.radius, 0.22, 3, 8),
      armor: vary(base.armor, 0.20, 1.8, 4.6),
      fertility: vary(base.fertility, 0.18, 0.010, 0.050),
      speed: vary(base.speed, 0.24, 14, 50),
      perception: DEFAULT_INITIAL_PERCEPTION,
      chemosense: vary(base.chemosense, 0.18, 1.4, 4.2),
      maxAge: vary(base.maxAge, 0.24, 4200, 12500),
      movementMask: balancedMovementMask(i)
    };
  }

  function lightningMobileOptions(kind, i) {
    const pred = kind === 'predator';
    const base = adaptiveBase(kind);
    return {
      size: vary(base.size, 0.28, pred ? 2.2 : 0.8, pred ? 9 : 6),
      reserves: vary(base.reserves, 0.28, pred ? 5 : 1, pred ? 20 : 8),
      flagella: clamp(Math.round(vary(base.flagella + (i % 3) - 1, 0.18, 0, pred ? 6 : 5)), 0, pred ? 6 : 5),
      cilia: clamp(Math.round(vary(base.cilia + ((i + 1) % 3) - 1, 0.18, 0, 6)), 0, 6),
      chemosense: vary(base.chemosense, 0.28, pred ? 1.1 : 0.4, pred ? 4.4 : 3.4),
      pseudopodia: vary(base.pseudopodia, 0.32, 0, pred ? 3.2 : 3.8),
      armor: vary(base.armor, 0.30, pred ? 0.8 : 0, pred ? 4 : 2.8),
      vacuole: vary(base.vacuole, 0.24, 0.3, 3.2),
      maxAge: vary(base.maxAge ?? (pred ? 9200 : 3600), 0.24, pred ? 6200 : 2400, pred ? 14000 : 6200),
      feeding: i % FEEDING.length,
      movementMask: balancedMovementMask(i),
      fertility: vary(base.fertility, 0.20, 0.45, 2.2)
    };
  }

  function spawnLightningBatch(kind, sub = null, amount = null) {
    let created = 0;
    if (kind === 'producer') {
      const producerSub = sub ?? PRODUCER.B;
      const total = amount ?? (isMobileProducer(producerSub) ? 36 : 14);
      for (let i = 0; i < total; i += 1) {
        spawnProducer(lightningProducerOptions(producerSub, i));
        created += 1;
      }
    } else if (kind === 'consumer') {
      const total = amount ?? 48;
      for (let i = 0; i < total; i += 1) {
        spawnConsumer(lightningMobileOptions(kind, i));
        created += 1;
      }
    } else {
      const total = amount ?? 16;
      for (let i = 0; i < total; i += 1) {
        spawnPredator(lightningMobileOptions(kind, i));
        created += 1;
      }
    }
    sim.births += created;
    updateStats(true);
  }

  function addLightningMix() {
    const form = new FormData(els.addForm);
    if (sim.selectedAddKind === 'producer') {
      spawnLightningBatch('producer', Number(form.get('sub') ?? PRODUCER.B));
    } else if (sim.selectedAddKind === 'consumer') {
      spawnLightningBatch('consumer');
    } else {
      spawnLightningBatch('predator');
    }
  }

  function defaultAddValues(kind, sub = PRODUCER.B) {
    if (kind === 'producer') {
      return {
        amount: ADD_AMOUNT_DEFAULT,
        sub,
        radius: isColonyProducer(sub) ? 18 : 5,
        armor: isColonyProducer(sub) ? 3.8 : 3.0,
        fertility: isMobileProducer(sub) ? PRODUCER_C_DEFAULT_FERTILITY : 0.024,
        speed: 24,
        perception: DEFAULT_INITIAL_PERCEPTION,
        chemosense: 2.7,
        movementMask: 2,
        maxAge: isColonyProducer(sub) ? 12000 : 6800
      };
    }
    return {
      amount: ADD_AMOUNT_DEFAULT,
      size: kind === 'predator' ? 5 : 2.4,
      flagella: kind === 'predator' ? 3 : 1,
      cilia: kind === 'predator' ? 1 : 2,
      reserves: kind === 'predator' ? 12 : 5,
      pseudopodia: kind === 'predator' ? 0.8 : 1.2,
      armor: kind === 'predator' ? 2 : 0.6,
      chemosense: kind === 'predator' ? 2.4 : 1.6,
      vacuole: 1.2,
      feeding: 0,
      movementMask: 2,
      fertility: 1,
      maxAge: kind === 'predator' ? 9200 : 3600
    };
  }

  function savedAddValues(kind, sub = null, forceDefaults = false) {
    const saved = forceDefaults ? null : sim.lastAddValues[kind];
    if (kind === 'producer') {
      const wantedSub = sub ?? Number(saved?.sub ?? PRODUCER.B);
      return { ...defaultAddValues(kind, wantedSub), ...(saved && Number(saved.sub) === wantedSub ? saved : {}), sub: wantedSub };
    }
    return { ...defaultAddValues(kind), ...(saved || {}) };
  }

  function cloneAddValues(e) {
    const amount = ADD_AMOUNT_DEFAULT;
    if (e.type === TYPE.PRODUCER) {
      return {
        amount,
        sub: e.sub,
        radius: Number(e.radius || defaultAddValues('producer', e.sub).radius),
        armor: Number(e.armor || 0),
        fertility: Number(e.fertility || defaultAddValues('producer', e.sub).fertility),
        speed: Number(e.speed || defaultAddValues('producer', e.sub).speed),
        perception: Number(e.perception || defaultAddValues('producer', e.sub).perception),
        chemosense: Number(e.chemosense || defaultAddValues('producer', e.sub).chemosense),
        movementMask: movementMaskFromLegacy(e),
        maxAge: Number.isFinite(Number(e.maxAge)) ? Number(e.maxAge) : defaultAddValues('producer', e.sub).maxAge
      };
    }
    const kind = e.type === TYPE.PREDATOR ? 'predator' : 'consumer';
    return {
      amount,
      size: Number(e.size || defaultAddValues(kind).size),
      flagella: Number(e.flagella || 0),
      cilia: Number(e.cilia || 0),
      reserves: Number(e.reserves || defaultAddValues(kind).reserves),
      pseudopodia: Number(e.pseudopodia || 0),
      armor: Number(e.armor || 0),
      chemosense: Number(e.chemosense || defaultAddValues(kind).chemosense),
      vacuole: Number(e.vacuole || defaultAddValues(kind).vacuole),
      feeding: Number(e.feeding || 0),
      movementMask: movementMaskFromLegacy(e),
      maxAge: Number.isFinite(Number(e.maxAge)) ? Number(e.maxAge) : defaultAddValues(kind).maxAge,
      fertility: Number(e.fertility || defaultAddValues(kind).fertility)
    };
  }

  function openCloneDialog(key) {
    const e = creatureByKey(key);
    if (!e || !e.alive || e.sub === PRODUCER.A) return;
    const kind = e.type === TYPE.PRODUCER ? 'producer' : e.type === TYPE.PREDATOR ? 'predator' : 'consumer';
    sim.lastAddValues[kind] = cloneAddValues(e);
    renderAddDialog(kind);
    els.addDialog.showModal();
  }

  function collectAddValues(form) {
    const values = {};
    for (const [key, value] of form.entries()) {
      if (key !== 'movementBits') values[key] = Number(value);
    }
    const movementBits = form.getAll('movementBits');
    if (movementBits.length) values.movementMask = movementMaskFromValue(movementBits);
    return values;
  }

  function numberField(name, label, value, min, max, step = 1, hint = '') {
    return `
      <div class="field">
        <label for="${name}">${labelWithTip(name, label, hint)}</label>
        <input id="${name}" name="${name}" type="number" value="${value}" min="${min}" max="${max}" step="${step}">
      </div>
    `;
  }

  function rangeField(name, label, value, min, max, step = 1, hint = '') {
    return `
      <div class="field range-field">
        <label for="${name}">${labelWithTip(name, label, hint)}</label>
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
        <label>${labelWithTip(name, label, hint)}</label>
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
        <label for="${name}">${labelWithTip(name, label, hint)}</label>
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
        <label>${labelWithTip(name, label, hint)}</label>
        <div class="segments multi">${opts}</div>
      </div>
    `;
  }

  function previewField(visualFields = '') {
    return `<div class="field wide preview-field visual-config"><div id="addPreview"></div><div class="visual-fields">${visualFields}</div></div>`;
  }

  function collectAddPreviewData() {
    const form = new FormData(els.addForm);
    const data = {};
    for (const [key, value] of form.entries()) {
      if (key !== 'movementBits') data[key] = Number(value);
    }
    if (sim.selectedAddKind === 'producer') {
      data.type = TYPE.PRODUCER;
      data.kind = 'producer';
      data.sub = Number(data.sub ?? PRODUCER.B);
      if (isColonyProducer(data.sub) && data.leafCount == null) data.leafCount = Math.max(2, Math.floor(2 + Number(data.radius || 18) / 8));
    } else {
      data.kind = sim.selectedAddKind;
      data.type = sim.selectedAddKind === 'predator' ? TYPE.PREDATOR : TYPE.CONSUMER;
      data.radius = 3.5 + Number(data.size || 1) * 1.72 + Number(data.reserves || 0) * 0.34;
    }
    return data;
  }

  function updateAddPreview() {
    const target = document.getElementById('addPreview');
    if (!target) return;
    target.innerHTML = previewHtml(collectAddPreviewData());
  }

  function bindDynamicFields() {
    els.dynamicFields.querySelectorAll('input[type="range"][data-range-output]').forEach((input) => {
      const out = document.getElementById(input.dataset.rangeOutput);
      const update = () => {
        if (out) out.textContent = input.value;
        updateAddPreview();
      };
      input.addEventListener('input', update);
      update();
    });
    els.dynamicFields.querySelectorAll('input, select').forEach((input) => {
      input.addEventListener('input', updateAddPreview);
      input.addEventListener('change', updateAddPreview);
    });
    updateAddPreview();
  }

  function renderAddDialog(kind, forceDefaults = false) {
    sim.selectedAddKind = kind;
    els.quickMix.hidden = false;
    els.defaultsAdd.hidden = false;
    const title = kind === 'producer' ? 'Añadir productores' : kind === 'consumer' ? 'Añadir consumidores' : 'Añadir depredadores';
    els.dialogKindLabel.textContent = 'Configuración inicial';
    els.dialogTitle.textContent = title;
    const initial = savedAddValues(kind, null, forceDefaults);
    const common = rangeField('amount', 'Cantidad', initial.amount ?? ADD_AMOUNT_DEFAULT, 1, ADD_AMOUNT_MAX, 1, 'Número de entidades a crear repartidas por todo el ecosistema. Valores altos pueden afectar al rendimiento.');
    if (kind === 'producer') {
      const renderProducerForm = (sub = PRODUCER.B, producerForceDefaults = false) => {
        const values = savedAddValues(kind, sub, forceDefaults || producerForceDefaults);
        const amountField = rangeField('amount', 'Cantidad', values.amount ?? ADD_AMOUNT_DEFAULT, 1, ADD_AMOUNT_MAX, 1, 'Número de entidades a crear repartidas por todo el ecosistema. Valores altos pueden afectar al rendimiento.');
        const visualFields = rangeField('radius', 'Tamaño base', values.radius, 2, 40, 0.5, 'Radio inicial. En Tipo B aumenta con el sol hasta su radio máximo; en Tipo C afecta a contacto y visibilidad.')
          + rangeField('armor', 'Armadura', values.armor, 0, 7, 0.1, 'Resistencia física: consumidores y depredadores necesitan alimentación y fenotipo suficientes para atravesarla.');
        els.dynamicFields.innerHTML = amountField
          + segmentedField('sub', 'Modelo productor', sub, [[1, 'Tipo B', 'Colonia fija grande: crece, genera hojas comestibles y muere por edad.'], [2, 'Tipo C', 'Productor móvil: detecta consumidores y depredadores y huye.']], 'Tipo A queda como densidad agregada del campo y crece con la energía del sistema; B y C sí entran en la rejilla espacial.')
          + previewField(visualFields)
          + rangeField('fertility', 'Reproducción', values.fertility, 0.004, 0.18, 0.001, 'Multiplica la velocidad del cooldown reproductivo; también escala con la energía solar. En productores entidad conviene mantenerlo bajo.')
          + (isMobileProducer(sub)
            ? rangeField('speed', 'Velocidad Tipo C', values.speed, 0, 80, 1, 'Velocidad de productores móviles. Más velocidad ayuda a huir, pero captar sol en movimiento es lento y reproducirse cuesta más.')
              + rangeField('perception', 'Percepción Tipo C', values.perception, 40, PRODUCER_C_MAX_PERCEPTION, 5, 'Rango para detectar consumidores y depredadores cercanos. Arranca igual que consumidores y depredadores; subirlo mucho rompe el equilibrio.')
              + rangeField('chemosense', 'Quimiosensibilidad Tipo C', values.chemosense, 0, 5, 0.1, 'Aumenta orientación y percepción efectiva, pero encarece mantener rangos altos.')
              + movementField('movementBits', 'Movimientos Tipo C', values.movementMask, 'Puede tener varios algoritmos simultáneos. En reproducción asexual mutan muy poco.')
            : '')
          + (isColonyProducer(sub)
            ? rangeField('maxAge', 'Vida máxima', values.maxAge, 3000, 24000, 50, 'Tiempo medio antes de morir por senescencia. Se hereda con margen controlado.')
            : '');
        bindDynamicFields();
        els.dynamicFields.querySelectorAll('input[name="sub"]').forEach((input) => {
          input.addEventListener('change', () => renderProducerForm(Number(input.value)));
        });
      };
      renderProducerForm(Number(initial.sub ?? PRODUCER.B));
    } else {
      const values = initial;
      const visualFields = rangeField('size', 'Tamaño', values.size, 0.5, 12, 0.1, 'Aumenta radio, energía máxima y capacidad de pastar hojas blindadas, pero sube masa, coste basal y reduce velocidad.')
        + rangeField('flagella', 'Flagelos', values.flagella, 0, 7, 1, 'Aumentan impulso, pero ahora tienen coste no lineal: muchos flagelos añaden rozamiento, masa funcional y gasto energético alto.')
        + rangeField('cilia', 'Cilios', values.cilia, 0, 6, 1, 'Aumentan micropropulsión, percepción cercana y alcance de filtrado, con coste moderado.')
        + rangeField('reserves', 'Reservas', values.reserves, 0, kind === 'predator' ? 24 : 14, 0.1, 'Amplían energía máxima y supervivencia, pero añaden masa y hacen al ser más lento.')
        + rangeField('pseudopodia', 'Pseudópodos', values.pseudopodia, 0, 4, 0.1, 'Mejoran mordida y consumo de hojas/presas, pero aportan coste y rozamiento.')
        + rangeField('armor', 'Película / armadura', values.armor, 0, 5, 0.1, 'Aumenta masa y coste; queda preparada para ventajas defensivas futuras.');
      els.dynamicFields.innerHTML = common
        + previewField(visualFields)
        + rangeField('chemosense', 'Quimiosensibilidad', values.chemosense, 0, 5, 0.1, 'Mejora atracción hacia alimento/presa y orientación si tiene movimiento quimiotáctico.')
        + rangeField('vacuole', 'Vacuola contráctil', values.vacuole, 0, 4, 0.1, 'Reduce parcialmente el metabolismo efectivo, compensando algo el coste de tamaño y movilidad.')
        + segmentedField('feeding', 'Alimentación', values.feeding, FEEDING_INFO.map((item, idx) => [idx, item[0], item[1]]), 'Modo de alimentación: modifica alcance, mordida y eficiencia al comer biomasa, hojas o presas.')
        + movementField('movementBits', 'Movimientos', values.movementMask, 'Puede combinar varios algoritmos. La reproducción mezcla los algoritmos activos de ambos padres.')
        + rangeField('maxAge', 'Vida máxima', values.maxAge, kind === 'predator' ? 5000 : 1800, kind === 'predator' ? 15000 : 8000, 50, 'Tiempo medio antes de morir por senescencia. Más vida permite que fenotipos lentos tengan opciones.')
        + rangeField('fertility', 'Fertilidad', values.fertility, 0.2, 3, 0.1, 'Reduce cooldown reproductivo cuando hay energía suficiente. Los hijos heredan cerca del rango parental con poca variación.');
      bindDynamicFields();
    }
  }

  function openAddDialog(kind) {
    renderAddDialog(kind);
    els.addDialog.showModal();
  }

  function openWorldDialog() {
    sim.selectedAddKind = 'world';
    els.quickMix.hidden = true;
    els.defaultsAdd.hidden = true;
    els.dialogKindLabel.textContent = 'Tamaño del ecosistema';
    els.dialogTitle.textContent = 'Configurar mundo 16:9';
    els.dynamicFields.innerHTML =
      selectField('preset', 'Preset', 'custom', [
        ['4000x2250', '1/4 · 4.000 x 2.250'],
        ['8000x4500', '1/2 · 8.000 x 4.500'],
        ['16000x9000', 'Completo por defecto · 16.000 x 9.000'],
        ['custom', 'Personalizado']
      ], 'Cambiar el tamaño reinicia el ecosistema.')
      + numberField('width', 'Ancho', WORLD.w, 1000, 32000, 1)
      + numberField('height', 'Alto', WORLD.h, 563, 18000, 1, 'Se fuerza proporción 16:9 al aplicar.');
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
    recomputeGridDimensions();
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
    const amount = clamp(Number(form.get('amount') || 1), 1, ADD_AMOUNT_MAX);
    const opts = collectAddValues(form);
    delete opts.amount;
    sim.lastAddValues[sim.selectedAddKind] = collectAddValues(form);
    let lastCreated = null;
    let created = 0;
    for (let i = 0; i < amount; i += 1) {
      const local = {
        ...opts,
        x: rand(0, WORLD.w),
        y: rand(0, WORLD.h)
      };
      if (sim.selectedAddKind === 'producer') lastCreated = spawnProducer(local) || lastCreated;
      else if (sim.selectedAddKind === 'consumer') lastCreated = spawnConsumer(local);
      else lastCreated = spawnPredator(local);
      if (lastCreated) created += 1;
    }
    if (created) {
      sim.births += created;
      const label = sim.selectedAddKind === 'consumer' ? 'consumidores' : 'depredadores';
      const producerLabel = sim.selectedAddKind === 'producer' ? 'productores' : label;
      logEvent(`Añadidos ${fmt.format(created)} ${producerLabel} desde el popup`, 'birth');
    }
    if (amount === 1 && lastCreated) selectCreature(lastCreated);
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
      panel.style.zIndex = '32';
      panel.setPointerCapture(ev.pointerId);
      const move = (moveEv) => {
        const x = clamp(moveEv.clientX - offsetX, 0, window.innerWidth - Math.min(96, rect.width));
        const y = clamp(moveEv.clientY - offsetY, 0, window.innerHeight - 38);
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

  function stretchTimeAxis(ev) {
    ev.preventDefault();
    const isGeneGraph = ev.currentTarget === geneCanvas;
    const current = isGeneGraph ? sim.genePxPerSecond : sim.populationPxPerSecond;
    const next = ev.deltaY > 0 ? current / 1.22 : current * 1.22;
    if (isGeneGraph) sim.genePxPerSecond = clamp(next, 0.09, 24);
    else sim.populationPxPerSecond = clamp(next, 0.09, 24);
    drawGraph();
    drawGeneHistory();
  }

  function togglePopulationSeries(key) {
    if (!(key in sim.populationSeriesVisible)) return;
    sim.populationSeriesVisible[key] = !sim.populationSeriesVisible[key];
    document.querySelectorAll(`[data-pop-series="${key}"]`).forEach((el) => el.classList.toggle('disabled', !sim.populationSeriesVisible[key]));
    drawGraph();
  }

  function toggleGeneSeries(key) {
    if (!key) return;
    const hidden = geneHiddenSet(sim.geneHistoryGroup);
    if (hidden.has(key)) hidden.delete(key);
    else hidden.add(key);
    drawGeneHistory();
  }

  function handleToggleKey(ev, callback) {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    ev.preventDefault();
    callback();
  }

  function bindEvents() {
    window.addEventListener('resize', resize);
    window.addEventListener('resize', () => {
      drawGraph();
      drawGeneHistory();
    });
    els.speed.addEventListener('input', setSpeed);
    els.systemEnergy.addEventListener('input', setSystemEnergy);
    els.dayNightToggle.addEventListener('click', toggleDayNight);
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
    document.querySelectorAll('[data-pop-series]').forEach((el) => {
      const toggle = () => togglePopulationSeries(el.dataset.popSeries);
      el.addEventListener('click', toggle);
      el.addEventListener('keydown', (ev) => handleToggleKey(ev, toggle));
    });
    els.geneSummary.addEventListener('pointerdown', (ev) => {
      const item = ev.target.closest('[data-gene-key]');
      if (!item) return;
      ev.preventDefault();
      ev.stopPropagation();
      toggleGeneSeries(item.dataset.geneKey);
    });
    els.geneSummary.addEventListener('keydown', (ev) => {
      const item = ev.target.closest('[data-gene-key]');
      if (!item) return;
      handleToggleKey(ev, () => toggleGeneSeries(item.dataset.geneKey));
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
    window.addEventListener('keydown', (ev) => {
      const editable = ev.target?.closest?.('input, textarea, select, dialog');
      if (ev.key === 'Escape' && sim.selectedCreatureIds.length && !els.addDialog.open) closeInspector();
      if (editable || ev.altKey || ev.ctrlKey || ev.metaKey) return;
      if (ev.code === 'Space') {
        ev.preventDefault();
        setPaused(!sim.paused);
      } else if (ev.key === '1') {
        ev.preventDefault();
        openAddDialog('producer');
      } else if (ev.key === '2') {
        ev.preventDefault();
        openAddDialog('consumer');
      } else if (ev.key === '3') {
        ev.preventDefault();
        openAddDialog('predator');
      } else if (ev.key === '+' || ev.key === '=') {
        ev.preventDefault();
        stepSlider(els.speed, 4, setSpeed);
      } else if (ev.key === '-') {
        ev.preventDefault();
        stepSlider(els.speed, -4, setSpeed);
      } else if (ev.key === '*') {
        ev.preventDefault();
        stepSlider(els.systemEnergy, 4, setSystemEnergy);
      } else if (ev.key === '/') {
        ev.preventDefault();
        stepSlider(els.systemEnergy, -4, setSystemEnergy);
      }
    });
    makePanelDraggable(els.graphPanel);
    makePanelDraggable(els.genePanel);
    makePanelDraggable(els.inspectPanel);
    makePanelDraggable(els.statsPanel);
    graphCanvas.addEventListener('wheel', stretchTimeAxis, { passive: false });
    geneCanvas.addEventListener('wheel', stretchTimeAxis, { passive: false });
    new ResizeObserver(() => {
      drawGraph();
      drawGeneHistory();
    }).observe(els.graphPanel);
    new ResizeObserver(() => drawGeneHistory()).observe(els.genePanel);

    document.querySelectorAll('[data-add]').forEach((btn) => {
      btn.addEventListener('click', () => openAddDialog(btn.dataset.add));
    });
    document.querySelectorAll('[data-quick-add]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const kind = btn.dataset.quickAdd;
        if (kind === 'producer-b') spawnLightningBatch('producer', PRODUCER.B);
        else if (kind === 'producer-c') spawnLightningBatch('producer', PRODUCER.C);
        else spawnLightningBatch(kind);
      });
    });

    document.getElementById('quickMix').addEventListener('click', () => {
      addLightningMix();
      els.addDialog.close();
    });
    els.defaultsAdd.addEventListener('click', () => {
      if (sim.selectedAddKind !== 'world') renderAddDialog(sim.selectedAddKind, true);
    });

    els.addForm.addEventListener('submit', (ev) => {
      if (ev.submitter?.value === 'cancel') return;
      ev.preventDefault();
      addFromForm();
      els.addDialog.close();
    });

    // === Help dialog ===
    const helpDialog = document.getElementById('helpDialog');
    document.getElementById('helpButton').addEventListener('click', () => {
      helpDialog.showModal();
    });
    helpDialog.addEventListener('click', (ev) => {
      if (ev.target.matches('[data-help-close]')) helpDialog.close();
    });
    document.querySelectorAll('.help-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        const target = tab.dataset.helpTab;
        document.querySelectorAll('.help-tab').forEach((t) => t.classList.toggle('active', t === tab));
        document.querySelectorAll('.help-section').forEach((s) => s.classList.toggle('active', s.dataset.helpSection === target));
      });
    });

    canvas.addEventListener('pointerdown', (ev) => {
      if (sim.followCreatureId != null) setFollowCreature(sim.followCreatureId, false);
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
      if (sim.followCreatureId != null) setFollowCreature(sim.followCreatureId, false);
      centerCamera({ fit: true });
    });
    canvas.addEventListener('click', (ev) => {
      if (camera.moved || ev.detail > 1) return;
      const selected = findCreatureAt(ev.clientX, ev.clientY);
      if (!selected) return;
      selectCreature(selected, ev.clientX, ev.clientY);
    });
    canvas.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      const following = sim.followCreatureId != null;
      const before = following ? null : screenToWorld(ev.clientX, ev.clientY);
      const bX = before ? before.x : 0, bY = before ? before.y : 0;
      const factor = Math.exp(-ev.deltaY * 0.0012);
      camera.zoom = clamp(camera.zoom * factor, 0.028, 2.2);
      if (following) {
        updateCameraFollow();
      } else {
        const after = screenToWorld(ev.clientX, ev.clientY);
        camera.x += bX - after.x;
        camera.y += bY - after.y;
      }
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
