#!/usr/bin/env python3
"""Build the browser-embedded company logo catalog.

Popular brand SVGs are sourced from Simple Icons. A small set of local marks is
kept for companies that are absent from that collection. The generated catalog
contains data URLs so iframe srcdoc previews and downloaded HTML remain stable.
"""

from __future__ import annotations

import base64
import concurrent.futures
import json
import re
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ASSET_DIR = ROOT / "assets" / "company-logos"
OUTPUT = ASSET_DIR / "catalog.json"
SIMPLE_ICONS_VERSION = "16.28.0"
SIMPLE_BASE = f"https://cdn.jsdelivr.net/npm/simple-icons@{SIMPLE_ICONS_VERSION}"


LOCAL_ICONS = [
    ("ByteDance", "bytedance.svg", ["字节跳动", "字节", "ByteDance"]),
    ("Amazon", "amazon.svg", ["亚马逊", "Amazon", "AWS", "亚马逊云科技"]),
    ("Tencent", "tencent.svg", ["腾讯", "Tencent", "腾讯科技", "腾讯集团"]),
    ("Alibaba", "alibaba.svg", ["阿里巴巴", "阿里", "Alibaba", "淘宝", "天猫", "蚂蚁集团", "蚂蚁金服"]),
    ("Meituan", "meituan.svg", ["美团", "Meituan", "大众点评"]),
    ("Trip", "trip.svg", ["携程", "Trip.com", "Trip.com Group", "Ctrip"]),
    ("Tesla", "tesla.svg", ["特斯拉", "Tesla"]),
]


SIMPLE_ICONS = [
    ("TikTok", "tiktok", ["TikTok", "抖音"]),
    ("Baidu", "baidu", ["百度", "Baidu"]),
    ("Kuaishou", "kuaishou", ["快手", "Kuaishou"]),
    ("Xiaomi", "xiaomi", ["小米", "Xiaomi", "小米集团"]),
    ("Huawei", "huawei", ["华为", "Huawei"]),
    ("OPPO", "oppo", ["OPPO", "欧珀"]),
    ("vivo", "vivo", ["vivo", "维沃"]),
    ("Lenovo", "lenovo", ["联想", "Lenovo"]),
    ("Google", "google", ["Google", "谷歌", "Alphabet"]),
    ("Apple", "apple", ["Apple", "苹果公司"]),
    ("Meta", "meta", ["Meta", "Meta Platforms"]),
    ("Facebook", "facebook", ["Facebook", "脸书"]),
    ("Instagram", "instagram", ["Instagram"]),
    ("YouTube", "youtube", ["YouTube"]),
    ("Netflix", "netflix", ["Netflix", "奈飞"]),
    ("Spotify", "spotify", ["Spotify"]),
    ("Intel", "intel", ["Intel", "英特尔"]),
    ("NVIDIA", "nvidia", ["NVIDIA", "英伟达"]),
    ("Uber", "uber", ["Uber", "优步"]),
    ("Airbnb", "airbnb", ["Airbnb", "爱彼迎"]),
    ("Booking", "bookingdotcom", ["Booking.com", "Booking"]),
    ("Shopify", "shopify", ["Shopify"]),
    ("eBay", "ebay", ["eBay"]),
    ("PayPal", "paypal", ["PayPal"]),
    ("Stripe", "stripe", ["Stripe"]),
    ("SAP", "sap", ["SAP", "思爱普"]),
    ("Zoom", "zoom", ["Zoom", "Zoom Video"]),
    ("Notion", "notion", ["Notion"]),
    ("Figma", "figma", ["Figma"]),
    ("GitHub", "github", ["GitHub"]),
    ("GitLab", "gitlab", ["GitLab"]),
    ("Bilibili", "bilibili", ["哔哩哔哩", "Bilibili", "B站"]),
    ("Xiaohongshu", "xiaohongshu", ["小红书", "Xiaohongshu", "RED"]),
    ("Weibo", "sinaweibo", ["新浪微博", "微博", "Weibo"]),
    ("Zhihu", "zhihu", ["知乎", "Zhihu"]),
    ("WeChat", "wechat", ["微信", "WeChat"]),
    ("QQ", "qq", ["腾讯QQ", "QQ"]),
    ("Anthropic", "anthropic", ["Anthropic", "Claude"]),
    ("Cloudflare", "cloudflare", ["Cloudflare"]),
    ("Dropbox", "dropbox", ["Dropbox"]),
    ("Discord", "discord", ["Discord"]),
    ("Reddit", "reddit", ["Reddit"]),
    ("Pinterest", "pinterest", ["Pinterest"]),
    ("Snapchat", "snapchat", ["Snapchat", "Snap"]),
    ("X", "x", ["X Corp", "Twitter", "推特"]),
    ("Atlassian", "atlassian", ["Atlassian"]),
    ("Cisco", "cisco", ["Cisco", "思科"]),
    ("Dell", "dell", ["Dell", "戴尔"]),
    ("HP", "hp", ["HP", "惠普"]),
    ("Samsung", "samsung", ["Samsung", "三星"]),
    ("Sony", "sony", ["Sony", "索尼"]),
    ("Nike", "nike", ["Nike", "耐克"]),
    ("Adidas", "adidas", ["Adidas", "阿迪达斯"]),
    ("Puma", "puma", ["Puma", "彪马"]),
    ("Starbucks", "starbucks", ["Starbucks", "星巴克"]),
    ("IKEA", "ikea", ["IKEA", "宜家"]),
    ("CocaCola", "cocacola", ["Coca-Cola", "Coca Cola", "可口可乐"]),
    ("McDonalds", "mcdonalds", ["McDonald's", "McDonalds", "麦当劳"]),
    ("Unilever", "unilever", ["Unilever", "联合利华"]),
    ("Accenture", "accenture", ["Accenture", "埃森哲"]),
    ("TCS", "tcs", ["Tata Consultancy Services", "TCS"]),
    ("Infosys", "infosys", ["Infosys"]),
    ("Shopee", "shopee", ["Shopee", "虾皮"]),
    ("Grab", "grab", ["Grab"]),
    ("Gojek", "gojek", ["Gojek"]),
    ("Rakuten", "rakuten", ["Rakuten", "乐天"]),
    ("LINE", "line", ["LINE"]),
    ("Kakao", "kakao", ["Kakao"]),
]


WORDMARKS = [
    ("Microsoft", "Microsoft", "#737373", ["Microsoft", "微软"]),
    ("OpenAI", "OpenAI", "#111111", ["OpenAI"]),
    ("JD", "JD", "#e1251b", ["京东", "JD.com", "JD"]),
    ("PDD", "PDD", "#e02e24", ["拼多多", "PDD", "Pinduoduo"]),
    ("Didi", "DiDi", "#ff6b00", ["滴滴", "DiDi", "滴滴出行"]),
    ("NetEase", "网易", "#d9272e", ["网易", "NetEase"]),
    ("TopSports", "TOP", "#174a7e", ["滔搏运动", "滔搏", "TOP SPORTS", "TOPSPORTS"]),
    ("Canva", "Canva", "#00c4cc", ["Canva"]),
    ("Salesforce", "SF", "#0d9dda", ["Salesforce"]),
    ("Adobe", "Adobe", "#e60012", ["Adobe", "奥多比"]),
    ("Oracle", "Oracle", "#f80000", ["Oracle", "甲骨文"]),
    ("IBM", "IBM", "#0f62fe", ["IBM", "国际商业机器"]),
    ("P&G", "P&amp;G", "#003da5", ["宝洁", "P&G", "Procter & Gamble"]),
    ("Deloitte", "Deloitte", "#86bc25", ["Deloitte", "德勤"]),
    ("PwC", "PwC", "#e0301e", ["PwC", "普华永道"]),
    ("KPMG", "KPMG", "#00338d", ["KPMG", "毕马威"]),
    ("EY", "EY", "#ffe600", ["EY", "安永"]),
]


def data_url(svg: bytes) -> str:
    return "data:image/svg+xml;base64," + base64.b64encode(svg).decode("ascii")


def wordmark_svg(label: str, color: str) -> bytes:
    safe = label.replace("&", "&amp;") if "&amp;" not in label else label
    font_size = 25 if len(re.sub(r"&[^;]+;", "&", safe)) <= 4 else 17
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img">
  <rect width="64" height="64" rx="13" fill="#fff"/>
  <text x="32" y="39" text-anchor="middle" font-family="Arial,sans-serif" font-size="{font_size}" font-weight="800" fill="{color}">{safe}</text>
</svg>'''
    return svg.encode("utf-8")


def fetch_simple_icons() -> tuple[dict[str, dict], dict[str, str]]:
    with urllib.request.urlopen(f"{SIMPLE_BASE}/data/simple-icons.json", timeout=30) as response:
        metadata = json.load(response)
    meta_by_slug = {item["slug"]: item for item in metadata}
    def fetch_one(spec: tuple[str, str, list[str]]) -> tuple[str, dict | None, str | None]:
        key, slug, aliases = spec
        meta = meta_by_slug.get(slug)
        if not meta:
            return key, None, f"slug not found: {slug}"
        try:
            with urllib.request.urlopen(f"{SIMPLE_BASE}/icons/{slug}.svg", timeout=30) as response:
                raw = response.read()
            svg = raw.decode("utf-8")
            if not svg.lstrip().startswith("<svg"):
                raise ValueError("not SVG")
            svg = svg.replace("<svg ", f'<svg fill="#{meta["hex"]}" ', 1)
            return key, {"aliases": aliases, "dataUrl": data_url(svg.encode("utf-8")), "source": "simple-icons", "slug": slug}, None
        except Exception as exc:  # pragma: no cover - network diagnostics
            return key, None, str(exc)

    icons: dict[str, dict] = {}
    failures: dict[str, str] = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as executor:
        for key, icon, error in executor.map(fetch_one, SIMPLE_ICONS):
            if icon:
                icons[key] = icon
            else:
                failures[key] = error or "unknown error"
    return icons, failures


def main() -> None:
    icons, failures = fetch_simple_icons()
    for key, filename, aliases in LOCAL_ICONS:
        icons[key] = {"aliases": aliases, "dataUrl": data_url((ASSET_DIR / filename).read_bytes()), "source": "local"}
    for key, label, color, aliases in WORDMARKS:
        icons[key] = {"aliases": aliases, "dataUrl": data_url(wordmark_svg(label, color)), "source": "local-wordmark"}
    ordered = {key: icons[key] for key in sorted(icons, key=str.casefold)}
    payload = {
        "version": "2026-08-25",
        "simpleIconsVersion": SIMPLE_ICONS_VERSION,
        "source": "https://github.com/simple-icons/simple-icons",
        "icons": ordered,
    }
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {OUTPUT} with {len(ordered)} company/brand entries")
    if failures:
        print("Skipped:", json.dumps(failures, ensure_ascii=False))


if __name__ == "__main__":
    main()
