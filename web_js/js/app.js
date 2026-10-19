// JS版ビューア: JAXA Earth API for JavaScript(v2.0.1) でブラウザが直接データを取得して描画する
// J1: 固定範囲（日本周辺）で取得 → メルカトル補正・階級配色 → Leaflet に重ねる
import * as je from "https://data.earth.jaxa.jp/api/javascript/v2.0.1/jaxa.earth.esm.js";
import { toCanvas } from "./render.js";

const BBOX = [120, 20, 150, 50]; // [西, 南, 東, 北]（Python版と同じ）
const SIZE = 600;                // 30°を600px = ppu20 相当
const KEEP = { daily: 14, monthly: 12, static: 1 };

const map = L.map("map").setView([36, 136], 5);
// 背景は国土地理院タイル（APIキー不要・出典表示必須）
L.tileLayer("https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png", {
  attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html">国土地理院</a>',
  maxZoom: 18,
}).addTo(map);

const el = (id) => document.getElementById(id);
const dsSel = el("dataset"), dateSel = el("date"), opacity = el("opacity"), statusEl = el("status");
let defs = [], def = null, ic = null, dates = [], overlay = null, marker = null, current = null, sourceText = null;
let seq = 0;                      // 古い読み込み結果を捨てるための連番
const icCache = new Map();

function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.className = isError ? "error" : "";
}

// ImageCollection は初期化に通信が要るのでデータセットごとにキャッシュ
async function collection(url) {
  if (!icCache.has(url)) {
    const c = new je.ImageCollection({ collectionUrl: url });
    await c.init();
    icCache.set(url, c);
  }
  return icCache.get(url);
}

// 表示対象の日付一覧（新しい順に keep 件、昇順で返す）
async function listDates(c, d) {
  const last = c.last();
  if (d.freq === "static") return [last];
  const n = KEEP[d.freq];
  const from = d.freq === "monthly"
    ? new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth() - (n - 1), 1))
    : new Date(last.getTime() - (n - 1) * 86400000);
  return await c.getDateAll(from, new Date(last.getTime() + 1));
}

const getData = (url, band, date) => je.getDataObject({ collectionUrl: url, band, bbox: BBOX, width: SIZE, height: SIZE, date });

// 1日分のデータ（平年差・単位換算を含む）を取得する
async function fetchData(d, date) {
  const obs = await getData(d.collectionUrl, d.band, date);
  if (obs.formattedDate !== c_format(date)) {
    // 未公開の日付を指定すると直近のデータが返るため、日付の不一致を検出する
    throw new Error(`未公開の日付です（${obs.formattedDate} が返りました）`);
  }
  if (d.normal) {
    const nor = await getData(d.normal.collectionUrl, d.normal.band, obs.date);
    return je.data.compute({ dataObjects: [obs, nor], operation: (a, b) => a - b, unit: obs.unit, date: obs.date, formattedDate: obs.formattedDate });
  }
  if (d.convert === "K2C") {
    return je.data.compute({ dataObjects: [obs], operation: (v) => v - 273.15, unit: "degC", date: obs.date, formattedDate: obs.formattedDate });
  }
  return obs;
}
const c_format = (date) => ic.formatDate(date);

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

async function showDate(date) {
  const my = ++seq;
  setStatus("取得中…");
  const t0 = performance.now();
  try {
    const data = await fetchData(def, date);
    if (my !== seq) return;       // 取得中に別の操作があった
    current = data;
    const url = toCanvas(data, def).toDataURL();
    if (overlay) map.removeLayer(overlay);
    overlay = L.imageOverlay(url, [[BBOX[1], BBOX[0]], [BBOX[3], BBOX[2]]], { opacity: Number(opacity.value) }).addTo(map);
    dateSel.value = String(date.getTime());
    setStatus(`${data.formattedDate} を表示（${Math.round(performance.now() - t0)}ms）`);
  } catch (e) {
    if (my !== seq) return;
    console.error(e);
    setStatus("取得に失敗: " + (e.message || e), true);
  }
}

async function loadDataset(id) {
  def = defs.find((d) => d.id === id);
  setStatus("読み込み中…");
  const my = ++seq;
  if (marker) { map.removeLayer(marker); marker = null; }
  try {
    ic = await collection(def.collectionUrl);
    dates = await listDates(ic, def);
    if (my !== seq) return;
    dateSel.innerHTML = dates.map((d) => `<option value="${d.getTime()}">${ic.formatDate(d)}</option>`).join("");
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
  const i = dates.indexOf(dateAt()) + delta;
  if (i >= 0 && i < dates.length) showDate(dates[i]);
}

// クリック地点の値（表示中の dataObject.data から直接読む。北→南・西→東）
map.on("click", (e) => {
  if (!current) return;
  const [w, s, ea, n] = BBOX;
  const { lat, lng } = e.latlng;
  if (lat < s || lat >= n || lng < w || lng >= ea) return;
  const row = Math.floor(((n - lat) / (n - s)) * current.height);
  const col = Math.floor(((lng - w) / (ea - w)) * current.width);
  const v = current.data[row * current.width + col];
  if (marker) map.removeLayer(marker);
  marker = L.circleMarker(e.latlng, { radius: 5, color: "#000", weight: 2, fillOpacity: 0 }).addTo(map);
  marker.bindPopup(
    `<b>${current.formattedDate}: ${Number.isNaN(v) ? "データなし" : Number(v.toPrecision(3))} ${def.unit}</b><br>${lat.toFixed(2)}°N ${lng.toFixed(2)}°E`
  ).openPopup();
});

dsSel.addEventListener("change", () => loadDataset(dsSel.value));
dateSel.addEventListener("change", () => showDate(dateAt()));
el("prev").addEventListener("click", () => step(-1));
el("next").addEventListener("click", () => step(1));
opacity.addEventListener("input", () => overlay && overlay.setOpacity(Number(opacity.value)));

defs = await (await fetch("js/datasets.json")).json();
dsSel.innerHTML = defs.map((d) => `<option value="${d.id}">${d.label}</option>`).join("");
const q = new URLSearchParams(location.search).get("ds");   // ?ds=sst で初期データセットを指定
const first = defs.some((d) => d.id === q) ? q : defs[0].id;
dsSel.value = first;
loadDataset(first);
