// 衛星データのオーバーレイを Leaflet 上に表示する（データセット切替・日付選択）
const DATA_DIR = "data/";

const map = L.map("map").setView([36, 136], 5);
// 背景は国土地理院タイル（APIキー不要・出典表示必須）
L.tileLayer("https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png", {
  attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html">国土地理院</a>',
  maxZoom: 18,
}).addTo(map);

let overlay = null;
let meta = null;
let sourceControl = null;
let timer = null; // 再生中のタイマー
let marker = null;
const gridCache = new Map(); // `${id}/${date}` → Int16Array
const dsSel = document.getElementById("dataset");
const dateSel = document.getElementById("date");
const opacity = document.getElementById("opacity");
const slider = document.getElementById("slider");
const playBtn = document.getElementById("play");

function showDate(d) {
  if (overlay) map.removeLayer(overlay);
  overlay = L.imageOverlay(`${DATA_DIR}${meta.id}/${d}.png`, meta.bounds, { opacity: Number(opacity.value) }).addTo(map);
  dateSel.value = d;
  slider.value = meta.dates.indexOf(d);
}

function step(delta) {
  const i = meta.dates.indexOf(dateSel.value) + delta;
  if (i >= 0 && i < meta.dates.length) showDate(meta.dates[i]);
}

// 凡例: 色の帯と、階級境界の位置に値ラベルを置く（extend=both は先頭に「最小未満」の帯がある）
function drawLegend() {
  const n = meta.colors.length;
  const offset = meta.extend === "both" ? 1 : 0;
  const bar = meta.colors.map((c) => `<span style="background:${c}"></span>`).join("");
  const labels = meta.levels
    .map((v, k) => `<span style="left:${((k + offset) / n) * 100}%">${v}</span>`)
    .join("");
  document.getElementById("legend").innerHTML =
    `<div class="bar">${bar}</div><div class="labels">${labels}</div><div class="unit">${meta.unit}</div>`;
}

// 出典は選択中のデータセットのものだけを表示する
function setSource() {
  if (sourceControl) map.attributionControl.removeAttribution(sourceControl);
  sourceControl = `出典: JAXA Earth API / ${meta.citation}`;
  map.attributionControl.addAttribution(sourceControl);
}

async function loadDataset(id) {
  stopPlay();
  meta = await (await fetch(`${DATA_DIR}${id}/index.json`)).json();
  dateSel.innerHTML = meta.dates.map((d) => `<option>${d}</option>`).join("");
  slider.max = meta.dates.length - 1;
  slider.disabled = playBtn.disabled = meta.dates.length < 2;
  drawLegend();
  setSource();
  if (marker) { map.removeLayer(marker); marker = null; }
  showDate(meta.dates[meta.dates.length - 1]);
}

fetch(`${DATA_DIR}datasets.json`)
  .then((r) => r.json())
  .then((list) => {
    dsSel.innerHTML = list.map((d) => `<option value="${d.id}">${d.label}</option>`).join("");
    // ?ds=sst のように初期データセットを指定できる
    const q = new URLSearchParams(location.search).get("ds");
    const id = list.some((d) => d.id === q) ? q : list[0].id;
    dsSel.value = id;
    loadDataset(id);
  });

dsSel.addEventListener("change", () => loadDataset(dsSel.value));
dateSel.addEventListener("change", () => showDate(dateSel.value));
document.getElementById("prev").addEventListener("click", () => step(-1));
document.getElementById("next").addEventListener("click", () => step(1));
opacity.addEventListener("input", () => overlay && overlay.setOpacity(Number(opacity.value)));

// ---- 時系列スライダー・再生 ----
slider.addEventListener("input", () => showDate(meta.dates[Number(slider.value)]));

function stopPlay() {
  if (timer) clearInterval(timer);
  timer = null;
  playBtn.textContent = "▶▶";
}

playBtn.addEventListener("click", () => {
  if (timer) return stopPlay();
  playBtn.textContent = "■";
  timer = setInterval(() => {
    const i = (meta.dates.indexOf(dateSel.value) + 1) % meta.dates.length; // 最後まで行ったら先頭へ
    showDate(meta.dates[i]);
  }, 1200);
});

// ---- クリック地点の値と時系列 ----
// 値グリッド: Int16(×scale)をgzip圧縮したもの。欠測は-32768。行は北→南、列は西→東
async function loadGrid(date) {
  const key = `${meta.id}/${date}`;
  if (!gridCache.has(key)) {
    const res = await fetch(`${DATA_DIR}${meta.id}/${date}.bin.gz`);
    let buf = await res.arrayBuffer();
    // サーバーが Content-Encoding: gzip を付けて転送時に解凍済みの場合は、先頭がgzipの印(1f 8b)ではない
    const b = new Uint8Array(buf);
    if (b[0] === 0x1f && b[1] === 0x8b) {
      buf = await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
    }
    gridCache.set(key, new Int16Array(buf));
  }
  return gridCache.get(key);
}

function valueAt(grid, lat, lng) {
  const [[south, west], [north, east]] = meta.bounds;
  if (lat < south || lat >= north || lng < west || lng >= east) return undefined; // 範囲外
  const row = Math.floor(((north - lat) / (north - south)) * meta.height);
  const col = Math.floor(((lng - west) / (east - west)) * meta.width);
  const v = grid[row * meta.width + col];
  return v === -32768 ? null : v / meta.scale;
}

const fmt = (v) => (v == null ? "データなし" : `${Number(v.toPrecision(3))}`);

// 折れ線グラフ(SVG)。欠測は線を切る
function chartSvg(dates, values) {
  const W = 240, H = 110, m = { l: 34, r: 8, t: 8, b: 20 };
  const ok = values.filter((v) => v != null);
  if (ok.length === 0) return "";
  let lo = Math.min(...ok), hi = Math.max(...ok);
  if (lo === hi) { lo -= 1; hi += 1; }
  // 横軸は日付に比例させる（欠月があっても間隔が歪まない）
  const t = dates.map((d) => Date.parse(d));
  const x = (i) => m.l + (t.length < 2 ? 0 : ((t[i] - t[0]) / (t[t.length - 1] - t[0])) * (W - m.l - m.r));
  const y = (v) => m.t + (1 - (v - lo) / (hi - lo)) * (H - m.t - m.b);
  let path = "", pen = false;
  values.forEach((v, i) => {
    if (v == null) { pen = false; return; }
    path += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
    pen = true;
  });
  const dots = values.map((v, i) => (v == null ? "" : `<circle cx="${x(i)}" cy="${y(v)}" r="3" fill="#1a6fd1"/>`)).join("");
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="時系列グラフ">
    <line x1="${m.l}" y1="${H - m.b}" x2="${W - m.r}" y2="${H - m.b}" stroke="#999"/>
    <line x1="${m.l}" y1="${m.t}" x2="${m.l}" y2="${H - m.b}" stroke="#999"/>
    <path d="${path}" fill="none" stroke="#1a6fd1" stroke-width="2"/>${dots}
    <text class="axis" x="${m.l - 3}" y="${m.t + 8}" text-anchor="end">${fmt(hi)}</text>
    <text class="axis" x="${m.l - 3}" y="${H - m.b}" text-anchor="end">${fmt(lo)}</text>
    <text class="axis" x="${m.l}" y="${H - 6}" text-anchor="start">${dates[0]}</text>
    <text class="axis" x="${W - m.r}" y="${H - 6}" text-anchor="end">${dates[dates.length - 1]}</text></svg>`;
}

map.on("click", async (e) => {
  if (!meta) return;
  const id = meta.id;
  const dates = meta.dates;
  try {
    const grids = await Promise.all(dates.map(loadGrid));
    if (id !== meta.id) return; // 読み込み中にデータセットが切り替わった
    const values = grids.map((g) => valueAt(g, e.latlng.lat, e.latlng.lng));
    if (values[0] === undefined) return; // データ範囲外
    const cur = values[dates.indexOf(dateSel.value)];
    const chart = dates.length > 1 ? `<div class="chart">${chartSvg(dates, values)}</div>` : "";
    if (marker) map.removeLayer(marker);
    marker = L.circleMarker(e.latlng, { radius: 5, color: "#000", weight: 2, fillOpacity: 0 }).addTo(map);
    marker.bindPopup(
      `<div class="pt-value">${dateSel.value}: ${fmt(cur)} ${meta.unit}</div>` +
      `<div>${e.latlng.lat.toFixed(2)}°N ${e.latlng.lng.toFixed(2)}°E</div>${chart}`,
      { minWidth: 240 }
    ).openPopup();
  } catch (err) {
    console.error("値の取得に失敗", err);
  }
});
