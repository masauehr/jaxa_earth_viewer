"""Phase0: GSMaP降水を日本周辺で1枚取得し、numpy配列と画像を保存する"""
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from jaxa.earth import je

dlim = ["2025-09-01T00:00:00", "2025-09-01T00:00:00"]
bbox = [120, 20, 150, 50]
collection = "JAXA.EORC_GSMaP_standard.Gauge.00Z-23Z.v6_daily"
band = "PRECIP"

data = je.ImageCollection(collection=collection, ssl_verify=True)\
    .filter_date(dlim=dlim)\
    .filter_resolution(ppu=10)\
    .filter_bounds(bbox=bbox)\
    .select(band=band)\
    .get_images()
img = je.ImageProcess(data)
arr = np.array(img.raster.img[0])
print("shape", arr.shape, "min", np.nanmin(arr), "max", np.nanmax(arr))
np.save("data/gsmap_test.npy", arr)
plt.imshow(arr, extent=[120, 150, 20, 50])
plt.colorbar()
plt.savefig("data/gsmap_test.png", dpi=100)
