import assert from "node:assert/strict";
import test from "node:test";

/**
 * statutoryService.js reads the bare `localStorage` global (the browser has
 * one; Node does not by default), so these tests install a minimal in-memory
 * polyfill before importing the module under test.
 */
function installLocalStorage() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: key => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: key => store.delete(key),
    clear: () => store.clear(),
  };
  return globalThis.localStorage;
}

const localStorage = installLocalStorage();
const { STATUTORY_STORAGE_KEY, effectiveVersion, readPayrollTransactions, versionUsage } = await import("../src/statutoryService.js");

function seedStatutoryTable() {
  const data = {
    sss: [
      { id: "sss-2026-1", code: "SSS-2026-001", effectiveDate: "2026-01-01", status: "Active", rows: [] },
    ],
  };
  localStorage.setItem(STATUTORY_STORAGE_KEY, JSON.stringify(data));
  return data;
}

test.beforeEach(() => localStorage.clear());

test("readPayrollTransactions reads the register's current versioned key", () => {
  // The transactions register is versioned in OperationalWorkspaces.jsx
  // (`atlas-operational-transactions-v${n}`) and bumping that version does not
  // migrate old rows forward under the new key — this locked in the bug where
  // readPayrollTransactions only ever looked at the stale v1 key and silently
  // saw zero transactions the moment the register moved to v2.
  localStorage.setItem("atlas-operational-transactions-v2", JSON.stringify([{ code: "PAY-2026-08-2", status: "Posted", payoutDate: "2026-08-31" }]));
  const rows = readPayrollTransactions();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].code, "PAY-2026-08-2");
});

test("readPayrollTransactions falls back to v1 when v2 has no rows yet", () => {
  localStorage.setItem("atlas-operational-transactions-v1", JSON.stringify([{ code: "PAY-2025-12-2", status: "Posted", payoutDate: "2025-12-31" }]));
  const rows = readPayrollTransactions();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].code, "PAY-2025-12-2");
});

test("a statutory version consumed by a posted payroll run reports as used", () => {
  const data = seedStatutoryTable();
  localStorage.setItem("atlas-operational-transactions-v2", JSON.stringify([
    { code: "PAY-2026-08-2", status: "Posted", payoutDate: "2026-08-31" },
  ]));
  const version = effectiveVersion("sss", "2026-08-31", data);
  assert.equal(version.code, "SSS-2026-001");
  const usage = versionUsage("sss", version, data);
  // This is the exact scenario that regressed: a real posted transaction
  // existed, yet the lock silently reported "not yet used" because the reader
  // was looking at an empty, stale storage key.
  assert.equal(usage.used, true, "a version a posted payroll run consumed must lock");
  assert.deepEqual(usage.transactions, ["PAY-2026-08-2 (Posted)"]);
});

test("a cancelled transaction does not lock the version it would have used", () => {
  const data = seedStatutoryTable();
  localStorage.setItem("atlas-operational-transactions-v2", JSON.stringify([
    { code: "PAY-2026-08-2", status: "Cancelled", payoutDate: "2026-08-31" },
  ]));
  const version = effectiveVersion("sss", "2026-08-31", data);
  const usage = versionUsage("sss", version, data);
  assert.equal(usage.used, false);
});

test("a version with no consuming transaction is not locked", () => {
  const data = seedStatutoryTable();
  localStorage.setItem("atlas-operational-transactions-v2", JSON.stringify([]));
  const version = effectiveVersion("sss", "2026-08-31", data);
  const usage = versionUsage("sss", version, data);
  assert.equal(usage.used, false);
  assert.deepEqual(usage.transactions, []);
});
