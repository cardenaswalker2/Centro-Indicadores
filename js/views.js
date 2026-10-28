/**
 * views.js - Plantillas de renderizado para Dashboard, Análisis, Causas, Captura, Metas, Carga, Catálogo y Configuración
 */

import {
  $, $$, MONTHS, MONTHS_L, ALLM, UCOL, YCOL, esc, norm, fmt, parseNum, toast, downloadBlob, today
} from './utils.js';
import { icon, ICONS } from './icons.js';
import {
  DB, UI, SK, GEN, hasUnits, unitsOf, ulabel, areaOf, indById, unitName, procName,
  getVal, setVal, tA, tM, setGoal, unitIds, S, status, ytd, accum, SL, stColor,
  PST, isLate, planCls, lastDataMonth, availableYears, dataYears, saveDB
} from './state.js';
import { lineChart, stackBars } from './charts.js';
import { buildXlsx, readAnyFile } from './excel.js';

export const VIEWS = {
  dash: { t: 'Tablero General', s: 'Visión consolidada y desempeño acumulado de indicadores por área', i: 'dash', n: 'Inicio' },
  ana: { t: 'Análisis y Tendencias', s: 'Diagnóstico analítico, metas y tendencias proyectadas', i: 'trend', n: 'Análisis y tendencias' },
  plan: { t: 'Causas y Planes de Acción', s: 'Gestión y control de compromisos de mejora operativa', i: 'tool', n: 'Causas y planes' },
  cap: { t: 'Captura Mensual', s: 'Registro directo de mediciones reales por planta y logística', i: 'edit', n: 'Captura mensual' },
  goal: { t: 'Metas Estratégicas', s: 'Definición de metas anuales y desgloses mensuales por unidad', i: 'target', n: 'Metas' },
  bulk: { t: 'Carga Masiva Excel', s: 'Importación y exportación de datos y metas vía Excel/CSV', i: 'upload', n: 'Carga masiva' },
  cat: { t: 'Catálogo de Indicadores', s: 'Configuración de métricas, sentidos, cálculo y líderes', i: 'list', n: 'Catálogo' },
  cfg: { t: 'Ajustes y Datos', s: 'Estructura organizacional, plantas, semáforo y respaldos', i: 'sliders', n: 'Configuración' }
};

export const emptyMsg = (ic, t) => `<div class="empty">${icon(ic)}<div>${t}</div></div>`;
export const areaBadge = a => `<span class="badge" style="background:${a.color}18;color:${a.color};border:1px solid ${a.color}30">${icon(a.icon)}${esc(a.name)}</span>`;
export const monthOpts = sel => MONTHS_L.map((n, i) => `<option value="${i}" ${i === sel ? 'selected' : ''}>${n}</option>`).join('');

export const chipsArea = (cur, act) => `<div class="chips">
  <button class="chip ${cur === 'all' ? 'active' : ''}" data-act="${act}" data-v="all">Todas</button>
  ${DB.areas.map(a => `<button class="chip ${cur === a.id ? 'active' : ''}" data-act="${act}" data-v="${a.id}"><span class="dot" style="background:${a.color}"></span>${esc(a.name)}</button>`).join('')}
</div>`;

export const chipsUnit = (a, cur, act) => hasUnits(a) ? `<div class="field">${esc(ulabel(a))}<div class="chips">
  <button class="chip ${cur === 'all' ? 'active' : ''}" data-act="${act}" data-v="all">Todas</button>
  ${a.units.map(u => `<button class="chip ${cur === u.id ? 'active' : ''}" data-act="${act}" data-v="${u.id}">${esc(u.name)}</button>`).join('')}
</div></div>` : '';

export const pill = s => `<span class="pill ${s}">${SL[s]}</span>`;
export const fmtI = (i, v) => fmt(v, i.dec ?? 1);
export const unitTxt = (i, v) => v == null ? '—' : fmtI(i, v) + (i.unit ? ' ' + esc(i.unit) : '');
export const dirSym = i => i.dir === 'up' ? '≥ ' : '≤ ';

export function complPct(specs, y, m) {
  let ok = 0, n = 0;
  specs.forEach(([i, u]) => {
    const s = S(i, u, y);
    const st = status(i, s.v[m], s.t[m]).s;
    if (st !== 'na') { n++; if (st === 'ok') ok++; }
  });
  return n ? (ok / n * 100) : null;
}

export const pctCol = p => p == null ? '#94a3b8' : p >= 80 ? '#10b981' : p >= 50 ? '#f59e0b' : '#ef4444';
export const unitsWord = a => ulabel(a) === 'Logística' ? 'logísticas' : 'plantas';

export function groups(areaSel, unitSel) {
  const out = [];
  DB.areas.filter(a => areaSel === 'all' || a.id === areaSel).forEach(a => {
    const inds = DB.indicators.filter(i => i.areaId === a.id);
    if (!inds.length) return;
    unitsOf(a).filter(u => !hasUnits(a) || unitSel === 'all' || areaSel === 'all' || u.id === unitSel).forEach(u => {
      out.push({ a, u, inds });
    });
  });
  return out;
}

export const grpRow = (g, cols) => `<tr class="grp"><td colspan="${cols}"><span style="color:${g.a.color}">●</span> ${esc(g.a.name)}${hasUnits(g.a) ? ' · ' + esc(g.u.name) : ''}</td></tr>`;

/* ============ Tendencias analíticas ============ */
export function trendInfo(ind, vals) {
  const pts = [];
  vals.forEach((v, i) => { if (v != null) pts.push([i, v]); });
  const l = pts.slice(-6);
  if (l.length < 3) return null;
  const n = l.length;
  let sx = 0, sy = 0, sxy = 0, sxx = 0;
  l.forEach(([x, y]) => { sx += x; sy += y; sxy += x * y; sxx += x * x; });
  const den = n * sxx - sx * sx;
  if (!den) return null;
  const slope = (n * sxy - sx * sy) / den;
  const icp = (sy - slope * sx) / n;
  const mean = l.reduce((a, p) => a + Math.abs(p[1]), 0) / n || 1;
  const rel = slope / mean * 100;
  const fav = ind.dir === 'up' ? slope : -slope;
  const label = Math.abs(rel) < 0.5 ? 'Estable' : (fav > 0 ? 'Mejorando' : 'Deteriorando');
  let proj = icp + slope * (l[l.length - 1][0] + 1);
  if (proj < 0) proj = 0;
  if (ind.unit === '%' && proj > 100) proj = 100;
  return { slope, label, proj };
}

export const trendHtml = ti => ti ? `<span class="delta ${ti.label === 'Mejorando' ? 'good' : ti.label === 'Deteriorando' ? 'badc' : 'flat'}">${icon(ti.label === 'Estable' ? 'flat' : ti.slope > 0 ? 'up' : 'down')}${ti.label}</span>` : '<span class="small" style="color:var(--text-muted)">—</span>';

export function monthsLabel(ms, long) {
  const a = ms.slice().sort((x, y) => x - y);
  if (!a.length) return 'Sin meses';
  if (a.length === 12) return 'Todo el año';
  const N = long ? MONTHS_L : MONTHS, runs = [];
  let s = a[0], p = a[0];
  for (let i = 1; i <= a.length; i++) {
    if (a[i] === p + 1) { p = a[i]; continue; }
    runs.push(s === p ? N[s] : (p === s + 1 ? N[s] + ', ' + N[p] : N[s] + '–' + N[p]));
    s = p = a[i];
  }
  return runs.join(', ');
}

/* ============ VISTA 1: DASHBOARD / TABLERO ============ */
const indMetaTxt = (i, yt, s) => i.agg === 'sum'
  ? `a la fecha ${fmtI(i, yt.t)} · anual ${fmtI(i, s.ta)}`
  : `anual ${dirSym(i)}${fmtI(i, s.ta)}`;

export function iCard(i, u, y, to) {
  const { s, yt, st } = accum(i, u, y, 0, to);
  const lbl = i.agg === 'sum' ? 'Acum.' : 'Prom.';
  return `<div class="icard ${st.s}" data-act="goAna" data-id="${i.id}" data-u="${u}" data-tip="${esc(`<b>${i.name}</b>${hasUnits(areaOf(i.areaId)) ? ' · General' : ''}<br>${lbl} Ene–${MONTHS[to]}: ${unitTxt(i, yt.v)}<br>Meta ${indMetaTxt(i, yt, s)}<br>${yt.n} meses medidos · ${SL[st.s]}`)}">
    <div class="nm">${esc(i.name)}</div>
    <div class="small" style="font-size:10.5px;margin-top:auto;color:var(--text-muted)">${lbl} Ene–${MONTHS[to]}</div>
    <div class="vl" style="margin-top:2px">${yt.v == null ? '—' : fmtI(i, yt.v)}<small>${esc(i.unit)}</small></div>
    <div class="mt2">Meta ${i.agg === 'sum' ? 'a la fecha' : 'anual'} <b>${dirSym(i)}${fmtI(i, i.agg === 'sum' ? yt.t : s.ta)}</b></div>
    <div class="ft">${pill(st.s)}<span class="small" style="color:var(--text-muted)">${yt.n} m</span></div>
  </div>`;
}

export function viewDash() {
  const y = UI.year, m = UI.month, D = UI.dash;
  if (!DB.indicators.length) {
    return `<div class="card">${emptyMsg('list', 'Aún no hay indicadores registrados. Puedes crearlos en el Catálogo o importar una plantilla Excel.')}</div>`;
  }
  const inds = DB.indicators.filter(i => D.area === 'all' || i.areaId === D.area);
  const c = { ok: 0, warn: 0, bad: 0, na: 0 };
  inds.forEach(i => c[accum(i, 'all', y, 0, m).st.s]++);
  const T = inds.length || 1;

  const stat = (k, ic, l) => `<div class="card"><div class="stat"><div class="bubble bg-${k}">${icon(ic)}</div><div><div class="num">${c[k]}</div><div class="lbl">${l} · ${fmt(c[k] / T * 100, 0)}%</div></div></div></div>`;

  const cards = DB.areas.map(a => {
    const ai = DB.indicators.filter(i => i.areaId === a.id);
    const cc = { ok: 0, warn: 0, bad: 0, na: 0 };
    ai.forEach(i => cc[accum(i, 'all', y, 0, m).st.s]++);
    const meas = cc.ok + cc.warn + cc.bad;
    const pct = meas ? cc.ok / meas * 100 : null;
    const n = ai.length || 1;
    return `<div class="card areacard ${D.area === a.id ? 'active' : ''}" data-act="dashArea" data-v="${D.area === a.id ? 'all' : a.id}">
      <div class="head">
        <div class="ico" style="background:${a.color}15;color:${a.color}">${icon(a.icon)}</div>
        <div>
          <b style="font-size:14.5px">${esc(a.name)}</b>
          <div class="small" style="color:var(--text-muted)">${ai.length} indicadores${hasUnits(a) ? ' · ' + a.units.length + ' ' + unitsWord(a) : ''}</div>
        </div>
        <div class="pct" style="color:${a.color}">${pct == null ? '—' : fmt(pct, 0) + '%'}</div>
      </div>
      <div class="stack">
        <i style="width:${cc.ok / n * 100}%;background:var(--ok)"></i>
        <i style="width:${cc.warn / n * 100}%;background:var(--warn)"></i>
        <i style="width:${cc.bad / n * 100}%;background:var(--bad)"></i>
      </div>
      <div class="uline">
        <span><b>${cc.ok}</b> cumplen</span>
        <span><b>${cc.warn}</b> en riesgo</span>
        <span><b>${cc.bad}</b> no cumplen</span>
      </div>
    </div>`;
  }).join('');

  const secs = [];
  DB.areas.filter(a => D.area === 'all' || a.id === D.area).forEach(a => {
    const ai = DB.indicators.filter(i => i.areaId === a.id);
    if (!ai.length) return;
    const cc = { ok: 0, warn: 0, bad: 0 };
    ai.forEach(i => {
      const s = accum(i, 'all', y, 0, m).st.s;
      if (cc[s] != null) cc[s]++;
    });
    secs.push(`<div class="asec">
      <div class="ah">
        <div class="ico" style="background:${a.color}18;color:${a.color}">${icon(a.icon)}</div>
        ${esc(a.name)}${hasUnits(a) ? ` <span style="color:var(--text-muted);font-weight:500">· General (${a.units.length} ${unitsWord(a)})</span>` : ''}
        <div class="cnt">
          <span><i style="background:var(--ok)"></i>${cc.ok}</span>
          <span><i style="background:var(--warn)"></i>${cc.warn}</span>
          <span><i style="background:var(--bad)"></i>${cc.bad}</span>
        </div>
      </div>
      <div class="icards">${ai.map(i => iCard(i, 'all', y, m)).join('')}</div>
    </div>`);
  });

  return `
  <div class="toolbar" style="display:flex;gap:14px;align-items:flex-end;flex-wrap:wrap;margin-bottom:18px">
    <label class="field">Acumulado hasta<select data-bind="month">${monthOpts(m)}</select></label>
    <div class="field">Filtrar por Área${chipsArea(D.area, 'dashArea')}</div>
    <div class="hint" style="margin-left:auto;font-size:12px;color:var(--text-muted);display:flex;align-items:center;gap:6px">
      ${icon('info')} Datos consolidados por promedio o suma ponderada según la unidad
    </div>
  </div>
  <div class="grid g4">${stat('ok', 'check', 'Cumplen meta')}${stat('warn', 'alert', 'En riesgo (tolerancia)')}${stat('bad', 'x', 'Fuera de meta')}${stat('na', 'clock', 'Sin datos')}</div>
  <div class="grid mt" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr))">${cards}</div>
  ${secs.join('')}`;
}

/* ============ CONTEXTO DE FILTROS ============ */
export function anaCtx() {
  const f = UI.f;
  if (f.ind !== 'all' && !indById(f.ind)) f.ind = 'all';
  if (f.area !== 'all' && !DB.areas.some(a => a.id === f.area)) f.area = 'all';
  if (!f.months.length) f.months = ALLM.slice();
  f.cmpY = f.cmpY.filter(y => y !== UI.year);
  const ind = f.ind !== 'all' ? indById(f.ind) : null;
  const unitArea = f.area !== 'all' ? areaOf(f.area) : (ind ? areaOf(ind.areaId) : null);
  if (!(unitArea && hasUnits(unitArea)) || (f.unit !== 'all' && !unitArea.units.some(u => u.id === f.unit))) {
    f.unit = 'all';
  }
  const ms = f.months.slice().sort((a, b) => a - b);
  return { f, ind, area: f.area, unitArea, uSel: f.unit, ms, per: monthsLabel(ms), perL: monthsLabel(ms, true) };
}

export function tableInds(C) {
  return DB.indicators.filter(i => C.area === 'all' || i.areaId === C.area);
}

export function scopePairs(C) {
  const out = [];
  DB.areas.filter(a => C.area === 'all' || a.id === C.area).forEach(a => {
    if (C.ind && C.ind.areaId !== a.id) return;
    if (!DB.indicators.some(i => i.areaId === a.id)) return;
    unitsOf(a).forEach(u => {
      if (C.uSel !== 'all' && hasUnits(a) && u.id !== C.uSel) return;
      out.push({ a, u });
    });
  });
  return out;
}

export function plansFor(C) {
  const { f, area, uSel } = C, y = UI.year;
  return DB.plans.filter(p => {
    const i = indById(p.ind);
    if (!i || p.y !== y || !f.months.includes(p.m)) return false;
    if (area !== 'all' && i.areaId !== area) return false;
    if (f.ind !== 'all' && p.ind !== f.ind) return false;
    if (uSel !== 'all' && hasUnits(areaOf(i.areaId)) && p.u !== uSel) return false;
    return true;
  });
}

export function planCounts(ps) {
  const c = { n: ps.length, abierto: 0, curso: 0, cerrado: 0, vencido: 0 };
  ps.forEach(p => {
    c[p.estado]++;
    if (isLate(p)) c.vencido++;
  });
  return c;
}

export function missingPlans(C) {
  const y = UI.year;
  let n = 0;
  const inds = C.ind ? [C.ind] : tableInds(C);
  inds.forEach(i => unitIds(i, C.uSel).forEach(u => C.ms.forEach(m => {
    const v = getVal(SK(i.id, u), y, m);
    if (status(i, v, tM(i, u, y, m)).s === 'bad' && !DB.plans.some(p => p.ind === i.id && p.u === u && p.y === y && p.m === m)) {
      n++;
    }
  })));
  return n;
}

const QUICK = [
  ['all', 'Todo el año', ALLM],
  ['ytd', 'Año a la fecha', null],
  ['t1', 'T1 (Ene-Mar)', [0, 1, 2]],
  ['t2', 'T2 (Abr-Jun)', [3, 4, 5]],
  ['t3', 'T3 (Jul-Sep)', [6, 7, 8]],
  ['t4', 'T4 (Oct-Dic)', [9, 10, 11]],
  ['s1', '1.er Semestre', [0, 1, 2, 3, 4, 5]],
  ['s2', '2.º Semestre', [6, 7, 8, 9, 10, 11]]
];
const sameSet = (a, b) => a.length === b.length && a.every(x => b.includes(x));
function quickList(k) {
  const q = QUICK.find(x => x[0] === k);
  if (!q) return null;
  if (q[2]) return q[2];
  const L = lastDataMonth(UI.year);
  return Array.from({ length: Math.max(1, L + 1) }, (_, i) => i);
}

export function ddMonths(C) {
  const f = C.f;
  return `<div class="field">Meses evaluados<div class="ms-dd ${UI.dd === 'm' ? 'open' : ''}">
    <button class="ms-btn" data-act="dd" data-v="m">${icon('cal')}<span>${esc(C.per)}</span>${icon('chev')}</button>
    <div class="ms-pop">
      <div class="ms-t">Periodos Rápidos</div>
      <div class="ms-q">${QUICK.map(([k, l]) => `<button class="chip ${sameSet(quickList(k), f.months) ? 'active' : ''}" data-act="mQuick" data-v="${k}">${l}</button>`).join('')}</div>
      <div class="ms-t">Selección individual</div>
      <div class="ms-g">${MONTHS.map((n, i) => `<button class="ms-m ${f.months.includes(i) ? 'on' : ''}" data-act="mTog" data-v="${i}">${n}</button>`).join('')}</div>
      <div class="ms-f"><span class="small" style="color:var(--text-muted)">${f.months.length} mes(es) seleccionados</span><button class="btn sm primary" data-act="ddClose">Listo</button></div>
    </div>
  </div></div>`;
}

export function ddYears(C) {
  const ys = dataYears().filter(y => y !== UI.year);
  const sel = C.f.cmpY.slice().sort((a, b) => b - a);
  return `<div class="field">Comparativo histórico<div class="ms-dd ${UI.dd === 'y' ? 'open' : ''}">
    <button class="ms-btn ${sel.length ? 'has' : ''}" data-act="dd" data-v="y">${icon('layers')}<span>${sel.length ? sel.join(', ') : 'Ningún año'}</span>${icon('chev')}</button>
    <div class="ms-pop" style="width:240px">
      <div class="ms-t">Años a contrastar</div>
      ${ys.length ? `<div class="ms-g" style="grid-template-columns:repeat(3,1fr)">${ys.map(y => `<button class="ms-m ${sel.includes(y) ? 'on' : ''}" data-act="yTog" data-v="${y}">${y}</button>`).join('')}</div>` : '<div class="small" style="color:var(--text-muted)">No hay otros años con datos</div>'}
      <div class="ms-f"><button class="btn sm ghost" data-act="yNone">Ninguno</button><button class="btn sm primary" data-act="ddClose">Listo</button></div>
    </div>
  </div></div>`;
}

export function filterBar(C, withCmp) {
  const { f, ind, unitArea } = C;
  const indOpts = `<option value="all">Todos los indicadores</option>` + DB.areas.filter(a => C.area === 'all' || a.id === C.area).map(a =>
    `<optgroup label="${esc(a.name)}">${DB.indicators.filter(i => i.areaId === a.id).map(i => `<option value="${i.id}" ${ind && i.id === ind.id ? 'selected' : ''}>${esc(i.name)}</option>`).join('')}</optgroup>`
  ).join('');
  const uOk = unitArea && hasUnits(unitArea);

  return `<div class="card filters">
    <span class="hint" style="color:var(--primary)">${icon('filter')}</span>
    <label class="field">Área<select data-bind="fArea"><option value="all">Todas las áreas</option>${DB.areas.map(a => `<option value="${a.id}" ${a.id === C.area ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label>
    <label class="field">${uOk ? esc(ulabel(unitArea)) : 'Planta / Logística'}<select data-bind="fUnit" ${uOk ? '' : 'disabled'}>${uOk ? `<option value="all">Todas</option>${unitArea.units.map(u => `<option value="${u.id}" ${u.id === f.unit ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}` : '<option>No aplica división</option>'}</select></label>
    <label class="field grow">Indicador<select data-bind="fInd">${indOpts}</select></label>
    <span class="fsep"></span>
    <label class="field">Año<select data-bind="year" class="ysel">${availableYears().map(a => `<option ${a === UI.year ? 'selected' : ''}>${a}</option>`).join('')}</select></label>
    ${ddMonths(C)}${withCmp ? ddYears(C) : ''}
    <button class="btn ghost" data-act="fReset" title="Limpiar filtros">${icon('refresh')} Limpiar</button>
  </div>`;
}

/* ============ VISTA 2: ANÁLISIS Y TENDENCIAS ============ */
export function viewAna() {
  if (!DB.indicators.length) return `<div class="card">${emptyMsg('list', 'Aún no hay indicadores.')}</div>`;
  const C = anaCtx();
  const { f, ind, unitArea } = C;
  const y = UI.year;
  const uOk = unitArea && hasUnits(unitArea);
  const filt = filterBar(C, true);
  const allP = plansFor(Object.assign({}, C, { f: Object.assign({}, f, { ind: 'all' }) }));

  const rows = tableInds(C).map(i => {
    const { s, yt, st } = accum(i, C.uSel, y, C.ms);
    let L = -1;
    C.ms.forEach(m => { if (s.v[m] != null) L = m; });
    const ok = C.ms.filter(m => status(i, s.v[m], s.t[m]).s === 'ok').length;
    const n = C.ms.filter(m => s.v[m] != null).length;
    return {
      i, s, yt, st, L, ok, n,
      np: allP.filter(p => p.ind === i.id).length,
      ti: trendInfo(i, C.ms.map(m => s.v[m]))
    };
  });

  const vis = rows.filter(r => f.ist === 'all' || r.st.s === f.ist)
    .sort((a, b) => (a.n ? a.ok / a.n : 2) - (b.n ? b.ok / b.n : 2));

  const c = { ok: 0, warn: 0, bad: 0, na: 0 };
  rows.forEach(r => c[r.st.s]++);
  const T = rows.length || 1;

  const statusCards = `<div class="grid g4">${[
    ['ok', 'check', 'Cumplen'],
    ['warn', 'alert', 'En riesgo'],
    ['bad', 'x', 'No cumplen'],
    ['na', 'clock', 'Sin dato']
  ].map(([k, ic, l]) => `
    <div class="card pcard ${f.ist === k ? 'active' : ''}" data-act="ist" data-v="${k}" title="Filtrar tabla">
      <div class="stat"><div class="bubble bg-${k}">${icon(ic)}</div><div><div class="num">${c[k]}</div><div class="lbl">${l} · ${fmt(c[k] / T * 100, 0)}%</div></div></div>
    </div>`).join('')}</div>`;

  const table = `<div class="card mt">
    <div class="card-header">
      <div>
        <h3>${icon('list')} Desempeño Operativo por Indicador</h3>
        <p class="sub">${esc(C.per)} ${y}${uOk ? ' · ' + esc(unitName(unitArea, C.uSel)) : ''}${f.ist !== 'all' ? ' · ' + SL[f.ist] : ''}</p>
      </div>
      <span class="small" style="color:var(--text-muted)">
        Clic en una fila para desplegar gráfico · Clic en causas para ver planes ${ind ? `· <a href="#" data-act="clearInd" style="color:var(--primary);font-weight:600">Ver gráfico consolidado</a>` : ''}
      </span>
    </div>
    ${vis.length ? `<div class="tbl-wrap" style="max-height:440px"><table class="tbl">
      <thead><tr>
        <th>Indicador</th>
        <th>Área</th>
        <th class="num">Último real</th>
        <th class="num">Meta mes</th>
        <th class="num">Acumulado</th>
        <th class="num">Meta anual</th>
        <th>Estado acum.</th>
        <th class="num">En meta</th>
        <th>Tendencia</th>
        <th class="c">Planes</th>
      </tr></thead>
      <tbody>
      ${vis.map(r => `<tr class="click ${ind && ind.id === r.i.id ? 'sel' : ''}" data-act="pickInd" data-id="${r.i.id}">
        <td class="name" style="min-width:200px"><b>${esc(r.i.name)}</b></td>
        <td>${areaBadge(areaOf(r.i.areaId))}</td>
        <td class="num"><b>${r.L >= 0 ? unitTxt(r.i, r.s.v[r.L]) : '—'}</b> ${r.L >= 0 ? `<span class="small" style="color:var(--text-muted)">${MONTHS[r.L]}</span>` : ''}</td>
        <td class="num small" style="color:var(--text-muted)">${r.L >= 0 ? fmtI(r.i, r.s.t[r.L]) : '—'}</td>
        <td class="num"><b>${fmtI(r.i, r.yt.v)}</b></td>
        <td class="num small" style="color:var(--text-muted)">${fmtI(r.i, r.s.ta)}</td>
        <td>${pill(r.st.s)}</td>
        <td class="num">${r.ok}/${r.n}</td>
        <td>${trendHtml(r.ti)}</td>
        <td class="c"><span class="sc ${r.np ? 'pri' : 'na'}" style="cursor:pointer" data-act="causeModal" data-id="${r.i.id}" title="Ver causas y planes">${r.np || '+'}</span></td>
      </tr>`).join('')}
      </tbody>
    </table></div>` : emptyMsg('filter', 'Ningún indicador coincide con este filtro de estado.')}
  </div>`;

  return filt + statusCards + table + (ind ? trendDetail(C) : trendGeneral(C, rows));
}

const CMPS = [['none', 'Solo selección'], ['units', 'Por plantas / logísticas'], ['areas', 'Por áreas']];
function cmpOpts(C, general) {
  const uA = C.ind ? areaOf(C.ind.areaId) : (C.area !== 'all' ? areaOf(C.area) : null);
  return CMPS.filter(([k]) => k === 'units' ? (uA && hasUnits(uA) && C.uSel === 'all') : k === 'areas' ? (general && C.area === 'all') : true);
}
function cmpSel(C, general) {
  const o = cmpOpts(C, general);
  return !o.some(x => x[0] === UI.cmpMode) ? 'none' : UI.cmpMode;
}
function cmpBar(C, general) {
  const o = cmpOpts(C, general);
  if (o.length < 2) return '';
  const cur = cmpSel(C, general);
  return `<div class="chips">${o.map(([k, l]) => `<button class="chip ${cur === k ? 'active' : ''}" data-act="cmpMode" data-v="${k}">${l}</button>`).join('')}</div>`;
}

function scopeBanner(C) {
  const uA = C.ind ? areaOf(C.ind.areaId) : (C.area !== 'all' ? areaOf(C.area) : null);
  let html = !uA
    ? `<span class="scope all">${icon('layers')}Consolidado General (Todas las Áreas)</span>`
    : (hasUnits(uA) && C.uSel === 'all'
        ? `<span class="scope all">${icon('layers')}${esc(uA.name)} · Consolidado ${unitsWord(uA)}</span>`
        : (hasUnits(uA)
            ? `<span class="scope one">${icon(uA.icon)}${esc(uA.name)} · ${esc(unitName(uA, C.uSel))}</span>`
            : `<span class="scope one">${icon(uA.icon)}${esc(uA.name)}</span>`));
  const cy = C.f.cmpY.slice().sort((a, b) => b - a);
  return html + `<span class="scope per">${icon('cal')}${esc(C.per)} ${UI.year}</span>` + (cy.length ? `<span class="scope per">${icon('layers')}vs ${cy.join(', ')}</span>` : '');
}

const cmpYears = C => C.f.cmpY.slice().sort((a, b) => b - a);

function trendGeneral(C, rows) {
  const { area, uSel, ms } = C, y = UI.year, inds = tableInds(C);
  const SR = [];
  const add = (name, color, specs, main) => SR.push({
    name, color, vals: ms.map(k => complPct(specs, y, k)),
    fill: main, w: main ? 2.8 : 1.7, dash: !main, nopts: !main
  });
  add('Cumplimiento ' + y, '#3b82f6', inds.map(i => [i, uSel]), true);

  cmpYears(C).forEach((yy, ix) => SR.push({
    name: 'Real ' + yy, color: YCOL[ix % YCOL.length],
    vals: ms.map(k => complPct(inds.map(i => [i, uSel]), yy, k)),
    dash: true, nopts: true, w: 1.8
  }));

  const cm = cmpSel(C, true);
  if (cm === 'areas') DB.areas.forEach(a => add(a.name, a.color, DB.indicators.filter(i => i.areaId === a.id).map(i => [i, 'all'])));
  if (cm === 'units') areaOf(area).units.forEach((u, ix) => add(u.name, UCOL[(ix + 1) % UCOL.length], inds.map(i => [i, u.id])));

  const low = rows.slice().sort((a, b) => (a.n ? a.ok / a.n : 2) - (b.n ? b.ok / b.n : 2)).slice(0, 4);
  const avg = v => {
    const a = v.filter(x => x != null);
    return a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
  };
  const cur = avg(SR[0].vals);
  const yIns = cmpYears(C).map(yy => {
    const o = avg(ms.map(k => complPct(inds.map(i => [i, uSel]), yy, k)));
    if (cur == null || o == null) return '';
    const d = cur - o;
    return `<div style="display:flex;gap:10px;margin-bottom:8px;font-size:12.5px"><span style="width:8px;height:8px;border-radius:50%;margin-top:6px;background:${Math.abs(d) < 1 ? '#94a3b8' : d > 0 ? '#10b981' : '#ef4444'}"></span><div>Frente a <b>${yy}</b>: Cumplimiento promedio <b>${fmt(cur, 0)}%</b> vs ${fmt(o, 0)}% (<b>${Math.abs(d) < 1 ? 'estable' : d > 0 ? '+' + fmt(d, 0) + ' pts' : fmt(d, 0) + ' pts'}</b>).</div></div>`;
  }).join('');

  return `<div class="grid g21 mt">
    <div class="card">
      <div class="scopebar">${scopeBanner(C)}</div>
      <div class="card-header">
        <h3>${icon('trend')} Tendencia de Cumplimiento Global (%)</h3>
        <span class="meta">${cmpBar(C, true)}</span>
      </div>
      <p class="sub" style="margin-bottom:12px;color:var(--text-secondary)">Porcentaje de indicadores que cumplieron la meta en cada mes del periodo seleccionado</p>
      ${lineChart({ labels: ms.map(m => MONTHS[m]), series: SR, fmtV: v => fmt(v, 0) + '%', H: 220 })}
      <div class="leg">${SR.map(s => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>
    </div>
    <div class="card">
      <h3>${icon('info')} Diagnóstico del Periodo</h3>
      <p class="sub" style="color:var(--text-secondary);margin-bottom:14px">Indicadores con mayor atención en <b>${esc(C.perL)} ${y}</b></p>
      ${yIns}
      ${low.map(r => `<div style="display:flex;gap:10px;margin-bottom:10px;font-size:12.5px">
        <span style="width:8px;height:8px;border-radius:50%;margin-top:6px;background:${pctCol(r.n ? r.ok / r.n * 100 : null)};flex-shrink:0"></span>
        <div><b>${esc(r.i.name)}</b> cumplió ${r.ok} de ${r.n} meses${r.ti ? ` · ${r.ti.label.toLowerCase()}` : ''}${r.np ? ` · ${r.np} plan(es)` : ''}.</div>
      </div>`).join('') || emptyMsg('info', 'Sin datos para análisis')}
    </div>
  </div>`;
}

function trendDetail(C) {
  const { ind, uSel, ms } = C, y = UI.year, a = areaOf(ind.areaId), s = S(ind, uSel, y);
  const sts = ms.map(m => status(ind, s.v[m], s.t[m]));
  const SR = [
    { name: 'Real ' + y, color: a.color, vals: ms.map(m => s.v[m]), fill: true, ptColors: sts.map(x => stColor[x.s]) },
    { name: 'Meta mes', color: '#10b981', vals: ms.map(m => s.t[m]), dash: true, w: 1.8 }
  ];

  cmpYears(C).forEach((yy, ix) => SR.push({
    name: 'Real ' + yy, color: YCOL[ix % YCOL.length],
    vals: ms.map(m => S(ind, uSel, yy).v[m]),
    dash: true, nopts: true, w: 1.8
  }));

  if (cmpSel(C, false) === 'units') {
    a.units.forEach((u, ix) => SR.push({
      name: u.name, color: UCOL[(ix + 1) % UCOL.length],
      vals: ms.map(m => S(ind, u.id, y).v[m]),
      dash: true, nopts: true, w: 1.5
    }));
  }

  const ins = [];
  const L = ms.filter(m => s.v[m] != null).pop();
  if (L != null) {
    const st = status(ind, s.v[L], s.t[L]);
    ins.push([stColor[st.s], `En <b>${MONTHS_L[L]}</b>: Real ${unitTxt(ind, s.v[L])} vs Meta ${dirSym(ind)}${fmtI(ind, s.t[L])} (${SL[st.s].toLowerCase()}).`]);
  }
  const ti = trendInfo(ind, ms.map(m => s.v[m]));
  if (ti) {
    ins.push([ti.label === 'Mejorando' ? '#10b981' : ti.label === 'Deteriorando' ? '#ef4444' : '#94a3b8', `Tendencia observada: <b>${ti.label.toLowerCase()}</b>. Proyección próximo mes: <b>${unitTxt(ind, ti.proj)}</b>.`]);
  }

  return `<div class="card mt">
    <div class="scopebar">${scopeBanner(C)}</div>
    <div class="card-header">
      <h3>${icon('trend')} Comportamiento Temporal: ${esc(ind.name)}</h3>
      <span class="meta">${cmpBar(C, false)}</span>
    </div>
    <div class="grid g21">
      <div>
        ${lineChart({ labels: ms.map(m => MONTHS[m]), series: SR, fmtV: v => fmt(v, ind.dec ?? 1) + (ind.unit === '%' ? '%' : ''), H: 240 })}
        <div class="leg">${SR.map(x => `<span><i style="background:${x.color}"></i>${esc(x.name)}</span>`).join('')}</div>
      </div>
      <div>
        <h4 style="font-size:13px;font-weight:700;margin-bottom:8px">Hallazgos y Proyecciones</h4>
        ${ins.map(x => `<div style="display:flex;gap:10px;margin-bottom:10px;font-size:12.5px">
          <span style="width:8px;height:8px;border-radius:50%;margin-top:6px;background:${x[0]};flex-shrink:0"></span>
          <div>${x[1]}</div>
        </div>`).join('')}
      </div>
    </div>
  </div>`;
}

/* ============ VISTA 3: CAUSAS Y PLANES DE ACCIÓN ============ */
export function viewPlan() {
  if (!DB.indicators.length) return `<div class="card">${emptyMsg('list', 'Aún no hay indicadores.')}</div>`;
  const C = anaCtx();
  return filterBar(C, false) +
    `<div id="planStats" style="margin-bottom:16px">${planStatsHtml(C)}</div>
     <div id="planCharts">${planChartsHtml(C)}</div>
     <div id="planSum">${planSumHtml(C)}</div>
     <div class="mt"></div>` +
    plansPanel(C);
}

export function planStatsHtml(C) {
  const ps = plansFor(C), c = planCounts(ps), f = C.f, miss = missingPlans(C);
  const card = (k, ic, bub, num, lbl, foot) => `
    <div class="card pcard ${k ? '' : 'static'} ${k && f.pst === k ? 'active' : ''}" ${k ? `data-act="pst" data-v="${k}"` : ''}>
      <div class="stat"><div class="bubble ${bub}">${icon(ic)}</div><div><div class="num">${num}</div><div class="lbl">${lbl}</div></div></div>
      ${foot ? `<div class="foot">${foot}</div>` : ''}
    </div>`;
  const nU = new Set(ps.map(p => p.u + '|' + indById(p.ind).areaId)).size;
  return `<div class="grid g6">
    ${card('all', 'tool', 'bg-pri', c.n, 'Planes Registrados', `En ${nU} sede(s)/unidad(es)`)}
    ${card('abierto', 'flag', 'bg-pri', c.abierto, 'Abiertos', c.n ? fmt(c.abierto / c.n * 100, 0) + '% del total' : '')}
    ${card('curso', 'play', 'bg-warn', c.curso, 'En Ejecución', c.n ? fmt(c.curso / c.n * 100, 0) + '% del total' : '')}
    ${card('vencido', 'alert', 'bg-bad', c.vencido, 'Vencidos', 'Fecha límite superada')}
    ${card('cerrado', 'check', 'bg-ok', c.cerrado, 'Cerrados', c.n ? 'Tasa ' + fmt(c.cerrado / c.n * 100, 0) + '%' : '')}
    ${card('', 'x', miss ? 'bg-bad' : 'bg-na', miss, 'Meses sin plan', 'Incumplimientos sin causa')}
  </div>`;
}

export function planChartsHtml(C) {
  const ps = plansFor(C), ms = C.ms;
  const pKey = p => p.estado === 'cerrado' ? 'cerrado' : isLate(p) ? 'vencido' : p.estado;
  const byM = ms.map(m => {
    const d = { cerrado: 0, curso: 0, abierto: 0, vencido: 0 };
    ps.filter(p => p.m === m).forEach(p => d[pKey(p)]++);
    return d;
  });

  const cz = {};
  ps.forEach(p => {
    const k = norm(p.causa);
    cz[k] = cz[k] || { t: p.causa, n: 0, o: 0 };
    cz[k].n++;
    if (p.estado !== 'cerrado') cz[k].o++;
  });
  const top = Object.values(cz).sort((a, b) => b.n - a.n).slice(0, 5);
  const tmx = top.length ? top[0].n : 1;

  const PCOL = { cerrado: '#10b981', curso: '#f59e0b', abierto: '#3b82f6', vencido: '#ef4444' };
  const leg = `<div class="leg">${[['cerrado', 'Cerrados'], ['curso', 'En curso'], ['abierto', 'Abiertos'], ['vencido', 'Vencidos']].map(([k, l]) => `<span><i style="background:${PCOL[k]}"></i>${l}</span>`).join('')}</div>`;

  return `<div class="grid g2 mb">
    <div class="card">
      <h3>${icon('bar')} Distribución de Planes por Mes y Estado</h3>
      <p class="sub" style="color:var(--text-secondary);margin-bottom:12px">Evolución mensual de causas generadas y su estado</p>
      ${ps.length ? stackBars(ms.map(m => MONTHS[m]), byM, 200) : emptyMsg('bar', 'Sin planes de acción')}
      ${leg}
    </div>
    <div class="card">
      <h3>${icon('alert')} Causas Raíz Más Frecuentes</h3>
      <p class="sub" style="color:var(--text-secondary);margin-bottom:14px">Principales motivos de desvío operativo en el periodo</p>
      ${top.length ? `<div class="hb">${top.map(c => `
        <div class="hbr cz" data-tip="${esc(`${c.n} ocurrencias · ${c.o} sin resolver`)}">
          <span class="hl" style="width:auto;flex:1">${esc(c.t)}</span>
          <span class="ht" style="flex:0 0 80px"><i style="width:${c.n / tmx * 100}%;background:var(--primary)"></i></span>
          <b>${c.n}</b>
        </div>`).join('')}</div>` : emptyMsg('alert', 'Sin causas registradas')}
    </div>
  </div>`;
}

export function planSumHtml(C) {
  const pairs = scopePairs(C);
  if (pairs.length < 2) return '';
  const ps = plansFor(C), ms = C.ms;
  const cellCls = arr => arr.some(isLate) ? 'bad' : arr.every(p => p.estado === 'cerrado') ? 'ok' : arr.some(p => p.estado === 'curso') ? 'warn' : 'pri';

  const rows = pairs.map(({ a, u }) => {
    const mine = ps.filter(p => indById(p.ind).areaId === a.id && p.u === u.id);
    const lbl = hasUnits(a) ? u.name : a.name;
    const cells = ms.map(m => {
      const arr = mine.filter(p => p.m === m);
      return `<td class="c">${arr.length ? `<span class="sc ${cellCls(arr)}" data-act="sumCell" data-a="${a.id}" data-u="${u.id}" data-m="${m}">${arr.length}</span>` : '<span class="sc na">·</span>'}</td>`;
    }).join('');
    const c = planCounts(mine);
    return `<tr>
      <td style="white-space:nowrap"><span style="color:${a.color}">●</span> <b>${esc(lbl)}</b>${hasUnits(a) ? ` <span class="small" style="color:var(--text-muted)">(${esc(a.name)})</span>` : ''}</td>
      ${cells}
      <td class="num"><b>${c.n}</b></td>
      <td class="num small">${c.n ? `${c.cerrado}/${c.n}` : '—'}</td>
      <td class="num">${c.vencido ? `<span class="pill bad">${c.vencido}</span>` : '<span class="small" style="color:var(--text-muted)">0</span>'}</td>
    </tr>`;
  }).join('');

  return `<div class="card mb">
    <h3>${icon('grid')} Matriz de Compromisos por Planta / Unidad</h3>
    <p class="sub" style="color:var(--text-secondary);margin-bottom:12px">Haz clic en cualquier celda para filtrar directamente el listado de planes</p>
    <div class="tbl-wrap"><table class="tbl">
      <thead><tr>
        <th>Planta / Logística / Área</th>
        ${ms.map(m => `<th class="c">${MONTHS[m]}</th>`).join('')}
        <th class="num">Total</th><th class="num">Cerrados</th><th class="num">Vencidos</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
  </div>`;
}

export function planRow(p, showInd) {
  const i = indById(p.ind);
  const v = getVal(SK(p.ind, p.u), p.y, p.m);
  const t = tM(i, p.u, p.y, p.m);
  const st = status(i, v, t).s;
  return `<tr data-pid="${p.id}">
    <td style="white-space:nowrap">
      <b>${MONTHS[p.m]}</b>
      <div class="small" style="color:${stColor[st]}" title="Real / Meta">${fmtI(i, v)} / ${fmtI(i, t)}</div>
    </td>
    <td class="small" style="font-weight:600;min-width:110px">${esc(procName(i, p.u))}</td>
    ${showInd ? `<td class="name" style="min-width:140px"><b>${esc(i.name)}</b></td>` : ''}
    <td style="width:22%"><textarea class="ie" data-f="causa" rows="1" placeholder="Descripción de la causa raíz">${esc(p.causa)}</textarea></td>
    <td style="width:22%"><textarea class="ie" data-f="accion" rows="1" placeholder="Acción correctiva planteada">${esc(p.accion)}</textarea></td>
    <td><textarea class="ie" data-f="resp" rows="1" placeholder="Líder">${esc(p.resp)}</textarea></td>
    <td><input type="date" class="ie" data-f="fecha" value="${esc(p.fecha)}">${isLate(p) ? '<span class="lt">Vencido</span>' : ''}</td>
    <td><select class="ie st-sel ${planCls(p)}" data-f="estado">${Object.keys(PST).map(k => `<option value="${k}" ${k === p.estado ? 'selected' : ''}>${PST[k]}</option>`).join('')}</select></td>
    <td style="width:16%"><textarea class="ie cierre" data-f="cierre" rows="1" placeholder="${p.estado === 'cerrado' ? 'Evidencia o resultado del cierre' : '—'}">${esc(p.cierre || '')}</textarea></td>
    <td class="c"><button class="btn sm icon ghost danger" data-act="planDel" data-id="${p.id}" title="Eliminar plan">${icon('trash')}</button></td>
  </tr>`;
}

export function plansPanel(C) {
  const f = C.f;
  const ps = plansFor(C).filter(p => f.pst === 'all' || (f.pst === 'vencido' ? isLate(p) : p.estado === f.pst))
    .sort((a, b) => b.m - a.m || (a.estado === 'cerrado') - (b.estado === 'cerrado'));
  const showInd = !C.ind;

  return `<div class="card">
    <div class="card-header">
      <div>
        <h3>${icon('tool')} Bitácora de Planes y Acciones Correctivas</h3>
        <p class="sub" style="color:var(--text-secondary)">Modifica directamente los campos; los cambios se guardan automáticamente en tu navegador.</p>
      </div>
      <div style="display:flex;gap:12px;align-items:center">
        <span class="savehint" id="saveHint">${icon('edit')} Autoguardado activo</span>
        <button class="btn primary sm" data-act="planNew" data-i="${C.ind ? C.ind.id : ''}" data-u="${C.uSel}" data-m="${C.ms[C.ms.length - 1]}">${icon('plus')} Registrar Plan</button>
      </div>
    </div>
    ${ps.length ? `<div class="tbl-wrap" style="max-height:600px"><table class="tbl">
      <thead><tr>
        <th>Mes</th>
        <th>Planta / Logística</th>
        ${showInd ? '<th>Indicador</th>' : ''}
        <th>Causa Raíz</th>
        <th>Acción Correctiva</th>
        <th>Responsable</th>
        <th>Compromiso</th>
        <th>Estado</th>
        <th>Evidencia Cierre</th>
        <th></th>
      </tr></thead>
      <tbody>${ps.map(p => planRow(p, showInd)).join('')}</tbody>
    </table></div>` : emptyMsg('tool', 'No se encontraron planes para los filtros seleccionados.')}
  </div>`;
}

export function causeModal(id) {
  const C = anaCtx();
  const i = indById(id);
  const CC = Object.assign({}, C, { ind: i, f: Object.assign({}, C.f, { ind: id }) });
  const ps = plansFor(CC).sort((a, b) => b.m - a.m);
  const a = areaOf(i.areaId);

  window.openModal(`
    <div class="card-header" style="margin-bottom:8px">
      <h2>${icon('tool')} Planes de Acción: ${esc(i.name)}</h2>
      <button class="btn icon ghost" data-act="closeModal">${icon('x')}</button>
    </div>
    <div class="ctx">${esc(a.name)}${hasUnits(a) ? ' · ' + esc(unitName(a, C.uSel)) : ''} · Periodo: ${esc(C.per)} ${UI.year}</div>
    ${ps.length ? `<div class="tbl-wrap" style="max-height:55vh"><table class="tbl">
      <thead><tr>
        <th>Mes</th><th>Planta</th><th>Causa</th><th>Acción</th><th>Responsable</th><th>Compromiso</th><th>Estado</th><th>Cierre</th><th></th>
      </tr></thead>
      <tbody>${ps.map(p => planRow(p, false)).join('')}</tbody>
    </table></div>` : emptyMsg('tool', 'Este indicador no tiene causas registradas en el periodo.')}
    <div class="actions">
      <button class="btn" data-act="goPlans" data-id="${id}">${icon('list')} Ver en módulo de Planes</button>
      <button class="btn primary" data-act="planNew" data-i="${id}" data-u="${C.uSel}" data-m="${C.ms[C.ms.length - 1]}">${icon('plus')} Registrar Causa</button>
    </div>`, 'wide');
  $$('#dlg textarea.ie').forEach(fitTA);
}

export const fitTA = el => {
  el.style.height = 'auto';
  el.style.height = (el.scrollHeight + 2) + 'px';
};

export function refreshPlanBits() {
  if (UI.view !== 'plan') return;
  const C = anaCtx();
  const a = $('#planStats'), b = $('#planSum'), c = $('#planCharts');
  if (a) a.innerHTML = planStatsHtml(C);
  if (b) b.innerHTML = planSumHtml(C);
  if (c) c.innerHTML = planChartsHtml(C);
}

/* ============ VISTA 4: CAPTURA MENSUAL ============ */
function planCell(i, u, y, m, st) {
  const n = DB.plans.filter(p => p.ind === i.id && p.u === u && p.y === y && p.m === m).length;
  if (n) return `<button class="btn sm" data-act="capPlans" data-i="${i.id}" data-u="${u}" data-m="${m}">${icon('tool')} ${n} plan(es)</button>`;
  if (st === 'bad' || st === 'warn') return `<button class="btn sm accent" data-act="planNew" data-i="${i.id}" data-u="${u}" data-m="${m}">${icon('plus')} Causa/Plan</button>`;
  return `<button class="btn sm icon ghost" data-act="planNew" data-i="${i.id}" data-u="${u}" data-m="${m}" title="Registrar acción">${icon('plus')}</button>`;
}

export function capRow(i, u, y, m) {
  const sk = SK(i.id, u);
  const v = getVal(sk, y, m);
  const t = tM(i, u, y, m);
  const ta = tA(i, u, y);
  const pv = m > 0 ? getVal(sk, y, m - 1) : getVal(sk, y - 1, 11);
  const st = status(i, v, t).s;

  return `<tr data-i="${i.id}" data-u="${u}">
    <td class="name"><b>${esc(i.name)}</b></td>
    <td class="small" style="color:var(--text-muted)">${esc(i.unit)}</td>
    <td class="num">${t == null ? '—' : dirSym(i) + fmtI(i, t)}</td>
    <td class="num small" style="color:var(--text-muted)">${fmtI(i, ta)}</td>
    <td class="num small" style="color:var(--text-muted)">${fmtI(i, pv)}</td>
    <td><input type="text" inputmode="decimal" class="cap-input" value="${v == null ? '' : String(v).replace('.', ',')}" placeholder="—"></td>
    <td class="st">${pill(st)}</td>
    <td class="pl">${planCell(i, u, y, m, st)}</td>
  </tr>`;
}

export function capProgress() {
  const y = UI.year, m = UI.month;
  let n = 0, d = 0;
  groups(UI.cap.area, UI.cap.unit).forEach(g => g.inds.forEach(i => {
    n++;
    if (getVal(SK(i.id, g.u.id), y, m) != null) d++;
  }));
  return `<div style="display:flex;align-items:center;gap:10px">
    <div class="progress"><i style="width:${n ? (d / n * 100) : 0}%"></i></div>
    <span class="small" style="font-weight:600">${d} de ${n} registrados</span>
  </div>`;
}

export function viewCap() {
  const y = UI.year, m = UI.month, Cp = UI.cap;
  const aSel = Cp.area === 'all' ? null : areaOf(Cp.area);
  const G = groups(Cp.area, Cp.unit);

  return `
  <div class="toolbar" style="display:flex;gap:14px;align-items:flex-end;flex-wrap:wrap;margin-bottom:18px">
    <div class="field">Mes de captura
      <div style="display:flex;gap:6px;align-items:center">
        <button class="btn icon" data-act="capPrev" title="Mes anterior">${icon('left')}</button>
        <select data-bind="month">${monthOpts(m)}</select>
        <button class="btn icon" data-act="capNext" title="Mes siguiente">${icon('right')}</button>
      </div>
    </div>
    <div class="field">Filtrar por Área${chipsArea(Cp.area, 'capArea')}</div>
    ${aSel ? chipsUnit(aSel, Cp.unit, 'capUnit') : ''}
    <div style="margin-left:auto;display:flex;gap:12px;align-items:center">
      <div id="capProg">${capProgress()}</div>
      <button class="btn" data-act="capCopy" title="Copia los datos del mes anterior en celdas vacías">${icon('refresh')} Repetir mes previo</button>
      <button class="btn primary" data-act="capSave">${icon('save')} Guardar Datos</button>
    </div>
  </div>
  <div class="card">
    <div class="card-header">
      <div>
        <h3>${icon('edit')} Hoja de Captura: ${MONTHS_L[m]} ${y}</h3>
        <p class="sub" style="color:var(--text-secondary)">Ingresa el valor real. Presiona Enter para pasar a la siguiente fila. Las causas se asocian si la métrica no cumple.</p>
      </div>
    </div>
    <div class="tbl-wrap"><table class="tbl">
      <thead><tr>
        <th>Indicador</th>
        <th>Unidad</th>
        <th class="num">Meta Mes</th>
        <th class="num">Meta Anual</th>
        <th class="num">Mes Anterior</th>
        <th class="num" style="width:120px">Real Registrado</th>
        <th>Estado</th>
        <th>Causa / Plan</th>
      </tr></thead>
      <tbody id="capBody">
        ${G.map(g => grpRow(g, 8) + g.inds.map(i => capRow(i, g.u.id, y, m)).join('')).join('') || `<tr><td colspan="8">${emptyMsg('list', 'Sin indicadores')}</td></tr>`}
      </tbody>
    </table></div>
  </div>`;
}

/* ============ VISTA 5: METAS ============ */
export function goalRow(i, u, y) {
  const sk = SK(i.id, u);
  const g = DB.goals[sk] && DB.goals[sk][y] || {};
  const a = tA(i, u, y);
  const ph = a == null ? '' : fmtI(i, i.agg === 'sum' ? a / 12 : a);

  return `<tr data-sk="${sk}">
    <td class="name"><b>${esc(i.name)}</b> <span class="small" style="color:var(--text-muted)">(${esc(i.unit)})</span></td>
    <td class="small" style="font-weight:600">${i.dir === 'up' ? '↑ Mayor' : '↓ Menor'}</td>
    <td><input class="goal-in ann" data-k="a" value="${g.a != null ? String(g.a).replace('.', ',') : ''}" placeholder="${i.target == null ? '' : fmtI(i, i.target)}"></td>
    ${MONTHS.map((_, k) => `<td style="padding:6px 3px"><input class="goal-in" data-k="${k}" value="${g.m && g.m[k] != null ? String(g.m[k]).replace('.', ',') : ''}" placeholder="${ph}"></td>`).join('')}
    <td class="c"><button class="btn sm icon ghost" data-act="goalClear" data-sk="${sk}" title="Restablecer metas mensuales al prorrateo">${icon('refresh')}</button></td>
  </tr>`;
}

export function viewGoal() {
  const y = UI.year, Gl = UI.goal;
  const aSel = Gl.area === 'all' ? null : areaOf(Gl.area);
  const G = groups(Gl.area, Gl.unit);

  return `
  <div class="toolbar" style="display:flex;gap:14px;align-items:flex-end;flex-wrap:wrap;margin-bottom:18px">
    <div class="field">Filtrar por Área${chipsArea(Gl.area, 'goalArea')}</div>
    ${aSel ? chipsUnit(aSel, Gl.unit, 'goalUnit') : ''}
    <div class="hint" style="margin-left:auto;font-size:12px;color:var(--text-muted)">
      ${icon('info')} Si dejas un mes vacío, el sistema adoptará la meta anual dividida o prorrateada.
    </div>
  </div>
  <div class="card">
    <div class="card-header">
      <div>
        <h3>${icon('target')} Planificación de Metas para el Año ${y}</h3>
        <p class="sub" style="color:var(--text-secondary)">Ingresa la meta anual y personaliza meses específicos si existe estacionalidad.</p>
      </div>
    </div>
    <div class="tbl-wrap"><table class="tbl">
      <thead><tr>
        <th>Indicador</th>
        <th>Sentido</th>
        <th class="num">Meta Anual</th>
        ${MONTHS.map(x => `<th style="text-align:center;padding:9px 4px">${x}</th>`).join('')}
        <th></th>
      </tr></thead>
      <tbody>${G.map(g => grpRow(g, 16) + g.inds.map(i => goalRow(i, g.u.id, y)).join('')).join('')}</tbody>
    </table></div>
  </div>`;
}

/* ============ VISTA 6: CARGA MASIVA EXCEL ============ */
export function viewBulk() {
  const B = UI.bulk, P = B.prev;
  let ph = '';
  if (P) {
    const c = { ok: 0, new: 0, warn: 0, error: 0 };
    let nv = 0, ng = 0;
    P.items.forEach(it => {
      c[it.status]++;
      if (it.status !== 'error') {
        const k = Object.keys(it.values).length;
        if (it.type === 'val') nv += k;
        else ng += k + (it.ann != null ? 1 : 0);
      }
    });

    const lab = {
      ok: '<span class="pill ok">Válido</span>',
      new: '<span class="pill pri">Crear nuevo</span>',
      warn: '<span class="pill warn">Revisar</span>',
      error: '<span class="pill bad">Error</span>'
    };

    ph = `
    <div class="counts" style="display:flex;gap:16px;margin-bottom:14px;font-size:12.5px;flex-wrap:wrap">
      <span><b>${P.items.length}</b> filas leídas</span>
      <span><b>${nv}</b> mediciones encontradas</span>
      <span><b>${ng}</b> metas identificadas</span>
      <span><b>${c.new}</b> elementos nuevos a crear</span>
      ${c.error ? `<span style="color:var(--bad)"><b>${c.error}</b> con error (serán omitidas)</span>` : ''}
    </div>
    <div class="tbl-wrap" style="max-height:360px"><table class="tbl">
      <thead><tr>
        <th>Hoja</th><th>Fila</th><th>Año</th><th>Área</th><th>Planta / Logística</th><th>Indicador</th><th class="num">Valores</th><th>Validación</th><th>Detalle</th>
      </tr></thead>
      <tbody>${P.items.slice(0, 300).map(it => `
        <tr>
          <td class="small">${esc(it.sheet)}</td>
          <td>${it.row}</td>
          <td>${it.year}</td>
          <td>${esc(it.areaName || '—')}</td>
          <td>${esc(it.plant || '—')}</td>
          <td class="name"><b>${esc(it.indName || '—')}</b></td>
          <td class="num">${Object.keys(it.values).length + (it.type === 'goal' && it.ann != null ? 1 : 0)}</td>
          <td>${lab[it.status]}</td>
          <td class="small" style="color:var(--text-secondary)">${esc(it.msgs.join(' · '))}</td>
        </tr>`).join('')}</tbody>
    </table></div>
    <div style="display:flex;gap:12px;justify-content:flex-end;margin-top:16px">
      <button class="btn" data-act="bulkCancel">Cancelar</button>
      <button class="btn primary" data-act="bulkApply" ${nv + ng + c.new === 0 ? 'disabled' : ''}>${icon('check')} Aplicar Carga Masiva</button>
    </div>`;
  }

  return `
  <div class="grid g2">
    <div class="card">
      <div style="display:flex;gap:10px;align-items:center;margin-bottom:12px">
        <div style="width:28px;height:28px;border-radius:50%;background:var(--primary);color:#fff;display:grid;place-items:center;font-weight:700">1</div>
        <h3 style="margin:0">Descargar Plantilla Oficial</h3>
      </div>
      <p class="sub" style="color:var(--text-secondary);margin-bottom:14px">Plantilla formateada con hojas "Mediciones" y "Metas", perfectamente compatible con Excel y hojas de cálculo.</p>
      <label class="field inline" style="margin-bottom:14px">Año fiscal de trabajo
        <select data-bind="bulkYear">${availableYears().map(a => `<option ${a === B.year ? 'selected' : ''}>${a}</option>`).join('')}</select>
      </label>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn primary" data-act="tplEmpty">${icon('download')} Plantilla en Blanco</button>
        <button class="btn" data-act="tplData">${icon('sheet')} Plantilla con Datos Actuales</button>
      </div>
    </div>
    <div class="card">
      <div style="display:flex;gap:10px;align-items:center;margin-bottom:12px">
        <div style="width:28px;height:28px;border-radius:50%;background:var(--primary);color:#fff;display:grid;place-items:center;font-weight:700">2</div>
        <h3 style="margin:0">Subir Archivo Excel o CSV</h3>
      </div>
      <div class="drop">
        ${icon('upload')}
        <b>Haz clic aquí o arrastra tu archivo</b>
        <span>Formatos soportados: .xlsx, .csv</span>
        ${B.fileName ? `<div style="margin-top:10px;color:var(--primary);font-weight:700">${esc(B.fileName)}</div>` : ''}
      </div>
      <div style="display:flex;gap:18px;flex-wrap:wrap;margin-top:14px">
        <label class="check" style="display:flex;gap:8px;font-size:12.5px"><input type="checkbox" data-bind="bulkOver" ${B.overwrite ? 'checked' : ''}> Sobrescribir datos existentes</label>
        <label class="check" style="display:flex;gap:8px;font-size:12.5px"><input type="checkbox" data-bind="bulkCreate" ${B.create ? 'checked' : ''}> Crear automáticamente áreas o métricas nuevas</label>
      </div>
    </div>
  </div>
  <div class="card mt">
    <div style="display:flex;gap:10px;align-items:center;margin-bottom:12px">
      <div style="width:28px;height:28px;border-radius:50%;background:var(--primary);color:#fff;display:grid;place-items:center;font-weight:700">3</div>
      <h3 style="margin:0">Validación y Vista Previa</h3>
    </div>
    ${P ? ph : emptyMsg('file', 'Sube un archivo para inspeccionar y validar los datos antes de guardarlos.')}
  </div>`;
}

/* ============ VISTA 7: CATÁLOGO ============ */
export function viewCat() {
  const q = norm(UI.cat.q);
  const list = DB.indicators.filter(i => (UI.cat.area === 'all' || i.areaId === UI.cat.area) && (!q || norm(i.name + ' ' + i.owner).includes(q)));

  return `
  <div class="toolbar" style="display:flex;gap:14px;align-items:flex-end;flex-wrap:wrap;margin-bottom:18px">
    <label class="field">Buscar indicador o líder<input type="text" id="catQ" value="${esc(UI.cat.q)}" placeholder="Escribe para filtrar…" style="width:240px"></label>
    <div class="field">Área${chipsArea(UI.cat.area, 'catArea')}</div>
    <div style="margin-left:auto"><button class="btn primary" data-act="indNew">${icon('plus')} Nuevo Indicador</button></div>
  </div>
  <div class="card">
    <div class="card-header">
      <div>
        <h3>${icon('list')} Catálogo Maestro de Indicadores</h3>
        <p class="sub" style="color:var(--text-secondary)">Configura la unidad, sentido del éxito, consolidación matemática y responsable directo.</p>
      </div>
    </div>
    <div class="tbl-wrap"><table class="tbl">
      <thead><tr>
        <th>Nombre del Indicador</th>
        <th>Área Asignada</th>
        <th>Alcance</th>
        <th>Unidad</th>
        <th>Sentido</th>
        <th>Consolidación</th>
        <th class="num">Meta Base</th>
        <th>Responsable</th>
        <th></th>
      </tr></thead>
      <tbody>
      ${list.map(i => {
        const a = areaOf(i.areaId);
        return `<tr>
          <td class="name"><b>${esc(i.name)}</b></td>
          <td>${areaBadge(a)}</td>
          <td class="small">${hasUnits(a) ? a.units.length + ' ' + unitsWord(a) : 'General'}</td>
          <td>${esc(i.unit)}</td>
          <td class="small" style="font-weight:600">${i.dir === 'up' ? '↑ Mayor es mejor' : '↓ Menor es mejor'}</td>
          <td class="small">${i.agg === 'sum' ? 'Suma acumulativa' : 'Promedio'}</td>
          <td class="num"><b>${fmtI(i, i.target)}</b></td>
          <td class="small" style="color:var(--text-secondary)">${esc(i.owner || '—')}</td>
          <td class="c">
            <div style="display:flex;gap:6px;justify-content:center">
              <button class="btn sm icon ghost" data-act="indEdit" data-id="${i.id}" title="Editar">${icon('edit')}</button>
              <button class="btn sm icon ghost danger" data-act="indDel" data-id="${i.id}" title="Eliminar">${icon('trash')}</button>
            </div>
          </td>
        </tr>`;
      }).join('') || `<tr><td colspan="9">${emptyMsg('search', 'No se encontraron indicadores con los criterios buscados.')}</td></tr>`}
      </tbody>
    </table></div>
  </div>`;
}

/* ============ VISTA 8: CONFIGURACIÓN ============ */
export function viewCfg() {
  const isDark = DB.settings.theme !== 'light';
  return `
  <div class="grid g2">
    <div class="card">
      <h3>${icon('factory')} Estructura de Áreas, Plantas y Sedes</h3>
      <p class="sub" style="color:var(--text-secondary);margin-bottom:14px">Define las áreas de tu compañía y si se dividen por plantas, logísticas o líneas.</p>
      <div style="display:flex;flex-direction:column;gap:8px">
        ${DB.areas.map(a => `
          <div style="display:flex;align-items:center;gap:12px;padding:12px;border:1px solid var(--line-dim);border-radius:var(--radius-md);background:var(--bg-card-hover)">
            <div style="width:36px;height:36px;border-radius:var(--radius-sm);background:${a.color}20;color:${a.color};display:grid;place-items:center">${icon(a.icon)}</div>
            <div style="flex:1">
              <b style="font-size:14px">${esc(a.name)}</b>
              <div class="small" style="color:var(--text-muted)">${hasUnits(a) ? `${a.units.length} ${unitsWord(a)}: ${a.units.map(u => u.name).join(', ')}` : 'Sin subdivisiones'}</div>
            </div>
            <button class="btn sm icon ghost" data-act="areaEdit" data-id="${a.id}">${icon('edit')}</button>
            <button class="btn sm icon ghost danger" data-act="areaDel" data-id="${a.id}">${icon('trash')}</button>
          </div>`).join('')}
      </div>
      <div style="margin-top:16px"><button class="btn primary sm" data-act="areaNew">${icon('plus')} Agregar Nueva Área</button></div>
    </div>
    
    <div class="card">
      <h3>${icon('sliders')} Parámetros y Preferencias</h3>
      <p class="sub" style="color:var(--text-secondary);margin-bottom:14px">Ajustes visuales y tolerancias para el semáforo gerencial.</p>
      
      <div style="margin-bottom:18px">
        <label class="field" style="margin-bottom:6px">Tema de la interfaz</label>
        <button class="btn" data-act="toggleTheme">${icon(isDark ? 'sun' : 'moon')} Modo ${isDark ? 'Claro' : 'Oscuro'}</button>
      </div>

      <div>
        <label class="field inline">Margen de Tolerancia (%)
          <input type="number" min="0" max="50" step="0.5" style="width:84px" value="${DB.settings.tol}" data-bind="tol">
        </label>
        <p class="small" style="color:var(--text-muted);margin-top:6px">Un indicador dentro de este margen respecto a la meta se categoriza en estado <b>"En riesgo"</b> (amarillo).</p>
      </div>
    </div>
  </div>

  <div class="card mt">
    <h3>${icon('save')} Respaldo y Gestión de Base de Datos</h3>
    <p class="sub" style="color:var(--text-secondary);margin-bottom:14px">Todos los datos se guardan de forma local en tu navegador. Puedes generar copias de seguridad o exportar informes consolidados.</p>
    <div style="display:flex;gap:12px;flex-wrap:wrap">
      <button class="btn primary" data-act="backup">${icon('download')} Descargar Respaldo JSON</button>
      <button class="btn" data-act="restore">${icon('upload')} Restaurar desde JSON</button>
      <button class="btn" data-act="expAll">${icon('sheet')} Exportar Libro Completo a Excel</button>
      <button class="btn" data-act="demo">${icon('refresh')} Cargar Datos de Demostración</button>
      <button class="btn danger" data-act="clearData">${icon('trash')} Limpiar Mediciones y Planes</button>
    </div>
  </div>`;
}
