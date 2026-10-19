# Phase 0 検証レポート（2026-10-19）

## 結果
- Python版 `jaxa-earth` 0.1.6 のインストールと、GSMaP日降水の取得・表示に成功した（方式Bは実証済み）。
- 取得物は numpy 配列（日本周辺 `[120,20,150,50]`・10ppu で 300×300×1）。2025-09-01 の九州付近の降水帯が確認できた。
- コレクションは 112 件（`scripts/phase0_list.py` で `data/collections.json` に保存。data/ はgit除外）。
- JS版は未検証。方式Aの可否は Phase 1 以降で確認する。

## 環境
- `python3 -m venv .venv`（Python 3.14.7）
- `pip install --extra-index-url https://data.earth.jaxa.jp/api/python/repository/ jaxa-earth`（matplotlib・requests が同時に入る）
- 公式ドキュメントの動作確認済みPythonは 3.8.10 だが、3.14 でも動作した。

## 基本の使い方
```python
from jaxa.earth import je
data = je.ImageCollection(collection=コレクションID, ssl_verify=True)\
    .filter_date(dlim=[開始, 終了])\
    .filter_resolution(ppu=10)\
    .filter_bounds(bbox=[経度min, 緯度min, 経度max, 緯度max])\
    .select(band=バンド名)\
    .get_images()
arr = je.ImageProcess(data).raster.img[0]   # numpy配列 (行, 列, 1)
```

## 初期候補コレクション（実在確認済み）
| 種別 | コレクションID | バンド |
|---|---|---|
| 降水（日） | JAXA.EORC_GSMaP_standard.Gauge.00Z-23Z.v6_daily | PRECIP |
| 降水（時間） | JAXA.EORC_GSMaP_standard.Gauge.v6_hourly | PRECIP |
| 海面水温（日・昼） | JAXA.G-Portal_GCOM-C.SGLI_standard.L3-SST.daytime.v3_global_daily | SST |
| 植生（日） | JAXA.G-Portal_GCOM-C.SGLI_standard.L3-NDVI.daytime.v3_global_daily | NDVI |
| 標高 | JAXA.EORC_ALOS.PRISM_AW3D30.v3.2_global | DSM |

## 決定
- Phase 1 は **方式B（Python取得 → 画像/配列を生成 → Webで表示）** で進める。
- 次の課題: 欠測値の扱い、データの鮮度（最新日）、取得時間、座標・向きの検証（地図重畳時）。

## Phase 1 で判明した事項（2026-10-19）
- GSMaP日降水 `PRECIP` は「降水強度（日平均）」で単位は mm/h（STACのtitle: Precipitation Rate (Daily)）。
- このコレクションの最大解像度は 10ppu（STAC `je:ppu_max`）。
- 最新日は実日付の約3〜4日遅れ。未公開日は `No date list found!` の例外になるため、遡って取得する。
- 欠測(NaN)は日本周辺では0%。配列は北→南・西→東の並びで、地図に重ねて海岸線と整合することを確認した。
- 緯度等間隔の画像は、Leaflet の imageOverlay（メルカトル）では歪むため、縦方向をメルカトル補正して出力している。
