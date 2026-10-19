// 描画の部品: メルカトル補正と階級配色（Python版 scripts/gen_overlay.py の to_mercator / colorize / legend と同じ考え方）

const my = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));

// メルカトル投影した画像の高さ（横幅 width px、経度幅 lonSpan° のとき、縦横比がメルカトルで等しくなる高さ）
export function mercatorHeight(width, south, north, west, east) {
  return Math.max(2, Math.round(((my(north) - my(south)) * width) / (((east - west) * Math.PI) / 180)));
}

// 出力の各行(メルカトルで等間隔)が、緯度等間隔のデータのどの行に当たるか（最近傍）
export function mercatorRowIndex(outH, srcH, south, north) {
  const top = my(north), bottom = my(south);
  const rows = new Int32Array(outH);
  for (let r = 0; r < outH; r++) {
    const y = top + ((bottom - top) * (r + 0.5)) / outH;
    const lat = (2 * Math.atan(Math.exp(y)) - Math.PI / 2) * (180 / Math.PI);
    rows[r] = Math.min(srcH - 1, Math.max(0, Math.floor(((north - lat) / (north - south)) * srcH)));
  }
  return rows;
}

const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));

// 値 → 階級番号。範囲外（透明にする場合）は -1
// extend=both: colors は「最小未満, 各階級…, 最大以上」（levels.length + 1 色）
// extend=max : colors は「各階級…, 最大以上」（levels.length 色）。最小階級未満は透明
export function classIndex(v, levels, extend) {
  if (Number.isNaN(v)) return -1;
  let k = 0;
  while (k < levels.length && v >= levels[k]) k++;   // k = v 以下の境界の数
  if (extend === "max") return k === 0 ? -1 : k - 1;
  return k;
}

// DataObject（緯度等間隔）→ メルカトル補正した階級配色の Canvas
export function toCanvas(dataObject, def, alpha = 190) {
  const { width, height, data, bbox } = dataObject;
  const [west, south, east, north] = bbox;
  const outH = mercatorHeight(width, south, north, west, east);
  const rows = mercatorRowIndex(outH, height, south, north);
  const rgb = def.colors.map(hex);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(width, outH);
  for (let r = 0; r < outH; r++) {
    const src = rows[r] * width;
    for (let c = 0; c < width; c++) {
      const k = classIndex(data[src + c], def.levels, def.extend);
      if (k < 0) continue;                     // 透明のまま
      const o = (r * width + c) * 4;
      img.data[o] = rgb[k][0]; img.data[o + 1] = rgb[k][1]; img.data[o + 2] = rgb[k][2]; img.data[o + 3] = alpha;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}
