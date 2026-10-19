"""JAXA Earth API から衛星データを取得し、Web地図用の透過PNG（Webメルカトル補正済み）を生成する

使い方:
  .venv/bin/python -I scripts/gen_overlay.py                # 全データセットの最新N件
  .venv/bin/python -I scripts/gen_overlay.py -d sst -n 6     # 指定データセットのみ
  .venv/bin/python -I scripts/gen_overlay.py -d precip --date 2026-10-10
未公開の日・月は例外になるため、新しい方から遡って取得できたものを使う。
"""
import argparse
import json
import math
import sys
from datetime import date, timedelta
from pathlib import Path

import numpy as np
from matplotlib import colormaps
from matplotlib.colors import BoundaryNorm
from PIL import Image
from jaxa.earth import je

sys.path.insert(0, str(Path(__file__).resolve().parent))  # -I 指定時もdatasets.pyを読めるように
from datasets import DATASETS  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "web" / "data"
BBOX = [120, 20, 150, 50]  # [西, 南, 東, 北]


def candidates(ds):
    """新しい方から順に、取得を試す日付候補を返す"""
    today = date.today()
    if ds["freq"] == "static":
        return [date.fromisoformat(ds["static_date"])]
    if ds["freq"] == "daily":
        return [today - timedelta(days=n) for n in range(2, 14)]
    out, y, m = [], today.year, today.month  # monthly: 当月から遡る（月初日で指定）
    for _ in range(12):
        out.append(date(y, m, 1))
        y, m = (y, m - 1) if m > 1 else (y - 1, 12)
    return out


def fetch(ds, day):
    """指定日の配列(行=北→南, 列=西→東)を返す。取得できなければNone"""
    d = day.strftime("%Y-%m-%dT00:00:00")
    try:
        data = je.ImageCollection(collection=ds["collection"], ssl_verify=True)\
            .filter_date(dlim=[d, d]).filter_resolution(ppu=ds["ppu"])\
            .filter_bounds(bbox=BBOX).select(band=ds["band"]).get_images()
        return np.array(je.ImageProcess(data).raster.img[0], dtype="float64")[:, :, 0]
    except Exception as e:  # 未公開日などは例外になる
        print("取得失敗", ds["id"], day, type(e).__name__, e)
        return None


def to_mercator(arr):
    """緯度等間隔の配列を、Webメルカトルの縦軸で等間隔になるよう再サンプルする"""
    h = arr.shape[0]
    south, north = BBOX[1], BBOX[3]
    my = lambda lat: math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))
    ys = np.linspace(my(north), my(south), h)  # 上→下
    lats = np.degrees(2 * np.arctan(np.exp(ys)) - math.pi / 2)
    idx = np.clip(((north - lats) / (north - south) * h).astype(int), 0, h - 1)
    return arr[idx, :]


def make_norm(ds):
    cmap = colormaps[ds["cmap"]]
    return cmap, BoundaryNorm(ds["levels"], cmap.N, extend=ds["extend"])


def legend_colors(ds):
    """凡例の各区間の色（16進）。extend=both は「最小未満」から、max は最小階級から始まる"""
    cmap, norm = make_norm(ds)
    lv = ds["levels"]
    mids = [(a + b) / 2 for a, b in zip(lv, lv[1:])] + [lv[-1] * 2 if lv[-1] > 0 else 1]
    if ds["extend"] == "both":
        mids = [lv[0] - 1] + mids
    return ["#%02x%02x%02x" % tuple(int(c * 255) for c in cmap(norm(m))[:3]) for m in mids]


def colorize(ds, arr):
    """階級配色のRGBA画像にする。欠測(NaN)は透明、extend=max は最小階級未満も透明"""
    cmap, norm = make_norm(ds)
    rgba = (cmap(norm(np.nan_to_num(arr, nan=ds["levels"][0]))) * 255).astype("uint8")
    clear = np.isnan(arr)
    if ds["extend"] == "max":
        clear |= arr < ds["levels"][0]
    rgba[..., 3] = np.where(clear, 0, 190)
    return rgba


def write_index(ds):
    folder = OUT / ds["id"]
    meta = {k: ds[k] for k in ("id", "label", "collection", "band", "unit", "levels", "extend", "citation")}
    meta["colors"] = legend_colors(ds)
    meta["bounds"] = [[BBOX[1], BBOX[0]], [BBOX[3], BBOX[2]]]  # Leaflet形式[[南,西],[北,東]]
    meta["dates"] = sorted(p.stem for p in folder.glob("*.png"))
    (folder / "index.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1))
    return meta


def run(ds, days, n):
    folder = OUT / ds["id"]
    folder.mkdir(parents=True, exist_ok=True)
    got = 0
    for day in days:
        if got >= n:
            break
        path = folder / f"{day}.png"
        if path.exists():  # 取得済みはスキップして件数に数える
            got += 1
            continue
        arr = fetch(ds, day)
        if arr is None:
            continue
        Image.fromarray(colorize(ds, to_mercator(arr))).save(path)
        print("生成:", ds["id"], day, "NaN率 %.2f" % np.isnan(arr).mean())
        got += 1
    return write_index(ds)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("-d", "--dataset", help="データセットID（省略で全て）")
    ap.add_argument("--date", help="日付 YYYY-MM-DD（省略で最新から遡る）")
    ap.add_argument("-n", type=int, default=3, help="保持する最新件数（既定3）")
    args = ap.parse_args()
    targets = [d for d in DATASETS if args.dataset in (None, d["id"])]
    if not targets:
        raise SystemExit("不明なデータセット: %s" % args.dataset)
    for ds in targets:
        days = [date.fromisoformat(args.date)] if args.date else candidates(ds)
        run(ds, days, 1 if ds["freq"] == "static" else args.n)
    # 全データセットの一覧（UIの切替用）。画像のあるものだけ載せる
    items = [json.loads((OUT / d["id"] / "index.json").read_text()) for d in DATASETS
             if (OUT / d["id"] / "index.json").exists()]
    (OUT / "datasets.json").write_text(json.dumps(
        [{"id": m["id"], "label": m["label"]} for m in items if m["dates"]], ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
