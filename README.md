# jaxa_earth_viewer — JAXA Earth API 衛星データビューア

> 詳しくは [jaxa-earth-viewer.md](jaxa-earth-viewer.md) を参照（pc_docs/manuals/automation/ のコピー）。

JAXA が提供する **JAXA Earth API**（STAC / COG ベース、Python版・JavaScript版あり）から衛星データを取得し、地図上に表示するプロダクト。

> 状態: Phase 4 完了・公開中（2026-10-19）。https://masauehr.github.io/jaxa_earth_viewer/ 。launchd で毎日 11:00/16:00 に自動更新。検証は [docs/phase0_report.md](docs/phase0_report.md)。

> 今後の計画（追加データセット候補、JavaScript版＋Render公開の検討）は [plan.md](plan.md) を参照。

## 公開・運用（Phase 4）

- **公開**: GitHub Pages（`.github/workflows/pages.yml` が `web/` をデプロイ）。https://masauehr.github.io/jaxa_earth_viewer/
- **日次更新**: launchd `com.user.jaxa_earth_viewer`（`scripts/com.user.jaxa_earth_viewer.plist` が控え。実体は `~/Library/LaunchAgents/`）が毎日 11:00 と 16:00 に `scripts/daily_update.sh` を実行 → データ生成 → 変更があれば commit/push → Pages が自動で再デプロイ。ログは `launchd.log`（git除外）
  - 登録: `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.user.jaxa_earth_viewer.plist`／解除: `launchctl bootout gui/$(id -u)/com.user.jaxa_earth_viewer`
- **保持期間**: 日別は直近14日、月別は直近12か月（`scripts/datasets.py` の `keep`）。超えた古い画像・グリッドは `gen_overlay.py` が自動で削除。全面欠測（ソース側の欠損）の日はスキップ。`--force` で取得済みの日付も再生成
- **データの利用条件（JAXA 地球観測データポリシー）**: 無償で利用・改変・再配布できる。条件は ①JAXAと研究名のクレジット表記（例: "Credit: GSMaP (JAXA)"）②JAXA以外の機関データを含む場合はその機関にも謝辞 ③**商用利用は事前にJAXAへ通知**。著作権はJAXAに帰属し、利用条件は予告なく変わる場合がある。本ビューアは個人の非商用公開で、画面右下の出典欄にクレジットを表示している
  - ポリシー原文: https://earth.jaxa.jp/en/data/policy/ 。各コレクションのSTACの `license` は `proprietary`（上記ポリシーへのリンク付き）

## 使い方

```bash
# 環境構築（初回のみ）
python3 -m venv .venv
.venv/bin/pip install --extra-index-url https://data.earth.jaxa.jp/api/python/repository/ jaxa-earth

# オーバーレイ生成（全データセットの最新3件。-d で指定、-n で件数、--date で日付指定）
.venv/bin/python -I scripts/gen_overlay.py
.venv/bin/python -I scripts/gen_overlay.py -d sst -n 6

# 表示
python3 -m http.server 8765 -d web   # → http://localhost:8765/
```

- `scripts/datasets.py`: データセット定義（コレクションID・バンド・解像度・配色・階級）。追加はここに1件足すだけ
- `scripts/gen_overlay.py`: 取得 → Webメルカトル補正 → 階級配色の透過PNG（`web/data/<id>/`）と `index.json`（凡例・出典）、`web/data/datasets.json` を生成。未公開の日・月は遡って取得
- `web/`: Vanilla JS + Leaflet（背景は国土地理院タイル）。データセット切替・日付選択・前後ボタン・透過度・凡例・選択中データの出典表示。`?ds=sst` で初期データセットを指定可
- 表示データ（14件。2026-10-19 に8件追加）:
  | 種別 | データ | 平年差 |
  |---|---|---|
  | 降水 | GSMaP 日(mm/h)・月 | 月（2012〜2021平年） |
  | 日射量 | JASMES Terra/MODIS 月平均（W/m²） | あり（2012〜2021平年） |
  | 土壌水分 | GCOM-W/AMSR2 月平均・昼（%） | あり（2012〜2021平年） |
  | 地表面温度 | GCOM-C/SGLI 月平均・昼（℃。元データはK） | あり（2000〜2022平年・JASMES） |
  | 海面水温 | GCOM-C/SGLI 月平均・昼（℃） | なし（同一プロダクトの平年値が無い） |
  | 植生 | NDVI（GCOM-C/SGLI 月） | なし（平年値はMODIS由来で別プロダクト） |
  | クロロフィルa | GCOM-C/SGLI 月平均（mg/m³） | なし |
  | 海上風速 | GCOM-W/AMSR2 月平均・昼（m/s） | なし |
  | 標高 | AW3D30（静的） | - |
- 時系列: スライダーと再生ボタン（1.2秒/コマ）で日付を送る
- 地点クリック: その地点の値と、保持している全日付の折れ線グラフ（横軸は日付に比例）をポップアップ表示。値は `web/data/<id>/<日付>.bin.gz`（Int16×scale・gzip・北→南/西→東）をブラウザで解凍して読む
- 平年差: 平年値コレクション（`*-normal`）は年に依存しない。SGLIのSST/NDVIには同一センサーの平年値がなく、差分は降水のみ（NDVIの平年はMODIS由来で別プロダクトのため不採用）
- 開発メモ: `python -m http.server` はブラウザにキャッシュされやすい。JS/CSSを更新したら `index.html` の `?v=` を上げる
- 注意: 公開は降水が約3〜4日遅れ、SST・NDVI は翌月以降（当月は未公開）。NDVI は 2026-08 がソース側で未提供。SST日別は雲で約74%欠測のため月別を採用

## 1. 目的

- JAXA の衛星プロダクト（降水・海面水温・植生・土地被覆・標高など、約90種類のデータセット）を手軽に閲覧できるようにする
- 既存の気象系プロジェクト（`kaiyo_sokuho_viewer` など）と並べて使える、自分用の地球観測ビューアにする
- JAXA Earth API の使い方（検索 → 取得 → 加工 → 可視化）を学ぶ

## 2. JAXA Earth API の概要（調査メモ）

| 項目 | 内容 |
|---|---|
| 提供元 | JAXA（<https://data.earth.jaxa.jp/>） |
| データ形式 | STAC（メタデータ検索）＋ COG（Cloud Optimized GeoTIFF） |
| ライブラリ | Python版（パッケージ名 `jaxa-earth`、ドキュメントは v0.1.5 まで確認）／JavaScript版 |
| 主な機能 | 衛星画像の取得、マスク処理、差分計算、統計処理、可視化 |
| データ数 | 約90種類のデータセット |
| 注意 | APIとデータ提供サービスは予告なく終了する可能性がある。論文等で使う場合はAPI利用の明記が必要。個々のデータの利用条件は各コレクションのSTACのライセンス情報で確認する |

参考:
- [JAXA Earth API for Python（v0.1.5）](https://data.earth.jaxa.jp/api/python/v0.1.5/en/index.html)
- [JAXA Earth API ポスター（日本語）](https://data.earth.jaxa.jp/poster/jaxa-earth-api-poster-ja.pdf)

※ JavaScript版のインストール手順・関数仕様は未確認。実装前に公式ドキュメントで確認すること。

## 3. 方針案

### 技術スタック（共通ルールに準拠）
- **フロント**: Vanilla JS / HTML / CSS（フレームワーク不使用）＋ Leaflet または OpenLayers
- **データ取得**: 以下2案を Phase 0 で比較して決定
  - A. **JS版をブラウザから直接利用**（サーバー不要・GitHub Pages で公開可能）
  - B. **Python版で取得 → 画像/GeoJSON/タイルを事前生成**（日次バッチ。重い処理や統計向き）
- **サーバー**: 必要な場合のみ Python 標準ライブラリで軽量構成
- 地図の背景タイルは CARTO を避けるか APIキー要件を確認すること（`reference_carto_basemaps_apikey` 参照）

### 想定する機能
1. データセット一覧・検索（STACコレクションから）
2. 期間・領域（日本周辺を既定）を指定して画像取得
3. 地図へのオーバーレイ表示（透過度・カラーマップ・凡例）
4. 時系列スライダー（日・月単位）
5. 2時点の差分表示、指定地点の時系列グラフ
6. 出典・ライセンス表示（データセットごと）

### 最初に扱うデータセット候補（要確認）
- 降水（GSMaP）
- 海面水温
- 植生指数（NDVI など）
- 標高（ALOS 系）

## 4. フェーズ計画

| Phase | 内容 | 完了条件 |
|---|---|---|
| 0 ✅ | 調査・検証 | 公式ドキュメントでJS/Python両版の使い方を確認し、1データセットを取得できる。方式A/Bを決定 |
| 1 ✅ | 最小ビューア | 1データセットを地図に表示（日本周辺・単一日） |
| 2 ✅ | 複数データセット対応 | データセット切替・凡例・カラーマップ・出典表示 |
| 3 ✅ | 時系列・差分 | 期間スライダー、差分表示、地点の時系列グラフ |
| 4 ✅ | 公開・運用 | GitHub Pages 等で公開、必要なら日次更新を launchd 化 |

## 5. ディレクトリ構成（予定）

```
jaxa_earth_viewer/
├── README.md        # 本書（計画・概要）
├── web/             # フロント（index.html, js/, css/）
├── scripts/         # Python取得・前処理スクリプト（方式B用）
├── data/            # 取得データ（git除外）
└── docs/            # 調査メモ・検証レポート
```

## 6. 留意事項

- JAXA Earth API の利用規約・ライセンスを遵守し、出典を必ず表示する
- API・データ提供が予告なく終了する可能性があるため、取得結果のキャッシュ方針を検討する
- APIキー・認証情報が必要になった場合は `.env` に分離し、コミットしない
- 他プロジェクトとの共通部品化はせず、本リポジトリで自己完結させる

## 7. 次のアクション

[plan.md](plan.md) に集約。要点:
1. JavaScript版（JAXA Earth API v2.0.1）＋ Render 公開の検証 Phase J0（CORS・取得速度・平年差・最新日判定を確認して go/no-go を決める）
2. 追加データセット（夜間LST・夜間SMC・降水半月値ほか）
3. 運用: 数日おきに `launchd.log` と Pages の更新を確認する
