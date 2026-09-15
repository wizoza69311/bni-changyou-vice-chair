"""BNI 本機同步橋接器：輪詢網站工作、使用本機已驗證的 BNI session、回傳結果。"""

from __future__ import annotations

import json
import os
import sys
import time
from datetime import date
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parent
SETTINGS_PATH = ROOT / "settings.json"


def load_settings() -> dict:
    if not SETTINGS_PATH.exists():
        raise RuntimeError("找不到 settings.json，請先複製 settings.example.json 並填入同步金鑰。")
    settings = json.loads(SETTINGS_PATH.read_text(encoding="utf-8"))
    if not str(settings.get("sync_key", "")).startswith("bni_sync_"):
        raise RuntimeError("同步金鑰尚未設定。")
    return settings


def month_window() -> tuple[str, str]:
    today = date.today()
    start_month = today.month - 5
    start_year = today.year
    while start_month <= 0:
        start_month += 12
        start_year -= 1
    return f"01/{start_month:02d}/{start_year}", today.strftime("%d/%m/%Y")


def pick(record: dict, aliases: list[str]) -> float:
    normalized = {str(key).replace(" ", "").lower(): value for key, value in record.items()}
    for alias in aliases:
        wanted = alias.replace(" ", "").lower()
        for key, value in normalized.items():
            if wanted in key:
                try:
                    return float(str(value).replace(",", ""))
                except (TypeError, ValueError):
                    return 0
    return 0


def summary_payload(tool_path: str) -> dict:
    tool = Path(tool_path).resolve()
    if not (tool / "palms_scraper" / "fetcher.py").exists():
        raise RuntimeError("找不到 BNI PALMS 查詢工具。")
    sys.path.insert(0, str(tool))
    previous_directory = Path.cwd()
    os.chdir(tool)
    try:
        from palms_scraper.fetcher import fetch_report_html  # type: ignore
        from palms_scraper.parser import parse_report  # type: ignore

        start, end = month_window()
        report = parse_report(fetch_report_html(start, end))
    finally:
        os.chdir(previous_directory)
    kpis = []
    members = []
    for row in report.get("members", []):
        member = str(row.get("會員姓名", "")).strip()
        if not member or not row.get("member_id"):
            continue
        members.append(member)
        inside = pick(row, ["提供內部引薦", "內部引薦", "rgbi"])
        outside = pick(row, ["提供外部引薦", "外部引薦", "rgbo"])
        weeks = max(1, pick(row, ["會議次數", "例會次數", "weeks"]) or 1)
        kpis.append({
            "member": member,
            "trainingPoints": round(pick(row, ["分會教育單位", "教育分數", "ceu"])),
            "visitorCount": round(pick(row, ["來賓", "訪客", "visitors"])),
            "oneToOneWeeklyAverage": round(pick(row, ["一對一會面", "一對一", "121"]) / weeks, 2),
            "referralWeeklyAverage": round((inside + outside) / weeks, 2),
            "referralTotal": round(inside + outside),
            "dreamReferralAmount": round(pick(row, ["交易價值", "引薦金額", "tyfcb"])),
        })
    if len(members) < 10:
        raise RuntimeError("BNI 回傳的會員資料不足，已停止更新以保護現有資料。")
    return {"members": members, "kpis": kpis}


def api(client: httpx.Client, site: str, key: str, path: str, method: str = "GET", body=None):
    response = client.request(method, f"{site.rstrip('/')}{path}", headers={"Authorization": f"Bearer {key}"}, json=body)
    response.raise_for_status()
    return response.json()


def run_job(client: httpx.Client, settings: dict) -> None:
    site, key = settings["site_url"], settings["sync_key"]
    claimed = api(client, site, key, "/api/v1/bni-sync/job", "POST", {"action": "claim"}).get("job", {})
    if claimed.get("state") != "running":
        return
    try:
        payload = summary_payload(settings["palms_tool_path"])
        result = api(client, site, key, "/api/v1/bni-sync", "POST", payload)
        message = f"會員主檔 {result.get('memberCount', 0)} 位、KPI {result.get('kpiCount', 0)} 位已更新"
        api(client, site, key, "/api/v1/bni-sync/job", "POST", {"action": "complete", "message": message})
        print(message, flush=True)
    except Exception as exc:
        message = str(exc)[:450]
        api(client, site, key, "/api/v1/bni-sync/job", "POST", {"action": "failed", "message": message})
        print(f"更新失敗：{message}", flush=True)


def main() -> None:
    settings = load_settings()
    print("BNI 本機同步工具已啟動；可回管理網站按『一鍵更新』。", flush=True)
    with httpx.Client(timeout=120) as client:
        while True:
            try:
                job = api(client, settings["site_url"], settings["sync_key"], "/api/v1/bni-sync/job").get("job", {})
                if job.get("state") == "pending":
                    run_job(client, settings)
            except Exception as exc:
                print(f"等待連線：{exc}", flush=True)
            time.sleep(max(10, int(settings.get("poll_seconds", 20))))


if __name__ == "__main__":
    main()
