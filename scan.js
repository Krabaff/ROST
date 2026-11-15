// Распознавание штрихкодов EAN-13 / UPC-A / EAN-8 по строкам яркости кадра (без библиотек)
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Scan = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
  const R = L.map((c) => c.replace(/./g, (b) => (b === '0' ? '1' : '0')));
  const G = R.map((c) => c.split('').reverse().join(''));
  const PAR = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

  function checksumOk(s) {
    if (!/^\d+$/.test(s) || (s.length !== 13 && s.length !== 8)) return false;
    let t = 0; for (let i = 0; i < s.length - 1; i++) t += +s[s.length - 2 - i] * (i % 2 === 0 ? 3 : 1);
    return (10 - (t % 10)) % 10 === +s[s.length - 1];
  }

  // Бинаризация строки: порог — середина между локальным минимумом и максимумом
  function binarize(row) {
    const n = row.length, B = 8, nb = Math.ceil(n / B), lo = new Float64Array(nb), hi = new Float64Array(nb);
    for (let b = 0; b < nb; b++) { let mn = 1e9, mx = -1e9; for (let i = b * B; i < Math.min(n, (b + 1) * B); i++) { if (row[i] < mn) mn = row[i]; if (row[i] > mx) mx = row[i]; } lo[b] = mn; hi[b] = mx; }
    const wb = Math.max(4, Math.round(n / 8 / B)), bits = new Uint8Array(n);
    for (let b = 0; b < nb; b++) {
      let mn = 1e9, mx = -1e9;
      for (let k = Math.max(0, b - wb); k <= Math.min(nb - 1, b + wb); k++) { if (lo[k] < mn) mn = lo[k]; if (hi[k] > mx) mx = hi[k]; }
      const thr = (mn + mx) / 2, ok = mx - mn > 40;
      for (let i = b * B; i < Math.min(n, (b + 1) * B); i++) bits[i] = ok && row[i] < thr ? 1 : 0;
    }
    return bits;
  }
  function runsOf(bits) {
    const out = []; let s = 0;
    for (let i = 1; i <= bits.length; i++) if (i === bits.length || bits[i] !== bits[s]) { out.push({ d: bits[s] === 1, x: s, w: i - s }); s = i; }
    return out;
  }
  const bitAt = (bits, x) => { const i = Math.round(x); return i < 0 || i >= bits.length ? 0 : bits[i]; };
  const seg = (bits, x0, u, m0, n) => { let s = ''; for (let k = 0; k < n; k++) s += bitAt(bits, x0 + (m0 + k + 0.5) * u); return s; };

  function tryDecode(bits, runs, kind) {
    const digits = kind === 13 ? 6 : 4, nRuns = 3 + digits * 4 + 5 + digits * 4 + 3, mods = 3 + digits * 7 + 5 + digits * 7 + 3;
    for (let i = 0; i + nRuns <= runs.length; i++) {
      if (!runs[i].d) continue;
      const a = runs[i], b = runs[i + 1], c = runs[i + 2], e = runs[i + nRuns - 1];
      const x0 = a.x, x1 = e.x + e.w, u = (x1 - x0) / mods;
      if (u < 1.1) continue;
      if ([a, b, c].some((r) => r.w < 0.55 * u || r.w > 1.7 * u)) continue;
      if (i > 0 && runs[i - 1].w < 3 * u && i - 1 !== 0) continue;
      if (seg(bits, x0, u, 0, 3) !== '101') continue;
      const cm = 3 + digits * 7; if (seg(bits, x0, u, cm, 5) !== '01010') continue;
      if (seg(bits, x0, u, mods - 3, 3) !== '101') continue;
      let out = '', par = '', ok = true;
      for (let k = 0; k < digits && ok; k++) {
        const s = seg(bits, x0, u, 3 + 7 * k, 7); let d = L.indexOf(s), p = 'L';
        if (d < 0 || (kind === 13 && k === 0 && false)) { d = G.indexOf(s); p = 'G'; }
        if (d < 0 || (kind === 8 && p === 'G')) ok = false; else { out += d; par += p; }
      }
      if (!ok) continue;
      for (let k = 0; k < digits && ok; k++) { const d = R.indexOf(seg(bits, x0, u, cm + 5 + 7 * k, 7)); if (d < 0) ok = false; else out += d; }
      if (!ok) continue;
      if (kind === 13) { const f = PAR.indexOf(par); if (f < 0) continue; out = f + out; }
      if (checksumOk(out)) return out;
    }
    return null;
  }

  function decodeRow(row) {
    const bits = binarize(row);
    const fwd = runsOf(bits);
    const rev = runsOf(Uint8Array.from(bits).reverse());
    for (const runs of [fwd, rev]) {
      const bb = runs === fwd ? bits : Uint8Array.from(bits).reverse();
      const r = tryDecode(bb, runs, 13) || tryDecode(bb, runs, 8);
      if (r) return r;
    }
    return null;
  }

  // gray: Uint8ClampedArray/Array яркости W×H. Пробуем несколько строк около центра
  function decodeGray(gray, W, H) {
    const fr = [0.5, 0.42, 0.58, 0.34, 0.66, 0.46, 0.54, 0.38, 0.62, 0.28, 0.72];
    for (const f of fr) {
      const y = Math.min(H - 1, Math.max(0, Math.round(H * f))), row = new Float64Array(W);
      for (let x = 0; x < W; x++) row[x] = (gray[y * W + x] + gray[Math.min(H - 1, y + 1) * W + x] + gray[Math.max(0, y - 1) * W + x]) / 3;
      const r = decodeRow(row); if (r) return r;
    }
    return null;
  }
  // RGBA (ImageData.data) → gray
  function decodeRGBA(data, W, H) {
    const g = new Uint8Array(W * H);
    for (let i = 0, j = 0; j < g.length; j++, i += 4) g[j] = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
    return decodeGray(g, W, H);
  }
  return { decodeRow, decodeGray, decodeRGBA, checksumOk };
});
