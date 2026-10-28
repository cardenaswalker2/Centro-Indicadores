/**
 * charts.js - Generador SVG para gráficos de líneas, dispersión y barras apiladas
 */

import { esc, fmt } from './utils.js';
import { icon } from './icons.js';

export function niceScale(min, max, n = 4) {
  if (min === max) { min -= 1; max += 1; }
  const span = max - min;
  const raw = span / n;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const nr = raw / mag;
  const step = (nr <= 1 ? 1 : nr <= 2 ? 2 : nr <= 2.5 ? 2.5 : nr <= 5 ? 5 : 10) * mag;
  const lo = Math.floor(min / step + 1e-9) * step;
  const hi = Math.ceil(max / step - 1e-9) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(+v.toFixed(10));
  return { lo, hi, ticks };
}

export function lineChart({ labels, series: SR, fmtV = v => fmt(v, 1), H = 260, tipExtra }) {
  const W = 760, L = 48, R = 16, T = 14, B = 28;
  const pw = W - L - R, ph = H - T - B;
  const all = [];
  SR.forEach(s => s.vals.forEach(v => { if (v != null) all.push(v); }));
  
  if (!all.length) {
    return `<div class="empty">${icon('trend')}<div>Sin datos para graficar en este periodo</div></div>`;
  }

  let mn = Math.min(...all), mx = Math.max(...all);
  const pd = (mx - mn || Math.abs(mx) || 1) * 0.12;
  mn -= pd; mx += pd;
  if (mn < 0 && all.every(v => v >= 0)) mn = 0;

  const sc = niceScale(mn, mx, 4);
  const X = i => L + pw * (i + 0.5) / labels.length;
  const Y = v => T + ph - (v - sc.lo) / (sc.hi - sc.lo) * ph;

  let g = `<svg class="chart" viewBox="0 0 ${W} ${H}" aria-label="Gráfico de tendencias">`;
  
  // Grid lines
  sc.ticks.forEach(t => {
    g += `<line class="gl" x1="${L}" x2="${W - R}" y1="${Y(t)}" y2="${Y(t)}"/><text x="${L - 8}" y="${Y(t) + 4}" text-anchor="end">${esc(fmtV(t))}</text>`;
  });

  // Labels X
  labels.forEach((l, i) => {
    g += `<text x="${X(i)}" y="${H - 8}" text-anchor="middle">${l}</text>`;
  });

  // Series
  SR.forEach(s => {
    let seg = [];
    const segs = [];
    s.vals.forEach((v, i) => {
      if (v == null) {
        if (seg.length) segs.push(seg);
        seg = [];
      } else {
        seg.push([X(i), Y(v)]);
      }
    });
    if (seg.length) segs.push(seg);

    if (s.fill) {
      segs.forEach(sg => {
        if (sg.length > 1) {
          g += `<path d="M${sg[0][0]},${T + ph} L${sg.map(p => p.join(',')).join(' L')} L${sg[sg.length - 1][0]},${T + ph}Z" fill="${s.color}" opacity=".1"/>`;
        }
      });
    }

    segs.forEach(sg => {
      if (sg.length === 1 && s.dash) {
        g += `<line x1="${sg[0][0] - 14}" x2="${sg[0][0] + 14}" y1="${sg[0][1]}" y2="${sg[0][1]}" stroke="${s.color}" stroke-width="2" stroke-dasharray="4 3"/>`;
      } else {
        g += `<path d="M${sg.map(p => p.join(',')).join(' L')}" fill="none" stroke="${s.color}" stroke-width="${s.w || 2.4}" ${s.dash ? 'stroke-dasharray="6 5"' : ''} stroke-linejoin="round" stroke-linecap="round"/>`;
      }
    });

    if (!s.nopts) {
      s.vals.forEach((v, i) => {
        if (v != null) {
          g += `<circle cx="${X(i)}" cy="${Y(v)}" r="${s.dash ? 2.5 : 4}" fill="${s.ptColors ? s.ptColors[i] : s.color}" stroke="var(--bg-card)" stroke-width="2"/>`;
        }
      });
    }
  });

  // Interactive hover targets
  labels.forEach((l, i) => {
    let t = `<b>${l}</b>`;
    SR.forEach(s => {
      if (s.vals[i] != null) t += `<br><span style="color:${s.color}">●</span> ${esc(s.name)}: <b>${esc(fmtV(s.vals[i]))}</b>`;
    });
    if (tipExtra) t += tipExtra(i);
    g += `<rect class="hit" x="${L + pw * i / labels.length}" y="${T}" width="${pw / labels.length}" height="${ph}" data-tip="${esc(t)}"/>`;
  });

  return g + '</svg>';
}

export function stackBars(labels, data, H = 210) {
  const PCOL = { cerrado: '#10b981', curso: '#f59e0b', abierto: '#3b82f6', vencido: '#ef4444' };
  const W = 380, L = 28, R = 8, T = 14, B = 24;
  const pw = W - L - R, ph = H - T - B;
  const keys = ['cerrado', 'curso', 'abierto', 'vencido'];
  const tot = data.map(d => keys.reduce((a, k) => a + d[k], 0));
  const mx = Math.max(1, ...tot);
  const sc = niceScale(0, mx, 4);
  const Y = v => T + ph - v / sc.hi * ph;
  const bw = Math.min(24, pw / labels.length * 0.62);

  let g = `<svg class="chart" viewBox="0 0 ${W} ${H}">`;
  sc.ticks.forEach(t => {
    g += `<line class="gl" x1="${L}" x2="${W - R}" y1="${Y(t)}" y2="${Y(t)}"/><text x="${L - 6}" y="${Y(t) + 4}" text-anchor="end">${t}</text>`;
  });

  labels.forEach((l, i) => {
    const cx = L + pw * (i + 0.5) / labels.length;
    let acc = 0;
    g += `<text x="${cx}" y="${H - 7}" text-anchor="middle">${l}</text>`;
    keys.forEach(k => {
      const v = data[i][k];
      if (!v) return;
      const y0 = Y(acc), y1 = Y(acc + v);
      g += `<rect x="${cx - bw / 2}" y="${y1}" width="${bw}" height="${Math.max(1, y0 - y1 - 1)}" rx="3" fill="${PCOL[k]}" opacity=".9"/>`;
      acc += v;
    });
    if (tot[i]) {
      g += `<text x="${cx}" y="${Y(tot[i]) - 5}" text-anchor="middle" style="fill:var(--text-main);font-weight:700">${tot[i]}</text>`;
    }
    g += `<rect class="hit" x="${L + pw * i / labels.length}" y="${T}" width="${pw / labels.length}" height="${ph}" data-tip="${esc(`<b>${l}</b><br>Cerrados ${data[i].cerrado} · En curso ${data[i].curso}<br>Abiertos ${data[i].abierto} · Vencidos ${data[i].vencido}`)}"/>`;
  });

  return g + '</svg>';
}
