const SITE = "https://bni-changyou-vice-chair.wizoza69311.chatgpt.site";
const BNI_REPORTS = "https://www.bniconnectglobal.com/web/secure/reportsHome#reportsactiontabcontentstructurechapter";
const $ = (id) => document.getElementById(id),
  status = (text, type = "") => {
    $("status").textContent = text;
    $("status").className = type;
  };
chrome.storage.local.get("syncKey", (data) => {
  $("key").value = data.syncKey || "";
});
chrome.storage.local.get(["autoSync", "lastSyncResult"], (data) => {
  $("auto-sync").checked = Boolean(data.autoSync);
  if (data.lastSyncResult) $("last-result").textContent = data.lastSyncResult;
});
$("save").onclick = () => {
  const syncKey = $("key").value.trim();
  chrome.storage.local.set({ syncKey }, () =>
    status(syncKey ? "配對金鑰已安全儲存在這台瀏覽器。" : "金鑰已清除。", "ok"),
  );
};
$("auto-sync").onchange = () => {
  const enabled = $("auto-sync").checked;
  chrome.storage.local.set({ autoSync: enabled });
  chrome.runtime.sendMessage({ type: "set-schedule", enabled });
  status(enabled ? "每週自動更新已開啟。" : "每週自動更新已關閉。", "ok");
};
const normalize = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[\s_\-–—／/()（）:：.]/g, "");
const number = (value) => {
  const parsed = Number(String(value || "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};
const cellValues = (row) => {
  const output = [];
  let cursor = 0;
  for (const cell of [...row.getElementsByTagNameNS("*", "Cell")]) {
    const index =
      cell.getAttributeNS(
        "urn:schemas-microsoft-com:office:spreadsheet",
        "Index",
      ) || cell.getAttribute("ss:Index");
    if (index) cursor = Number(index) - 1;
    output[cursor] = (
      cell.getElementsByTagNameNS("*", "Data")[0]?.textContent || ""
    ).trim();
    cursor++;
  }
  return output;
};
const spreadsheetRows = (text) => {
  const xml = new DOMParser().parseFromString(text, "application/xml");
  if (xml.querySelector("parsererror"))
    throw new Error("BNI 回傳的報表格式無法辨識");
  return [...xml.getElementsByTagNameNS("*", "Row")].map(cellValues);
};
function findId(source, key) {
  const wanted = normalize(key),
    seen = new Set();
  function visit(value) {
    if (!value || typeof value !== "object" || seen.has(value)) return "";
    seen.add(value);
    for (const [name, item] of Object.entries(value)) {
      if (normalize(name).includes(wanted) && /\d{2,}/.test(String(item || "")))
        return String(item).match(/\d{2,}/)?.[0] || "";
      const nested = visit(item);
      if (nested) return nested;
    }
    return "";
  }
  return visit(source);
}
async function readPageContext(tabId) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: () => {
      const params = Object.fromEntries(
        new URL(location.href).searchParams.entries(),
      );
      for (const element of document.querySelectorAll(
        "input[name],select[name]",
      )) {
        if (element.value && !params[element.name])
          params[element.name] = element.value;
      }
      const chapter = document.getElementById("bniChapter")?.getAttribute("name") || "",
        region = document.getElementById("bniRegion")?.getAttribute("name") || "",
        country = document.getElementById("bniCountry")?.getAttribute("name") || "";
      if (/^\d+$/.test(chapter)) {
        params.IdOrg = params.IdOrg || chapter;
        params.__heading_chapter = params.__heading_chapter || chapter;
      }
      if (/^\d+$/.test(region)) params.__heading_region = params.__heading_region || region;
      if (/^\d+$/.test(country)) params.__heading_country = params.__heading_country || country;
      return {
        params,
        url: location.href,
        text: (document.body?.innerText || "").slice(0, 1200),
      };
    },
  });
  return result || { params: {}, url: "", text: "" };
}
async function readAttendancePalms(tabId) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: async () => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
        end = new Date(),
        start = new Date(end.getFullYear(), end.getMonth() - 5, 1),
        displayDate = (date) =>
          `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
      document.querySelector(".ui-dialog-titlebar-close")?.click();
      const tabLink = [...document.querySelectorAll('a[href^="#ui-tabs-"]')].find(
        (link) => (link.textContent || "").replace(/\s+/g, "").includes("PALMS出席報告"),
      );
      if (!tabLink) return { error: "找不到 PALMS 出席報告，請確認目前位於 BNI 報告頁" };
      tabLink.click();
      let form = null;
      for (let attempt = 0; attempt < 40; attempt++) {
        form = document.querySelector("#chapter_PALMSAttendanceReport");
        if (form) break;
        await wait(100);
      }
      if (!form) return { error: "PALMS 出席報告無法開啟" };
      for (const [id, value] of [
        ["startDateChapterChapterPALMSAttendanceReportDisplay", displayDate(start)],
        ["endDateChapterChapterPALMSAttendanceReportDisplay", displayDate(end)],
      ]) {
        const input = document.getElementById(id);
        if (!input) return { error: "PALMS 出席報告日期欄位無法辨識" };
        input.value = value;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
      form.querySelector("#button")?.click();
      let report = null;
      for (let attempt = 0; attempt < 80; attempt++) {
        await wait(250);
        try {
          const candidate = document.querySelector("#reportsIFrame")?.contentDocument;
          if (candidate?.body?.innerText?.includes("PALMS出席報告")) {
            report = candidate;
            break;
          }
        } catch {}
      }
      if (!report) return { error: "PALMS 出席報告載入逾時，請確認 BNI 仍保持登入" };
      const exportLink = [...report.querySelectorAll("a")].find((link) =>
        /ReportType=XLS/i.test(link.href),
      );
      if (!exportLink) return { error: "找不到 PALMS 匯出資料" };
      const response = await fetch(exportLink.href, { credentials: "include" });
      if (!response.ok) return { error: `PALMS 匯出失敗（${response.status}）` };
      const text = await response.text();
      document.querySelector(".ui-dialog-titlebar-close")?.click();
      return { text, end: end.toISOString() };
    },
  });
  if (result?.error) throw new Error(result.error);
  if (!result?.text) throw new Error("PALMS 出席報告沒有可同步內容");
  return result;
}
async function readPersonalPalms(tabId) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: async () => {
      const form = document.querySelector("#chapter_Personal_VP"),
        select = document.querySelector("#membershipIdMemberPersonalVP");
      if (!form || !select)
        return { error: "請先在報告頁展開『個人 PALMS 報告』" };
      const end = new Date(),
        sixStart = new Date(end.getFullYear(), end.getMonth() - 5, 1),
        fourStart = new Date(end);
      fourStart.setDate(end.getDate() - 27);
      const displayDate = (date) =>
          `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`,
        normalize = (value) =>
          String(value || "")
            .replace(/[\s_\-–—／/()（）:：.]/g, "")
            .toLowerCase(),
        asNumber = (value) => {
          const parsed = Number(String(value || "").replace(/[^\d.-]/g, ""));
          return Number.isFinite(parsed) ? parsed : 0;
        },
        asDate = (value) => {
          const parts = String(value || "").match(
            /(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/,
          );
          return parts
            ? new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]))
            : null;
        },
        wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
        cleanMemberName = (value) => {
          const text = String(value || "").replace(/\s+/g, " ").trim();
          const chinese = text.match(/[\u3400-\u9fff]+/g)?.join("") || "";
          return chinese.length >= 2 ? chinese : text;
        },
        directCells = (row) =>
          [...row.children]
            .filter((cell) => cell.tagName === "TH" || cell.tagName === "TD")
            .map((cell) => (cell.textContent || "").trim());
      const aliases = {
          date: ["會議日期", "meetingdate"],
          inside: ["提供內部引薦", "gi", "referralsgiveninside"],
          outside: ["提供外部引薦", "go", "referralsgivenoutside"],
          visitors: ["來賓", "v", "visitors"],
          oneToOne: ["一對一會面", "121", "onetoone"],
          amount: [
            "交易價值",
            "成交價值",
            "引薦金額",
            "tyfcb",
            "businessvalue",
          ],
          education: ["分會教育單位", "教育分數", "教育單位", "ceu"],
        },
        col = (headers, names) =>
          headers.findIndex((header) =>
            names.some(
              (name) =>
                normalize(header) === normalize(name) ||
                normalize(header).includes(normalize(name)),
            ),
          );
      async function load(option) {
        const oldFrame = document.querySelector("#reportsIFrame");
        document.querySelector(".ui-dialog-titlebar-close")?.click();
        for (let attempt = 0; oldFrame?.isConnected && attempt < 20; attempt++)
          await wait(100);
        select.value = option.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        for (const [id, value] of [
          ["fromDatePersonalVPDisplay", displayDate(sixStart)],
          ["toDatePersonalVPDisplay", displayDate(end)],
        ]) {
          const input = document.getElementById(id);
          input.value = value;
          input.dispatchEvent(new Event("change", { bubbles: true }));
        }
        form.querySelector("#button").click();
        let report = null;
        for (let attempt = 0; attempt < 80; attempt++) {
          await wait(250);
          const frame = document.querySelector("#reportsIFrame");
          try {
            const candidate = frame?.contentDocument;
            const reportText = normalize(candidate?.body?.textContent);
            const memberText = normalize(option.text);
            if (
              candidate &&
              candidate.querySelectorAll("tr").length > 3 &&
              reportText.includes(memberText)
            ) {
              report = candidate;
              break;
            }
          } catch {}
        }
        if (!report) throw new Error(`${option.text} 報告載入逾時`);
      let headerRow = null,
        indexes;
      for (const candidateRow of report.querySelectorAll("tr")) {
        const cells = directCells(candidateRow);
        if (cells.length < 7) continue;
        const candidate = {
          date: col(cells, aliases.date),
          inside: col(cells, aliases.inside),
          outside: col(cells, aliases.outside),
          visitors: col(cells, aliases.visitors),
          oneToOne: col(cells, aliases.oneToOne),
          amount: col(cells, aliases.amount),
          education: col(cells, aliases.education),
        };
        const positions = Object.values(candidate);
        if (
          positions.every((index) => index >= 0) &&
          new Set(positions).size === positions.length
        ) {
          headerRow = candidateRow;
          indexes = candidate;
          break;
        }
      }
      const reportTable = headerRow?.closest("table");
      const tableRows = reportTable ? [...reportTable.rows] : [];
      const headerIndex = headerRow ? tableRows.indexOf(headerRow) : -1;
      const rows = tableRows.map(directCells);
        document.querySelector(".ui-dialog-titlebar-close")?.click();
        if (headerIndex < 0) throw new Error(`${option.text} 欄位格式無法辨識`);
        let inside = 0,
          outside = 0,
          visitors = 0,
          oneToOne = 0,
          amount = 0,
          education = 0;
        for (const row of rows.slice(headerIndex + 1)) {
          const date = asDate(row[indexes.date]);
          if (!date || date < sixStart || date > end) continue;
          inside += asNumber(row[indexes.inside]);
          outside += asNumber(row[indexes.outside]);
          oneToOne += asNumber(row[indexes.oneToOne]);
          amount += asNumber(row[indexes.amount]);
          education += asNumber(row[indexes.education]);
          if (date >= fourStart) visitors += asNumber(row[indexes.visitors]);
        }
        const weeks = Math.max(1, (end - sixStart) / 604800000);
        const record = {
          member: cleanMemberName(option.text),
          trainingPoints: Math.round(education),
          visitorCount: Math.round(visitors),
          oneToOneWeeklyAverage: Number((oneToOne / weeks).toFixed(2)),
          referralWeeklyAverage: Number(
            ((inside + outside) / weeks).toFixed(2),
          ),
          dreamReferralAmount: Math.round(amount),
        };
        if (
          record.trainingPoints > 500 ||
          record.visitorCount > 500 ||
          record.oneToOneWeeklyAverage > 200 ||
          record.referralWeeklyAverage > 200 ||
          record.dreamReferralAmount > 10000000000
        )
          throw new Error(`${option.text} 數值異常，已略過避免寫入錯誤資料`);
        return record;
      }
      const options = [...select.options].filter(
          (option) => option.value && option.text.trim(),
        ),
        records = [],
        errors = [],
        failedMembers = [];
      for (const option of options) {
        let lastError;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            records.push(await load(option));
            lastError = null;
            break;
          } catch (error) {
            lastError = error;
            await wait(500);
          }
        }
        if (lastError) {
          errors.push(lastError.message || option.text);
          failedMembers.push(cleanMemberName(option.text));
        }
      }
      return { records, errors, failedMembers, total: options.length };
    },
  });
  if (result?.error) throw new Error(result.error);
  return result;
}
function usDate(date) {
  return `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}/${date.getFullYear()}`;
}
function isoDate(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
function parseAttendanceReport(text, endDate) {
  const rows = spreadsheetRows(text);
  let headers = [],
    headerIndex = -1,
    dateStart = -1;
  for (let i = 0; i < rows.length; i++) {
    const first = rows[i].findIndex(
      (v) =>
        /^\d{1,2}\s*月\s*\d{1,2}$/.test(v) || /^\d{1,2}[\/-]\d{1,2}$/.test(v),
    );
    if (first >= 0) {
      headers = rows[i];
      headerIndex = i;
      dateStart = first;
      break;
    }
  }
  if (headerIndex < 0) throw new Error("無法辨識 PALMS 報表日期欄");
  const records = [];
  for (const row of rows.slice(headerIndex + 1)) {
    const member = row.slice(0, dateStart).join("").replace(/\s+/g, "").trim();
    if (!member) continue;
    for (let col = dateStart; col < headers.length; col++) {
      const code = (row[col] || "").trim().toUpperCase();
      if (!["P", "A", "L", "M", "S"].includes(code)) continue;
      const parts =
        headers[col].match(/^(\d{1,2})\s*月\s*(\d{1,2})$/) ||
        headers[col].match(/^(\d{1,2})[\/-](\d{1,2})$/);
      if (!parts) continue;
      const month = Number(parts[1]),
        day = Number(parts[2]),
        year =
          month > endDate.getMonth() + 1
            ? endDate.getFullYear() - 1
            : endDate.getFullYear();
      records.push({ member, date: isoDate(year, month, day), code });
    }
  }
  return records;
}
const aliases = {
  member: ["會員姓名", "會員", "membername", "member"],
  surname: ["姓氏", "lastname", "surname"],
  givenName: ["名字", "firstname", "givenname"],
  education: [
    "教育分數",
    "教育點數",
    "培訓分數",
    "educationpoints",
    "educationunits",
    "ceu",
    "分會教育單位",
  ],
  inside: [
    "內部引薦",
    "內引薦",
    "referralsgiveninside",
    "referralsinside",
    "rgbi",
  ],
  outside: [
    "外部引薦",
    "外引薦",
    "referralsgivenoutside",
    "referralsoutside",
    "rgbo",
  ],
  referralAmount: [
    "提供的引薦金額",
    "引薦金額",
    "商機金額",
    "referralamount",
    "referralsgivenamount",
    "businessgiven",
    "交易價值",
  ],
  visitors: ["來賓", "訪客", "visitors", "visitor"],
  oneToOne: ["一對一", "121", "1to1", "onetoone", "onetoones"],
};
const column = (headers, names) =>
  headers.findIndex((header) =>
    names.some((name) => normalize(header).includes(normalize(name))),
  );
function parseKpiReport(text) {
  const rows = spreadsheetRows(text);
  let headerIndex = -1,
    indexes;
  for (let i = 0; i < rows.length; i++) {
    const candidate = {
      member: column(rows[i], aliases.member),
      surname: column(rows[i], aliases.surname),
      givenName: column(rows[i], aliases.givenName),
      education: column(rows[i], aliases.education),
      inside: column(rows[i], aliases.inside),
      outside: column(rows[i], aliases.outside),
      referralAmount: column(rows[i], aliases.referralAmount),
      visitors: column(rows[i], aliases.visitors),
      oneToOne: column(rows[i], aliases.oneToOne),
    };
    if (
      (candidate.member >= 0 ||
        (candidate.surname >= 0 && candidate.givenName >= 0)) &&
      [
        candidate.education,
        candidate.inside,
        candidate.outside,
        candidate.referralAmount,
        candidate.visitors,
        candidate.oneToOne,
      ].filter((value) => value >= 0).length >= 5
    ) {
      headerIndex = i;
      indexes = candidate;
      break;
    }
  }
  if (headerIndex < 0)
    throw new Error(
      "無法辨識個人 PALMS 欄位，請確認目前開啟的是個人 PALMS 報告",
    );
  return rows
    .slice(headerIndex + 1)
    .map((row) => ({
      member: String(
        indexes.member >= 0
          ? row[indexes.member] || ""
          : `${row[indexes.surname] || ""}${row[indexes.givenName] || ""}`,
      )
        .replace(/\s+/g, " ")
        .trim(),
      education: number(row[indexes.education]),
      inside: number(row[indexes.inside]),
      outside: number(row[indexes.outside]),
      referralAmount: number(row[indexes.referralAmount]),
      visitors: number(row[indexes.visitors]),
      oneToOne: number(row[indexes.oneToOne]),
    }))
    .filter((item) => item.member && !/合計|總計|total/i.test(item.member));
}
async function sessionFor(tab) {
  if (!tab?.url?.includes("bniconnectglobal.com"))
    throw new Error("請先切到已登入的 BNI Connect 報表頁，再開啟工具");
  const [{ result: sessionText }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: "MAIN",
    func: () => localStorage.getItem("bniconnect:portal:session"),
  });
  if (!sessionText) throw new Error("找不到 BNI 登入工作階段，請重新登入");
  const token = JSON.parse(sessionText).access_token;
  if (!token) throw new Error("BNI 工作階段缺少 Access Token");
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/json, text/plain, */*",
  };
}
function parseDateValue(value) {
  const text = String(value || "").trim();
  let match = text.match(/(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
  if (match) return isoDate(Number(match[1]), Number(match[2]), Number(match[3]));
  match = text.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
  if (match) return isoDate(Number(match[3]), Number(match[2]), Number(match[1]));
  return "";
}
function parseRosterReport(text) {
  const rows = spreadsheetRows(text), expiryAliases = ["到期日", "續約日", "會籍到期", "會員到期", "expirationdate", "expirydate", "renewaldate"];
  let headerIndex = -1, indexes;
  for (let i = 0; i < rows.length; i++) {
    const candidate = {
      member: column(rows[i], aliases.member),
      surname: column(rows[i], aliases.surname),
      givenName: column(rows[i], aliases.givenName),
      expiry: column(rows[i], expiryAliases),
    };
    if (candidate.member >= 0 || (candidate.surname >= 0 && candidate.givenName >= 0)) {
      headerIndex = i; indexes = candidate; break;
    }
  }
  if (headerIndex < 0) throw new Error("無法辨識會員名冊欄位");
  return rows.slice(headerIndex + 1).map((row) => {
    const member = String(indexes.member >= 0 ? row[indexes.member] || "" : `${row[indexes.surname] || ""}${row[indexes.givenName] || ""}`).replace(/\s+/g, " ").trim();
    return { member, expiryDate: indexes.expiry >= 0 ? parseDateValue(row[indexes.expiry]) : "" };
  }).filter((item) => item.member && !/合計|總計|total/i.test(item.member));
}
async function bniTab() {
  const tabs = await chrome.tabs.query({});
  let tab = tabs.find((item) => item.url?.includes("bniconnectglobal.com/web/secure")) ||
    tabs.find((item) => item.url?.includes("bniconnectglobal.com/login"));
  if (!tab) tab = await chrome.tabs.create({ url: BNI_REPORTS, active: false });
  else if (!tab.url?.includes("/web/secure/reportsHome"))
    tab = await chrome.tabs.update(tab.id, { url: BNI_REPORTS, active: false });
  if (tab.status !== "complete") {
    await new Promise((resolve) => {
      const timeout = setTimeout(() => { chrome.tabs.onUpdated.removeListener(listener); resolve(); }, 30000);
      const listener = (tabId, info) => {
        if (tabId === tab.id && info.status === "complete") {
          clearTimeout(timeout); chrome.tabs.onUpdated.removeListener(listener); resolve();
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
    });
  }
  const current = await chrome.tabs.get(tab.id);
  if (!current.url?.includes("/web/secure/reportsHome"))
    throw new Error("BNI 登入已過期，請在剛開啟的頁面登入後再按一次更新");
  return current;
}
async function reportContext(tab, headers) {
  const [profileResponse, homeResponse, page] = await Promise.all([
    fetch("https://api.bniconnectglobal.com/core-api/profile", { headers }),
    fetch("https://api.bniconnectglobal.com/member-api/v2/home", { headers }),
    readPageContext(tab.id),
  ]);
  if (profileResponse.status === 401 || homeResponse.status === 401)
    throw new Error("BNI 登入已過期，請重新登入");
  const source = {
      profile: profileResponse.ok ? await profileResponse.json() : {},
      home: homeResponse.ok ? await homeResponse.json() : {},
    },
    params = { ...page.params };
  params.IdOrg = params.IdOrg || findId(source, "chapter");
  params.__heading_chapter = params.__heading_chapter || params.IdOrg;
  params.__heading_region = params.__heading_region || findId(source, "region");
  params.__heading_country =
    params.__heading_country || findId(source, "country");
  return { params, page };
}
async function generateReport(base, start, end, headers) {
  const params = new URLSearchParams({
    ...base,
    startDate: usDate(start),
    endDate: usDate(end),
    ReportType: "EXCEL",
    execution_type: "SHORT",
    ShowDetails: "false",
    __exports_details: "1",
  });
  const response = await fetch(
    `https://api.bniconnectglobal.com/reports-api/reports/v1/generate?${params}`,
    { headers },
  );
  if (!response.ok) throw new Error(`BNI 報表讀取失敗（${response.status}）`);
  return response.text();
}
async function readSummaryKpis(tab) {
  const headers = await sessionFor(tab);
  const { params } = await reportContext(tab, headers);
  if (!params.IdOrg || !params.__heading_region || !params.__heading_country)
    throw new Error("無法取得分會報表識別資料");
  const end = new Date(),
    sixStart = new Date(end.getFullYear(), end.getMonth() - 5, 1),
    fourStart = new Date(end);
  fourStart.setDate(end.getDate() - 27);
  const base = {
    menuName: "menu.reports.chapter.palms.summary",
    IdOrg: params.IdOrg,
    __heading_chapter: params.__heading_chapter || params.IdOrg,
    __heading_region: params.__heading_region,
    __heading_country: params.__heading_country,
    __orientation: "ltr",
  };
  const [sixText, fourText] = await Promise.all([
    generateReport(base, sixStart, end, headers),
    generateReport(base, fourStart, end, headers),
  ]);
  const six = parseKpiReport(sixText),
    four = parseKpiReport(fourText),
    visitors = new Map(four.map((item) => [normalize(item.member), item.visitors])),
    weeks = Math.max(1, (end - sixStart) / 604800000);
  return six.map((item) => ({
    member: item.member,
    trainingPoints: Math.round(item.education),
    visitorCount: Math.round(visitors.get(normalize(item.member)) || 0),
    oneToOneWeeklyAverage: Number((item.oneToOne / weeks).toFixed(2)),
    referralWeeklyAverage: Number(((item.inside + item.outside) / weeks).toFixed(2)),
    dreamReferralAmount: Math.round(item.referralAmount),
  }));
}
async function readRosterAndRenewals(tab) {
  const headers = await sessionFor(tab), { params } = await reportContext(tab, headers);
  if (!params.IdOrg || !params.__heading_region || !params.__heading_country)
    throw new Error("無法取得分會報表識別資料");
  const end = new Date(), start = new Date(end.getFullYear(), end.getMonth() - 1, 1), common = {
    IdOrg: params.IdOrg,
    __heading_chapter: params.__heading_chapter || params.IdOrg,
    __heading_region: params.__heading_region,
    __heading_country: params.__heading_country,
    __orientation: "ltr",
  };
  const rosterText = await generateReport({ ...common, menuName: "menu.reports.chapter.roster" }, start, end, headers);
  const roster = parseRosterReport(rosterText);
  if (roster.length < 10) throw new Error("會員名冊筆數異常，已停止更新以保護現有資料");
  let dues = [];
  try {
    const duesText = await generateReport({ ...common, menuName: "menu.reports.chapter.membership.dues" }, start, end, headers);
    dues = parseRosterReport(duesText);
  } catch {}
  const expiryByName = new Map([...roster, ...dues].filter(item => item.expiryDate).map(item => [normalize(item.member), item.expiryDate]));
  return {
    members: roster.map(item => item.member),
    renewals: roster.map(item => ({ member: item.member, expiryDate: expiryByName.get(normalize(item.member)) || item.expiryDate })).filter(item => item.expiryDate),
  };
}
async function upload(key, payload) {
  const response = await fetch(`${SITE}/api/v1/bni-sync`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }),
    result = await response.json();
  if (!response.ok) throw new Error(result.error || "同步失敗");
  return result;
}
function attendanceCoverage(records, expectedMembers) {
  const dates = records.map((item) => item.date).sort(), latestDate = dates.at(-1) || "";
  const present = new Set(records.filter((item) => item.date === latestDate).map((item) => normalize(item.member)));
  const missingMembers = expectedMembers.filter((member) => !present.has(normalize(member)));
  return { latestDate, presentCount: present.size, expectedCount: expectedMembers.length, missingMembers };
}
async function runAttendance(expectedMembers = []) {
  try {
    $("sync").disabled = true;
    status("正在讀取 BNI Connect…");
    const key = $("key").value.trim();
    if (!key) throw new Error("請先貼上並儲存同步配對金鑰");
    const tab = await bniTab();
    await sessionFor(tab);
    status("正在自動開啟並產生滾動六個月 PALMS…");
    let report = await readAttendancePalms(tab.id),
      records = parseAttendanceReport(report.text, new Date(report.end)),
      coverage = expectedMembers.length ? attendanceCoverage(records, expectedMembers) : null;
    if (coverage?.missingMembers.length) {
      status(`最新例會缺少 ${coverage.missingMembers.length} 位，正在自動複查…`);
      const retryReport = await readAttendancePalms(tab.id),
        retryRecords = parseAttendanceReport(retryReport.text, new Date(retryReport.end)),
        retryCoverage = attendanceCoverage(retryRecords, expectedMembers);
      if (retryCoverage.presentCount >= coverage.presentCount) {
        report = retryReport;
        records = retryRecords;
        coverage = retryCoverage;
      }
    }
    if (!records.length) throw new Error("報表沒有可同步的 PALMS 紀錄");
    const result = await upload(key, { records, attendanceCheck: coverage });
    const incomplete = Boolean(coverage?.missingMembers.length),
      message = incomplete
        ? `出缺席已更新 ${result.count} 筆，但 ${coverage.missingMembers.length} 位待核對：${coverage.missingMembers.join("、")}`
        : `出缺席完成：${result.count} 筆已更新${coverage ? `，最新例會 ${coverage.presentCount}/${coverage.expectedCount} 位已核對` : ""}。`;
    status(message, incomplete ? "error" : "ok");
    return message;
  } catch (error) {
    status(error.message || "同步失敗", "error");
    throw error;
  } finally {
    $("sync").disabled = false;
  }
}
$("sync").onclick = runAttendance;
async function runKpi() {
  try {
    $("sync-kpi").disabled = true;
    status("正在逐一彙整全分會個人 PALMS，約需 1–3 分鐘…");
    const key = $("key").value.trim();
    if (!key) throw new Error("請先貼上並儲存同步配對金鑰");
    const tab = await bniTab();
    await sessionFor(tab);
    let batch;
    try {
      const records = await readSummaryKpis(tab);
      batch = { records, errors: [], failedMembers: [], total: records.length };
    } catch {
      status("分會總表暫時無法讀取，改用逐位補抓…");
      batch = await readPersonalPalms(tab.id);
    }
    if (!batch.records?.length)
      throw new Error(batch.errors?.[0] || "沒有可同步的個人 PALMS 資料");
    status(
      `已讀取 ${batch.records.length}/${batch.total} 位，正在寫入管理系統…`,
    );
    const result = await upload(key, {
        kpis: batch.records,
        failedMembers: batch.failedMembers || [],
      }),
      failed = batch.errors?.length || 0;
    const message = `KPI 完成：${result.kpiCount} 位會員已更新${failed ? `，${failed} 位維持待補（${(batch.failedMembers || []).join("、")}）` : ""}。`;
    status(
      message,
      failed ? "error" : "ok",
    );
    return message;
  } catch (error) {
    status(error.message || "同步失敗", "error");
    throw error;
  } finally {
    $("sync-kpi").disabled = false;
  }
}
$("sync-kpi").onclick = runKpi;

async function runAll() {
  const button = $("sync-all");
  button.disabled = true;
  try {
    const key = $("key").value.trim();
    if (!key) throw new Error("請先貼上並儲存同步配對金鑰");
    const tab = await bniTab();
    status("正在確認在籍會員與續約日期…");
    const roster = await readRosterAndRenewals(tab);
    const rosterResult = await upload(key, roster);
    const attendance = await runAttendance(roster.members);
    const kpi = await runKpi();
    const stamp = new Date().toLocaleString("zh-TW", { hour12: false });
    const message = `${stamp}｜主檔 ${rosterResult.memberCount || roster.members.length} 位、續約 ${rosterResult.renewalCount || roster.renewals.length} 位。${attendance} ${kpi}`;
    $("last-result").textContent = message;
    chrome.storage.local.set({ lastSyncResult: message, lastSyncAt: Date.now() });
    status(attendance.includes("待核對") ? "資料已更新，但出席仍有缺漏待核對。" : "全部資料更新完成。", attendance.includes("待核對") ? "error" : "ok");
    return !attendance.includes("待核對");
  } catch (error) {
    const message = `${new Date().toLocaleString("zh-TW", { hour12: false })}｜${error.message || "更新失敗"}`;
    $("last-result").textContent = message;
    chrome.storage.local.set({ lastSyncResult: message });
    status(error.message || "更新失敗", "error");
    return false;
  } finally {
    button.disabled = false;
  }
}
$("sync-all").onclick = runAll;
if (new URLSearchParams(location.search).get("auto") === "1") {
  setTimeout(async () => {
    const ok = await runAll();
    chrome.runtime.sendMessage({ type: "scheduled-result", ok });
    if (ok) setTimeout(() => window.close(), 2500);
  }, 800);
}
