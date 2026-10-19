// JS版ビューア: JAXA Earth API for JavaScript(v2.0.1) でブラウザが直接データを取得して描画する
// J2: 表示範囲に合わせた再取得（ズーム・パン）、スライダー・再生、地点クリックの時系列
import * as je from "https://data.earth.jaxa.jp/api/javascript/v2.0.1/jaxa.earth.esm.js";
import { toCanvas } from "./render.js";

const KEEP = { daily: 14, monthly: 12, static: 1 };  // 日付一覧の件数
const MAX_W = 1600;          // 取得する画像の横幅の上限(px)
const CACHE_MAX = 40;        // 描画結果のキャッシュ件数
const REFETCH_DELAY = 400;   // ズーム・パン後に再取得するまでの待ち(ms)

const map = L.map("map").setView([36, 136], 5);
// 背景は国土地理院タイル（APIキー不要・出典表示必須）
L.tileLayer("https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png", {
  attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html">国土地理院</a>',
  maxZoom: 18,
}).addTo(map);

const el = (id) => document.getElementById(id);
const dsSel = el("dataset"), dateSel = el("date"), opacity = el("opacity"), statusEl = el("status");
const slider = el("slider"), playBtn = el("play");
let defs = [], def = null, ic = null, dates = [], overlay = null, marker = null, current = null, sourceText = null;
let seq = 0;                        // 古い読み込み結果を捨てるための連番
let playing = false;
let refetchTimer = null;
const icCache = new Map();
const renderCache = new Map();      // キー → { data, url }（挿入順で古いものから捨てる）

function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.className = isError ? "error" : "";
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ImageCollection は初期化に通信が要るのでURLごとにキャッシュ
async function collection(url) {
  if (!icCache.has(url)) {
    const c = new je.ImageCollection({ collectionUrl: url });
    await c.init();
    icCache.set(url, c);
  }
  return icCache.get(url);
}

// 表示対象の日付一覧（新しい方から keep 件。昇順で返す）
async function listDates(c, d) {
  const last = c.last();
  if (d.freq === "static") return [last];
  const n = KEEP[d.freq];
  const from = d.freq === "monthly"
    ? new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth() - (n - 1), 1))
    : new Date(last.getTime() - (n - 1) * 86400000);
  return await c.getDateAll(from, new Date(last.getTime() + 1));
}

// 現在の表示範囲(+25%の余白)から取得範囲と画像サイズを決める。経度は±180、緯度は±85に収める
function viewRequest() {
  const b = map.getBounds().pad(0.25);
  const west = Math.max(-180, b.getWest()), east = Math.min(180, b.getEast());
  const south = Math.max(-85, b.getSouth()), north = Math.min(85, b.getNorth());
  const px = map.getSize().x * 1.5 * ((east - west) / (b.getEast() - b.getWest()));
  const width = Math.max(64, Math.min(MAX_W, Math.round(px)));
  const height = Math.max(2, Math.round((width * (north - south)) / (east - west)));
  return { bbox: [west, south, east, north], width, height, zoom: map.getZoom() };
}

// 1日分のデータを取得する（平年差・単位換算を含む）。getter(url, band, date) で範囲・サイズを差し替えられる
async function fetchWith(d, date, getter) {
  const obs = await getter(d.collectionUrl, d.band, date);
  // 未公開の日付を指定すると直近のデータが返るため、日付の不一致を検出する
  if (obs.formattedDate !== ic.formatDate(date)) {
    throw new Error(`未公開の日付です（${obs.formattedDate} が返りました）`);
  }
  if (d.normal) {
    const nor = await getter(d.normal.collectionUrl, d.normal.band, obs.date);
    return je.data.compute({ dataObjects: [obs, nor], operation: (a, b) => a - b, unit: obs.unit, date: obs.date, formattedDate: obs.formattedDate });
  }
  if (d.convert === "K2C") {
    return je.data.compute({ dataObjects: [obs], operation: (v) => v - 273.15, unit: "degC", date: obs.date, formattedDate: obs.formattedDate });
  }
  return obs;
}

const viewGetter = (req) => (url, band, date) => je.getDataObject({ collectionUrl: url, band, bbox: req.bbox, width: req.width, height: req.height, date });

function drawLegend() {
  const n = def.colors.length, offset = def.extend === "both" ? 1 : 0;
  const bar = def.colors.map((c) => `<span style="background:${c}"></span>`).join("");
  const labels = def.levels.map((v, k) => `<span style="left:${((k + offset) / n) * 100}%">${v}</span>`).join("");
  el("legend").innerHTML = `<div class="bar">${bar}</div><div class="labels">${labels}</div><div class="unit">${def.unit}</div>`;
}

function setSource() {
  if (sourceText) map.attributionControl.removeAttribution(sourceText);
  sourceText = `出典: JAXA Earth API / ${def.citation}`;
  map.attributionControl.addAttribution(sourceText);
}

// 指定日を現在の表示範囲で描画する。再生中のコマ送りでも await できる
async function showDate(date) {
  const my = ++seq;
  const req = viewRequest();
  const key = `${def.id}|${date.getTime()}|${req.bbox.join(",")}|${req.width}`;
  const t0 = performance.now();
  let hit = renderCache.get(key);
  try {
    if (!hit) {
      setStatus("取得中…");
      const data = await fetchWith(def, date, viewGetter(req));
      hit = { data, url: toCanvas(data, def).toDataURL(), req };
      renderCache.set(key, hit);
      if (renderCache.size > CACHE_MAX) renderCache.delete(renderCache.keys().next().value);
    }
    if (my !== seq) return;         // 取得中に別の操作があった
    current = hit;
    const next = L.imageOverlay(hit.url, [[hit.req.bbox[1], hit.req.bbox[0]], [hit.req.bbox[3], hit.req.bbox[2]]], { opacity: Number(opacity.value) }).addTo(map);
    if (overlay) map.removeLayer(overlay);   // 新しい画像を載せてから古い画像を外す（ちらつき防止）
    overlay = next;
    dateSel.value = String(date.getTime());
    slider.value = dates.indexOf(date);
    setStatus(`${hit.data.formattedDate} を表示（${hit.req.width}×${hit.req.height}px・${Math.round(performance.now() - t0)}ms${renderCache.has(key) && performance.now() - t0 < 5 ? "・キャッシュ" : ""}）`);
  } catch (e) {
    if (my !== seq) return;
    console.error(e);
    setStatus("取得に失敗: " + (e.message || e), true);
  }
}

async function loadDataset(id) {
  stopPlay();
  def = defs.find((d) => d.id === id);
  setStatus("読み込み中…");
  const my = ++seq;
  closePoint();
  try {
    ic = await collection(def.collectionUrl);
    dates = await listDates(ic, def);
    if (my !== seq) return;
    dateSel.innerHTML = dates.map((d) => `<option value="${d.getTime()}">${ic.formatDate(d)}</option>`).join("");
    slider.max = dates.length - 1;
    slider.disabled = playBtn.disabled = dates.length < 2;
    drawLegend();
    setSource();
    await showDate(dates[dates.length - 1]);   // 最新を表示
  } catch (e) {
    console.error(e);
    setStatus("読み込みに失敗: " + (e.message || e), true);
  }
}

const dateAt = () => dates.find((d) => String(d.getTime()) === dateSel.value);
function step(delta) {
  stopPlay();
  const i = dates.indexOf(dateAt()) + delta;
  if (i >= 0 && i < dates.length) showDate(dates[i]);
}

// ---- 再生（コマ送り。1コマの取得・描画が終わってから次へ進む）----
function stopPlay() {
  playing = false;
  playBtn.textContent = "▶▶";
}
async function startPlay() {
  playing = true;
  playBtn.textContent = "■";
  while (playing) {
    const i = (dates.indexOf(dateAt()) + 1) % dates.length;   // 最後まで行ったら先頭へ
    await showDate(dates[i]);
    if (playing) await sleep(300);
  }
}
playBtn.addEventListener("click", () => (playing ? stopPlay() : startPlay()));
slider.addEventListener("input", () => { stopPlay(); showDate(dates[Number(slider.value)]); });

// ---- ズーム・パンに合わせた再取得 ----
// 表示範囲が取得済みの範囲に収まり、ズームも変わっていなければ再取得しない
map.on("moveend", () => {
  if (!def || !current) return;
  clearTimeout(refetchTimer);
  refetchTimer = setTimeout(() => {
    const b = map.getBounds();
    const [w, s, e, n] = current.req.bbox;
    const inside = b.getWest() >= w && b.getEast() <= e && b.getSouth() >= s && b.getNorth() <= n;
    if (inside && map.getZoom() === current.req.zoom) return;
    if (!playing) showDate(dateAt());   // 再生中は次のコマが新しい範囲で取得される
  }, REFETCH_DELAY);
});

// ---- 地点クリック: 値と時系列 ----
function closePoint() {
  if (marker) { map.removeLayer(marker); marker = null; }
}

// 表示中の画像と同じ解像度で、クリック地点の1画素（11×11取得の中央）を取るためのgetter
// （getDataObject の幅・高さは10以上が必須。中央は 5*11+5 = 60 番目）
const POINT_N = 11, POINT_CENTER = 5 * POINT_N + 5;
function pointGetter(lat, lng) {
  const req = current.req;
  const ppu = req.width / (req.bbox[2] - req.bbox[0]);   // 表示中の画像の画素数/度
  const half = (POINT_N / 2) / ppu;
  return (url, band, date) => je.getDataObject({ collectionUrl: url, band, bbox: [lng - half, lat - half, lng + half, lat + half], width: POINT_N, height: POINT_N, date });
}

const fmt = (v) => (v == null || Number.isNaN(v) ? "データなし" : `${Number(v.toPrecision(3))}`);

// 折れ線グラフ(SVG)。横軸は日付に比例（欠月があっても間隔が歪まない）。欠測は線を切る
function chartSvg(dts, values) {
  const W = 240, H = 110, m = { l: 34, r: 8, t: 8, b: 20 };
  const ok = values.filter((v) => v != null && !Number.isNaN(v));
  if (ok.length === 0) return "";
  let lo = Math.min(...ok), hi = Math.max(...ok);
  if (lo === hi) { lo -= 1; hi += 1; }
  const t = dts.map((d) => d.getTime());
  const x = (i) => m.l + (t.length < 2 ? 0 : ((t[i] - t[0]) / (t[t.length - 1] - t[0])) * (W - m.l - m.r));
  const y = (v) => m.t + (1 - (v - lo) / (hi - lo)) * (H - m.t - m.b);
  let path = "", pen = false;
  values.forEach((v, i) => {
    if (v == null || Number.isNaN(v)) { pen = false; return; }
    path += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
    pen = true;
  });
  const dots = values.map((v, i) => (v == null || Number.isNaN(v) ? "" : `<circle cx="${x(i)}" cy="${y(v)}" r="3" fill="#1a6fd1"/>`)).join("");
  const lab = (d) => ic.formatDate(d);
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="時系列グラフ">
    <line x1="${m.l}" y1="${H - m.b}" x2="${W - m.r}" y2="${H - m.b}" stroke="#999"/>
    <line x1="${m.l}" y1="${m.t}" x2="${m.l}" y2="${H - m.b}" stroke="#999"/>
    <path d="${path}" fill="none" stroke="#1a6fd1" stroke-width="2"/>${dots}
    <text class="axis" x="${m.l - 3}" y="${m.t + 8}" text-anchor="end">${fmt(hi)}</text>
    <text class="axis" x="${m.l - 3}" y="${H - m.b}" text-anchor="end">${fmt(lo)}</text>
    <text class="axis" x="${m.l}" y="${H - 6}" text-anchor="start">${lab(dts[0])}</text>
    <text class="axis" x="${W - m.r}" y="${H - 6}" text-anchor="end">${lab(dts[dts.length - 1])}</text></svg>`;
}

let clickSeq = 0;
map.on("click", async (e) => {
  if (!current) return;
  const my = ++clickSeq;
  const { lat, lng } = e.latlng;
  const [w, s, ea, n] = current.req.bbox;
  if (lat < s || lat >= n || lng < w || lng >= ea) return;
  closePoint();
  marker = L.circleMarker(e.latlng, { radius: 5, color: "#000", weight: 2, fillOpacity: 0 }).addTo(map);
  marker.bindPopup("読み込み中…", { minWidth: 240 }).openPopup();
  const where = `${lat.toFixed(2)}°N ${lng.toFixed(2)}°E`;
  // 表示中の日付の値は、描画に使ったデータから直接読む（時系列の取得を待たずに先に表示する）
  const cur = current.data;
  const row = Math.floor(((n - lat) / (n - s)) * cur.height), col = Math.floor(((lng - w) / (ea - w)) * cur.width);
  marker.setPopupContent(`<div class="pt-value">${cur.formattedDate}: ${fmt(cur.data[row * cur.width + col])} ${def.unit}</div><div>${where}</div>` + (dates.length > 1 ? "<div class=\"chart\">時系列を取得中…</div>" : ""));
  if (dates.length < 2) return;
  // 全日付の同地点の値を並列で取得する
  const getter = pointGetter(lat, lng);
  const dts = dates.slice(), d = def;
  const values = await Promise.all(dts.map(async (date) => {
    try { return (await fetchWith(d, date, getter)).data[POINT_CENTER]; } catch (err) { console.warn("時系列の取得に失敗", date, err); return null; }
  }));
  if (my !== clickSeq || d !== def || !marker) return;   // 別の地点・データセットに切り替わった
  // 表示中の日付の値が時系列で取れなかった場合は、描画に使ったグリッドの値を使う
  const v0 = values[dts.indexOf(dateAt())];
  const curVal = v0 == null || Number.isNaN(v0) ? cur.data[row * cur.width + col] : v0;
  marker.setPopupContent(`<div class="pt-value">${cur.formattedDate}: ${fmt(curVal)} ${def.unit}</div><div>${where}</div><div class="chart">${chartSvg(dts, values)}</div>`);
});

dsSel.addEventListener("change", () => loadDataset(dsSel.value));
dateSel.addEventListener("change", () => { stopPlay(); showDate(dateAt()); });
el("prev").addEventListener("click", () => step(-1));
el("next").addEventListener("click", () => step(1));
opacity.addEventListener("input", () => overlay && overlay.setOpacity(Number(opacity.value)));

defs = await (await fetch("js/datasets.json")).json();
dsSel.innerHTML = defs.map((d) => `<option value="${d.id}">${d.label}</option>`).join("");
const q = new URLSearchParams(location.search).get("ds");   // ?ds=sst で初期データセットを指定
const first = defs.some((d) => d.id === q) ? q : defs[0].id;
dsSel.value = first;
loadDataset(first);
