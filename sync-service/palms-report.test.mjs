import test from "node:test";
import assert from "node:assert/strict";
import { parseChapterAudit, parseChapterSummary } from "./palms-report.mjs";

test("weekly PALMS summary adds inside and outside referrals without aggregate placeholders", () => {
  const report = parseChapterSummary("2026-10-22", [
    ["王", "小明", "P", "6", "1", "0", "0", "1", "2", "150,000", "0"],
    ...Array.from({ length: 9 }, (_, index) => ["測試", `${index}`, "P", "0", "0", "0", "0", "0", "0", "0", "0"]),
    ["來賓", "", "P", "0", "0", "0", "0", "0", "0", "0", "0"],
  ], new Map([["王小明", "王小明"]]));
  assert.equal(report.totals.inside + report.totals.outside, 7);
  assert.equal(report.totals.visitors, 1);
  assert.equal(report.totals.transactionValue, 150000);
  assert.equal(report.members.some((row) => row.member === "來賓"), false);
});

test("audit excludes transactions explicitly marked as another chapter", () => {
  const audit = parseChapterAudit([
    ["", "王 小明", "交易價值", "", "150000.00", "", ""],
    ["", "王 小明", "交易價值", "", "500000.00", "", "別的分會"],
    ["王 小明", "李 小美", "引薦", "一級(內部)", "", "", ""],
  ], 650000);
  assert.equal(audit.status, "verified");
  assert.equal(audit.ownTotal, 150000);
  assert.equal(audit.otherChapterTotal, 500000);
  assert.deepEqual(audit.ownTransactions.map(({member, amount}) => [member, amount]), [["王小明", 150000]]);
});

test("audit mismatch is explicit instead of claiming verification", () => {
  assert.equal(parseChapterAudit([["", "王 小明", "交易價值", "", "500", "", ""]], 600).status, "mismatch");
});

 test("121 follows its header, sums member counts and distinguishes missing data", () => {
 const rows=Array.from({length:10},(_,i)=>["會員",String(i),"P",0,0,0,0,0,3,0,9]);
 const headers=["姓","名","出席","內","外","收內","收外","來賓","一對一","交易價值","教育"];
 const report=parseChapterSummary("2026-10-29",rows,new Map(),headers);
 assert.equal(report.totals.oneToOne,30);
 assert.equal(report.members[0].oneToOne,3);
 assert.equal(parseChapterSummary("2026-10-29",rows,new Map()).totals.oneToOne,undefined);
});
