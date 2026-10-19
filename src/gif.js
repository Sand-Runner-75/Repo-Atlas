/* A small animated GIF encoder: one shared 256-color palette, LZW-compressed frames, loops forever.
   Good enough for flat charts like the branch graph; not meant for photos. */
(function () {
"use strict";
// frames: [{ data: Uint8ClampedArray (RGBA, width × height), delay: ms }], all the same size. The palette comes from paletteFrom.
function encodeGif(width, height, frames, paletteFrom) {
  const pal = buildPalette(paletteFrom || frames[frames.length - 1].data);
  const out = [];
  const b = (x) => out.push(x & 255), w16 = (x) => { b(x); b(x >> 8); }, str = (s) => { for (const c of s) b(c.charCodeAt(0)); };
  str("GIF89a"); w16(width); w16(height);
  b(0xf7); b(0); b(0); // global color table of 256 entries
  for (let i = 0; i < 256; i++) { const c = pal.colors[i] || [0, 0, 0]; b(c[0]); b(c[1]); b(c[2]); }
  b(0x21); b(0xff); b(11); str("NETSCAPE2.0"); b(3); b(1); w16(0); b(0); // loop forever
  for (const f of frames) {
    b(0x21); b(0xf9); b(4); b(0); w16(Math.round((f.delay || 100) / 10)); b(0); b(0);
    b(0x2c); w16(0); w16(0); w16(width); w16(height); b(0);
    const px = new Uint8Array(width * height), d = f.data;
    for (let i = 0, j = 0; i < px.length; i++, j += 4) px[i] = pal.index(d[j], d[j + 1], d[j + 2]);
    lzw(px, 8, out);
  }
  b(0x3b);
  return new Uint8Array(out);
}
// The 256 most common colors (after trimming each channel to 5 bits), then nearest-match for everything else
function buildPalette(rgba) {
  const counts = new Map();
  for (let j = 0; j < rgba.length; j += 4) { const k = (rgba[j] >> 3) << 10 | (rgba[j + 1] >> 3) << 5 | rgba[j + 2] >> 3; counts.set(k, (counts.get(k) || 0) + 1); }
  const keys = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 256).map(([k]) => k);
  const colors = keys.map((k) => [((k >> 10) & 31) << 3 | 4, ((k >> 5) & 31) << 3 | 4, (k & 31) << 3 | 4]);
  const memo = new Map();
  return {
    colors,
    index(r, g, b) {
      const k = (r >> 3) << 10 | (g >> 3) << 5 | b >> 3;
      let i = memo.get(k);
      if (i === undefined) {
        let best = Infinity; i = 0;
        for (let n = 0; n < colors.length; n++) { const c = colors[n], e = (c[0] - r) ** 2 * 3 + (c[1] - g) ** 2 * 4 + (c[2] - b) ** 2 * 2; if (e < best) { best = e; i = n; } }
        memo.set(k, i);
      }
      return i;
    },
  };
}
// Variable-width LZW as GIF wants it, written in sub-blocks of up to 255 bytes
function lzw(px, minSize, out) {
  out.push(minSize);
  const clear = 1 << minSize, eoi = clear + 1;
  let size = minSize + 1, next = eoi + 1, dict = new Map();
  const buf = []; let acc = 0, nbits = 0;
  const emit = (code) => { acc |= code << nbits; nbits += size; while (nbits >= 8) { buf.push(acc & 255); acc >>>= 8; nbits -= 8; } };
  emit(clear);
  let prefix = px[0];
  for (let i = 1; i < px.length; i++) {
    const k = px[i], key = prefix << 8 | k, hit = dict.get(key);
    if (hit !== undefined) { prefix = hit; continue; }
    emit(prefix);
    if (next < 4096) { dict.set(key, next++); if (next > (1 << size) && size < 12) size++; }
    else { emit(clear); dict = new Map(); size = minSize + 1; next = eoi + 1; }
    prefix = k;
  }
  emit(prefix); emit(eoi);
  if (nbits > 0) buf.push(acc & 255);
  for (let i = 0; i < buf.length; i += 255) { const n = Math.min(255, buf.length - i); out.push(n); for (let j = 0; j < n; j++) out.push(buf[i + j]); }
  out.push(0);
}
window.encodeGif = encodeGif;
})();
