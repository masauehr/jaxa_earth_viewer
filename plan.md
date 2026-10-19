# plan.md — 今後の計画（追加データセット候補・JavaScript版 + Render 公開の検討）

作成: 2026-10-19。現状は Phase 0〜4 完了・14データセット・GitHub Pages 公開・launchd 日次更新（方式B: Python で取得 → 透過PNG＋値グリッドを生成）。詳細は [README.md](README.md)。

---

## 1. 次のデータセット候補

`scripts/datasets.py` に1件足すだけで追加できる（`normal` で平年差、`offset` で単位換算）。コレクションIDは `data/collections.json`（112件）で存在確認済み。**値域・最新月・ppu は追加時に実測すること**（下表の「状態」が「要実測」のもの）。

| 優先 | データ | コレクション（`JAXA.` 以降の要点） | 平年差 | 状態・メモ |
|---|---|---|---|---|
| 高 | 夜間の地表面温度 | G-Portal_GCOM-C.SGLI_standard.L3-LST.**nighttime**.v3_global_monthly | 可（JASMES `LST nighttime monthly-normal`） | 要実測。昼の LST と同じ作り（Kを℃へ換算）。昼夜差も出せる |
| 高 | 夜間の土壌水分 | G-Portal_GCOM-W.AMSR2_standard.L3-SMC.**nighttime**.v3_global_monthly | 可（`...nighttime...monthly-normal`） | 要実測。昼夜の違い（地表の乾き方）の比較 |
| 高 | 降水の半月値 | EORC_GSMaP_standard.Gauge.00Z-23Z.v6_**half-monthly** | 可（`half-monthly-normal`） | 要実測。月より細かく、日より安定。梅雨・台風期の見え方が変わる |
| 中 | エアロゾル光学的厚さ | G-Portal_GCOM-C.SGLI_standard.L3-AROT.daytime.v3_global_monthly | 無し | 要実測。黄砂・PM2.5 越境の目安 |
| 中 | 蒸発散 | JASMES_GCOM-C.SGLI_ET（8-day / half-monthly / monthly）、SGLI_ETidx | 無し | 要実測。農業・水循環向け |
| 中 | Aqua/MODIS 日射量 | JASMES_Aqua.MODIS_swr.v811_global_monthly（＋ `monthly-normal`） | 可 | Terra との差で観測時刻の影響を見られる。太陽光の `ml_forecast` と比較したい |
| 中 | 標準化降水指数 SPI | EORC_GSMaP_SPI.climate.gnrt6_monthly | 指数そのもの | 要実測。干ばつ・多雨の指標。平年差が不要で解釈しやすい |
| 中 | 準リアルタイム降水 | EORC_GSMaP_NRT.Gauge.Ext.00Z-23Z.v6_daily（バンド EXT） | 無し | 標準版（3〜4日遅れ）より新しい可能性。要実測（最新日・品質） |
| 低 | 時間降水 | EORC_GSMaP_standard.Gauge.v6_hourly | 無し | 1日24枚でデータ量が多い。直近数日のみ保持し、再生で見せる想定 |
| 低 | 海氷（オホーツク海） | JASMES_GCOM-W.AMSR2_ic0 daily | 無し | **bbox を北へ広げる必要**（現状の北端は50°N）。領域をデータセットごとに持てるよう拡張が前提 |
| 低 | 土地利用・森林 | EORC_ALOS_HRLULC.v25（日本）、ALOS-2.PALSAR-2_FNF、Copernicus.C3S_PROBA-V_LCCS | 無し | 静的／年次。カテゴリ値なので連続値用の階級配色ではなく凡例の作り直しが必要 |

### 機能面の候補
- 領域をデータセット／画面ごとに選べるようにする（日本周辺固定 → 沖縄周辺・全球）。現状は `BBOX` 固定（`scripts/gen_overlay.py`）。
- 2データセットの並置・スワイプ比較（例: 日射量と降水の平年差）。
- 地点の時系列に「平年値」の線を重ねる（現状は表示値のみ）。
- 平年差の凡例を「平年比（%）」でも選べるようにする（降水は差より比の方が直感的）。
- 欠測の理由の表示（海・雲・未提供月）と、NDVI の未提供月（2026-08）の注記。

---

## 2. JavaScript 版 + Render 公開の検討

### 2.1 動機
現状（方式B: Python 取得 → PNG/グリッド生成 → 静的配信）の弱点:
- **Mac の launchd に依存**する。Mac が止まっていると更新が止まる。
- **データをリポジトリに溜める**。14件で約39MB。データセット・領域・解像度を増やすほど肥大する（日射量だけで約18MB）。
- 領域・解像度・ズームが**生成時に固定**。ズームしても粗いまま。
- 生成のたびに commit/push が走り、履歴が増える。

JavaScript 版（ブラウザが JAXA のデータを直接取得して描画する）にすると、上記がほぼ解消する見込み。

### 2.2 JAXA Earth API for JavaScript（v2.0.1）で確認できたこと
公式ドキュメントと v2.0.1 サンプル一覧による。

- **APIキー・ユーザー登録は不要**。モジュールは約 120KB、追加依存なし。ESM（`jaxa.earth.esm.js`）と UMD（`jaxa.earth.umd.js`）を配布。
- 基本の呼び出し: `je.getDataObject({ collectionUrl, bbox, width, height })`（bbox は [西, 南, 東, 北]）→ `je.image.ColorMap({ min, max, colors })` → `je.image.createCanvas(dataObject, colorMap)` で `HTMLCanvasElement` を得る。
- `je.ImageCollection`（collection.json から任意時刻の `je.Image` を取り出す）、`je.ImageGenerator`（単一画像として高速に描画）、`je.TileGenerator`（WMTS 的にタイル描画。やや遅いが多くの地図APIに対応）。
- **`je.data.compute`**: 単位変換（K→℃）、偏差計算、GeoJSON マスクなどの演算。現在 Python 側でやっている `offset` や平年差に相当する。
- 時系列データの取得・アニメーション・グラフ化（Plotly 利用）のサンプルがある。地点クリックの時系列の置き換え候補。
- 地図連携サンプル: **Leaflet**（現行と同じ）、OpenLayers、MapLibre GL JS（3D地形）、CesiumJS、ArcGIS Maps SDK。OpenLayers では Web Worker を使う実用的な構成が推奨されている。
- 動作環境: v2 系はブラウザ（メインスレッド・Web Worker）、Node.js、Deno、Bun。
- サンプルは ES Module。**HTML を直接開くと動かず、サーバー経由で配信する必要がある**。
- 生成AI向けに MCP・Agent Skills・AI向け Markdown ドキュメント／データセット一覧が提供されている（実装時に参照する）。
- 注意: v1 から仕様が大きく変わっている。2.0.0 の文書は日本語版のみ。一部データセットは商用利用に制限がある。

### 2.3 J0 の検証結果（2026-10-19・結論 GO）
詳細は [docs/js_j0_report.md](docs/js_j0_report.md)。

| 項目 | 結果 |
|---|---|
| 配布URL・import | `import * as je from "https://data.earth.jaxa.jp/api/javascript/v2.0.1/jaxa.earth.esm.js"`（約125KB。バージョン固定可） |
| **CORS** | **全て `Access-Control-Allow-Origin: *`**（モジュール・collection.json・COG、Range 可）→ **静的サイトで成立**。公開先オリジンでの確認は J3 |
| 取得速度 | 日本周辺 0.3〜0.7秒、全球 0.5〜0.9秒、12か月の時系列（並列）1〜1.5秒。ズーム時の再取得が現実的 |
| 平年差・単位換算 | `je.data.compute` で可能。降水の平年差・LST の℃換算は **Python版と全画素一致**（降水・LST・SST・平年差の4件で欠測位置の不一致 0） |
| 最新日の判定 | `ic.last()` / `ic.getDateAll()` で取得。**未公開日を指定すると例外にならず直近データが返る**ので `formattedDate` を確認する |
| 値の取得 | `dataObject.data`（Float32Array・NaN=欠測・北→南）から直接読める。値グリッドの同梱が不要になる |
| 注意 | 平年値は `je-pds` と `je-pds2` に分かれて置かれている（地表面温度の平年は `je-pds2`）。コレクションごとに置き場を持たせる |
| サービス継続 | 公式に「予告なく終了する可能性」あり。当面は方式B（現行）を J3 までフォールバックとして維持 |

### 2.4 Render 公開の方針案
- **第一案: Render の Static Site（無料）**。JS 版は静的ファイルだけで完結するため、サーバー不要。ビルドなし（`web/` をそのまま配信）。
  - `render.yaml` の例（**デプロイ前に Render の最新仕様を要確認**）:
    ```yaml
    services:
      - type: web
        name: jaxa-earth-viewer
        runtime: static
        staticPublishPath: ./web
        buildCommand: "echo no build"
    ```
  - 認証なし・個人情報なし・JAXA の公開データのみ（`kaiyo_sokuho_viewer` と同じ条件）。
- **第二案: Render の Web Service（無料）＋軽量サーバー**。CORS が通らない場合や、取得結果のキャッシュ・最新日の集約が必要な場合のみ。`kaiyo_sokuho_viewer`（Python 標準ライブラリの `server.py`、`healthCheckPath`、`/tmp` キャッシュ）と同じ構成で作れる。無料プランはスリープするため初回アクセスが遅い点に注意。
- **GitHub Pages との比較**: JS 版が静的で済むなら、公開先は Pages のままでも成立する。Render を選ぶ理由は、①CORS 回避のためのプロキシが置ける、②環境変数・ヘルスチェック・PR プレビューが使える、③`kaiyo_sokuho_viewer` と運用を揃えられる、の3点。**判断は J0 の CORS 結果で決める**。
- 運用: Static Site は更新が不要（データはブラウザが取りに行く）。launchd・日次 commit/push は不要になる。

### 2.5 移行フェーズ案
| Phase | 内容 | 完了条件 / 判断基準 |
|---|---|---|
| J0 ✅ | 検証（最小HTML） | `web_js/j0.html` で CORS・取得速度・Python版との一致・平年差・最新日・値の読み取りを確認し、**GO** と判断（2026-10-19）。[docs/js_j0_report.md](docs/js_j0_report.md) |
| J1 ✅ | データセット定義の移植 | `scripts/datasets.py` 相当を JSON（または JS）に。階級配色・凡例・出典・`offset`/平年差を `ColorMap` と `compute` で再現。既存14件のうち主要5件で見た目が現行と一致 |
| J2 ✅ | UI の移植 | データセット／日付選択、スライダー・再生、透過度、凡例、出典（現行の `web/js/app.js` を土台）。地点クリックの値・時系列（`getDataObject` の値、または時系列サンプルを使用） |
| J3 ✅ | Render 公開 | `render.yaml` を置き、Static Site（CORS 次第で Web Service）としてデプロイ。公開URLで全データセットの表示を確認 |
| J4 | 切り替え・整理 | JS 版が現行（方式B）と同等以上になった時点で、launchd 停止・`web/data` の削除（またはフォールバック用に縮小）。README・pc_docs を更新 |

**方式B（Python 生成）は J3 まで維持する**。JS 版が上回るまで現行の公開と日次更新は止めない。

### 2.6 想定されるメリット・リスク
**メリット**: Mac 非依存／リポジトリが軽くなる／任意の領域・ズーム・解像度／常に最新（生成待ちなし）／Python 版（`jaxa-earth` 0.1.x）より新しい v2 系の機能（`compute`・タイル描画・Worker）を使える。

**リスク**: 閲覧のたびに JAXA 側へ負荷・アクセスが発生する（速度・可用性が JAXA 次第）／ブラウザ側の処理が重い端末（スマホ）での体感／v2 の仕様変更・提供終了の影響を直接受ける／CORS が通らない場合は構成が複雑になる。

---

### 2.7 J1 の結果（2026-10-19・完了）
`web_js/` に JS版の骨組みを作った（[web_js/](web_js/)。起動: `python3 -m http.server 8767 -d web_js`）。
- 構成: `index.html` / `css/style.css` / `js/app.js`（取得・UI）/ `js/render.js`（メルカトル補正・階級配色）/ `js/datasets.json`（14件の定義。Python版の `scripts/datasets.py` から一度だけ書き出したもので、以後は JSON が正本）。
- 動作: `ic.last()` と `getDateAll` で日付一覧（日別14件・月別12件・静的1件）を作り、`getDataObject`（固定範囲・600×600）→ `je.data.compute`（平年差・K→℃）→ メルカトル補正と階級配色の Canvas → Leaflet `imageOverlay`。データセット／日付の選択、透過度、凡例、出典、クリック地点の値を実装。
- 結果: **全14件が エラーなく表示**。取得は 1枚あたり約0.4〜1.2秒（平年差は2枚取得のため約1.0〜1.7秒）。降水の平年差は Python版の公開ページと見た目が一致。未公開日は `formattedDate` の不一致で検出（例外にしてステータスに表示）。
- 未対応（J2）: ズーム・パンに合わせた再取得、スライダー・再生、地点クリックの時系列グラフ、データセット切替時の連続操作の最適化。

### 2.8 J2 の結果（2026-10-19・完了）
`web_js/js/app.js` に実装。
- **ズーム・パンに合わせた再取得**: 表示範囲＋25%の余白を取得範囲にし、画像サイズは画面幅×1.5（上限1600px）。移動後400ms待ってから再取得。表示範囲が取得済みの範囲に収まりズームも同じなら再取得しない。新しい画像を載せてから古い画像を外す。海面水温でズームすると細部が鮮明になることを確認（取得は約1.2〜2.1秒/1600px）。
- **スライダー・再生**: コマ送りは「取得・描画が終わってから次へ」進める方式。描画結果を40件までキャッシュし、2周目以降は速い。日別降水で実際に再生・停止できることを確認（初回は約1〜1.4秒/コマ）。
- **地点クリックの時系列**: クリック地点を中心に **11×11 画素**（表示中の画像と同じ解像度）を全日付ぶん並列取得し、中央の値を折れ線に。日付に比例した横軸・欠測で線を切る。平年差・K→℃も同じ `fetchWith` を通す。**表示グリッドの値と点取得の値が完全に一致**（海面水温で 27.6968℃）。値は先にグリッドから表示し、時系列は後から差し替える。
- 発見: `je.getDataObject` の **width / height は 10〜10000 の範囲が必須**（5×5 は例外）。範囲外はそのまま `RangeError`。
- **スマホ幅**: 当初は確認できなかったが、J3 で 406px 幅の実画面で確認できた（2.9）。公開オリジンでの動作も J3 で確認。
- **残る負荷**: 1600px の取得は1.2〜2.1秒（海面水温は元解像度が細かく重め）。連続操作には負荷があるため、必要なら `MAX_W` を下げる。

### 2.9 J3 の進捗（2026-10-19）
- **公開オリジンでの CORS 確認: 完了**。Pages のワークフローを拡張し、JS版を https://masauehr.github.io/jaxa_earth_viewer/js-version/ に同居させて（`web/` は従来どおり `/`）、`github.io` のオリジンから JAXA のデータ置き場へ直接取得・描画できることを確認（降水の平年差・地表面温度の平年差・クリックの時系列）。CORS ヘッダーが `*` のため、Render のオリジンでも同様に通る見込み。
- **スマホ幅（406px）の確認**: 表示・凡例・操作は問題なし。ポップアップがパネルの裏に隠れる問題を見つけ、自動パンの余白（パネルの下端）を取るよう両版を修正。
- **`render.yaml` を用意**（[render.yaml](render.yaml)。静的サイト・`staticPublishPath: ./web_js`・`buildCommand: echo no build`・`buildFilter` で `web_js/**` と `render.yaml` のみ。日次データ更新の commit では再ビルドしない）。Render の仕様上、静的サイトに `plan` は指定しない。**Blueprint の構文は Render CLI での検証をしていない**（CLI 未導入）。
- **Render へのデプロイは未実施**。サービスの作成は Render ダッシュボードでのアカウント認証が要るため、ユーザー操作が必要:
  1. https://dashboard.render.com/ → **New → Blueprint** → GitHub の `masauehr/jaxa_earth_viewer` を選択
  2. `render.yaml` が読み込まれ、静的サイト `jaxa-earth-viewer` が作成される → **Apply**
  3. 発行された `https://jaxa-earth-viewer-xxxx.onrender.com/` で全データセットの表示を確認する（確認済みの github.io と同じ挙動のはず）。`buildFilter` の書式でエラーが出たら、そのメッセージを見て調整する
- 静的サイトの無料枠（帯域・パイプライン分の月間枠。具体的な上限値は公式ドキュメントに数値の記載なし）はダッシュボードの請求ページで確認する。

### 2.10 J3 完了: Render 公開（2026-10-19）
- Render ダッシュボードで Blueprint を作成（`masauehr/jaxa_earth_viewer` の `main`）。同期は成功し、静的サイト `jaxa-earth-viewer` が作成された（`render.yaml` の `buildFilter` 等の構文エラーなし）。
- **公開URL: https://jaxa-earth-viewer.onrender.com/**（`?ds=swr_diff` のように初期データセットを指定可）。
- 確認: 日射量の平年差の表示、クリックでの値と12か月の時系列グラフが Render 上で動作（`Cache-Control: public, max-age=0, s-maxage=300`。JS/CSSは `?v=` で更新を反映）。
- 以後、`web_js/**` を変更して main に push すると Render が自動デプロイする。日次データ更新（`web/data`）の commit では再ビルドしない。

### 2.11 J4 完了: Python生成版の廃止（2026-10-19）
ユーザーの指示で実施。
- launchd `com.user.jaxa_earth_viewer` を停止（`launchctl bootout`）し、`~/Library/LaunchAgents/` の plist を削除（控えは `scripts/com.user.jaxa_earth_viewer.plist`）。
- `web/data`（347ファイル・約39MB）を `git rm` で削除し、`.gitignore` に `web/data/` を追加。Git の履歴にはデータが残る。
- **GitHub Pages のルートを JS版（`web_js/`）に切り替え**（`web/data` を消すと Python版のページが表示できなくなるため）。以前の `/js-version/` は無くなり、ルートが JS版。
- `web/`（画面のコード）と `scripts/` は履歴として残した（不要なら別途削除できる）。`scripts/daily_update.sh` には廃止の注記を追加。
- JS版（Render・Pages）が引き続き動くことを確認する。

## 3. 次のアクション（提案）
1. ~~J1~~ 完了（2.7）。
2. ~~J2~~ 完了（2.8）。スマホ実機での確認が残る。
3. ~~J3~~ 完了（2.10）。
4. ~~J4~~ 完了（2.11）。
5. 並行して、優先「高」のデータセット（夜間 LST・夜間 SMC・降水半月値）の追加は、JS版の定義 JSON に足す形で進められる。
