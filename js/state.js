/**
 * state.js - Modelo de datos, caché de cálculos y persistencia en LocalStorage
 */

import { uid, mulberry, pad, norm } from './utils.js';

export const KEY = 'centroIndicadores_v5';
export let DB = null;
let MEM = null;
export const MEMO = new Map();

export const GEN = { id: 'gen', name: 'General' };

export const hasUnits = a => !!(a && a.units && a.units.length);
export const unitsOf = a => hasUnits(a) ? a.units : [GEN];
export const ulabel = a => (a && a.ulabel) || 'Planta';
export const SK = (i, u) => i + '@' + u;

export const areaOf = id => DB.areas.find(a => a.id === id) || {
  id: '', name: '—', color: '#94a3b8', icon: 'bar', units: []
};

export const indById = id => DB.indicators.find(i => i.id === id);

export const unitName = (a, u) => u === 'all'
  ? 'Todas'
  : (unitsOf(a).find(x => x.id === u) || { name: '—' }).name;

export const procName = (ind, u) => {
  const a = areaOf(ind.areaId);
  return hasUnits(a) ? unitName(a, u) : a.name;
};

export const dateKey = (y, m) => y + '-' + pad(m + 1);

export const getVal = (sk, y, m) => {
  const o = DB.data[sk];
  if (!o) return null;
  const v = o[dateKey(y, m)];
  return v == null ? null : v;
};

export function setVal(sk, y, m, v) {
  MEMO.clear();
  DB.data[sk] = DB.data[sk] || {};
  if (v == null) delete DB.data[sk][dateKey(y, m)];
  else DB.data[sk][dateKey(y, m)] = v;
}

export const goalRaw = (sk, y) => {
  const g = DB.goals[sk];
  return g && g[y];
};

export function tA(ind, u, y) {
  const g = goalRaw(SK(ind.id, u), y);
  return g && g.a != null ? g.a : ind.target;
}

export function tM(ind, u, y, m) {
  const g = goalRaw(SK(ind.id, u), y);
  if (g && g.m && g.m[m] != null) return g.m[m];
  const a = tA(ind, u, y);
  return a == null ? null : (ind.agg === 'sum' ? +(a / 12).toFixed(4) : a);
}

export function setGoal(sk, y, k, v) {
  MEMO.clear();
  DB.goals[sk] = DB.goals[sk] || {};
  const g = DB.goals[sk][y] = DB.goals[sk][y] || { a: null, m: Array(12).fill(null) };
  if (k === 'a') g.a = v;
  else g.m[k] = v;
}

export function aggr(ind, arr) {
  const a = arr.filter(v => v != null && !isNaN(v));
  if (!a.length) return null;
  const s = a.reduce((x, y) => x + y, 0);
  return ind.agg === 'sum' ? s : s / a.length;
}

export function unitIds(ind, uSel) {
  const a = areaOf(ind.areaId);
  if (!hasUnits(a)) return ['gen'];
  if (uSel === 'all' || !a.units.some(u => u.id === uSel)) return a.units.map(u => u.id);
  return [uSel];
}

export function S(ind, uSel, y) {
  const k = ind.id + '|' + uSel + '|' + y;
  if (MEMO.has(k)) return MEMO.get(k);
  const us = unitIds(ind, uSel), v = [], t = [];
  for (let m = 0; m < 12; m++) {
    const have = us.filter(u => getVal(SK(ind.id, u), y, m) != null);
    v.push(aggr(ind, have.map(u => getVal(SK(ind.id, u), y, m))));
    t.push(aggr(ind, (have.length ? have : us).map(u => tM(ind, u, y, m))));
  }
  const r = { v, t, ta: aggr(ind, us.map(u => tA(ind, u, y))) };
  MEMO.set(k, r);
  return r;
}

export function status(ind, v, t) {
  if (v == null || t == null || isNaN(t)) return { s: 'na', gap: null };
  const den = Math.abs(t) || 1;
  const gap = (ind.dir === 'up' ? (v - t) : (t - v)) / den * 100;
  if (gap >= 0) return { s: 'ok', gap };
  if (gap >= -DB.settings.tol) return { s: 'warn', gap };
  return { s: 'bad', gap };
}

export function ytd(ind, s, from, to) {
  const list = Array.isArray(from) ? from : Array.from({ length: to - from + 1 }, (_, k) => from + k);
  const ms = list.filter(m => s.v[m] != null);
  if (!ms.length) return { v: null, t: ind.agg === 'sum' ? null : s.ta, n: 0 };
  const sum = ms.reduce((a, m) => a + s.v[m], 0);
  if (ind.agg === 'sum') return { v: sum, t: ms.reduce((a, m) => a + (s.t[m] ?? 0), 0), n: ms.length };
  return { v: sum / ms.length, t: s.ta, n: ms.length };
}

export function accum(ind, u, y, from, to) {
  const s = S(ind, u, y);
  const yt = ytd(ind, s, from, to);
  return { s, yt, st: status(ind, yt.v, yt.t) };
}

export const SL = { ok: 'Cumple', warn: 'En riesgo', bad: 'No cumple', na: 'Sin dato' };
export const stColor = { ok: '#10b981', warn: '#f59e0b', bad: '#ef4444', na: '#94a3b8' };

export const PST = { abierto: 'Abierto', curso: 'En curso', cerrado: 'Cerrado' };
export const isLate = p => p.estado !== 'cerrado' && !!p.fecha && p.fecha < (new Date().toISOString().slice(0, 10));
export const planCls = p => p.estado === 'cerrado' ? 'ok' : isLate(p) ? 'bad' : p.estado === 'curso' ? 'warn' : 'pri';

export function lastDataMonth(y) {
  let L = -1;
  Object.values(DB.data).forEach(o => {
    for (let m = 11; m > L; m--) {
      if (o[dateKey(y, m)] != null) { L = m; break; }
    }
  });
  return L;
}

export function availableYears() {
  const set = new Set([UI.year]);
  const cy = new Date().getFullYear();
  for (let y = cy - 2; y <= cy + 1; y++) set.add(y);
  Object.values(DB.data).forEach(o => Object.keys(o).forEach(k => set.add(+k.slice(0, 4))));
  return [...set].sort();
}

export function dataYears() {
  const s = new Set();
  Object.values(DB.data).forEach(o => Object.keys(o).forEach(k => s.add(+k.slice(0, 4))));
  return [...s].sort((a, b) => b - a);
}

export function saveDB() {
  try {
    localStorage.setItem(KEY, JSON.stringify(DB));
  } catch (e) {
    MEM = JSON.stringify(DB);
  }
}

export function loadDB() {
  try {
    const r = localStorage.getItem(KEY) || localStorage.getItem('centroIndicadores_v4') || MEM;
    if (r) return JSON.parse(r);
  } catch (e) {}
  return null;
}

export function setDB(newDatabase) {
  DB = newDatabase;
  MEMO.clear();
}

/* ============ Generador de Catálogo Base & Demo ============ */
export function baseCatalog() {
  const A = [
    { id: 'a_prod', name: 'Producción', color: '#3b82f6', icon: 'factory', ulabel: 'Planta', units: [{ id: 'u_pvc', name: 'Película PVC' }, { id: 'u_pof', name: 'Película POF' }, { id: 'u_tej', name: 'Tejas' }] },
    { id: 'a_log', name: 'Logística', color: '#0ea5e9', icon: 'truck', ulabel: 'Logística', units: [{ id: 'u_lnac', name: 'Logística Nacional' }, { id: 'u_lexp', name: 'Logística Exportación' }] },
    { id: 'a_gh', name: 'Gestión Humana', color: '#8b5cf6', icon: 'users', ulabel: 'Planta', units: [] }
  ];
  const I = (areaId, name, unit, dir, target, dec, owner, agg = 'avg') => ({
    id: uid('i_'), areaId, name, unit, dir, agg, target, dec, owner
  });
  return {
    areas: A,
    indicators: [
      I('a_prod', 'OEE (Eficiencia global de equipos)', '%', 'up', 85, 1, 'Jefe de Producción'),
      I('a_prod', 'Paros no planeados', '%', 'down', 5, 1, 'Jefe de Producción'),
      I('a_prod', 'Scrap', '%', 'down', 2.5, 1, 'Jefe de Producción'),
      I('a_prod', 'Adherencia al programa de producción', '%', 'up', 95, 1, 'Planeación'),
      I('a_prod', 'Producto no conforme', '%', 'down', 1.5, 1, 'Calidad'),
      I('a_prod', 'Costo unitario de operación', 'USD/ton', 'down', 420, 0, 'Controller'),
      I('a_log', 'OTIF (On time in full)', '%', 'up', 95, 1, 'Jefe de Logística'),
      I('a_log', 'Cumplimiento de despachos', '%', 'up', 98, 1, 'Jefe de Logística'),
      I('a_log', 'Exactitud de inventario', '%', 'up', 98, 1, 'Almacén'),
      I('a_log', 'Costo logístico sobre ventas', '%', 'down', 6, 1, 'Jefe de Logística'),
      I('a_log', 'Tiempo de ciclo del pedido', 'días', 'down', 3, 1, 'Servicio al cliente'),
      I('a_gh', 'Ausentismo', '%', 'down', 3, 1, 'Gestión Humana'),
      I('a_gh', 'Rotación de personal', '%', 'down', 2, 1, 'Gestión Humana'),
      I('a_gh', 'Cumplimiento plan de capacitación', '%', 'up', 90, 1, 'Gestión Humana'),
      I('a_gh', 'Horas de capacitación', 'h', 'up', 480, 0, 'Gestión Humana', 'sum'),
      I('a_gh', 'Índice de clima laboral', '%', 'up', 80, 1, 'Gestión Humana'),
      I('a_gh', 'Tiempo de cobertura de vacantes', 'días', 'down', 30, 0, 'Gestión Humana')
    ]
  };
}

export const POOL = {
  a_prod: [
    ['Falla mecánica en extrusora', 'Reforzar plan de mantenimiento preventivo'],
    ['Cambios de referencia no programados', 'Estandarizar cambios de referencia (SMED)'],
    ['Materia prima fuera de especificación', 'Inspección de materia prima en recepción'],
    ['Variación de temperatura en proceso', 'Capacitar operadores en ajuste de parámetros'],
    ['Mantenimiento correctivo extendido', 'Revisar disponibilidad de repuestos críticos'],
    ['Falta de personal capacitado en turno', 'Matriz de polivalencia por turno']
  ],
  a_log: [
    ['Retraso de transportador', 'Seguimiento diario a transportadores'],
    ['Referencias sin inventario disponible', 'Alinear inventario con plan de ventas'],
    ['Errores en alistamiento', 'Doble verificación en alistamiento'],
    ['Diferencias en conteo cíclico', 'Aumentar frecuencia de conteos cíclicos'],
    ['Cambio de fecha solicitado por cliente', 'Acordar ventanas de entrega con clientes']
  ],
  a_gh: [
    ['Incapacidades por enfermedad general', 'Campaña de prevención en salud'],
    ['Retiro voluntario por oferta externa', 'Entrevistas de retiro y plan de retención'],
    ['Baja asistencia a capacitaciones', 'Reprogramar capacitaciones dentro del turno'],
    ['Procesos de selección con pocos candidatos', 'Ampliar fuentes de reclutamiento']
  ]
};

export function initNewDB(demo = true) {
  const c = baseCatalog();
  DB = {
    version: 5,
    settings: { tol: 5, theme: 'dark' },
    areas: c.areas,
    indicators: c.indicators,
    data: {},
    goals: {},
    plans: []
  };
  MEMO.clear();
  if (!demo) return DB;

  const rnd = mulberry(2026);
  const PF = { u_pvc: 1, u_pof: 0.97, u_tej: 0.94, u_lnac: 1, u_lexp: 0.97, gen: 1 };
  
  DB.indicators.forEach(ind => {
    unitIds(ind, 'all').forEach(u => {
      const sk = SK(ind.id, u);
      const f = PF[u] || 1;
      DB.data[sk] = {};
      let base = ind.agg === 'sum' ? ind.target : (ind.dir === 'up' ? ind.target * f : ind.target * (2 - f));
      if (ind.unit === '%' && base > 100) base = 100;
      base = +base.toFixed(ind.dec);
      const mBase = ind.agg === 'sum' ? base / 12 : base;
      const mm = Array.from({ length: 12 }, (_, k) => +(ind.dir === 'up' ? mBase * (0.985 + 0.03 * k / 11) : mBase * (1.03 - 0.06 * k / 11)).toFixed(ind.dec));
      
      DB.goals[sk] = {
        2026: { a: base, m: mm },
        2025: { a: base, m: Array(12).fill(null) },
        2024: { a: base, m: Array(12).fill(null) }
      };

      [[2024, 12, 0.05], [2025, 12, 0.02], [2026, 9, 0]].forEach(([y, n, off]) => {
        for (let m = 0; m < n; m++) {
          const t = y === 2026 ? mm[m] : mBase;
          const k = ind.dir === 'up' ? 0.93 + rnd() * 0.11 - off : 0.82 + rnd() * 0.38 + off * 2.5;
          let v = t * k;
          if (ind.unit === '%' && ind.dir === 'up') v = Math.min(100, v);
          DB.data[sk][y + '-' + pad(m + 1)] = +v.toFixed(ind.dec);
        }
      });
    });
  });

  const CIE = [
    'Acción implementada; el indicador volvió a la meta.',
    'Acción implementada y estandarizada.',
    'Se verificó eficacia en el mes siguiente.'
  ];
  
  DB.indicators.forEach(ind => unitIds(ind, 'all').forEach(u => {
    for (let m = 3; m <= 8; m++) {
      const v = getVal(SK(ind.id, u), 2026, m);
      const t = tM(ind, u, 2026, m);
      if (status(ind, v, t).s === 'bad' && rnd() < 0.8) {
        const pool = POOL[ind.areaId];
        const pc = pool[Math.floor(rnd() * pool.length)];
        const est = m <= 5 ? 'cerrado' : m === 6 ? (rnd() < 0.5 ? 'cerrado' : 'curso') : m === 7 ? (rnd() < 0.5 ? 'curso' : 'abierto') : 'abierto';
        DB.plans.push({
          id: uid('p_'),
          ind: ind.id,
          u,
          y: 2026,
          m,
          causa: pc[0],
          accion: pc[1],
          resp: ind.owner,
          fecha: `2026-${pad(m + 2)}-${pad(10 + Math.floor(rnd() * 15))}`,
          estado: est,
          cierre: est === 'cerrado' ? CIE[Math.floor(rnd() * 3)] : ''
        });
      }
    }
  }));

  return DB;
}

/* ============ Estado Global de Interfaz (UI State) ============ */
export const UI = {
  view: 'dash',
  year: 2026,
  month: 8,
  cmpMode: 'none',
  dd: null,
  dash: { area: 'all', unit: 'all' },
  f: {
    area: 'all',
    unit: 'all',
    ind: 'all',
    months: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    cmpY: [],
    pst: 'all',
    ist: 'all'
  },
  cap: { area: 'all', unit: 'all' },
  goal: { area: 'all', unit: 'all' },
  cat: { q: '', area: 'all' },
  bulk: { year: 2026, overwrite: true, create: true, prev: null, sheets: null, fileName: '' }
};
