import http from "node:http";
import { chromium } from "playwright";

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
async function sync() {
  for (const key of required)
    if (!process.env[key]) throw Error(`同步服務缺少 ${key}`);
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ locale: "zh-TW" }),
      page = await context.newPage();
    console.log("Opening BNI chapter reports page");
    await page.goto("https://www.bniconnectglobal.com/web/reports?tab=chapter", {
      waitUntil: "networkidle",
      timeout: 90000,
    });
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
      await page.goto("https://www.bniconnectglobal.com/web/reports?tab=chapter", {
        waitUntil: "networkidle",
        timeout: 90000,
      });
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
      };
    const end = new Date(),
      start = new Date(end.getFullYear(), end.getMonth() - 5, 1),
      displayDate = (date) =>
        `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
    const startInput = page
        .locator("input[name='startDate'], input[id*='startDate']")
        .first(),
      endInput = page
        .locator("input[name='endDate'], input[id*='endDate']")
        .first(),
      goButton = page
        .locator("button#button, button:has-text('開始'), button:has-text('Go')")
        .first();
    if (!(await startInput.count()) || !(await endInput.count()) || !(await goButton.count()))
      throw Error("BNI 報表頁結構已變更，找不到日期欄位或 Go 按鈕");
    await startInput.fill(displayDate(start));
    await endInput.fill(displayDate(end));
    const htmlOption = page.locator("input[name='report-type'][value='HTML']");
    if (await htmlOption.count()) await htmlOption.check();
    const reportResponsePromise = page.waitForResponse(
      (response) => response.url().includes("reports-api"),
      { timeout: 90000 },
    );
    await goButton.click();
    const reportResponse = await reportResponsePromise;
    if (!reportResponse.ok())
      throw Error(`BNI 報表頁測試失敗（${reportResponse.status()}）`);
    const capturedUrl = new URL(reportResponse.url()),
      capturedParams = capturedUrl.searchParams,
      chapter = capturedParams.get("IdOrg") || capturedParams.get("__heading_chapter"),
      region = capturedParams.get("__heading_region"),
      country = capturedParams.get("__heading_country");
    if (!chapter) throw Error("BNI 報表頁未回傳分會識別資料");
    console.log("Captured BNI report parameters from the authenticated page");
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
      records = [
        ...new Map(
          attendance(at, end)
            .filter((i) => members.includes(i.member.replace(/\s+/g, "")))
            .map((i) => [`${normalize(i.member)}|${i.date}`, i]),
        ).values(),
      ];
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
          data: { members, records, renewals },
        },
      ),
      result = await upload.json();
    if (!upload.ok())
      throw Error(result.error || `管理系統寫入失敗（${upload.status()}）`);
    return {
      ok: true,
      ...result,
      latestDate:
        records
          .map((i) => i.date)
          .sort()
          .at(-1) || "",
    };
  } finally {
    await browser.close();
  }
}
let busy = false;
const server = http.createServer(async (req, res) => {
  res.setHeader("content-type", "application/json; charset=utf-8");
  if (req.url === "/health") {
    res.end(JSON.stringify({ ok: true }));
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
    res.statusCode = 409;
    res.end(JSON.stringify({ error: "同步正在執行中" }));
    return;
  }
  busy = true;
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
    res.end(JSON.stringify(result));
  } catch (error) {
    const message = error instanceof Error ? error.message : "同步失敗";
    console.error("BNI sync failed:", message);
    res.statusCode = 502;
    res.end(JSON.stringify({ error: message }));
  } finally {
    busy = false;
  }
});
server.listen(Number(process.env.PORT || 10000), "0.0.0.0", () =>
  console.log("BNI sync service listening"),
);
