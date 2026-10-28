/**
 * utils.js - Constantes, funciones de formateo, matemáticas y utilidades comunes
 */

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

export const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
export const MONTHS_L = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];
export const MON_KEYS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const MON_EN = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
export const ALLM = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

export const PALETTE = ['#3b82f6', '#0ea5e9', '#8b5cf6', '#f59e0b', '#ec4899', '#10b981', '#ef4444', '#64748b'];
export const UCOL = ['#3b82f6', '#f59e0b', '#0ea5e9', '#8b5cf6', '#ec4899', '#64748b'];
export const YCOL = ['#94a3b8', '#c4b5fd', '#fdba74', '#99f6e4', '#f9a8d4', '#cbd5e1'];
export const AREA_ICONS = ['factory', 'truck', 'users', 'box', 'shield', 'bolt', 'bar', 'dollar'];

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

export const norm = s => String(s ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/\s+/g, ' ')
  .trim();

export const pad = n => String(n).padStart(2, '0');
export const uid = p => p + Math.random().toString(36).slice(2, 9);

export const fmt = (v, dec = 1) => (v == null || isNaN(v))
  ? '—'
  : Number(v).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: dec });

export function parseNum(x) {
  if (x == null) return null;
  if (typeof x === 'number') return isFinite(x) ? x : NaN;
  let s = String(x).trim().replace(/[\s%]/g, '');
  if (s === '') return null;
  if (s.includes(',') && s.includes('.')) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (s.includes(',')) {
    s = s.replace(',', '.');
  }
  const n = Number(s);
  return isFinite(n) ? n : NaN;
}

export function toast(msg, ico = 'check') {
  const t = $('#toast');
  if (!t) return;
  t.innerHTML = `<svg class="ic" viewBox="0 0 24 24"><use href="#ic-${ico}"></use></svg> <span>${esc(msg)}</span>`;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 2600);
}

export function downloadBlob(name, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 500);
}

export function mulberry(a) {
  return function() {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export const today = () => {
  const d = new Date();
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
};
