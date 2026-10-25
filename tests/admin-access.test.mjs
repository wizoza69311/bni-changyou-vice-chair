import assert from "node:assert/strict";
import test from "node:test";
import { isSiteAdmin, isSiteOwner } from "../worker/admin-access.ts";

const env = {
  ADMIN_EMAIL: "owner@example.com",
  ADMIN_EMAILS: "helper@example.com, second@example.com",
};
const requestFor = email => new Request("https://example.com/api/admin-status", {
  headers: email ? { "oai-authenticated-user-email": email } : {},
});

test("both configured accounts receive full system access", () => {
  assert.equal(isSiteOwner(requestFor("OWNER@EXAMPLE.COM"), env), true);
  assert.equal(isSiteAdmin(requestFor("OWNER@EXAMPLE.COM"), env), true);
  assert.equal(isSiteOwner(requestFor("helper@example.com"), env), true);
  assert.equal(isSiteAdmin(requestFor("helper@example.com"), env), true);
});

test("only allowlisted signed-in emails gain admin access", () => {
  assert.equal(isSiteAdmin(requestFor("HELPER@example.com"), env), true);
  assert.equal(isSiteAdmin(requestFor("second@example.com"), env), true);
  assert.equal(isSiteAdmin(requestFor("unknown@example.com"), env), false);
  assert.equal(isSiteAdmin(requestFor("helper@example.com.evil"), env), false);
  assert.equal(isSiteAdmin(requestFor(null), env), false);
});
