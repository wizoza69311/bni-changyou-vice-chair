import test from "node:test";
import assert from "node:assert/strict";
import { parseYearlyVisitors } from "../sync-service/yearly-visitors.mjs";

const xml = (data) => `<Workbook><Worksheet><Table>${data.map(row => `<Row>${row.map(value => `<Cell><Data>${value}</Data></Cell>`).join("")}</Row>`).join("")}</Table></Worksheet></Workbook>`;

test("年度 PALMS 依會員計算來賓人次，保留明確的零", () => {
  const roster = new Map([["王大明", "王大明"], ["林小華", "林小華"]]);
  const report = xml([["會員姓名", "來賓"], ["王 大明", "2"], ["林小華", "0"]]);
  assert.deepEqual(parseYearlyVisitors(report, roster), [{ member: "王大明", count: 2 }, { member: "林小華", count: 0 }]);
});

test("欄位或會員覆蓋不足時拒絕推斷無邀約", () => {
  const roster = new Map([["王大明", "王大明"], ["林小華", "林小華"]]);
  assert.throws(() => parseYearlyVisitors(xml([["會員姓名", "其他"], ["王大明", "0"]]), roster));
  assert.throws(() => parseYearlyVisitors(xml([["會員姓名", "來賓"], ["王大明", "0"]]), roster));
});
