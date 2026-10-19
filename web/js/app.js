// 降水オーバーレイを Leaflet 上に表示する
const DATA_DIR = "data/precip/";

const map = L.map("map").setView([36, 136], 5);
// 背景は国土地理院タイル（APIキー不要・出典表示必須）
L.tileLayer("https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png", {
  attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html">国土地理院</a>',
  maxZoom: 18,
}).addTo(map);

let overlay = null;
let meta = null;
const sel = document.getElementById("date");
const opacity = document.getElementById("opacity");

function showDate(d) {
  if (overlay) map.removeLayer(overlay);
  overlay = L.imageOverlay(`${DATA_DIR}${d}.png`, meta.bounds, { opacity: Number(opacity.value) }).addTo(map);
  sel.value = d;
}

function step(delta) {
  const i = meta.dates.indexOf(sel.value) + delta;
  if (i >= 0 && i < meta.dates.length) showDate(meta.dates[i]);
}

function drawLegend() {
  const lv = meta.levels;
  const bar = meta.colors.map((c) => `<span style="background:${c}"></span>`).join("");
  const labels = lv.map((v) => `<span>${v}</span>`).join("");  // 最後の色は最大階級以上
  document.getElementById("legend").innerHTML =
    `<div class="bar">${bar}</div><div class="labels">${labels}</div>` +
    `<div class="unit">${meta.unit}</div>`;
}

fetch(`${DATA_DIR}index.json`)
  .then((r) => r.json())
  .then((m) => {
    meta = m;
    sel.innerHTML = m.dates.map((d) => `<option>${d}</option>`).join("");
    drawLegend();
    map.attributionControl.addAttribution(`出典: JAXA Earth API / ${m.citation}`);
    showDate(m.dates[m.dates.length - 1]);
  });

sel.addEventListener("change", () => showDate(sel.value));
document.getElementById("prev").addEventListener("click", () => step(-1));
document.getElementById("next").addEventListener("click", () => step(1));
opacity.addEventListener("input", () => overlay && overlay.setOpacity(Number(opacity.value)));
