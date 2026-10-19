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
const dsSel = document.getElementById("dataset");
const dateSel = document.getElementById("date");
const opacity = document.getElementById("opacity");

function showDate(d) {
  if (overlay) map.removeLayer(overlay);
  overlay = L.imageOverlay(`${DATA_DIR}${meta.id}/${d}.png`, meta.bounds, { opacity: Number(opacity.value) }).addTo(map);
  dateSel.value = d;
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
  meta = await (await fetch(`${DATA_DIR}${id}/index.json`)).json();
  dateSel.innerHTML = meta.dates.map((d) => `<option>${d}</option>`).join("");
  drawLegend();
  setSource();
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
