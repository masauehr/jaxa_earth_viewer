"""GSMaP日降水を取得し、Web地図用の透過PNG（Webメルカトル補正済み）を生成する

使い方: .venv/bin/python -I scripts/gen_overlay.py [--date YYYY-MM-DD]
日付を省略すると、2日前から遡って最初に取得できた日を使う。
"""
import argparse
import json
import math
from datetime import date, timedelta
from pathlib import Path

import numpy as np
from matplotlib import colormaps
from matplotlib.colors import BoundaryNorm
from PIL import Image
from jaxa.earth import je

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "web" / "data" / "precip"
BBOX = [120, 20, 150, 50]  # [西, 南, 東, 北]
PPU = 10  # このコレクションの最大解像度（STACの je:ppu_max）
COLLECTION = "JAXA.EORC_GSMaP_standard.Gauge.00Z-23Z.v6_daily"
BAND = "PRECIP"
# 日平均降水強度(mm/h)の階級境界
LEVELS = [0.05, 0.1, 0.25, 0.5, 1, 2, 4, 8, 16]


def fetch(day):
    """指定日の降水量配列(行=北→南, 列=西→東)を返す。取得できなければNone"""
    d = day.strftime("%Y-%m-%dT00:00:00")
    try:
        data = je.ImageCollection(collection=COLLECTION, ssl_verify=True)\
            .filter_date(dlim=[d, d]).filter_resolution(ppu=PPU)\
            .filter_bounds(bbox=BBOX).select(band=BAND).get_images()
        arr = np.array(je.ImageProcess(data).raster.img[0], dtype="float64")[:, :, 0]
    except Exception as e:  # 未公開日などは例外になる
        print("取得失敗", day, type(e).__name__, e)
        return None
    return arr


def merc_y(lat):
    return math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))


def to_mercator(arr):
    """緯度等間隔の配列を、Webメルカトルの縦軸で等間隔になるよう再サンプルする"""
    h = arr.shape[0]
    south, north = BBOX[1], BBOX[3]
    ys = np.linspace(merc_y(north), merc_y(south), h)  # 上→下
    lats = np.degrees(2 * np.arctan(np.exp(ys)) - math.pi / 2)
    idx = np.clip(((north - lats) / (north - south) * h).astype(int), 0, h - 1)
    return arr[idx, :]


CMAP = colormaps["turbo"]
NORM = BoundaryNorm(LEVELS, CMAP.N, extend="max")


def legend_colors():
    """各階級（最後は最大階級以上）の色を16進で返す。凡例用"""
    mids = [(a + b) / 2 for a, b in zip(LEVELS, LEVELS[1:])] + [LEVELS[-1] * 2]
    return ["#%02x%02x%02x" % tuple(int(c * 255) for c in CMAP(NORM(m))[:3]) for m in mids]


def colorize(arr):
    """階級配色のRGBA画像にする。欠測(NaN)と最小階級未満は透明"""
    cmap, norm = CMAP, NORM
    rgba = (cmap(norm(np.nan_to_num(arr, nan=0))) * 255).astype("uint8")
    rgba[..., 3] = np.where(np.isnan(arr) | (arr < LEVELS[0]), 0, 190)
    return rgba


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--date")
    args = ap.parse_args()
    days = ([date.fromisoformat(args.date)] if args.date
            else [date.today() - timedelta(days=n) for n in range(2, 9)])
    for day in days:
        arr = fetch(day)
        if arr is not None:
            break
    else:
        raise SystemExit("取得できる日がありませんでした")

    OUT.mkdir(parents=True, exist_ok=True)
    Image.fromarray(colorize(to_mercator(arr))).save(OUT / f"{day}.png")
    meta = {
        "collection": COLLECTION, "band": BAND, "unit": "mm/h（日平均）", "levels": LEVELS, "colors": legend_colors(),
        "citation": "Japan Aerospace Exploration Agency. 1998. GSMaP(Hourly). DOI:10.57746/EO.01gs73bkt358gfpy92y2qns5e9",
        "bounds": [[BBOX[1], BBOX[0]], [BBOX[3], BBOX[2]]],  # Leaflet形式[[南,西],[北,東]]
        "dates": sorted(p.stem for p in OUT.glob("*.png")),
    }
    (OUT / "index.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1))
    print("生成:", day, "NaN率", float(np.isnan(arr).mean()), "最大", float(np.nanmax(arr)))


if __name__ == "__main__":
    main()
