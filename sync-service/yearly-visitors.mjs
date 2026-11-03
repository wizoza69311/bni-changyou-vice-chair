const normalize = (value) => String(value || "").toLowerCase().replace(/[\s_\-–—／/()（）:：.]/g, "");
const decode = (value) => value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

export function spreadsheetRows(text) {
  const output = [];
  for (const match of text.matchAll(/<(?:\w+:)?Row\b[^>]*>([\s\S]*?)<\/(?:\w+:)?Row>/gi)) {
    const row = [];
    let cursor = 0;
    for (const cell of match[1].matchAll(/<(?:\w+:)?Cell\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?Cell>/gi)) {
      const index = cell[1].match(/(?:ss:)?Index=["'](\d+)["']/i);
      if (index) cursor = Number(index[1]) - 1;
      const data = cell[2].match(/<(?:\w+:)?Data\b[^>]*>([\s\S]*?)<\/(?:\w+:)?Data>/i);
      row[cursor++] = decode((data?.[1] || "").replace(/<[^>]+>/g, "")).trim();
    }
    if (row.length) output.push(row);
  }
  if (!output.length) throw Error("年度 PALMS 報表沒有可讀取的資料列");
  return output;
}

export function parseYearlyVisitors(text, rosterMembers) {
  const rows = spreadsheetRows(text);
  const memberNames = ["會員姓名", "會員名稱", "姓名", "membername", "member"],
    surnameNames = ["姓氏", "會員姓氏", "lastname", "surname"],
    givenNames = ["名字", "會員名字", "firstname", "givenname"],
    visitorNames = ["來賓人數", "來賓數", "邀約來賓", "來賓", "訪客數", "訪客", "visitors", "visitor"];
  const column = (row, aliases) => row.findIndex((cell) => aliases.some((alias) => normalize(cell) === normalize(alias)));
  let header = null;
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index], visitors = column(row, visitorNames), member = column(row, memberNames), surname = column(row, surnameNames), given = column(row, givenNames);
    if (visitors >= 0 && (member >= 0 || (surname >= 0 && given >= 0))) {
      header = { index, visitors, member, surname, given };
      break;
    }
  }
  if (!header) throw Error("年度 PALMS 報表缺少會員或來賓欄位");
  const counts = new Map();
  for (const row of rows.slice(header.index + 1)) {
    const name = header.member >= 0 ? row[header.member] : `${row[header.surname] || ""}${row[header.given] || ""}`;
    const member = rosterMembers.get(normalize(name));
    if (!member) continue;
    const raw = String(row[header.visitors] || "").replace(/,/g, "").trim();
    if (!/^\d+$/.test(raw)) throw Error(`年度 PALMS 的來賓人數無法辨識：${member}`);
    const count = Number(raw);
    if (!Number.isSafeInteger(count) || count > 1000 || counts.has(member)) throw Error(`年度 PALMS 的來賓資料異常：${member}`);
    counts.set(member, count);
  }
  if (counts.size < Math.ceil(rosterMembers.size * 0.8)) throw Error(`年度 PALMS 只辨識 ${counts.size}/${rosterMembers.size} 位會員，未更新續約來賓資料`);
  if (![...counts.values()].some((count) => count > 0)) throw Error("年度 PALMS 來賓總數為零，需先核對報表來源");
  return [...counts].map(([member, count]) => ({ member, count }));
}
