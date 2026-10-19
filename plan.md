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

### 2.3 未確認事項（Phase J0 で最初に潰す）
| 項目 | 確認内容 | 失敗時の影響 |
|---|---|---|
| 配布URL・import 方法 | ESM/UMD の正確なURL、バージョン固定の書き方 | ドキュメントで確認すれば足りる。ページ本文には URL の記載が見つからなかった |
| **CORS** | GitHub Pages / Render のオリジンから、JAXA のデータ置き場（COG・collection.json）を `fetch` できるか | 不可なら静的配信だけでは成立しない。**Render の Web Service に取得プロキシを置く**案に切り替える |
| 取得速度 | 日本周辺・ppu 10〜20 での `getDataObject` の所要時間、全球時の重さ | 遅ければ、一部データセットのみ従来の事前生成（方式B）を併用 |
| 平年差 | `je.data.compute` で `monthly` − `monthly-normal`（年に依存しない日付）が取れるか | 取れなければ平年差のみ事前生成で併用 |
| 最新日の判定 | 未公開日は Python 版で `No date list found!` の例外。JS 版で STAC の日付一覧から最新日を取る方法 | 日付を遡って試行する（現行と同じ） |
| 値の取得 | クリック地点の値・時系列を `DataObject` の配列から読めるか | 読めれば現行のグリッド同梱が不要になる |
| 欠測の表現 | NaN/無効値の扱い、透過になるか | カラーマップ側で透過を設定 |
| サービス継続 | 公式に「予告なく終了する可能性」あり。JS版も同じ | 方式B のキャッシュを**縮退運用（フォールバック）**として残すか検討 |

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
| J0 | 検証（最小HTML） | ローカルで `je.getDataObject` → Canvas → Leaflet の `imageOverlay` で降水を表示。**CORS**、取得速度、平年差（`compute`）、最新日判定、値の読み取りを確認し、2.3 の表を埋める。go / no-go を決める |
| J1 | データセット定義の移植 | `scripts/datasets.py` 相当を JSON（または JS）に。階級配色・凡例・出典・`offset`/平年差を `ColorMap` と `compute` で再現。既存14件のうち主要5件で見た目が現行と一致 |
| J2 | UI の移植 | データセット／日付選択、スライダー・再生、透過度、凡例、出典（現行の `web/js/app.js` を土台）。地点クリックの値・時系列（`getDataObject` の値、または時系列サンプルを使用） |
| J3 | Render 公開 | `render.yaml` を置き、Static Site（CORS 次第で Web Service）としてデプロイ。公開URLで全データセットの表示を確認 |
| J4 | 切り替え・整理 | JS 版が現行（方式B）と同等以上になった時点で、launchd 停止・`web/data` の削除（またはフォールバック用に縮小）。README・pc_docs を更新 |

**方式B（Python 生成）は J3 まで維持する**。JS 版が上回るまで現行の公開と日次更新は止めない。

### 2.6 想定されるメリット・リスク
**メリット**: Mac 非依存／リポジトリが軽くなる／任意の領域・ズーム・解像度／常に最新（生成待ちなし）／Python 版（`jaxa-earth` 0.1.x）より新しい v2 系の機能（`compute`・タイル描画・Worker）を使える。

**リスク**: 閲覧のたびに JAXA 側へ負荷・アクセスが発生する（速度・可用性が JAXA 次第）／ブラウザ側の処理が重い端末（スマホ）での体感／v2 の仕様変更・提供終了の影響を直接受ける／CORS が通らない場合は構成が複雑になる。

---

## 3. 次のアクション（提案）
1. **J0 を先に実施**する（最小HTMLで CORS・速度・平年差を確認。数時間規模）。結果を 2.3 の表に追記して go / no-go を決める。
2. J0 と並行して、優先「高」のデータセット（夜間 LST・夜間 SMC・降水半月値）を方式B に追加してよい（JS 版の移植対象が増えても定義は流用できる）。
3. JS 版に進む場合のみ、Render のアカウント・無料プランの制限（Static Site / Web Service）を公式ドキュメントで確認してから `render.yaml` を作る。**デプロイは公開操作なので、実施前にユーザー確認を取る**。
