const normalize = (name) => String(name || "").replace(/\s+/g, "").trim();

export function currentMembersFromRows(rows) {
  const members = [];
  const seen = new Set();
  for (const row of rows) {
    const member = normalize(row.member);
    const status = String(row.status || "").trim();
    if (!member || !/^(現任|active)$/i.test(status)) {
      throw new Error(`Connect 現任會員清單包含異常資料：${member || "無姓名"}（${status || "無狀態"}）`);
    }
    if (!seen.has(member)) {
      seen.add(member);
      members.push(member);
    }
  }
  return members;
}

export async function readCurrentChapterMembers(context, { chapter, region, country }) {
  const page = await context.newPage();
  try {
    const query = new URLSearchParams({ countryId: country, regionId: region, chapterId: chapter });
    await page.goto(`https://www.bniconnectglobal.com/web/secure/operationsChapterManageMembership?${query}`, {
      waitUntil: "domcontentloaded",
      timeout: 90000,
    });
    if (page.url().includes("/login")) throw new Error("Connect 登入已失效，無法核對現任會員");
    await page.locator("#memberStatus").selectOption("membershipstatus.active", { timeout: 45000 });
    await page.locator("#searchMembers").click();
    await page.locator('select[name="datalist_length"]').selectOption("100", { timeout: 45000 });
    const rows = [];
    for (let pageNumber = 0; pageNumber < 30; pageNumber++) {
      await page.waitForFunction(() => {
        const table = document.querySelector("#datalist");
        return table && table.querySelectorAll("tbody tr").length > 0;
      }, null, { timeout: 45000 });
      const chunk = await page.locator("#datalist tbody tr").evaluateAll((elements) =>
        elements.map((element) => ({
          member: element.children[0]?.textContent?.trim() || "",
          status: element.children[4]?.textContent?.trim() || "",
        })),
      );
      rows.push(...chunk);
      const next = page.locator("#datalist_next");
      const nextClass = await next.getAttribute("class");
      if (/disabled/i.test(nextClass || "")) {
        const members = currentMembersFromRows(rows);
        if (members.length < 10) throw new Error("Connect 現任會員筆數異常，已停止更新");
        return members;
      }
      const currentPage = await page.locator("#datalist_info").textContent();
      await next.click();
      await page.waitForFunction((previous) => document.querySelector("#datalist_info")?.textContent !== previous, currentPage, { timeout: 30000 });
    }
    throw new Error("Connect 現任會員名單分頁過多，已停止更新");
  } finally {
    await page.close();
  }
}
