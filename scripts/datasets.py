"""表示するデータセットの定義（コレクションID・バンド・配色・階級）"""

SGLI = "JAXA.G-Portal_GCOM-C.SGLI_standard."

DATASETS = [
    {
        "id": "precip", "label": "降水（GSMaP・日平均）",
        "collection": "JAXA.EORC_GSMaP_standard.Gauge.00Z-23Z.v6_daily", "band": "PRECIP",
        "ppu": 10,  # STACのje:ppu_max
        "freq": "daily", "unit": "mm/h（日平均）",
        "levels": [0.05, 0.1, 0.25, 0.5, 1, 2, 4, 8, 16],
        "cmap": "turbo", "extend": "max",  # 最小階級未満は透明
        "citation": "Japan Aerospace Exploration Agency. 1998. GSMaP(Hourly). DOI:10.57746/EO.01gs73bkt358gfpy92y2qns5e9",
    },
    {
        "id": "sst", "label": "海面水温（GCOM-C/SGLI・月平均・昼）",
        "collection": SGLI + "L3-SST.daytime.v3_global_monthly", "band": "SST",
        "ppu": 20, "freq": "monthly", "unit": "℃",
        "levels": [0, 5, 10, 15, 20, 24, 26, 28, 30],
        "cmap": "turbo", "extend": "both",
        "citation": "JAXA GCOM-C/SGLI L3 海面水温（G-Portal）",
    },
    {
        "id": "ndvi", "label": "植生指数 NDVI（GCOM-C/SGLI・月）",
        "collection": SGLI + "L3-NDVI.daytime.v3_global_monthly", "band": "NDVI",
        "ppu": 20, "freq": "monthly", "unit": "NDVI（-）",
        "levels": [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8],
        "cmap": "YlGn", "extend": "both",
        "citation": "JAXA GCOM-C/SGLI L3 植生指数（G-Portal）",
    },
    {
        "id": "dsm", "label": "標高 DSM（ALOS AW3D30）",
        "collection": "JAXA.EORC_ALOS.PRISM_AW3D30.v3.2_global", "band": "DSM",
        "ppu": 20, "freq": "static", "static_date": "2021-02-01", "unit": "m",
        "levels": [1, 100, 300, 500, 1000, 1500, 2000, 3000],
        "cmap": "terrain", "extend": "max",  # 1m未満（海）は透明
        "citation": "JAXA EORC ALOS World 3D (AW3D30) v3.2",
    },
]
