/**
 * app.js - Controlador principal, navegación, delegación de eventos y orquestación
 */

import {
  $, $$, MONTHS, MONTHS_L, ALLM, PALETTE, AREA_ICONS, esc, norm, fmt, parseNum, toast, downloadBlob, today, uid
} from './utils.js';
import { icon } from './icons.js';
import {
  DB, UI, SK, setDB, initNewDB, loadDB, saveDB, areaOf, indById, unitName, hasUnits, unitsOf,
  ulabel, tA, tM, getVal, setVal, setGoal, status, PST, lastDataMonth, availableYears
} from './state.js';
import {
  VIEWS, viewDash, viewAna, viewPlan, viewCap, viewGoal, viewBulk, viewCat, viewCfg,
  anaCtx, causeModal, fitTA, refreshPlanBits, capProgress, capRow
} from './views.js';
import { buildXlsx, readAnyFile } from './excel.js';

/* ============ Control de Tema (Oscuro/Claro) ============ */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  DB.settings.theme = theme;
  saveDB();
  const tb = $('[data-act="toggleTheme"]');
  if (tb) {
    const isDark = theme !== 'light';
    tb.innerHTML = `${icon(isDark ? 'sun' : 'moon')} Modo ${isDark ? 'Claro' : 'Oscuro'}`;
  }
}

/* ============ Render Principal ============ */
export function render() {
  const V = VIEWS[UI.view];
  $('#ttl').textContent = V.t;
  $('#sub').textContent = V.s;

  $$('.nav-item').forEach(b => {
    const v = VIEWS[b.dataset.v];
    b.innerHTML = icon(v.i) + '<span>' + v.n + '</span>';
    b.classList.toggle('active', b.dataset.v === UI.view);
  });

  $('#logo').innerHTML = icon('logo');

  const ys = $('#yearSel');
  if (ys) {
    ys.innerHTML = availableYears().map(a => `<option ${a === UI.year ? 'selected' : ''}>${a}</option>`).join('');
    ys.closest('label').style.display = (UI.view === 'ana' || UI.view === 'plan') ? 'none' : '';
  }

  const vMap = {
    dash: viewDash,
    ana: viewAna,
    plan: viewPlan,
    cap: viewCap,
    goal: viewGoal,
    bulk: viewBulk,
    cat: viewCat,
    cfg: viewCfg
  };

  $('#view').innerHTML = vMap[UI.view]();
  $$('textarea.ie').forEach(fitTA);
  sideFoot();
}

export function sideFoot() {
  const nV = Object.values(DB.data).reduce((a, o) => a + Object.keys(o).length, 0);
  const open = DB.plans.filter(p => p.estado !== 'cerrado').length;
  $('#sideFoot').innerHTML = `
    <b>${DB.indicators.length}</b> indicadores · <b>${DB.areas.length}</b> áreas<br>
    <b>${nV}</b> resultados guardados<br>
    <b>${open}</b> planes pendientes de cierre
  `;
}

export function go(v) {
  UI.view = v;
  UI.dd = null;
  render();
  window.scrollTo(0, 0);
}

/* ============ Modales y Formularios ============ */
window.openModal = function(h, cls) {
  const d = $('#dlg');
  d.className = 'dlg' + (cls ? ' ' + cls : '');
  d.innerHTML = h;
  $('#modal').classList.add('show');
};

export function closeModal() {
  const w = $('#dlg').classList.contains('wide');
  $('#modal').classList.remove('show');
  if (w && UI.view === 'ana') render();
}

export function confirmBox(msg, cb, label = 'Eliminar') {
  window.openModal(`
    <h2>Confirmación Requerida</h2>
    <p style="line-height:1.6;color:var(--text-secondary);margin:14px 0">${msg}</p>
    <div class="actions">
      <button class="btn" data-act="closeModal">Cancelar</button>
      <button class="btn primary" style="background:var(--bad);border-color:var(--bad)" id="cfmOk">${label}</button>
    </div>
  `);
  $('#cfmOk').onclick = () => { closeModal(); cb(); };
}

function planUnitOpts(ind, cur) {
  const a = areaOf(ind.areaId);
  return hasUnits(a)
    ? a.units.map(u => `<option value="${u.id}" ${u.id === cur ? 'selected' : ''}>${esc(u.name)}</option>`).join('')
    : '<option value="gen">General</option>';
}

function planForm(pre = {}) {
  if (!DB.indicators.length) {
    toast('Primero crea al menos un indicador', 'alert');
    return;
  }
  const ind = indById(pre.ind) || DB.indicators[0];
  const us = unitsOf(areaOf(ind.areaId));
  const u = us.some(x => x.id === pre.u) ? pre.u : us[0].id;
  const m = pre.m ?? UI.month;

  window.openModal(`
    <h2>Registrar Causa y Plan de Acción</h2>
    <div class="ctx" id="pCtx"></div>
    <div class="form">
      <label class="field full">Indicador
        <select id="pInd">${DB.areas.map(a => `
          <optgroup label="${esc(a.name)}">${DB.indicators.filter(i => i.areaId === a.id).map(i => `<option value="${i.id}" ${i.id === ind.id ? 'selected' : ''}>${esc(i.name)}</option>`).join('')}</optgroup>`
        ).join('')}</select>
      </label>
      <label class="field">Planta / Logística<select id="pUnit">${planUnitOpts(ind, u)}</select></label>
      <label class="field">Mes del desvío<select id="pMes">${MONTHS_L.map((n, i) => `<option value="${i}" ${i === m ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label class="field full">Causa Raíz Identificada *<textarea id="pCausa" placeholder="¿Qué factor originó el desvío frente a la meta?"></textarea></label>
      <label class="field full">Plan de Acción / Contramedida *<textarea id="pAcc" placeholder="¿Qué acción correctiva se implementará para solucionar la causa?"></textarea></label>
      <label class="field">Líder Responsable<input type="text" id="pResp" value="${esc(ind.owner || '')}"></label>
      <label class="field">Fecha Límite Compromiso<input type="date" id="pFecha"></label>
      <label class="field">Estado Actual<select id="pEst">${Object.keys(PST).map(k => `<option value="${k}">${PST[k]}</option>`).join('')}</select></label>
      <label class="field full">Evidencia de Cierre (Opcional)<textarea id="pCierre" placeholder="Comentario o resultado cuando el plan quede cerrado"></textarea></label>
    </div>
    <div class="actions">
      <button class="btn" data-act="closeModal">Cancelar</button>
      <button class="btn primary" data-act="planSave">${icon('check')} Guardar Plan</button>
    </div>
  `);
  updatePlanCtx();
}

function updatePlanCtx() {
  const i = indById($('#pInd').value);
  const u = $('#pUnit').value;
  const m = +$('#pMes').value;
  const y = UI.year;
  if (!i) return;
  const v = getVal(SK(i.id, u), y, m);
  const t = tM(i, u, y, m);
  const st = status(i, v, t);
  $('#pCtx').innerHTML = `${MONTHS_L[m]} ${y} · Real <b>${v == null ? '—' : fmt(v, i.dec) + ' ' + (i.unit || '')}</b> · Meta <b>${t == null ? '—' : fmt(t, i.dec) + ' ' + (i.unit || '')}</b> · <span class="pill ${st.s}">${st.s === 'ok' ? 'Cumple' : st.s === 'warn' ? 'En riesgo' : 'No cumple'}</span>`;
}

function indForm(id) {
  if (!DB.areas.length) {
    toast('Primero crea al menos un área', 'alert');
    return;
  }
  const i = id ? indById(id) : { areaId: DB.areas[0].id, name: '', unit: '%', dir: 'up', agg: 'avg', target: '', dec: 1, owner: '' };

  window.openModal(`
    <h2>${id ? 'Editar' : 'Nuevo'} Indicador</h2>
    <div class="ctx">Configura la fórmula de consolidación, sentidos y responsables.</div>
    <div class="form">
      <label class="field full">Nombre del Indicador *<input type="text" id="fName" value="${esc(i.name)}"></label>
      <label class="field">Área Asignada<select id="fArea">${DB.areas.map(a => `<option value="${a.id}" ${a.id === i.areaId ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label>
      <label class="field">Unidad de Medida<input type="text" id="fUnit" value="${esc(i.unit)}" placeholder="%, días, USD/ton…"></label>
      <label class="field">Sentido de Éxito<select id="fDir"><option value="up" ${i.dir === 'up' ? 'selected' : ''}>↑ Mayor es mejor</option><option value="down" ${i.dir === 'down' ? 'selected' : ''}>↓ Menor es mejor</option></select></label>
      <label class="field">Tipo de Consolidación<select id="fAgg"><option value="avg" ${i.agg !== 'sum' ? 'selected' : ''}>Promedio</option><option value="sum" ${i.agg === 'sum' ? 'selected' : ''}>Suma Acumulativa</option></select></label>
      <label class="field">Meta Base Anual *<input type="text" id="fTarget" inputmode="decimal" value="${i.target === '' || i.target == null ? '' : String(i.target).replace('.', ',')}"></label>
      <label class="field">Decimales Mostrados<select id="fDec">${[0, 1, 2, 3].map(d => `<option ${d === (i.dec ?? 1) ? 'selected' : ''}>${d}</option>`).join('')}</select></label>
      <label class="field full">Líder Responsable<input type="text" id="fOwner" value="${esc(i.owner || '')}"></label>
    </div>
    <div class="actions">
      <button class="btn" data-act="closeModal">Cancelar</button>
      <button class="btn primary" data-act="indSave" data-id="${id || ''}">${icon('check')} Guardar Indicador</button>
    </div>
  `);
}

function areaForm(id) {
  const a = id ? areaOf(id) : { name: '', color: PALETTE[DB.areas.length % PALETTE.length], icon: AREA_ICONS[DB.areas.length % AREA_ICONS.length], ulabel: 'Planta', units: [] };

  window.openModal(`
    <h2>${id ? 'Editar' : 'Nueva'} Área Organizacional</h2>
    <div class="form">
      <label class="field full">Nombre del Área *<input type="text" id="aName" value="${esc(a.name)}"></label>
      <label class="field">Nombre de las divisiones<select id="aLabel">${['Planta', 'Logística', 'Sede', 'Línea'].map(x => `<option ${x === ulabel(a) ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
      <label class="field">Color distintivo<input type="color" id="aColor" value="${a.color}" style="height:38px;padding:3px;width:100%"></label>
      <label class="field full">Plantas / Sedes / Unidades (una por línea · dejar vacío si no se divide)<textarea id="aUnits" placeholder="Ej: Película PVC&#10;Película POF&#10;Tejas">${esc((a.units || []).map(u => u.name).join('\n'))}</textarea></label>
      <div class="field full">Ícono representativo
        <div class="chips" id="aIcons">${AREA_ICONS.map(n => `<button type="button" class="chip ${n === a.icon ? 'active' : ''}" data-act="pickIcon" data-ico="${n}" style="padding:8px">${icon(n)}</button>`).join('')}</div>
      </div>
    </div>
    <div class="actions">
      <button class="btn" data-act="closeModal">Cancelar</button>
      <button class="btn primary" data-act="areaSave" data-id="${id || ''}">${icon('check')} Guardar Área</button>
    </div>
  `);
}

/* ============ Exportación y Plantillas Excel ============ */
const DIRTXT = d => d === 'up' ? 'Mayor es mejor' : 'Menor es mejor';
function eachSeries(fn) {
  DB.areas.forEach(a => unitsOf(a).forEach(u => DB.indicators.filter(i => i.areaId === a.id).forEach(i => fn(a, u, i))));
}
const plantaTxt = (a, u) => hasUnits(a) ? u.name : '';

function sheetMed(y, withData) {
  const rows = [['Año', 'Área', 'Planta / Logística', 'Indicador', 'Unidad', 'Sentido', ...MONTHS]];
  eachSeries((a, u, i) => rows.push([
    y, a.name, plantaTxt(a, u), i.name, i.unit, DIRTXT(i.dir),
    ...MONTHS.map((_, m) => withData ? (getVal(SK(i.id, u.id), y, m) ?? '') : '')
  ]));
  return { name: 'Mediciones', rows, widths: [8, 18, 22, 42, 10, 16, ...Array(12).fill(9)] };
}

function sheetMetas(y) {
  const rows = [['Año', 'Área', 'Planta / Logística', 'Indicador', 'Meta anual', ...MONTHS]];
  eachSeries((a, u, i) => {
    const g = DB.goals[SK(i.id, u.id)] && DB.goals[SK(i.id, u.id)][y] || {};
    rows.push([
      y, a.name, plantaTxt(a, u), i.name, tA(i, u.id, y),
      ...MONTHS.map((_, m) => g.m && g.m[m] != null ? g.m[m] : '')
    ]);
  });
  return { name: 'Metas', rows, widths: [8, 18, 22, 42, 12, ...Array(12).fill(9)] };
}

export function exportTemplate(withData) {
  const y = UI.bulk.year;
  const inst = {
    name: 'Instrucciones',
    noHeader: true,
    note: true,
    widths: [130],
    rows: [
      ['GUÍA DE DILIGENCIAMIENTO'],
      ['1. Hoja "Mediciones": 1 renglón por cada métrica y planta. Registra los valores reales mes a mes.'],
      ['2. Hoja "Metas": Define la meta anual o las metas particulares para cada mes.'],
      ['3. Las columnas Año, Área, Planta / Logística e Indicador no deben renombrarse.'],
      ['4. Guarda el archivo e impórtalo desde la sección "Carga masiva".']
    ]
  };
  downloadBlob(`Plantilla_Indicadores_${y}${withData ? '_con_datos' : ''}.xlsx`, buildXlsx([sheetMed(y, withData), sheetMetas(y), inst]));
  toast('Plantilla descargada con éxito', 'download');
}

export function exportAll() {
  const y = UI.year;
  const hist = [['Año', 'Mes', 'Área', 'Planta / Logística', 'Indicador', 'Unidad', 'Meta mes', 'Real', 'Estado']];
  eachSeries((a, u, i) => {
    for (let m = 0; m < 12; m++) {
      const v = getVal(SK(i.id, u.id), y, m);
      if (v == null) continue;
      const t = tM(i, u.id, y, m);
      hist.push([y, MONTHS_L[m], a.name, plantaTxt(a, u), i.name, i.unit, t, v, status(i, v, t).s]);
    }
  });

  const pl = [['Año', 'Mes', 'Área', 'Planta / Logística', 'Indicador', 'Causa Raíz', 'Acción Correctiva', 'Responsable', 'Fecha Límite', 'Estado', 'Evidencia Cierre']];
  DB.plans.filter(p => p.y === y).forEach(p => {
    const i = indById(p.ind);
    if (!i) return;
    const a = areaOf(i.areaId);
    pl.push([p.y, MONTHS_L[p.m], a.name, hasUnits(a) ? unitName(a, p.u) : '', i.name, p.causa, p.accion, p.resp, p.fecha, PST[p.estado], p.cierre || '']);
  });

  const cat = [['Área', 'Indicador', 'Unidad', 'Sentido', 'Consolidación', 'Meta Base', 'Responsable']];
  DB.indicators.forEach(i => cat.push([areaOf(i.areaId).name, i.name, i.unit, DIRTXT(i.dir), i.agg === 'sum' ? 'Suma' : 'Promedio', i.target, i.owner || '']));

  downloadBlob(`Reporte_Gerencial_Indicadores_${y}.xlsx`, buildXlsx([
    sheetMed(y, true),
    sheetMetas(y),
    { name: 'Histórico Completo', rows: hist, widths: [8, 14, 18, 22, 42, 10, 12, 12, 14] },
    { name: 'Planes de Acción', rows: pl, widths: [8, 14, 18, 22, 38, 42, 24, 16, 14, 40] },
    { name: 'Catálogo de Métricas', rows: cat, widths: [18, 42, 10, 16, 14, 12, 24] }
  ]));
  toast('Libro Excel exportado exitosamente', 'download');
}

/* ============ Carga Masiva Logic ============ */
function headerMap(sh) {
  const hi = sh.rows.findIndex((r, i) => i < 15 && r && r.some(c => norm(c) === 'indicador'));
  if (hi < 0) return null;
  const col = { months: {}, hi };
  sh.rows[hi].forEach((c, i) => {
    const n = norm(c);
    if (!n) return;
    if (n === 'ano' || n === 'anio' || n === 'year') col.year = i;
    else if (n === 'area') col.area = i;
    else if (n.startsWith('planta') || n.startsWith('logistica') || n === 'sede' || n === 'linea') col.plant = i;
    else if (n === 'indicador') col.ind = i;
    else if (n === 'unidad') col.unit = i;
    else if (n === 'sentido') col.dir = i;
    else if (n.startsWith('meta')) col.ann = i;
    else {
      let k = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'].findIndex(x => n.startsWith(x));
      if (k < 0) k = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].findIndex(x => n.startsWith(x));
      if (k < 0 && /^\d+$/.test(n) && +n >= 1 && +n <= 12) k = +n - 1;
      if (k >= 0 && n.length <= 12 && col.months[k] == null) col.months[k] = i;
    }
  });
  return Object.keys(col.months).length || col.ann != null ? col : null;
}

function resolveUpload(it, doCreate) {
  let a = DB.areas.find(x => norm(x.name) === norm(it.areaName));
  if (!a) {
    if (!doCreate) return { nw: 'Área nueva' };
    a = { id: uid('a_'), name: it.areaName, color: PALETTE[DB.areas.length % PALETTE.length], icon: AREA_ICONS[DB.areas.length % AREA_ICONS.length], ulabel: 'Planta', units: it.plant ? [{ id: uid('u_'), name: it.plant }] : [] };
    DB.areas.push(a);
  }
  let u = 'gen';
  if (hasUnits(a)) {
    if (!it.plant) return { err: ulabel(a) + ' requerida para ' + a.name };
    let x = a.units.find(z => norm(z.name) === norm(it.plant));
    if (!x) {
      if (!doCreate) return { nw: ulabel(a) + ' nueva' };
      x = { id: uid('u_'), name: it.plant };
      a.units.push(x);
    }
    u = x.id;
  }
  let ind = DB.indicators.find(i => i.areaId === a.id && norm(i.name) === norm(it.indName));
  if (!ind) {
    if (!doCreate) return { nw: 'Indicador nuevo' };
    ind = { id: uid('i_'), areaId: a.id, name: it.indName, unit: it.unit || '%', dir: it.dir || 'up', agg: 'avg', target: it.ann ?? null, dec: 1, owner: '' };
    DB.indicators.push(ind);
  }
  return { a, u, ind };
}

function buildPreview(sheets) {
  const items = [];
  let found = false;
  sheets.forEach(sh => {
    const col = headerMap(sh);
    if (!col || col.ind == null) return;
    found = true;
    const type = norm(sh.name).startsWith('meta') ? 'goal' : 'val';
    for (let r = col.hi + 1; r < sh.rows.length; r++) {
      const row = sh.rows[r];
      if (!row || row.every(c => c === '' || c == null)) continue;
      const it = { type, sheet: sh.name, row: r + 1, status: 'ok', msgs: [], values: {} };
      it.indName = String(row[col.ind] ?? '').trim();
      it.areaName = col.area != null ? String(row[col.area] ?? '').trim() : '';
      it.plant = col.plant != null ? String(row[col.plant] ?? '').trim() : '';
      let y = col.year != null ? parseNum(row[col.year]) : null;
      if (y == null) y = UI.bulk.year;
      it.year = y;
      it.unit = col.unit != null ? String(row[col.unit] ?? '').trim() : '';
      const dt = col.dir != null ? norm(row[col.dir]) : '';
      it.dir = dt ? (/^(men|down|baj|min)/.test(dt) ? 'down' : 'up') : null;
      it.ann = col.ann != null ? parseNum(row[col.ann]) : null;
      if (isNaN(it.ann)) it.ann = null;

      if (!it.indName) { it.status = 'error'; it.msgs.push('Falta el indicador'); }
      if (!it.areaName) { it.status = 'error'; it.msgs.push('Falta el área'); }
      if (isNaN(y) || y < 2000 || y > 2100) { it.status = 'error'; it.msgs.push('Año inválido'); }

      Object.keys(col.months).forEach(k => {
        const raw = row[col.months[k]];
        const v = parseNum(raw);
        if (v == null) return;
        if (isNaN(v)) {
          it.msgs.push(`${MONTHS[k]}: "${raw}" no es numérico`);
          if (it.status === 'ok') it.status = 'warn';
          return;
        }
        it.values[k] = v;
      });

      if (it.status !== 'error') {
        const rs = resolveUpload(it, false);
        if (rs.err) { it.status = 'error'; it.msgs.push(rs.err); }
        else if (rs.nw) {
          if (UI.bulk.create) { it.status = 'new'; it.msgs.unshift(rs.nw); }
          else { it.status = 'error'; it.msgs.push(rs.nw + ' (creación deshabilitada)'); }
        }
      }
      const nv = Object.keys(it.values).length + (type === 'goal' && it.ann != null ? 1 : 0);
      if (it.status === 'ok' && !nv) { it.status = 'warn'; it.msgs.push('Sin valores numéricos'); }
      items.push(it);
    }
  });

  if (!found) throw new Error('No se encontraron columnas con el encabezado "Indicador". Usa la plantilla oficial.');
  return { items };
}

function applyUpload(prev) {
  let nv = 0, ng = 0;
  const i0 = DB.indicators.length;
  prev.items.forEach(it => {
    if (it.status === 'error') return;
    const r = resolveUpload(it, true);
    if (r.err) return;
    const sk = SK(r.ind.id, r.u);
    if (it.type === 'val') {
      Object.keys(it.values).forEach(k => {
        if (UI.bulk.overwrite || getVal(sk, it.year, +k) == null) {
          setVal(sk, it.year, +k, it.values[k]);
          nv++;
        }
      });
    } else {
      if (it.ann != null) { setGoal(sk, it.year, 'a', it.ann); ng++; }
      Object.keys(it.values).forEach(k => {
        setGoal(sk, it.year, +k, it.values[k]);
        ng++;
      });
    }
  });
  saveDB();
  return { nv, ng, ni: DB.indicators.length - i0 };
}

async function handleFile(f) {
  if (!f) return;
  try {
    UI.bulk.fileName = f.name;
    UI.bulk.sheets = await readAnyFile(f);
    UI.bulk.prev = buildPreview(UI.bulk.sheets);
    toast('Archivo analizado: ' + UI.bulk.prev.items.length + ' filas', 'file');
  } catch (e) {
    UI.bulk.prev = null;
    UI.bulk.sheets = null;
    toast(e.message || 'No se pudo leer el archivo', 'alert');
  }
  render();
}

/* ============ Control de Eventos Globales ============ */
const resetF = () => Object.assign(UI.f, {
  area: 'all', unit: 'all', ind: 'all', months: ALLM.slice(), cmpY: [], pst: 'all', ist: 'all'
});
const rangeTo = m => Array.from({ length: m + 1 }, (_, i) => i);

const ACTIONS = {
  nav: t => go(t.dataset.v),
  toggleTheme: () => applyTheme(DB.settings.theme === 'light' ? 'dark' : 'light'),
  dashArea: t => { UI.dash.area = t.dataset.v; render(); },
  capArea: t => { UI.cap.area = t.dataset.v; UI.cap.unit = 'all'; render(); },
  capUnit: t => { UI.cap.unit = t.dataset.v; render(); },
  goalArea: t => { UI.goal.area = t.dataset.v; UI.goal.unit = 'all'; render(); },
  goalUnit: t => { UI.goal.unit = t.dataset.v; render(); },
  catArea: t => { UI.cat.area = t.dataset.v; render(); },
  goAna: t => {
    const i = indById(t.dataset.id);
    resetF();
    Object.assign(UI.f, {
      area: i.areaId,
      ind: i.id,
      unit: t.dataset.u && t.dataset.u !== 'gen' ? t.dataset.u : 'all',
      months: rangeTo(UI.month)
    });
    go('ana');
  },
  pickInd: t => { UI.f.ind = UI.f.ind === t.dataset.id ? 'all' : t.dataset.id; render(); },
  clearInd: () => { UI.f.ind = 'all'; render(); },
  cmpMode: t => { UI.cmpMode = t.dataset.v; render(); },
  causeModal: t => causeModal(t.dataset.id),
  goPlans: t => { closeModal(); UI.f.ind = t.dataset.id; go('plan'); },
  dd: t => { UI.dd = UI.dd === t.dataset.v ? null : t.dataset.v; render(); },
  ddClose: () => { UI.dd = null; render(); },
  mTog: t => {
    const m = +t.dataset.v, f = UI.f;
    if (f.months.includes(m)) {
      if (f.months.length === 1) { toast('Mantén al menos un mes seleccionado', 'alert'); return; }
      f.months = f.months.filter(x => x !== m);
    } else {
      f.months = [...f.months, m].sort((a, b) => a - b);
    }
    render();
  },
  mQuick: t => {
    const q = [
      ['all', ALLM], ['ytd', Array.from({ length: Math.max(1, lastDataMonth(UI.year) + 1) }, (_, i) => i)],
      ['t1', [0, 1, 2]], ['t2', [3, 4, 5]], ['t3', [6, 7, 8]], ['t4', [9, 10, 11]],
      ['s1', [0, 1, 2, 3, 4, 5]], ['s2', [6, 7, 8, 9, 10, 11]]
    ].find(x => x[0] === t.dataset.v);
    if (q) UI.f.months = q[1].slice();
    render();
  },
  yTog: t => {
    const y = +t.dataset.v, f = UI.f;
    f.cmpY = f.cmpY.includes(y) ? f.cmpY.filter(x => x !== y) : [...f.cmpY, y];
    render();
  },
  yNone: () => { UI.f.cmpY = []; render(); },
  ist: t => { UI.f.ist = UI.f.ist === t.dataset.v ? 'all' : t.dataset.v; render(); },
  sumCell: t => {
    const a = areaOf(t.dataset.a), f = UI.f;
    f.area = a.id;
    f.unit = hasUnits(a) ? t.dataset.u : 'all';
    if (f.ind !== 'all' && indById(f.ind).areaId !== a.id) f.ind = 'all';
    f.months = [+t.dataset.m];
    f.pst = 'all';
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },
  fReset: () => { resetF(); UI.dd = null; render(); },
  pst: t => { UI.f.pst = UI.f.pst === t.dataset.v && t.dataset.v !== 'all' ? 'all' : t.dataset.v; render(); },
  capPrev: () => { if (UI.month > 0) UI.month--; else { UI.month = 11; UI.year--; } render(); },
  capNext: () => { if (UI.month < 11) UI.month++; else { UI.month = 0; UI.year++; } render(); },
  capSave: () => { saveDB(); toast('Mediciones guardadas correctamente'); },
  capCopy: () => {
    const y = UI.year, m = UI.month;
    let n = 0;
    groups(UI.cap.area, UI.cap.unit).forEach(g => g.inds.forEach(i => {
      const sk = SK(i.id, g.u.id);
      if (getVal(sk, y, m) == null) {
        const pv = m > 0 ? getVal(sk, y, m - 1) : getVal(sk, y - 1, 11);
        if (pv != null) { setVal(sk, y, m, pv); n++; }
      }
    }));
    saveDB(); render();
    toast(n ? `Se replicaron ${n} valores del mes previo` : 'No había valores disponibles para copiar', 'refresh');
  },
  capPlans: t => {
    const i = indById(t.dataset.i);
    resetF();
    Object.assign(UI.f, { area: i.areaId, ind: i.id, unit: t.dataset.u === 'gen' ? 'all' : t.dataset.u, months: [+t.dataset.m] });
    go('plan');
  },
  planNew: t => {
    const C = UI.view === 'ana' || UI.view === 'plan' ? anaCtx() : null;
    planForm({
      ind: t.dataset.i || (C && C.area !== 'all' ? (DB.indicators.find(i => i.areaId === C.area) || {}).id : undefined),
      u: t.dataset.u,
      m: t.dataset.m != null && t.dataset.m !== 'undefined' ? +t.dataset.m : undefined
    });
  },
  planDel: t => confirmBox('¿Deseas eliminar este plan de acción y su causa asociada?', () => {
    DB.plans = DB.plans.filter(p => p.id !== t.dataset.id);
    saveDB(); render();
    toast('Plan eliminado', 'trash');
  }),
  planSave: () => {
    const o = {
      ind: $('#pInd').value,
      u: $('#pUnit').value,
      y: UI.year,
      m: +$('#pMes').value,
      causa: $('#pCausa').value.trim(),
      accion: $('#pAcc').value.trim(),
      resp: $('#pResp').value.trim(),
      fecha: $('#pFecha').value,
      estado: $('#pEst').value,
      cierre: $('#pCierre').value.trim()
    };
    if (!o.causa || !o.accion) {
      toast('Ingresa la causa y la acción correctiva', 'alert');
      return;
    }
    DB.plans.push({ id: uid('p_'), ...o });
    saveDB(); closeModal(); render();
    toast('Plan de acción registrado');
  },
  goalClear: t => {
    const g = DB.goals[t.dataset.sk] && DB.goals[t.dataset.sk][UI.year];
    if (g) {
      g.m = Array(12).fill(null);
      saveDB(); render();
      toast('Metas mensuales prorrateadas a la meta anual', 'refresh');
    }
  },
  tplEmpty: () => exportTemplate(false),
  tplData: () => exportTemplate(true),
  expAll: exportAll,
  bulkCancel: () => {
    Object.assign(UI.bulk, { prev: null, sheets: null, fileName: '' });
    render();
  },
  bulkApply: () => {
    const r = applyUpload(UI.bulk.prev);
    Object.assign(UI.bulk, { prev: null, sheets: null, fileName: '' });
    render();
    toast(`Carga exitosa: ${r.nv} datos, ${r.ng} metas${r.ni ? `, ${r.ni} métricas nuevas` : ''}`);
  },
  closeModal,
  indNew: () => indForm(),
  indEdit: t => indForm(t.dataset.id),
  indSave: t => {
    const name = $('#fName').value.trim();
    const tg = parseNum($('#fTarget').value);
    if (!name) { toast('Ingresa el nombre del indicador', 'alert'); return; }
    if (tg == null || isNaN(tg)) { toast('La meta base debe ser numérica', 'alert'); return; }
    const o = {
      areaId: $('#fArea').value,
      name,
      unit: $('#fUnit').value.trim(),
      dir: $('#fDir').value,
      agg: $('#fAgg').value,
      target: tg,
      owner: $('#fOwner').value.trim(),
      dec: +$('#fDec').value
    };
    if (t.dataset.id) Object.assign(indById(t.dataset.id), o);
    else DB.indicators.push({ id: uid('i_'), ...o });
    saveDB(); closeModal(); render();
    toast('Indicador configurado correctamente');
  },
  indDel: t => {
    const i = indById(t.dataset.id);
    confirmBox(`¿Eliminar <b>${esc(i.name)}</b> junto con todas sus mediciones históricas y planes?`, () => {
      DB.indicators = DB.indicators.filter(x => x.id !== i.id);
      Object.keys(DB.data).forEach(k => { if (k.startsWith(i.id + '@')) delete DB.data[k]; });
      Object.keys(DB.goals).forEach(k => { if (k.startsWith(i.id + '@')) delete DB.goals[k]; });
      DB.plans = DB.plans.filter(p => p.ind !== i.id);
      saveDB(); render();
      toast('Indicador y datos eliminados', 'trash');
    });
  },
  areaNew: () => areaForm(),
  areaEdit: t => areaForm(t.dataset.id),
  pickIcon: t => {
    $$('#aIcons .chip').forEach(c => c.classList.remove('active'));
    t.classList.add('active');
  },
  areaSave: t => {
    const name = $('#aName').value.trim();
    if (!name) { toast('Escribe el nombre del área', 'alert'); return; }
    const old = t.dataset.id ? areaOf(t.dataset.id).units || [] : [];
    const units = [...new Set($('#aUnits').value.split('\n').map(x => x.trim()).filter(Boolean))].map(n =>
      old.find(u => norm(u.name) === norm(n)) || { id: uid('u_'), name: n }
    );
    const o = {
      name,
      units,
      ulabel: $('#aLabel').value,
      color: $('#aColor').value,
      icon: ($('#aIcons .active') || { dataset: { ico: 'bar' } }).dataset.ico
    };
    if (t.dataset.id) Object.assign(areaOf(t.dataset.id), o);
    else DB.areas.push({ id: uid('a_'), ...o });
    saveDB(); closeModal(); render();
    toast('Área guardada');
  },
  areaDel: t => {
    const a = areaOf(t.dataset.id);
    const ids = DB.indicators.filter(i => i.areaId === a.id).map(i => i.id);
    confirmBox(`¿Eliminar <b>${esc(a.name)}</b> y sus ${ids.length} indicadores asociados?`, () => {
      ids.forEach(id => {
        Object.keys(DB.data).forEach(k => { if (k.startsWith(id + '@')) delete DB.data[k]; });
        Object.keys(DB.goals).forEach(k => { if (k.startsWith(id + '@')) delete DB.goals[k]; });
      });
      DB.plans = DB.plans.filter(p => !ids.includes(p.ind));
      DB.indicators = DB.indicators.filter(i => i.areaId !== a.id);
      DB.areas = DB.areas.filter(x => x.id !== a.id);
      ['dash', 'cap', 'goal', 'cat'].forEach(k => {
        if (UI[k].area === a.id) {
          UI[k].area = 'all';
          if ('unit' in UI[k]) UI[k].unit = 'all';
        }
      });
      if (UI.f.area === a.id) resetF();
      saveDB(); render();
      toast('Área eliminada', 'trash');
    });
  },
  backup: () => {
    downloadBlob(`Respaldo_Indicadores_${today()}.json`, new Blob([JSON.stringify(DB, null, 2)], { type: 'application/json' }));
    toast('Copia de seguridad descargada', 'download');
  },
  restore: () => $('#fileRestore').click(),
  demo: () => confirmBox('Esta acción reemplazará toda la información con datos de ejemplo gerenciales. ¿Deseas continuar?', () => {
    initNewDB(true);
    saveDB();
    UI.year = 2026;
    UI.month = 8;
    render();
    toast('Datos de demostración cargados');
  }, 'Cargar Demo'),
  clearData: () => confirmBox('Se eliminarán todos los resultados mensuales y planes de acción registrados. Se preservará la estructura de áreas, métricas y metas. ¿Confirmar?', () => {
    DB.data = {};
    DB.plans = [];
    saveDB(); render();
    toast('Resultados operativos eliminados', 'trash');
  }, 'Limpiar Datos')
};

/* Delegación de Clics */
document.addEventListener('click', e => {
  if (UI.dd && !e.target.closest('.ms-dd')) {
    UI.dd = null;
    $$('.ms-dd.open').forEach(x => x.classList.remove('open'));
  }
  if (e.target.id === 'modal') { closeModal(); return; }
  if (e.target.closest('.drop')) { $('#fileUp').click(); return; }
  const t = e.target.closest('[data-act]');
  if (t && ACTIONS[t.dataset.act]) {
    e.preventDefault();
    ACTIONS[t.dataset.act](t);
  }
});

/* Delegación de Cambios (Change) */
document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'fileUp') { handleFile(t.files[0]); t.value = ''; return; }
  if (t.id === 'fileRestore') {
    const f = t.files[0];
    t.value = '';
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const o = JSON.parse(r.result);
        if (!o.areas || !o.indicators || !o.data) throw new Error();
        setDB(Object.assign({ settings: { tol: 5, theme: 'dark' }, goals: {}, plans: [] }, o));
        saveDB();
        applyTheme(DB.settings.theme || 'dark');
        render();
        toast('Copia de seguridad restaurada');
      } catch (x) {
        toast('El archivo no contiene un respaldo JSON válido', 'alert');
      }
    };
    r.readAsText(f);
    return;
  }
  if (t.id === 'pInd') {
    const i = indById(t.value);
    $('#pUnit').innerHTML = planUnitOpts(i);
    if (!$('#pResp').value) $('#pResp').value = i.owner || '';
    updatePlanCtx();
    return;
  }
  if (t.id === 'pUnit' || t.id === 'pMes') {
    updatePlanCtx();
    return;
  }
  if (t.classList.contains('ie')) {
    const tr = t.closest('tr');
    const p = DB.plans.find(x => x.id === tr.dataset.pid);
    if (!p) return;
    const fld = t.dataset.f;
    const v = t.tagName === 'SELECT' || t.type === 'date' ? t.value : t.value.trim();
    if ((fld === 'causa' || fld === 'accion') && !v) {
      t.value = p[fld];
      toast('La causa y la acción son campos obligatorios', 'alert');
      return;
    }
    p[fld] = v;
    saveDB();
    if (fld === 'estado' || fld === 'fecha') {
      const sel = tr.querySelector('.st-sel');
      sel.className = 'ie st-sel ' + (p.estado === 'cerrado' ? 'ok' : (p.estado !== 'cerrado' && p.fecha && p.fecha < today() ? 'bad' : p.estado === 'curso' ? 'warn' : 'pri'));
      refreshPlanBits();
      sideFoot();
    }
    const h = $('#saveHint');
    if (h) {
      h.innerHTML = `${icon('check')} Guardado`;
      h.classList.add('on');
      setTimeout(() => {
        h.innerHTML = `${icon('edit')} Autoguardado activo`;
        h.classList.remove('on');
      }, 1500);
    }
    return;
  }
  if (t.classList.contains('cap-input')) {
    const tr = t.closest('tr');
    const v = parseNum(t.value);
    if (isNaN(v)) {
      t.classList.add('invalid');
      toast('Formato numérico no válido', 'alert');
      return;
    }
    t.classList.remove('invalid');
    setVal(SK(tr.dataset.i, tr.dataset.u), UI.year, UI.month, v);
    if (v != null) t.value = String(v).replace('.', ',');
    saveDB();
    const i = indById(tr.dataset.i);
    const u = tr.dataset.u;
    const st = status(i, getVal(SK(i.id, u), UI.year, UI.month), tM(i, u, UI.year, UI.month)).s;
    tr.querySelector('.st').innerHTML = `<span class="pill ${st}">${st === 'ok' ? 'Cumple' : st === 'warn' ? 'En riesgo' : 'No cumple'}</span>`;
    $('#capProg').innerHTML = capProgress();
    return;
  }
  if (t.classList.contains('goal-in')) {
    const tr = t.closest('tr');
    const v = parseNum(t.value);
    const k = t.dataset.k;
    if (isNaN(v)) {
      t.classList.add('invalid');
      toast('Valor numérico inválido', 'alert');
      return;
    }
    t.classList.remove('invalid');
    setGoal(tr.dataset.sk, UI.year, k === 'a' ? 'a' : +k, v);
    saveDB();
    return;
  }

  const b = t.dataset.bind;
  if (!b) return;
  const f = UI.f;
  switch (b) {
    case 'year':
      UI.year = +t.value;
      {
        const L = lastDataMonth(UI.year);
        if (L >= 0) UI.month = L;
      }
      UI.f.cmpY = UI.f.cmpY.filter(y => y !== UI.year);
      render();
      break;
    case 'month':
      UI.month = +t.value;
      render();
      break;
    case 'fArea':
      f.area = t.value;
      f.unit = 'all';
      if (f.ind !== 'all' && f.area !== 'all' && indById(f.ind).areaId !== f.area) f.ind = 'all';
      render();
      break;
    case 'fUnit':
      f.unit = t.value;
      render();
      break;
    case 'fInd':
      f.ind = t.value;
      render();
      break;
    case 'bulkYear':
      UI.bulk.year = +t.value;
      if (UI.bulk.sheets) {
        try { UI.bulk.prev = buildPreview(UI.bulk.sheets); } catch (e) {}
      }
      render();
      break;
    case 'bulkOver':
      UI.bulk.overwrite = t.checked;
      break;
    case 'bulkCreate':
      UI.bulk.create = t.checked;
      if (UI.bulk.sheets) {
        try { UI.bulk.prev = buildPreview(UI.bulk.sheets); } catch (e) {}
      }
      render();
      break;
    case 'tol': {
      const n = parseNum(t.value);
      if (n != null && !isNaN(n) && n >= 0) {
        DB.settings.tol = n;
        saveDB();
        toast('Tolerancia actualizada');
      }
      break;
    }
  }
});

/* Input y Teclado */
document.addEventListener('input', e => {
  if (e.target.id === 'catQ') {
    UI.cat.q = e.target.value;
    const p = e.target.selectionStart;
    render();
    const n = $('#catQ');
    if (n) { n.focus(); n.setSelectionRange(p, p); }
  }
  if (e.target.matches && e.target.matches('textarea.ie')) fitTA(e.target);
});

document.addEventListener('keydown', e => {
  const c = e.target.classList;
  if (e.key === 'Enter' && (c.contains('cap-input') || c.contains('goal-in'))) {
    e.preventDefault();
    const all = $$(c.contains('cap-input') ? '.cap-input' : '.goal-in');
    const n = all[all.indexOf(e.target) + 1];
    e.target.blur();
    if (n) { n.focus(); n.select(); }
  }
  if (e.key === 'Escape') {
    closeModal();
    if (UI.dd) {
      UI.dd = null;
      $$('.ms-dd.open').forEach(x => x.classList.remove('open'));
    }
  }
});

/* Drag and Drop */
['dragenter', 'dragover'].forEach(ev => document.addEventListener(ev, e => {
  const d = e.target.closest && e.target.closest('.drop');
  if (d) { e.preventDefault(); d.classList.add('over'); }
}));
['dragleave', 'drop'].forEach(ev => document.addEventListener(ev, e => {
  const d = e.target.closest && e.target.closest('.drop');
  if (d) {
    e.preventDefault();
    d.classList.remove('over');
    if (ev === 'drop') handleFile(e.dataTransfer.files[0]);
  }
}));
window.addEventListener('dragover', e => e.preventDefault());
window.addEventListener('drop', e => {
  if (!e.target.closest || !e.target.closest('.drop')) e.preventDefault();
});

/* Tooltip dinámico */
const tip = $('#tip');
document.addEventListener('mouseover', e => {
  const t = e.target.closest && e.target.closest('[data-tip]');
  if (t && tip) { tip.innerHTML = t.dataset.tip; tip.classList.add('show'); }
});
document.addEventListener('mousemove', e => {
  if (tip && tip.classList.contains('show')) {
    tip.style.left = Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 12) + 'px';
    tip.style.top = (e.clientY + 16) + 'px';
  }
});
document.addEventListener('mouseout', e => {
  const t = e.target.closest && e.target.closest('[data-tip]');
  if (t && tip && !(e.relatedTarget && t.contains(e.relatedTarget))) tip.classList.remove('show');
});

/* ============ Inicialización ============ */
let stored = loadDB();
if (!stored || !stored.areas) {
  setDB(initNewDB(true));
} else {
  setDB(stored);
}

DB.settings = DB.settings || { tol: 5, theme: 'dark' };
DB.goals = DB.goals || {};
DB.plans = DB.plans || [];
DB.areas.forEach(a => {
  a.units = a.units || [];
  a.ulabel = a.ulabel || 'Planta';
});
saveDB();

applyTheme(DB.settings.theme || 'dark');

UI.year = 2026;
{
  const L = lastDataMonth(UI.year);
  UI.month = L >= 0 ? L : new Date().getMonth();
}
UI.bulk.year = UI.year;

render();
