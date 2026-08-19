/**
 * Who may reach each module, and where each actor lands.
 *
 * This is the single authority for shell-level access. It is derived from the
 * "Actor access" column of the Phase 2 BRD, which uses exactly four values:
 *
 *   "All Users"               – sign-on, design shell, self-learning, audit trail
 *   "Employee"                – Employee Self Inquiry and the certificate requests
 *   "P&A Admin, Client Admin" – every payroll, settings, masterfile and reference module
 *   "P&A Admin"               – the Billing Transaction module and its two setup rows
 *
 * The consequence worth stating plainly: **the Payroll, Core and Settings
 * modules are administrator surfaces.** Not one of the 324 Payroll rows grants
 * an employee access to a payroll register. What an employee is granted —
 * payslip, loan, statutory contribution and payroll history inquiry, plus the
 * COE/BIR-2316/2307 certificate requests — is served by the HRM module, which
 * is why HRM and Timekeeping are the only modules every actor can open.
 *
 * `accessFor` in `hrmData.js` still decides what a user sees *inside* HRM and
 * Timekeeping (own records vs team vs company). This module decides only which
 * doors exist; the two must not be collapsed into one another.
 */

/** Canonical actor ids, in privilege order. */
export const ACTORS = ['employee', 'approver', 'client_admin', 'pa_admin'];

const ADMINS = ['client_admin', 'pa_admin'];
const EVERY_ACTOR = ['employee', 'approver', ...ADMINS];

/**
 * Accepts the legacy role ids that earlier builds persisted so a saved
 * localStorage value from an older session still resolves to a real actor.
 */
export function normalizeRole(saved) {
  if (saved === 'admin') return 'pa_admin';
  if (saved === 'client') return 'client_admin';
  if (saved && ACTORS.includes(saved)) return saved;
  return 'client_admin';
}

/** Top-level modules keyed by the screen that opens them. */
export const MODULE_ACCESS = {
  hrm: EVERY_ACTOR,
  timekeeping: EVERY_ACTOR,
  core: ADMINS,
  payroll: ADMINS,
  settings: ADMINS,
};

export function canAccessModule(role, moduleKey) {
  const actor = normalizeRole(role);
  return (MODULE_ACCESS[moduleKey] || ADMINS).includes(actor);
}

/**
 * Hub tiles the BRD restricts more tightly than their module.
 *
 * Billing Transaction is the only register whose every row reads "P&A Admin"
 * rather than "P&A Admin, Client Admin" — P&A bills the client, so the client
 * does not see its own billing register.
 */
export const PA_ADMIN_ONLY_TILES = ['Billing'];

export function canAccessTile(role, label) {
  if (PA_ADMIN_ONLY_TILES.includes(label)) return normalizeRole(role) === 'pa_admin';
  return true;
}

/** Filters a hub's card list to the tiles this actor may open. */
export const visibleTiles = (role, cards) => cards.filter(card => canAccessTile(role, card.label));

/**
 * The screen an actor opens the application on, and the screen they are
 * returned to when they lose access to where they were standing. An employee
 * or approver has no Core, so their default initial view is the HRM portal.
 */
export function landingScreen(role) {
  return canAccessModule(role, 'core') ? 'core' : 'hrm';
}

/**
 * The module a screen id belongs to, so a route can be checked against
 * `MODULE_ACCESS` without every caller re-deriving the prefix rules.
 */
export function moduleForScreen(screen) {
  if (screen === 'hrm') return 'hrm';
  if (screen === 'timekeeping') return 'timekeeping';
  if (screen === 'payroll' || screen.startsWith('payroll-workspace:') || screen === 'statutory-payroll' || screen === 'tax-payroll') return 'payroll';
  if (screen === 'settings' || screen.startsWith('settings-workspace:') || screen === 'statutory-settings' || screen === 'tax-settings' || screen === 'reference-settings' || screen === 'settings-computation-admin') return 'settings';
  // Core and everything reached from it — company configuration, the employee
  // masterfile, reference tables, ticketing — is one administrator surface.
  return 'core';
}

/** True when this actor may stand on this screen. */
export function canAccessScreen(role, screen) {
  return canAccessModule(role, moduleForScreen(screen));
}

/**
 * HRM's and Timekeeping's "Reports" landing tile is a separate, bulk/export
 * reporting surface from the per-employee self-inquiry (DTR Summary, leave
 * ledger) every actor keeps elsewhere in each module. The HRM Reports Module
 * and TK Reports Module BRD rows are 100% "P&A Admin, Client Admin" — 27 + 22
 * rows, zero exceptions — so an Employee or Approver must not reach it even
 * though every other tile in both landings is open to "both" experiences.
 *
 * Takes the HRM/Timekeeping `access` object (from `accessFor` in hrmData.js),
 * not a bare role id, because that object already carries the company-view
 * flag both portals use for every other admin-only surface inside them.
 */
export const canViewReportsTile = access => Boolean(access?.canViewCompanyData);
