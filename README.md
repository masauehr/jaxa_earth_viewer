# jaxa_earth_viewer — JAXA Earth API 衛星データビューア

> 詳しくは [jaxa-earth-viewer.md](jaxa-earth-viewer.md) を参照（pc_docs/manuals/automation/ のコピー）。

JAXA が提供する **JAXA Earth API**（STAC / COG ベース、Python版・JavaScript版あり）から衛星データを取得し、地図上に表示するプロダクト。

> 状態: Phase 1 完了（2026-10-19）。GSMaP降水を Leaflet 地図に表示する最小ビューアが動作。検証は [docs/phase0_report.md](docs/phase0_report.md)。

## 使い方（Phase 1）

```bash
# 環境構築（初回のみ）
python3 -m venv .venv
.venv/bin/pip install --extra-index-url https://data.earth.jaxa.jp/api/python/repository/ jaxa-earth

# 降水オーバーレイ生成（日付省略で取得できる最新日。--date YYYY-MM-DD で指定）
.venv/bin/python -I scripts/gen_overlay.py

# 表示
python3 -m http.server 8765 -d web   # → http://localhost:8765/
```

- `scripts/gen_overlay.py`: GSMaP日降水を取得 → Webメルカトル補正 → 階級配色の透過PNG（`web/data/precip/`）と `index.json`（凡例・出典）を生成
- `web/`: Vanilla JS + Leaflet（背景は国土地理院タイル）。日付選択・前後ボタン・透過度・凡例・出典表示
- 注意: GSMaP日降水の単位は **mm/h（日平均の降水強度）**。公開は実日付の約3〜4日遅れ（2026-10-19時点で10/15が最新）

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
| 2 | 複数データセット対応 | データセット切替・凡例・カラーマップ・出典表示 |
| 3 | 時系列・差分 | 期間スライダー、差分表示、地点の時系列グラフ |
| 4 | 公開・運用 | GitHub Pages 等で公開、必要なら日次更新を launchd 化 |

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

1. Phase 2: データセット切替（海面水温・植生・標高）、データセットごとの配色・凡例・出典
2. 日付の自動更新（日次バッチ）と取得失敗日のスキップ
3. JS版（方式A）の可否を確認する
