# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## Company rules workflow decisions

- Keep Company Rules as one unified register. Policy-engine-owned rows may appear in the same table but remain locked and must be edited in Policy Engines.
- Applying a rule is a three-step flow: rule details and activation, mapped policy-engine code selection or inline code creation, then review.
- Sub-category is always a controlled dropdown derived from the available Atlas modules; do not return to free-text sub-categories.
- Rule parameters are governed through reusable policy-engine codes. Policy Engines must support creating codes, and newly created codes must become immediately available in the Company Rules wizard.
- “Enable rule” belongs with rule metadata in Step 1. It is a deliberate toggle, not a validation blocker.

## Payroll requirements synchronization

- Treat the Phase 2 BRD Audit Summary and Annex B Employee Masterfile Payroll Data Tables as the source catalogue for this prototype. Apply requirements that belong to the modules present in Atlas; do not recreate deleted requirements or unrelated infrastructure work as UI.
- Reuse `src/requirementsCatalog.js` for Company Rules and policy-code category/sub-category labels so Company Rules, Policy Engines, services, and employee payroll records do not drift.
- Annex B payroll records must retain their effective dates, payment frequency and period fields, holds, remarks, upload support, derived rates, YTD/previous-employer context, loan balances, banking uniqueness, and 100% cost-allocation validation where applicable.

## Module wiring rules

- Every screen uses the shared `BrandRail` and `Topbar` from `src/AppChrome.jsx`. Do not re-create a private rail or top bar in a module — the copies in Employee Masterfile and Reference Tables were navigational dead ends.
- `OperationalWorkspace` is a dispatcher with no hooks of its own. Register a workspace in `delegatedWorkspaces`, or give it an entry in `operationalDefinitions` for the generic record table — never both, and never add hooks above the dispatch.
- One workspace key resolves to exactly one component regardless of entry point (Core, Company sidebar, Settings hub, Payroll hub). Do not special-case a key in `App.jsx`.
- Company-scoped modules read `readActiveCompanyId()` / `readActiveCompany()` from `companyRepository`, never `readCompanies()[0]`. The top-bar switcher is the only place the active company changes.
- File downloads use `downloadFile` from `src/fileDownload.js`.
- Dropdowns that Annex B specifies as reference-backed bind to `referenceValues(tableId)` from `ReferenceTables` (or `chargeCodeNames` for cost allocation). Field `options` may be a function, and a stored value stays selectable even if its reference row is retired.
- Modules publish domain events through `publishNotificationEvent` in `src/notificationServices.js` after their own record is persisted; the Notifications workspace resolves them against the configured rules.
- The Audit Log workspace renders the real `readAuditEvents` store. Any module that changes governed data should call `appendAuditEvent`.

## No duplicated lists or hand-written counts

- Never write a count into JSX. Every badge, tally and "Step N of M" reads `.length` from the list it describes.
- A list that more than one module needs lives in one exported constant: `policyEngines` (PolicyComputations), `serviceCatalog` (companyRepository), `chargeCodeTypes` (chargeCodeService), `defaultNotificationRules` (notificationServices), `ruleWizardSteps` / `onboardingSteps`. Adding an entry must not require editing a second file.
- Counted nouns go through `plural()` in `src/textFormat.js` so a single row never reads "1 tickets".
- Two registers must not share a label. The Reference Table module owns "reference tables"; the REF-0xx register inside Computational Basis is "formula reference sources". The code library's engine-family tally is "Engine families", distinct from the four interactive "Policy engines".
- Several policy codes may govern one engine — a company has one Take-Home Pay policy, but THP-001 owns its protected minimum and THP-002 its caps. Give each such code an entry in `codeParameterScopes` so it advertises only the parameters it governs; codes on one engine must never look like duplicates of each other.
- A scope must be provable on screen: opening a code from the library highlights exactly the fields it governs, and the highlighted count must equal the library's Parameters column and the number of fields the Company Rules wizard asks for. `scopeKey` on `FieldLabel`/`NumberField`/`Toggle`/`SourceMultiSelect` carries the policy key — do not reuse `helpKey`, which is a help-text id and does not always match (`protectedBase`→`base`, `conflictPriority`→`priorityChoice`, `serviceRounding`→`rounding`, `taxationRule`→`taxExemption`).
- A control that owns several parameters proves them individually: `CheckList` takes a `keys` map from label to parameter key, and a wrapper can call `useFieldScope` directly. One checkbox per governed parameter, never one field standing in for six.
- The scope split between sibling codes is a product decision, not something the BRD or Annexes specify. It is currently inferred from the code names and the engine rows in `getEngineRows`; confirm it with the business owner before treating it as final.

## Policy engine applicability and transactions

- A policy engine is never assumed to be company-wide. Every engine renders `ApplicabilityPanel` and stores an `assignment` (`All Employees` / `Employee Group` / `Department` / `Specific Employees`), and the employee picker carries employee code, name, group and department.
- `employeeDirectory` in `src/PolicyApplicability.jsx` is the single roster. The specific-employee picker, the retirement transaction and the final-pay transaction all read it — do not add a second sample roster to an engine.
- Configuration and transaction stay separate. The engine defines the method, parameters, applicability and hierarchy; the simulator's transaction panel selects employees, chooses the transaction method (engine calculation, manual, upload, override) and triggers the computation. A manual or overridden amount stays visibly marked against the engine-calculated value.
- A bulk transaction evaluates each employee individually against eligibility, taxability and their own masterfile data. Never present one shared result for a selected batch.

## Deferred and staggered deductions

- Carrying an outstanding amount forward and staggering its recovery are two different decisions. `recoveryPlan` in `src/DeferredDeductions.jsx` only staggers above the configured `staggerThreshold`; below it the balance is recovered in full on the next payroll.
- A deferred item keeps both its original due date and its revised due date, plus approval status, employee authorization status and an audit trail. Outstanding amounts never disappear.
- The recovery panel covers everything still owed — items deferred this cutoff *and* balances carried in from an earlier one.

## Retirement and final pay

- Retirement's statutory basis stays on monthly basic pay. Only the company plan may widen the salary basis, and it does so by selecting earnings that Earning Configuration already owns — either every earning classified `Retirement` or an explicit selection. Retirement never redefines an earning.
- Rehires and breaks in service are a configured rule (`serviceHistoryRule`), not an assumption. Prior service and the break itself are credited only when the rule says so.
- Reason for Leaving drives computation, not description. `separationRules` maps each reason to its formula, months-per-year, minimum, service rounding and tax treatment; Final Pay resolves each employee's own row, so one bulk run can apply several formulas.
- Final Pay does not inherit the regular payroll deduction hierarchy unless `hierarchySource` says so, and statutory contributions can be settled in configuration or deferred to the payroll transaction because an earlier payroll may already have collected the month.
- Final Pay consumes the Retirement engine's result for the same employee rather than taking a re-entered amount. Leave conversion eligibility and caps stay in Leave Configuration.

## Payroll calculation rules

- Statutory rates, brackets and ceilings are versioned data, never constants in calculation code. Read them through `src/statutoryService.js` (`withholdingTax`, `deMinimisSplit`, `effectiveVersion`); the bonus non-taxable ceiling comes from the `bonus-ceilings` reference table.
- A statutory version that a payroll transaction has consumed is locked. Changes roll forward as a new version via "Create new version" so historical runs stay reproducible; `versionUsage` decides this and counts Draft/Calculated runs as used.
- Gross-up iterates against the effective withholding table. `net / (1 - rate)` is only valid for the flat/final-tax method — do not use it as the general formula.
- Row-level derivations live in `normalizePayrollRecord`; anything that depends on sibling rows or YTD utilisation (bonus ceiling, De Minimis ceiling) belongs in `recalculateSection`, which runs on save, on import and on load.
- A scheduled loan or deduction collection never exceeds the remaining balance, and a deduction terminates at a zero balance or a passed end date. Employee dates may be MM/DD/YYYY or ISO — compare them through `toIsoDate`.
