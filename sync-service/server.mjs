import http from "node:http";
import { chromium } from "playwright";
import { parseChapterAudit, parseChapterSummary } from "./palms-report.mjs";

const required = [
  "BNI_USERNAME",
  "BNI_PASSWORD",
  "BNI_RUNNER_TOKEN",
  "SITE_URL",
];
const normalize = (v) =>
  String(v || "")
    .toLowerCase()
    .replace(/[\s_\-–—／/()（）:：.]/g, "");
const decode = (v) =>
  v
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
function rows(text) {
  const out = [];
  for (const rm of text.matchAll(
    /<(?:\w+:)?Row\b[^>]*>([\s\S]*?)<\/(?:\w+:)?Row>/gi,
  )) {
    const row = [];
    let cursor = 0;
    for (const cm of rm[1].matchAll(
      /<(?:\w+:)?Cell\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?Cell>/gi,
    )) {
      const index = cm[1].match(/(?:ss:)?Index=["'](\d+)["']/i);
      if (index) cursor = Number(index[1]) - 1;
      const data = cm[2].match(
        /<(?:\w+:)?Data\b[^>]*>([\s\S]*?)<\/(?:\w+:)?Data>/i,
      );
      row[cursor] = decode((data?.[1] || "").replace(/<[^>]+>/g, "")).trim();
      cursor++;
    }
    if (row.length) out.push(row);
  }
  if (!out.length) throw Error("BNI 報表格式無法辨識");
  return out;
}
const col = (h, n) =>
  h.findIndex((x) => n.some((y) => normalize(x).includes(normalize(y))));
const memberNames = ["會員姓名", "會員", "membername", "member"],
  surnames = ["姓氏", "lastname", "surname"],
  given = ["名字", "firstname", "givenname"];
function dateValue(v) {
  const s = String(v || "");
  let m = s.match(/(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : "";
}
function roster(text) {
  const data = rows(text),
    expiryNames = [
      "到期日",
      "續約日",
      "會籍到期",
      "會員到期",
      "expirationdate",
      "expirydate",
      "renewaldate",
    ];
  let at = -1,
    x;
  for (let i = 0; i < data.length; i++) {
    const c = {
      m: col(data[i], memberNames),
      s: col(data[i], surnames),
      g: col(data[i], given),
      e: col(data[i], expiryNames),
    };
    if (c.m >= 0 || (c.s >= 0 && c.g >= 0)) {
      at = i;
      x = c;
      break;
    }
  }
  if (at < 0) throw Error("無法辨識會員名冊");
  const blocked = new Set([
    "提供",
    "會員姓名",
    "分會網站管理員",
    "發展協調人",
    "會員委員會",
    "會員委員會社區建設者",
    "會員委員會品質保證",
    "會員委員會會員參與",
    "會員委員會會員關係",
  ]);
  return data
    .slice(at + 1)
    .map((r) => {
      const member = String(
        x.m >= 0 ? r[x.m] || "" : `${r[x.s] || ""}${r[x.g] || ""}`,
      )
        .replace(/\s+/g, " ")
        .trim();
      return { member, expiryDate: x.e >= 0 ? dateValue(r[x.e]) : "" };
    })
    .filter(
      (i) =>
        i.member &&
        !/合計|總計|total/i.test(i.member) &&
        !blocked.has(normalize(i.member)) &&
        !/^\d+會員$/.test(normalize(i.member)),
    );
}
function attendance(text, end) {
  const data = rows(text);
  let h = [],
    at = -1,
    start = -1;
  for (let i = 0; i < data.length; i++) {
    const first = data[i].findIndex(
      (v) =>
        /^\d{1,2}\s*月\s*\d{1,2}$/.test(v) || /^\d{1,2}[\/-]\d{1,2}$/.test(v),
    );
    if (first >= 0) {
      h = data[i];
      at = i;
      start = first;
      break;
    }
  }
  if (at < 0) throw Error("無法辨識 PALMS 日期欄");
  const out = [];
  for (const r of data.slice(at + 1)) {
    const member = r.slice(0, start).join("").replace(/\s+/g, "").trim();
    if (!member) continue;
    for (let c = start; c < h.length; c++) {
      const code = (r[c] || "").trim().toUpperCase();
      if (!["P", "A", "L", "M", "S"].includes(code)) continue;
      const p =
        h[c].match(/^(\d{1,2})\s*月\s*(\d{1,2})$/) ||
        h[c].match(/^(\d{1,2})[\/-](\d{1,2})$/);
      if (!p) continue;
      const month = +p[1],
        year =
          month > end.getMonth() + 1
            ? end.getFullYear() - 1
            : end.getFullYear();
      out.push({
        member,
        date: `${year}-${String(month).padStart(2, "0")}-${p[2].padStart(2, "0")}`,
        code,
      });
    }
  }
  return out;
}
function findId(source, key) {
  const wanted = normalize(key),
    seen = new Set();
  function visit(v) {
    if (!v || typeof v !== "object" || seen.has(v)) return "";
    seen.add(v);
    for (const [name, item] of Object.entries(v)) {
      if (normalize(name).includes(wanted) && /\d{2,}/.test(String(item || "")))
        return String(item).match(/\d{2,}/)?.[0] || "";
      const n = visit(item);
      if (n) return n;
    }
    return "";
  }
  return visit(source);
}
const us = (d) =>
  `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
function recentMeetingStart(end) {
  const date = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 42);
  while (date.getDay() !== 4) date.setDate(date.getDate() - 1);
  return date;
}
async function completedChapterPalms(page, chapter, start) {
  await page.goto(
    `https://www.bniconnectglobal.com/web/secure/operationsChapterMeetingReportPalms?chapterId=${encodeURIComponent(chapter)}`,
    { waitUntil: "domcontentloaded", timeout: 90000 },
  );
  const dateInput = page.locator("#fromDate");
  await dateInput.waitFor({ state: "visible", timeout: 30000 });
  await dateInput.click();
  const calendar = page.locator("#ui-datepicker-div");
  await calendar.locator(".ui-datepicker-year").selectOption(String(start.getFullYear()));
  await calendar.locator(".ui-datepicker-month").selectOption(String(start.getMonth()));
  await calendar.getByRole("link", { name: String(start.getDate()), exact: true }).click();
  await page.locator("#Search").click();
  await page.waitForFunction(
    () => [...document.querySelectorAll("#datalist tbody tr")].some((row) => row.querySelectorAll("td").length >= 5),
    null,
    { timeout: 30000 },
  );
  const pageSize = page.locator("#datalist_length select");
  if (await pageSize.count()) await pageSize.selectOption("100");
  const rows = await page.locator("#datalist tbody tr").evaluateAll((elements) =>
    elements.map((row) => {
      const cells = [...row.querySelectorAll("td")];
      return {
        date: cells[0]?.textContent?.trim() || "",
        status: cells[2]?.textContent?.trim() || "",
        href: cells[2]?.querySelector("a")?.getAttribute("href") || "",
      };
    }),
  );
  const meetings = rows
    .filter((row) => /^(完成|completed)$/i.test(row.status) && /^operationsChapterViewPalms\?/.test(row.href))
    .map((row) => ({ date: dateValue(row.date), href: row.href }))
    .filter((row) => row.date && row.date >= dateValue(start.toISOString().slice(0, 10)));
  if (!meetings.length) throw Error("找不到最近已完成的分會 PALMS；本次未覆寫出缺席資料");
  return meetings.sort((a, b) => a.date.localeCompare(b.date));
}
async function chapterPalmsAttendance(page, meeting, chapter, rosterMembers) {
  const url = new URL(meeting.href, "https://www.bniconnectglobal.com/web/secure/");
  if (url.origin !== "https://www.bniconnectglobal.com" ||
      url.pathname !== "/web/secure/operationsChapterViewPalms" ||
      url.searchParams.get("chapterId") !== chapter) {
    throw Error("分會 PALMS 明細連結異常，已停止更新");
  }
  await page.goto(url.href, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(() => document.querySelectorAll("#datalist tbody tr").length >= 10, null, { timeout: 30000 });
  const pageSize = page.locator("#datalist_length select");
  if (await pageSize.count()) await pageSize.selectOption("100");
  await page.waitForFunction((minimum) => document.querySelectorAll("#datalist tbody tr").length >= minimum, Math.ceil(rosterMembers.size * 0.8), { timeout: 30000 });
  const rows = await page.locator("#datalist tbody tr").evaluateAll((elements) =>
    elements.map((row) => [...row.querySelectorAll("td")].map((cell) => cell.textContent?.trim() || "")),
  );
  const records = rows
    .map(([surname, given, code]) => {
      const name = normalize(`${surname}${given}`);
      const member = rosterMembers.get(name) || [...rosterMembers.entries()]
        .filter(([key]) => name.startsWith(key))
        .sort((a, b) => b[0].length - a[0].length)[0]?.[1] || "";
      return { member, date: meeting.date, code: code?.toUpperCase() || "" };
    })
    .filter((row) => row.member && ["P", "A", "L", "M", "S"].includes(row.code));
  if (records.length < Math.ceil(rosterMembers.size * 0.8)) {
    throw Error(`${meeting.date} 分會 PALMS 明細人數異常，已停止更新`);
  }
  let report;
  try {
    report = parseChapterSummary(meeting.date, rows, rosterMembers);
  } catch (error) {
    console.warn(`Weekly summary unavailable for ${meeting.date}:`, error instanceof Error ? error.message : String(error));
    return { records, report: null };
  }
  try {
    await page.locator('a[href^="operationsChapterSlipsAuditReport?"]').click();
    const auditFrame = page.frameLocator("#reportsIFrame");
    await auditFrame.getByText("交易總額", { exact: true }).waitFor({ state: "visible", timeout: 60000 });
    const auditRows = await auditFrame.locator("table").evaluateAll((tables) => {
      const table = tables.find((item) => {
        const first = item.querySelector("tr");
        const cells = [...(first?.querySelectorAll("th,td") || [])].map((cell) => cell.textContent?.trim() || "");
        return cells[0] === "自" && cells[1] === "至" && cells[2] === "事件類型";
      });
      return table ? [...table.querySelectorAll("tr")].slice(1).map((row) =>
        [...row.querySelectorAll("td")].map((cell) => cell.textContent?.trim() || ""),
      ) : [];
    });
    report.audit = parseChapterAudit(auditRows, report.totals.transactionValue);
  } catch (error) {
    console.warn(`Audit report unavailable for ${meeting.date}:`, error instanceof Error ? error.message : String(error));
    report.audit = { status: "unavailable", total: null, ownTotal: null, otherChapterTotal: null, transactionCount: 0, ownTransactions: [] };
  }
  return { records, report };
}
async function sync() {
  for (const key of required)
    if (!process.env[key]) throw Error(`同步服務缺少 ${key}`);
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ locale: "zh-TW" }),
      page = await context.newPage();
    console.log("Opening BNI chapter reports page");
    await page.goto(
      "https://www.bniconnectglobal.com/web/secure/reportsHome#reportsactiontabcontentstructurechapter",
      {
      waitUntil: "networkidle",
      timeout: 90000,
      },
    );
    await page.waitForTimeout(2000);
    if (
      page.url().includes("/login") ||
      page.url().replace(/\/$/, "") === "https://bniconnectglobal.com"
    ) {
      await page
        .locator("input[name='username']")
        .fill(process.env.BNI_USERNAME);
      await page
        .locator("input[name='password']")
        .fill(process.env.BNI_PASSWORD);
      await page.locator("form button[type='submit']").click();
      await page
        .waitForURL((url) => !url.toString().includes("/login"), {
          timeout: 60000,
        })
        .catch(() => {
          throw Error("BNI 登入失敗；可能需要驗證碼或重新確認帳密");
        });
      await page.goto(
        "https://www.bniconnectglobal.com/web/secure/reportsHome#reportsactiontabcontentstructurechapter",
        { waitUntil: "networkidle", timeout: 90000 },
      );
    }
    let session = "";
    for (let attempt = 0; attempt < 5 && !session; attempt++) {
      try {
        session =
          (await page.evaluate(() =>
            localStorage.getItem("bniconnect:portal:session"),
          )) || "";
      } catch (error) {
        if (!String(error).includes("Execution context was destroyed")) throw error;
        await page.waitForLoadState("domcontentloaded", { timeout: 30000 });
      }
      if (!session) await page.waitForTimeout(1000);
    }
    if (!session) throw Error("BNI 登入後未取得工作階段");
    const token = JSON.parse(session).access_token,
      headers = {
        Authorization: `Bearer ${token}`,
        Accept: "application/json, text/plain, */*",
        Origin: "https://www.bniconnectglobal.com",
        Referer: "https://www.bniconnectglobal.com/",
      };
    const end = new Date(),
      start = new Date(end.getFullYear(), end.getMonth() - 5, 1),
      displayDate = (date) =>
        `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
    const [profileResponse, homeResponse] = await Promise.all([
      context.request.get("https://api.bniconnectglobal.com/core-api/profile", { headers }),
      context.request.get("https://api.bniconnectglobal.com/member-api/v2/home", { headers }),
    ]);
    if (!profileResponse.ok() || !homeResponse.ok())
      throw Error("BNI 登入有效，但無法取得分會識別資料");
    const profile = await profileResponse.json(),
      home = await homeResponse.json(),
      chapter = findId({ profile, home }, "chapter"),
      region = findId({ profile, home }, "region"),
      country = findId({ profile, home }, "country"),
      capturedParams = new URLSearchParams({
        IdOrg: chapter,
        startDate: displayDate(start),
        endDate: displayDate(end),
        ReportType: "HTML",
        __heading_chapter: chapter,
        __orientation: "ltr",
        execution_type: "SHORT",
        ShowDetails: "false",
        __exports_details: "1",
      });
    if (region) capturedParams.set("__heading_region", region);
    if (country) capturedParams.set("__heading_country", country);
    if (!chapter) throw Error("BNI 報表頁未回傳分會識別資料");
    console.log("Resolved BNI report parameters from the authenticated session");
    const
      generate = async (menu) => {
        const q = new URLSearchParams(capturedParams);
        q.set("menuName", menu);
        q.set("IdOrg", chapter);
        q.set("startDate", us(start));
        q.set("endDate", us(end));
        q.set("ReportType", "EXCEL");
        q.set("__heading_chapter", chapter);
        if (region) q.set("__heading_region", region);
        if (country) q.set("__heading_country", country);
        q.set("__orientation", "ltr");
        q.set("execution_type", "SHORT");
        q.set("ShowDetails", "false");
        q.set("__exports_details", "1");
        const
          r = await context.request.get(
            `https://api.bniconnectglobal.com/reports-api/reports/v1/generate?${q}`,
            { headers },
          );
        if (!r.ok()) throw Error(`BNI 報表讀取失敗（${r.status()}）`);
        return r.text();
      };
    const [rt, at, dt] = await Promise.all([
        generate("menu.reports.chapter.roster"),
        generate("menu.reports.chapter.palms.attendance"),
        generate("menu.reports.chapter.membership.dues").catch(() => ""),
      ]),
      rosterRows = roster(rt);
    if (rosterRows.length < 10) throw Error("會員名冊筆數異常，已停止更新");
    const members = [
        ...new Set(rosterRows.map((i) => i.member.replace(/\s+/g, ""))),
      ],
      rosterMembers = new Map(members.map((member) => [normalize(member), member])),
      byMemberAndDate = new Map(
        attendance(at, end)
          .map((record) => ({ ...record, member: rosterMembers.get(normalize(record.member)) || "" }))
          .filter((record) => record.member)
          .map((record) => [`${normalize(record.member)}|${record.date}`, record]),
      );
    // The aggregate attendance export can lag behind a completed meeting. Reconcile
    // the recent completed chapter PALMS reports before replacing site data.
    const completedMeetings = await completedChapterPalms(page, chapter, recentMeetingStart(end));
    const weeklyReports = [];
    for (const meeting of completedMeetings) {
      const { records: directRecords, report } = await chapterPalmsAttendance(page, meeting, chapter, rosterMembers);
      if (report) weeklyReports.push(report);
      for (const record of directRecords) {
        byMemberAndDate.set(`${normalize(record.member)}|${record.date}`, record);
      }
    }
    const records = [...byMemberAndDate.values()],
      latestCompletedDate = completedMeetings.at(-1)?.date || "",
      latestRecordDate = records.map((record) => record.date).sort().at(-1) || "";
    if (latestRecordDate < latestCompletedDate) {
      throw Error(`分會 PALMS 已完成至 ${latestCompletedDate}，但同步資料只到 ${latestRecordDate || "無資料"}；本次未覆寫出缺席資料`);
    }
    if (records.length < 10) throw Error("PALMS 筆數異常，已停止更新");
    const dues = dt ? roster(dt) : [],
      expiry = new Map(
        [...rosterRows, ...dues]
          .filter((i) => i.expiryDate)
          .map((i) => [normalize(i.member), i.expiryDate]),
      ),
      renewals = rosterRows
        .map((i) => ({
          member: i.member,
          expiryDate: expiry.get(normalize(i.member)) || i.expiryDate,
        }))
        .filter((i) => i.expiryDate);
    const upload = await context.request.post(
        `${process.env.SITE_URL.replace(/\/$/, "")}/api/v1/bni-sync`,
        {
          headers: {
            Authorization: `Bearer ${process.env.BNI_RUNNER_TOKEN}`,
            "Content-Type": "application/json",
          },
          data: { members, records, renewals, weeklyReports },
        },
      ),
      result = await upload.json();
    if (!upload.ok())
      throw Error(result.error || `管理系統寫入失敗（${upload.status()}）`);
    return {
      ok: true,
      ...result,
      latestDate: latestRecordDate,
      completedMeetingCount: completedMeetings.length,
      weeklyReportCount: weeklyReports.length,
    };
  } finally {
    await browser.close();
  }
}
let busy = false;
let syncStatus = { state: "idle", startedAt: null, completedAt: null, result: null, error: "" };
const server = http.createServer(async (req, res) => {
  res.setHeader("content-type", "application/json; charset=utf-8");
  if (req.url === "/health") {
    res.end(JSON.stringify({ ok: true, ...syncStatus }));
    return;
  }
  if (req.url === "/status") {
    if (req.headers.authorization !== `Bearer ${process.env.BNI_RUNNER_TOKEN}`) {
      res.statusCode = 401;
      res.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }
    res.end(JSON.stringify(syncStatus));
    return;
  }
  if (req.url !== "/sync" || req.method !== "POST") {
    res.statusCode = 404;
    res.end(JSON.stringify({ error: "not found" }));
    return;
  }
  if (req.headers.authorization !== `Bearer ${process.env.BNI_RUNNER_TOKEN}`) {
    console.warn("BNI sync rejected: runner token mismatch");
    res.statusCode = 401;
    res.end(JSON.stringify({ error: "unauthorized" }));
    return;
  }
  if (busy) {
    res.statusCode = 202;
    res.end(JSON.stringify({ ok: true, accepted: true, ...syncStatus }));
    return;
  }
  busy = true;
  const startedAt = new Date().toISOString();
  syncStatus = { state: "running", startedAt, completedAt: null, result: null, error: "" };
  res.statusCode = 202;
  res.end(JSON.stringify({ ok: true, accepted: true, state: "running", startedAt }));
  void (async () => {
   try {
    console.log("BNI sync started");
    const result = await sync();
    console.log(
      "BNI sync completed",
      JSON.stringify({
        members: result.memberCount,
        records: result.recordCount,
        renewals: result.renewalCount,
        latestDate: result.latestDate,
      }),
    );
    syncStatus = { state: "success", startedAt, completedAt: new Date().toISOString(), result, error: "" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "同步失敗";
    console.error("BNI sync failed:", message);
    syncStatus = { state: "failed", startedAt, completedAt: new Date().toISOString(), result: null, error: message };
  } finally {
    busy = false;
  }
  })();
});
server.listen(Number(process.env.PORT || 10000), "0.0.0.0", () =>
  console.log("BNI sync service listening"),
);
