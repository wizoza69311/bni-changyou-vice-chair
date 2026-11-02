import assert from "node:assert/strict";
import test from "node:test";
import { currentMembersFromRows } from "./current-members.mjs";

test("only a verified current-member result can replace the site roster", () => {
  assert.deepEqual(currentMembersFromRows([
    { member: "丁 慶儒", status: "現任" },
    { member: "王 世品", status: "現任" },
    { member: "丁慶儒", status: "現任" },
  ]), ["丁慶儒", "王世品"]);
  assert.throws(() => currentMembersFromRows([
    { member: "丁 慶儒", status: "現任" },
    { member: "許 國祥", status: "逾期" },
  ]), /許國祥.*逾期/);
  assert.throws(() => currentMembersFromRows([{ member: "", status: "現任" }]), /無姓名/);
});
