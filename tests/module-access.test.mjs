import assert from "node:assert/strict";
import test from "node:test";
import {
  ACTORS,
  MODULE_ACCESS,
  canAccessModule,
  canAccessScreen,
  canAccessTile,
  landingScreen,
  moduleForScreen,
  normalizeRole,
  visibleTiles,
} from "../src/moduleAccess.js";

/**
 * These lock in the Phase 2 BRD "Actor access" column. Every payroll, settings,
 * masterfile and reference row reads "P&A Admin, Client Admin"; the only rows
 * granted to an employee are Self Inquiry and the certificate requests, both
 * served by HRM.
 */

test("payroll, core and settings are administrator modules", () => {
  for (const moduleKey of ["core", "payroll", "settings"]) {
    assert.equal(canAccessModule("employee", moduleKey), false, `employee must not reach ${moduleKey}`);
    assert.equal(canAccessModule("approver", moduleKey), false, `approver must not reach ${moduleKey}`);
    assert.equal(canAccessModule("client_admin", moduleKey), true);
    assert.equal(canAccessModule("pa_admin", moduleKey), true);
  }
});

test("HRM and Timekeeping are open to every actor", () => {
  for (const actor of ACTORS) {
    assert.equal(canAccessModule(actor, "hrm"), true, `${actor} needs HRM`);
    assert.equal(canAccessModule(actor, "timekeeping"), true, `${actor} needs Timekeeping`);
  }
});

test("an employee's own BRD rows are served by a module they can open", () => {
  // Payslip / loan / contribution / payroll-history inquiry and the certificate
  // requests are the employee's 15 rows, and they all live in HRM.
  assert.equal(canAccessModule("employee", "hrm"), true);
  assert.equal(canAccessModule("employee", "payroll"), false);
});

test("Billing is reserved for P&A even inside Payroll", () => {
  assert.equal(canAccessTile("pa_admin", "Billing"), true);
  assert.equal(canAccessTile("client_admin", "Billing"), false);
  const cards = [{ label: "Journal Entry" }, { label: "Billing" }, { label: "Reports" }];
  assert.deepEqual(visibleTiles("client_admin", cards).map(c => c.label), ["Journal Entry", "Reports"]);
  assert.deepEqual(visibleTiles("pa_admin", cards).map(c => c.label), ["Journal Entry", "Billing", "Reports"]);
});

test("a tile with no special rule follows its module", () => {
  for (const actor of ACTORS) assert.equal(canAccessTile(actor, "Journal Entry"), true);
});

test("each actor lands on a screen it can actually open", () => {
  for (const actor of ACTORS) {
    const landing = landingScreen(actor);
    assert.equal(canAccessScreen(actor, landing), true, `${actor} lands somewhere it cannot open`);
  }
  assert.equal(landingScreen("employee"), "hrm");
  assert.equal(landingScreen("approver"), "hrm");
  assert.equal(landingScreen("client_admin"), "core");
  assert.equal(landingScreen("pa_admin"), "core");
});

test("every payroll and settings route resolves to its own module", () => {
  const payroll = ["payroll", "payroll-workspace:earnings", "payroll-workspace:billing", "statutory-payroll", "tax-payroll"];
  for (const screen of payroll) assert.equal(moduleForScreen(screen), "payroll", screen);

  const settings = ["settings", "settings-workspace:accessRights", "statutory-settings", "tax-settings", "reference-settings", "settings-computation-admin"];
  for (const screen of settings) assert.equal(moduleForScreen(screen), "settings", screen);

  assert.equal(moduleForScreen("hrm"), "hrm");
  assert.equal(moduleForScreen("timekeeping"), "timekeeping");
  // Core and everything reached from it is one administrator surface.
  for (const screen of ["core", "company", "employee", "reference", "ticketing"]) {
    assert.equal(moduleForScreen(screen), "core", screen);
  }
});

test("a deep payroll route is closed to an employee, not just its hub", () => {
  // Losing the tile is not enough — the route itself must refuse to render, or
  // switching role while standing on a register would leave it on screen.
  for (const screen of ["payroll-workspace:earnings", "tax-payroll", "settings-workspace:security", "employee"]) {
    assert.equal(canAccessScreen("employee", screen), false, screen);
    assert.equal(canAccessScreen("approver", screen), false, screen);
    assert.equal(canAccessScreen("client_admin", screen), true, screen);
  }
});

test("legacy persisted role ids still resolve to a real actor", () => {
  assert.equal(normalizeRole("admin"), "pa_admin");
  assert.equal(normalizeRole("client"), "client_admin");
  assert.equal(normalizeRole(null), "client_admin");
  assert.equal(normalizeRole("nonsense"), "client_admin");
  for (const actor of ACTORS) assert.equal(normalizeRole(actor), actor);
});

test("an unknown module is closed by default rather than open", () => {
  assert.equal(canAccessModule("employee", "some-future-module"), false);
  assert.equal(canAccessModule("pa_admin", "some-future-module"), true);
  assert.ok(!Object.keys(MODULE_ACCESS).includes("some-future-module"));
});
