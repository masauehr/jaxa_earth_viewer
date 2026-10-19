# J0 検証レポート — JAXA Earth API for JavaScript v2.0.1（2026-10-19）

検証ページ: [web_js/j0.html](../web_js/j0.html) / [web_js/j0.js](../web_js/j0.js)（ローカルの `python3 -m http.server` 経由で Chrome 154 から実行。Python版の出力 `web/data/` と値を突き合わせた）。

## 結論: **GO**（JS版で実現できる。静的サイトで足りる）

| 項目 | 結果 |
|---|---|
| **CORS** | **問題なし**。モジュール（`jaxa.earth.esm.js`）もデータ置き場（`collection.json`・COG、Range ヘッダー含む）も `Access-Control-Allow-Origin: *`。どのオリジン（GitHub Pages・Render）からも取得できる見込み（公開先での確認は J3） |
| **配布URL** | `https://data.earth.jaxa.jp/api/javascript/v2.0.1/jaxa.earth.esm.js`（約125KB、`import * as je from "<URL>"`）。UMD版もある。バージョンがURLに入っているので固定できる |
| **Python版との一致** | 降水(月)・降水平年差・地表面温度(℃)・海面水温の4件で、**欠測位置の不一致 0、値は量子化誤差の範囲内で全画素一致**（降水 最大差 0.0005、LST 0.00002℃、SST 0.0048℃）。Python版と同じ見た目を再現できる |
| **平年差** | `je.data.compute({ dataObjects: [obs, normal], operation: (a, b) => a - b })` で Python版（`precip_m_diff`）と一致。平年値の日付は年に依存せず（`formattedDate` が `"09"`）、観測と同じ `date` を渡せば取れる |
| **単位換算** | `compute` で K→℃（`operation: (v) => v - 273.15`）。`dataObject.unit` は `"Kelvin"` / `"degreeC"` / `"mm/hr"` と取れるので、凡例の単位表示にも使える。Python版の `offset` は不要 |
| **データ形式** | `dataObject.data` は `Float32Array`（行は北→南、列は西→東、**欠測は NaN**）、`width` `height` `bbox` `unit` `date` `formattedDate` 付き。Python版のグリッドと同じ並び |
| **最新日の判定** | `ic.last()`（`ImageCollection#init()` 後）で取得でき、Python版の最新日と一致（降水日 2026/10/15、他の月別は 2026/09）。Python版のように未公開日を例外で試す必要がない。`ic.getDateAll(開始, 終了)` で存在する日付の一覧も取れる |
| **未公開日の挙動（注意）** | 未公開の月（2026-10、2027-01）を指定しても**例外にならず、直近の公開データ（2026/09）が返る**。`dataObject.formattedDate` が要求と違えば未公開と判断する、または `ic.last()` / `getDateAll` で日付を決めること。公開範囲より前（1990年）は例外 |
| **取得速度** | 日本周辺 300×300〜1200×1200：**約0.3〜0.7秒**。全球 1800×900：約0.5〜0.9秒。関東狭域 800×800：約0.7秒（初回は接続分が上乗せされ約1.3秒）。12か月分の時系列を並列取得：**約1.1〜1.5秒** |
| **平年値コレクションの置き場** | 地表面温度の平年（`JASMES_GCOM-C...L3-LST.daytime...monthly-normal`）は `je-pds` ではなく **`je-pds2`** にある（`je-pds` は `ImageCollection#init()` が失敗）。他の平年値は `je-pds` にあるため、**コレクションごとに置き場の確認が必要**（Python版 `je` は内部で解決していた） |
| **タイル描画** | 公式サンプルに Leaflet 用 `je.TileGenerator`（`L.GridLayer`）がある。ただし `compute`（平年差・単位換算）後のデータはタイルに使えないため、平年差は `getDataObject` ＋ 自前描画（下記）の方針 |

## 設計への含意（J1 以降）
- 描画は **`getDataObject` で表示範囲を取得 → 自前で階級配色して Canvas 化 → Leaflet に重ねる**。Python版の `to_mercator`（緯度等間隔→メルカトル縦補正）と階級配色（`BoundaryNorm` 相当）を JS に移植する。階級色は既存の `web/data/<id>/index.json` の `levels` / `colors` をそのまま流用できる。
- ズームや表示範囲に合わせて `bbox` と `width`/`height` を変えて再取得すれば、ズームしても粗くならない（0.5〜1秒で再取得できる）。
- 地点クリックの値は、表示中の `dataObject.data` から直接読める（値グリッドの同梱が不要）。時系列は `ic.getDateAll` ＋並列 `getDataObject`（12か月で約1〜1.5秒）。
- 最新日は `ic.last()`。未公開日は `formattedDate` の不一致で検出する。
- 平年値コレクションは `je-pds` / `je-pds2` を定義に持たせる（`collectionUrl` を完全なURLで持つ）。

## 残る確認事項
- 公開先（Render / GitHub Pages）のオリジンからの取得確認（J3）。CORS ヘッダーが `*` なので通る見込み。
- ズーム・パン時の連続リクエストの負荷（デバウンスと取得範囲のキャッシュが必要）とスマホでの体感。
- モジュールをJAXAの配布URLから直接読む運用になる（提供終了・仕様変更の影響を受ける）。再配布（自前ホスト）の可否はライセンスを要確認のため、当面は配布URLのバージョン固定で運用する。
