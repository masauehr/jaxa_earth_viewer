"""Phase0: コレクション一覧を取得して data/collections.json に保存する"""
import json
from jaxa.earth import je

collections, bands = je.ImageCollectionList(ssl_verify=True).filter_name()
out = [{"collection": c, "bands": b} for c, b in zip(collections, bands)]
with open("data/collections.json", "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=1)
print(len(out), "collections")
