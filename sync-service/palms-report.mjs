const normalizeName = (value) => String(value || "").replace(/\s+/g, "").trim();
const integer = (value) => {
  const number = Number(String(value ?? "").replace(/[,\s]/g, ""));
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : 0;
};

export function parseChapterSummary(meetingDate, tableRows, rosterMembers, headers = []) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(meetingDate) || !Array.isArray(tableRows)) {
    throw Error("分會 PALMS 週報資料格式異常");
  }
  const oneToOneIndex = headers.findIndex(value => /^(一對一(?:會談)?|121|1to1|one[- ]?to[- ]?ones?)$/i.test(String(value).replace(/\s+/g, "")));
  const members = tableRows.filter((row) => {
    const name = normalizeName(`${row[0] || ""}${row[1] || ""}`);
    return name && !["BNI", "來賓", "合計", "總計"].includes(name);
  }).map((row) => {
    const rawName = normalizeName(`${row[0] || ""}${row[1] || ""}`);
    const member = rosterMembers.get(rawName) || [...rosterMembers.entries()]
      .filter(([key]) => rawName.startsWith(key))
      .sort((a, b) => b[0].length - a[0].length)[0]?.[1] || rawName;
    return {
      member,
      inside: integer(row[3]),
      outside: integer(row[4]),
      visitors: integer(row[7]),
      ...(oneToOneIndex >= 0 ? { oneToOne: integer(row[oneToOneIndex]) } : {}),
      transactionValue: integer(row[9]),
    };
  });
  if (members.length < 10) throw Error(`${meetingDate} 分會 PALMS 週報人數異常`);
  const totals = members.reduce((result, row) => ({
    inside: result.inside + row.inside,
    outside: result.outside + row.outside,
    visitors: result.visitors + row.visitors,
    transactionValue: result.transactionValue + row.transactionValue,
  }), { inside: 0, outside: 0, visitors: 0, transactionValue: 0 });
  if (oneToOneIndex >= 0) totals.oneToOne = members.reduce((sum, row) => sum + row.oneToOne, 0);
  return { meetingDate, totals, members, source: "BNI 分會 PALMS" };
}

export function parseChapterAudit(tableRows, expectedTotal) {
  if (!Array.isArray(tableRows) || !tableRows.length) throw Error("審計報告沒有明細");
  const transactions = tableRows.filter((row) => String(row[2] || "").trim() === "交易價值")
    .map((row) => ({
      member: normalizeName(row[1] || row[0]),
      amount: integer(row[4]),
      otherChapter: String(row[6] || "").trim(),
    })).filter((row) => row.member && row.amount > 0);
  if (!transactions.length && expectedTotal > 0) throw Error("審計報告缺少交易明細");
  const total = transactions.reduce((sum, row) => sum + row.amount, 0);
  const own = transactions.filter((row) => !row.otherChapter);
  const ownTotal = own.reduce((sum, row) => sum + row.amount, 0);
  const seen = new Map();
  const ownTransactions = own.map((row) => {
    const signature = `${row.member}|${row.amount}`;
    const occurrence = (seen.get(signature) || 0) + 1;
    seen.set(signature, occurrence);
    return { id: `${signature}|${occurrence}`, member: row.member, amount: row.amount };
  }).sort((a, b) => b.amount - a.amount || a.member.localeCompare(b.member, "zh-Hant"));
  return {
    status: total === expectedTotal ? "verified" : "mismatch",
    total,
    ownTotal,
    otherChapterTotal: total - ownTotal,
    transactionCount: transactions.length,
    ownTransactions,
  };
}
