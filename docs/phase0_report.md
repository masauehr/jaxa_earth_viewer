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

## Phase 2 で判明した事項（2026-10-19）
| データ | ppu_max | 日付形式 | 備考 |
|---|---|---|---|
| SGLI SST 日別 | 360 | YYYY-MM/DD | 雲で約74%欠測。月別（約25%＝陸のみ）を採用 |
| SGLI SST 月別 | 360 | YYYY-MM | 当月は未公開。値は℃相当（日本周辺で約8〜31） |
| SGLI NDVI 月別 | 40 | YYYY-MM | 欠測73%は海。2026-08 はソース未提供 |
| AW3D30 DSM | 3600 | 2021-02 のみ | 静的データ。海は欠測 |
- `python -I` ではスクリプトのディレクトリが import パスに入らないため、`gen_overlay.py` で `sys.path` に追加している。

## Phase 3 で判明した事項（2026-10-19）
- `*-normal` コレクションは年に依存しない（2012・2021・2026 のどれを指定しても同じ値）。月別降水の平年差は `monthly - monthly-normal` を同じ月日で取得して算出する。
- 平年値があるのは GSMaP降水、AMSR2 SMC、JASMES(MODIS) の swr/ndvi/taua、MODIS LST、SGLI LST など。SGLI の SST・NDVI と同一プロダクトの平年値は無い。
- 値グリッドは Int16 に量子化（降水・NDVI は×1000、SST は×100、標高は×1）してgzipで同梱。600×600 で約0.1〜0.3MB/件、`web/data` 全体で約3MB。

## Phase 4 で判明した事項（2026-10-19）
- JAXA 地球観測データポリシー（https://earth.jaxa.jp/en/data/policy/）: 無償で利用・改変・第三者への配布が可能。JAXA と研究名のクレジット表記が必須（"Credit: XXXX (JAXA)" 等）、商用利用は事前通知が必要、著作権はJAXA帰属。STAC の license は `proprietary` でこのポリシーへのリンクが付く。
- ソース側に全面NaNの日がある（GSMaP 2026-10-11）。保存しないようスキップしている。
- GitHub Pages では `.bin.gz` が圧縮済みのまま届くか、転送時に解凍されるかが環境で異なり得るため、クライアントでgzipの印(1f 8b)を見て分岐している。公開サイトでの動作を確認済み。
- 地点クリックは全日付のグリッド読み込みが初回に数秒かかる（12か月分）ため、「読み込み中…」を先に表示する。

## データセット追加（2026-10-19）
| データ | ppu_max | 実測の値域（2026-09・日本周辺） | 備考 |
|---|---|---|---|
| 日射量 swr(Terra) | 20 | 約120〜295 W/m²、欠測0% | 平年(2012〜2021)と同一プロダクトで平年差が成立 |
| 土壌水分 SMC | 10 | 約4〜41 %、欠測77% | 植生が濃い・海は欠測 |
| 地表面温度 LST | 40 | 約286〜308 K（月平均）、欠測72% | Kなので `offset: -273.15` で℃化。平年は JASMES(2000〜2022)で別提供だが平均差0.5Kと整合 |
| クロロフィルa CHLA | 360 | 約0.03〜9 mg/m³、欠測25% | 値域が広く対数的な階級（0.05〜10）にした |
| 海上風速 SSW | 10 | 約4〜8.4 m/s、欠測34% | |
- 容量: `web/data` は 14 データセットで約39MB。日射量は雲による細かい模様でPNGが大きい（約170KB/件）。
- LST の平年値コレクションは `JASMES_GCOM-C...monthly-normal`（STACの置き場が通常のパスと異なり、直接のcollection.json取得は404だが je 経由では取得できる）。
