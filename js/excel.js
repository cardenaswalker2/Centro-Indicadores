/**
 * excel.js - Lector y escritor nativo XLSX y CSV sin dependencias externas
 */

const CRC_T = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(u8) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < u8.length; i++) c = CRC_T[(c ^ u8[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function zipStore(files) {
  const enc = new TextEncoder(), parts = [], cd = [];
  let off = 0;
  files.forEach(f => {
    const nb = enc.encode(f.name), data = enc.encode(f.text), crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true);
    lh.setUint16(4, 20, true);
    lh.setUint16(6, 0x0800, true);
    lh.setUint16(12, 33, true);
    lh.setUint32(14, crc, true);
    lh.setUint32(18, data.length, true);
    lh.setUint32(22, data.length, true);
    lh.setUint16(26, nb.length, true);
    parts.push(new Uint8Array(lh.buffer), nb, data);
    
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true);
    ch.setUint16(4, 20, true);
    ch.setUint16(6, 20, true);
    ch.setUint16(8, 0x0800, true);
    ch.setUint16(14, 33, true);
    ch.setUint32(16, crc, true);
    ch.setUint32(20, data.length, true);
    ch.setUint32(24, data.length, true);
    ch.setUint16(28, nb.length, true);
    ch.setUint32(42, off, true);
    cd.push(new Uint8Array(ch.buffer), nb);
    off += 30 + nb.length + data.length;
  });
  
  const cdSize = cd.reduce((a, b) => a + b.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, files.length, true);
  e.setUint16(10, files.length, true);
  e.setUint32(12, cdSize, true);
  e.setUint32(16, off, true);
  return new Blob([...parts, ...cd, new Uint8Array(e.buffer)], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
}

const xe = s => String(s ?? '')
  .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

function colName(i) {
  let s = ''; i++;
  while (i > 0) {
    const m = (i - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    i = Math.floor((i - 1) / 26);
  }
  return s;
}

export function buildXlsx(sheets) {
  const NS = 'http://schemas.openxmlformats.org';
  const files = [];
  
  files.push({
    name: '[Content_Types].xml',
    text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="${NS}/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`
  });

  files.push({
    name: '_rels/.rels',
    text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${NS}/package/2006/relationships"><Relationship Id="rId1" Type="${NS}/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`
  });

  files.push({
    name: 'xl/workbook.xml',
    text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="${NS}/spreadsheetml/2006/main" xmlns:r="${NS}/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${xe(s.name.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`
  });

  files.push({
    name: 'xl/_rels/workbook.xml.rels',
    text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${NS}/package/2006/relationships">${sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="${NS}/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="${NS}/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`
  });

  files.push({
    name: 'xl/styles.xml',
    text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="${NS}/spreadsheetml/2006/main"><fonts count="3"><font><sz val="11"/><name val="Segoe UI"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Segoe UI"/></font><font><i/><sz val="10"/><color rgb="FF6B7280"/><name val="Segoe UI"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF3B82F6"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`
  });

  sheets.forEach((s, si) => {
    let rows = '';
    s.rows.forEach((r, ri) => {
      let cells = '';
      r.forEach((v, ci) => {
        if (v == null || v === '') return;
        const ref = colName(ci) + (ri + 1);
        const st = (ri === 0 && !s.noHeader) ? 1 : (s.note ? 2 : 0);
        if (typeof v === 'number' && isFinite(v)) {
          cells += `<c r="${ref}" s="${st}"><v>${v}</v></c>`;
        } else {
          cells += `<c r="${ref}" s="${st}" t="inlineStr"><is><t xml:space="preserve">${xe(v)}</t></is></c>`;
        }
      });
      rows += `<row r="${ri + 1}">${cells}</row>`;
    });

    const cols = s.widths ? `<cols>${s.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';
    const view = s.noHeader ? '' : `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`;
    files.push({
      name: `xl/worksheets/sheet${si + 1}.xml`,
      text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="${NS}/spreadsheetml/2006/main">${view}${cols}<sheetData>${rows}</sheetData></worksheet>`
    });
  });

  return zipStore(files);
}

async function inflateRaw(u8) {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Navegador no soporta descompresión nativa de archivos .xlsx. Por favor use una versión moderna de Chrome o Edge, o convierta el archivo a formato .csv.');
  }
  const out = new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(out).arrayBuffer());
}

async function unzip(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let e = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 70000); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
  }
  if (e < 0) throw new Error('El archivo proporcionado no es un paquete .xlsx válido.');

  const n = dv.getUint16(e + 10, true);
  let p = dv.getUint32(e + 16, true);
  const dec = new TextDecoder(), map = {};

  for (let i = 0; i < n; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const csz = dv.getUint32(p + 20, true);
    const nl = dv.getUint16(p + 28, true);
    const el = dv.getUint16(p + 30, true);
    const cl = dv.getUint16(p + 32, true);
    const lo = dv.getUint32(p + 42, true);
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nl));
    const st = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true);
    map[name] = { method, data: buf.subarray(st, st + csz) };
    p += 46 + nl + el + cl;
  }

  return {
    async text(name) {
      const f = map[name];
      if (!f) return null;
      return dec.decode(f.method === 0 ? f.data : await inflateRaw(f.data));
    }
  };
}

export async function readXlsx(buf) {
  const z = await unzip(buf);
  const dp = new DOMParser();
  const parse = t => dp.parseFromString(t, 'application/xml');

  const wbT = await z.text('xl/workbook.xml');
  if (!wbT) throw new Error('El archivo no parece ser un libro de Excel válido.');

  const wb = parse(wbT);
  const rels = parse(await z.text('xl/_rels/workbook.xml.rels'));
  const relMap = {};
  Array.from(rels.getElementsByTagName('Relationship')).forEach(r => relMap[r.getAttribute('Id')] = r.getAttribute('Target'));

  let ss = [];
  const ssT = await z.text('xl/sharedStrings.xml');
  if (ssT) {
    ss = Array.from(parse(ssT).getElementsByTagName('si')).map(si =>
      Array.from(si.getElementsByTagName('t')).map(t => t.textContent).join('')
    );
  }

  const out = [];
  for (const sh of Array.from(wb.getElementsByTagName('sheet'))) {
    const rid = sh.getAttribute('r:id') || sh.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    let tg = relMap[rid];
    if (!tg) continue;
    tg = tg.replace(/^\//, '');
    const xt = await z.text(tg.startsWith('xl/') ? tg : 'xl/' + tg);
    if (!xt) continue;
    
    const doc = parse(xt);
    const rows = [];
    Array.from(doc.getElementsByTagName('row')).forEach(row => {
      const ri = parseInt(row.getAttribute('r')) - 1;
      const arr = [];
      Array.from(row.getElementsByTagName('c')).forEach(c => {
        const m = (c.getAttribute('r') || '').match(/^([A-Z]+)/);
        if (!m) return;
        let ci = 0;
        for (const ch of m[1]) ci = ci * 26 + (ch.charCodeAt(0) - 64);
        ci--;
        const t = c.getAttribute('t');
        const vEl = c.getElementsByTagName('v')[0];
        let v = '';
        if (t === 's') v = ss[parseInt(vEl ? vEl.textContent : '-1')] ?? '';
        else if (t === 'inlineStr') v = Array.from(c.getElementsByTagName('t')).map(x => x.textContent).join('');
        else if (t === 'str') v = vEl ? vEl.textContent : '';
        else if (t === 'b' || t === 'e') v = '';
        else if (vEl && vEl.textContent !== '') {
          const nn = parseFloat(vEl.textContent);
          v = isNaN(nn) ? vEl.textContent : nn;
        }
        arr[ci] = v;
      });
      rows[ri >= 0 ? ri : rows.length] = arr;
    });

    for (let i = 0; i < rows.length; i++) rows[i] = rows[i] || [];
    out.push({ name: sh.getAttribute('name'), rows });
  }
  return out;
}

export function parseCSV(text) {
  text = text.replace(/^\uFEFF/, '');
  const first = text.split(/\r?\n/)[0] || '';
  const cnt = d => first.split(d).length - 1;
  const delim = cnt(';') >= cnt(',') && cnt(';') >= cnt('\t') ? ';' : (cnt('\t') > cnt(',') ? '\t' : ',');
  const rows = [];
  let row = [], cur = '', q = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; }
        else q = false;
      } else cur += ch;
    } else if (ch === '"') {
      q = true;
    } else if (ch === delim) {
      row.push(cur);
      cur = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cur);
      cur = '';
      rows.push(row);
      row = [];
    } else {
      cur += ch;
    }
  }
  if (cur !== '' || row.length) {
    row.push(cur);
    rows.push(row);
  }
  return [{ name: 'Mediciones', rows }];
}

export async function readAnyFile(file) {
  const n = file.name.toLowerCase();
  if (n.endsWith('.csv') || n.endsWith('.txt')) {
    return parseCSV(await file.text());
  }
  return await readXlsx(new Uint8Array(await file.arrayBuffer()));
}
