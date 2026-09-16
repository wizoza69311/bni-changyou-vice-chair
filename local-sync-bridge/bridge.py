"""BNI 本機同步橋接器：輪詢網站工作、使用本機已驗證的 BNI session、回傳結果。"""

from __future__ import annotations

import json
import base64
import os
import re
import sys
import time
from datetime import date
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from xml.etree import ElementTree

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


def normalize(value: object) -> str:
    return re.sub(r"[\s_\-–—／/()（）:：.]", "", str(value or "")).lower()


def spreadsheet_rows(text: str) -> list[list[str]]:
    try:
        root = ElementTree.fromstring(text.lstrip("\ufeff"))
    except ElementTree.ParseError as exc:
        raise RuntimeError("BNI 匯出檔案格式無法辨識。") from exc
    rows: list[list[str]] = []
    for row_node in root.iter():
        if row_node.tag.rsplit("}", 1)[-1] != "Row":
            continue
        row: list[str] = []
        cursor = 0
        for cell in row_node:
            if cell.tag.rsplit("}", 1)[-1] != "Cell":
                continue
            index = next((value for key, value in cell.attrib.items() if key.rsplit("}", 1)[-1] == "Index"), None)
            if index:
                cursor = int(index) - 1
            while len(row) <= cursor:
                row.append("")
            data = next((node for node in cell.iter() if node.tag.rsplit("}", 1)[-1] == "Data"), None)
            row[cursor] = "" if data is None else "".join(data.itertext()).strip()
            cursor += 1
        if row:
            rows.append(row)
    if not rows:
        raise RuntimeError("BNI 匯出檔案沒有可辨識的資料列。")
    return rows


def find_column(headers: list[str], aliases: list[str]) -> int:
    for index, header in enumerate(headers):
        if any(alias in normalize(header) for alias in map(normalize, aliases)):
            return index
    return -1


def parse_date(value: object) -> str:
    text = str(value or "").strip()
    match = re.search(r"(\d{4})[/-](\d{1,2})[/-](\d{1,2})", text)
    if match:
        return f"{int(match.group(1)):04d}-{int(match.group(2)):02d}-{int(match.group(3)):02d}"
    match = re.search(r"(\d{1,2})[/-](\d{1,2})[/-](\d{4})", text)
    if match:
        return f"{int(match.group(3)):04d}-{int(match.group(2)):02d}-{int(match.group(1)):02d}"
    return ""


def parse_roster(text: str) -> list[dict]:
    rows = spreadsheet_rows(text)
    expiry_aliases = ["到期日期", "到期日", "續約日", "會籍到期", "會員到期", "expirationdate", "expirydate", "renewaldate"]
    blocked = {normalize(value) for value in ["會員姓名", "分會網站管理員", "發展協調人", "會員委員會", "會員委員會社區建設者", "會員委員會品質保證", "會員委員會會員參與", "會員委員會會員關係"]}
    for position, headers in enumerate(rows):
        member_headers = {normalize(value) for value in ["會員姓名", "會員", "membername", "member"]}
        member = next((index for index, value in enumerate(headers) if normalize(value) in member_headers), -1)
        surname = find_column(headers, ["姓氏", "lastname", "surname"])
        given = find_column(headers, ["名字", "firstname", "givenname"])
        if member < 0 and (surname < 0 or given < 0):
            continue
        expiry = find_column(headers, expiry_aliases)
        result = []
        for row in rows[position + 1:]:
            name = (row[member] if member >= 0 and member < len(row) else f"{row[surname] if surname < len(row) else ''}{row[given] if given < len(row) else ''}").strip()
            if not name or normalize(name) in blocked or re.search(r"合計|總計|total", name, re.I):
                continue
            result.append({"member": re.sub(r"\s+", "", name), "expiryDate": parse_date(row[expiry] if expiry >= 0 and expiry < len(row) else "")})
        return result
    raise RuntimeError("無法辨識會員名冊欄位。")


def parse_attendance(text: str, end_date: date) -> list[dict]:
    rows = spreadsheet_rows(text)
    for position, headers in enumerate(rows):
        first_date = next((index for index, value in enumerate(headers) if re.fullmatch(r"\d{1,2}\s*月\s*\d{1,2}|\d{1,2}[/-]\d{1,2}", value.strip())), -1)
        if first_date < 0:
            continue
        records = []
        for row in rows[position + 1:]:
            member = re.sub(r"\s+", "", "".join(row[:first_date])).strip()
            if not member or re.search(r"合計|總計|total", member, re.I):
                continue
            for index in range(first_date, min(len(headers), len(row))):
                code = row[index].strip().upper()
                if code not in {"P", "A", "L", "M", "S"}:
                    continue
                parts = re.search(r"(\d{1,2})\s*(?:月|[/-])\s*(\d{1,2})", headers[index])
                if not parts:
                    continue
                month, day = int(parts.group(1)), int(parts.group(2))
                year = end_date.year - 1 if month > end_date.month else end_date.year
                records.append({"member": member, "date": f"{year:04d}-{month:02d}-{day:02d}", "code": code})
        return records
    raise RuntimeError("無法辨識 PALMS 出席日期欄。")


def fetch_connected_exports(page, start: str, end: str) -> tuple[str, str, str]:
    start_input = page.locator("input[name='startDate']").first
    end_input = page.locator("input[name='endDate']").first
    if not start_input.count() or not end_input.count():
        raise RuntimeError("BNI 報表頁缺少日期欄位。")
    start_input.fill(start)
    end_input.fill(end)
    html = page.locator("input[name='report-type'][value='HTML']")
    if html.count():
        html.check()
    go = page.get_by_role("button", name="Go").first
    with page.expect_response(lambda response: "reports-api" in response.url, timeout=90000) as info:
        go.click()
    captured = info.value
    if not captured.ok:
        raise RuntimeError(f"BNI 報表參數讀取失敗（{captured.status}）。")
    parts = urlsplit(captured.url)
    base_params = dict(parse_qsl(parts.query, keep_blank_values=True))
    chapter = base_params.get("IdOrg") or base_params.get("__heading_chapter")
    if not chapter:
        raise RuntimeError("無法取得分會報表識別資料。")
    request_headers = captured.request.headers
    headers = {key: value for key, value in request_headers.items() if key.lower() in {"authorization", "accept", "accept-language"}}
    start_api = date.fromisoformat(f"{start[6:10]}-{start[3:5]}-{start[:2]}").strftime("%m/%d/%Y")
    end_api = date.fromisoformat(f"{end[6:10]}-{end[3:5]}-{end[:2]}").strftime("%m/%d/%Y")

    def generate(menu_name: str) -> str:
        params = dict(base_params)
        params.update({"menuName": menu_name, "IdOrg": chapter, "startDate": start_api, "endDate": end_api, "ReportType": "EXCEL", "__heading_chapter": chapter, "__orientation": "ltr", "execution_type": "SHORT", "ShowDetails": "false", "__exports_details": "1"})
        url = urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(params), ""))
        result = page.evaluate(
            """async ({url, headers}) => {
              const response = await fetch(url, {headers});
              const bytes = new Uint8Array(await response.arrayBuffer());
              let binary = '';
              for (let index = 0; index < bytes.length; index += 0x8000) {
                binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
              }
              return {ok: response.ok, status: response.status, body: btoa(binary)};
            }""",
            {"url": url, "headers": headers},
        )
        if not result["ok"]:
            raise RuntimeError(f"BNI 報表讀取失敗（{result['status']}）。")
        raw = base64.b64decode(result["body"])
        encodings = ("utf-16",) if raw.startswith((b"\xff\xfe", b"\xfe\xff")) else ("utf-8-sig", "cp950", "big5")
        for encoding in encodings:
            try:
                return raw.decode(encoding)
            except UnicodeDecodeError:
                continue
        raise RuntimeError("BNI 報表文字編碼無法辨識。")

    return (
        generate("menu.reports.chapter.roster"),
        generate("menu.reports.chapter.membership.dues"),
        generate("menu.reports.chapter.palms.attendance"),
    )


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
    from playwright.sync_api import sync_playwright
    from palms_scraper.fetcher import open_authenticated_page  # type: ignore

    start, end = month_window()
    os.chdir(tool)
    try:
        with sync_playwright() as playwright:
            browser, context, page = open_authenticated_page(playwright, headless=True)
            try:
                roster_text, dues_text, attendance_text = fetch_connected_exports(page, start, end)
            finally:
                context.storage_state(path=str(tool / "storage_state.json"))
                context.close()
                browser.close()
    finally:
        os.chdir(previous_directory)
    roster = parse_roster(roster_text)
    dues = parse_roster(dues_text)
    active_names = [item["member"] for item in roster]
    if len(active_names) < 10:
        raise RuntimeError("在籍會員筆數異常，已停止更新。")
    expiry = {normalize(item["member"]): item["expiryDate"] for item in [*roster, *dues] if item["expiryDate"]}
    renewals = [{"member": item["member"], "expiryDate": expiry.get(normalize(item["member"]), item["expiryDate"])} for item in roster]
    renewals = [item for item in renewals if item["expiryDate"]]
    attendance = [item for item in parse_attendance(attendance_text, date.today()) if normalize(item["member"]) in {normalize(name) for name in active_names}]
    if len(attendance) < len(active_names):
        raise RuntimeError("PALMS 出席筆數異常，已停止更新以保護現有資料。")
    return {"members": active_names, "renewals": renewals, "records": attendance, "kpis": kpis}


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
        message = f"會員主檔 {result.get('memberCount', 0)} 位、續約 {result.get('renewalCount', 0)} 位、PALMS {result.get('count', 0)} 筆、KPI {result.get('kpiCount', 0)} 位已更新"
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
