import assert from "node:assert/strict";
import test from "node:test";
import { accessFor, defaultHrmData } from "../src/hrmData.js";
import { canViewReportsTile } from "../src/moduleAccess.js";

/**
 * The HRM Reports Module and TK Reports Module BRD rows are 100%
 * "P&A Admin, Client Admin" (27 + 22 rows, zero exceptions) — the bulk/export
 * reporting suite is a distinct feature from the DTR Summary and leave-ledger
 * self-inquiry every actor keeps elsewhere in each module. Before this fix,
 * both landing grids' Reports tile had no gate at all (HRM: `experience:
 * 'both'`; Timekeeping: no `adminOnly` concept existed), so any Employee or
 * Approver could open Headcount, Medical Profiles, Compliance and CGI
 * Configuration reports despite the screen's own "ACTOR SCOPE: OWN" badge.
 */

const data = defaultHrmData("cmp-test");

test("Reports tile is closed to Employee and Approver", () => {
  for (const role of ["employee", "approver"]) {
    const access = accessFor(role, data, "EMP-1002");
    assert.equal(canViewReportsTile(access), false, `${role} must not see the Reports tile`);
  }
});

test("Reports tile stays open to Client Admin and P&A Admin", () => {
  for (const role of ["client_admin", "pa_admin"]) {
    const access = accessFor(role, data, "EMP-1001");
    assert.equal(canViewReportsTile(access), true, `${role} must keep the Reports tile`);
  }
});

test("canViewReportsTile follows canViewCompanyData, not canApproveTeamRequests", () => {
  // An approver can approve team requests but still has no company-wide view —
  // Reports must track the company-view flag, not the approval flag it sits
  // beside on the same landing grid (Manage Approvals uses the other one).
  const approver = accessFor("approver", data, "EMP-1001");
  assert.equal(approver.canApproveTeamRequests, true);
  assert.equal(canViewReportsTile(approver), false);
});

test("canViewReportsTile tolerates a missing access object", () => {
  assert.equal(canViewReportsTile(undefined), false);
  assert.equal(canViewReportsTile(null), false);
  assert.equal(canViewReportsTile({}), false);
});
