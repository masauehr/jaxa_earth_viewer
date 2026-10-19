// Phase J0: JAXA Earth API for JavaScript v2.0.1 の検証（CORS・取得速度・Python版との値の一致・平年差・最新日）
// 結果は #result に JSON で出力する。Python版の出力（web/data）と突き合わせる。
import * as je from "https://data.earth.jaxa.jp/api/javascript/v2.0.1/jaxa.earth.esm.js";

const BASE = "https://s3.ap-northeast-1.wasabisys.com/je-pds/cog/v1/";
const BASE2 = "https://s3.ap-northeast-1.wasabisys.com/je-pds2/cog/v1/";
const GP = "JAXA.G-Portal_";
const GSMAP = "JAXA.EORC_GSMaP_standard.Gauge.00Z-23Z.v6_";
const BBOX = [120, 20, 150, 50]; // Python版と同じ範囲
const out = {};
const url = (id, base = BASE) => `${base}${id}/collection.json`;
const ym = (y, m) => new Date(Date.UTC(y, m - 1, 1));

// 計測つきで実行し、例外は結果に記録する
async function step(name, fn) {
  const t0 = performance.now();
  try {
    out[name] = { ...(await fn()), ms: Math.round(performance.now() - t0) };
  } catch (e) {
    out[name] = { error: String(e && e.message || e), ms: Math.round(performance.now() - t0) };
  }
  console.log("[J0]", name, JSON.stringify(out[name]));
}

// Python版が出力した値グリッド（Int16×scale, gzip）を読む
async function pyGrid(id, date) {
  const res = await fetch(`../web/data/${id}/${date}.bin.gz`);
  let buf = await res.arrayBuffer();
  const b = new Uint8Array(buf);
  if (b[0] === 0x1f && b[1] === 0x8b) {
    buf = await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
  }
  return new Int16Array(buf);
}

// JSのFloat32配列とPython版のグリッドを比較する
function compare(js, py, scale) {
  let n = 0, maxd = 0, sumd = 0, nanMismatch = 0, within = 0;
  for (let i = 0; i < js.length; i++) {
    const pn = py[i] === -32768, jn = Number.isNaN(js[i]);
    if (pn !== jn) { nanMismatch++; continue; }
    if (jn) continue;
    const d = Math.abs(js[i] - py[i] / scale);
    n++; sumd += d; if (d > maxd) maxd = d;
    if (d <= 1.5 / scale) within++;
  }
  return { valid: n, nanMismatch, maxAbsDiff: +maxd.toFixed(5), meanAbsDiff: +(sumd / Math.max(n, 1)).toFixed(6), withinQuantization: +(within / Math.max(n, 1)).toFixed(4) };
}

const stat = (d) => { const s = je.data.stat(d); return { min: s.min, max: s.max, mean: s.mean }; };

// A. コレクションの初期化と最新日（Python版は未公開日を例外で判定していた）
const colls = {
  precip_daily: GSMAP + "daily", precip_m: GSMAP + "monthly",
  sst: GP + "GCOM-C.SGLI_standard.L3-SST.daytime.v3_global_monthly",
  ndvi: GP + "GCOM-C.SGLI_standard.L3-NDVI.daytime.v3_global_monthly",
  swr: "JAXA.JASMES_Terra.MODIS_swr.v811_global_monthly",
  smc: GP + "GCOM-W.AMSR2_standard.L3-SMC.daytime.v3_global_monthly",
  lst: GP + "GCOM-C.SGLI_standard.L3-LST.daytime.v3_global_monthly",
  chla: GP + "GCOM-C.SGLI_standard.L3-CHLA.daytime.v3_global_monthly",
  ssw: GP + "GCOM-W.AMSR2_standard.L3-SSW.daytime.v4_global_monthly",
};
const ics = {};
for (const [k, id] of Object.entries(colls)) {
  await step(`A_last_${k}`, async () => {
    const ic = new je.ImageCollection({ collectionUrl: url(id) });
    await ic.init();
    ics[k] = ic;
    return { first: ic.formatDate(ic.first()), last: ic.formatDate(ic.last()), bands: ic.getBandIdAll() };
  });
}

// B. 降水(月) 2026-09 の生値をPython版と比較（300x300 = ppu10）
await step("B_precip_m_vs_python", async () => {
  const d = await je.getDataObject({ collectionUrl: url(colls.precip_m), band: "PRECIP", bbox: BBOX, width: 300, height: 300, date: ym(2026, 9) });
  return { unit: d.unit, date: d.formattedDate, dtype: d.data.constructor.name, size: [d.width, d.height], ...compare(d.data, await pyGrid("precip_m", "2026-09-01"), 1000) };
});

// C. 平年差（precip_m − monthly-normal）をPython版と比較
await step("C_anomaly_vs_python", async () => {
  const get = (id, band) => je.getDataObject({ collectionUrl: url(id), band, bbox: BBOX, width: 300, height: 300, date: ym(2026, 9) });
  const [obs, nor] = await Promise.all([get(colls.precip_m, "PRECIP"), get(GSMAP + "monthly-normal", "PRECIP_2012_2021")]);
  const diff = je.data.compute({ dataObjects: [obs, nor], operation: (a, b) => a - b, unit: obs.unit, date: obs.date, formattedDate: obs.formattedDate });
  return { normalDate: nor.formattedDate, ...compare(diff.data, await pyGrid("precip_m_diff", "2026-09-01"), 1000) };
});

// D. 地表面温度: K→℃（compute）をPython版（offset -273.15）と比較。解像度は ppu20 = 600x600
await step("D_lst_celsius_vs_python", async () => {
  const k = await je.getDataObject({ collectionUrl: url(colls.lst), band: "LST", bbox: BBOX, width: 600, height: 600, date: ym(2026, 9) });
  const c = je.data.compute({ dataObjects: [k], operation: (v) => v - 273.15, unit: "degC", date: k.date, formattedDate: k.formattedDate });
  return { unitIn: k.unit, unitOut: c.unit, ...compare(c.data, await pyGrid("lst", "2026-09-01"), 100) };
});

// E. 地表面温度の平年値コレクション（Python版ではSTACのcollection.jsonが通常パスに無かった）
for (const [label, base] of [["je-pds", BASE], ["je-pds2", BASE2]]) {
  await step(`E_lst_normal_${label}`, async () => {
    const d = await je.getDataObject({ collectionUrl: url("JAXA.JASMES_GCOM-C.SGLI_standard.L3-LST.daytime.v3_global_monthly-normal", base), band: "LST_2000_2022", bbox: BBOX, width: 150, height: 150, date: ym(2026, 9) });
    return { ok: true, unit: d.unit, date: d.formattedDate, ...stat(d) };
  });
}

// F. 海面水温（月）をPython版と比較（ppu20 = 600x600）
await step("F_sst_vs_python", async () => {
  const d = await je.getDataObject({ collectionUrl: url(colls.sst), band: "SST", bbox: BBOX, width: 600, height: 600, date: ym(2026, 9) });
  return { unit: d.unit, ...compare(d.data, await pyGrid("sst", "2026-09-01"), 100) };
});

// G. 時系列: 降水(月) 12か月を並列取得（地点クリックの時系列の代替）
await step("G_timeseries_12m_300px", async () => {
  const ic = ics.precip_m;
  const dates = await ic.getDateAll(ym(2025, 10), ym(2026, 10));
  const ds = await Promise.all(dates.map(async (date) => (await ic.getImage({ date, band: "PRECIP" })).getDataObject({ bbox: BBOX, width: 300, height: 300 })));
  const i = 150 * 300 + 150; // 画像中央付近の1画素
  return { dates: dates.length, centerSeries: ds.map((d) => +d.data[i].toFixed(3)) };
});

// H. 解像度・範囲を変えた取得時間（ズームに応じた取得の見積もり）
for (const [label, bbox, w, h] of [["日本1200x1200", BBOX, 1200, 1200], ["全球1800x900", [-180, -90, 180, 90], 1800, 900], ["関東狭域 800x800", [138, 34, 142, 38], 800, 800]]) {
  await step(`H_${label}`, async () => {
    const d = await je.getDataObject({ collectionUrl: url(colls.sst), band: "SST", bbox, width: w, height: h, date: ym(2026, 9) });
    return { size: [d.width, d.height], valid: d.data.reduce((a, v) => a + (Number.isNaN(v) ? 0 : 1), 0) };
  });
}

// I. 未公開月・範囲外の日付を指定したときの挙動（最新日判定の代替）
for (const [label, date] of [["未公開2026-10", ym(2026, 10)], ["未公開2027-01", ym(2027, 1)], ["範囲外1990-01", ym(1990, 1)]]) {
  await step(`I_${label}`, async () => {
    try {
      const d = await je.getDataObject({ collectionUrl: url(colls.precip_m), band: "PRECIP", bbox: BBOX, width: 50, height: 50, date });
      const valid = d.data.reduce((a, v) => a + (Number.isNaN(v) ? 0 : 1), 0);
      return { threw: false, returnedDate: d.formattedDate, valid };
    } catch (e) { return { threw: true, message: String(e.message).slice(0, 120) }; }
  });
}
// 日付を省略した場合（＝最新データ）
await step("I_日付省略", async () => {
  const d = await je.getDataObject({ collectionUrl: url(colls.precip_m), band: "PRECIP", bbox: BBOX, width: 50, height: 50 });
  return { returnedDate: d.formattedDate };
});

out._env = { ua: navigator.userAgent, cores: navigator.hardwareConcurrency };
document.getElementById("status").textContent = "完了";
document.getElementById("result").textContent = JSON.stringify(out, null, 1);
console.log("[J0] DONE");
