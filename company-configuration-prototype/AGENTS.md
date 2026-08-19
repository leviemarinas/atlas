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

## HRM module

- The HRM module is a real signed-in experience, not a demo. There is no persona chooser, no DEMO MODE banner and no demo session store. `signedInUser()` resolves the application's signed-in identity to an employee record, and the Client / P&A Admin `RoleSwitch` the top bar already owns is the only thing that changes the experience.
- What a user may see comes from `accessFor(role, data)`: the role gives the Administrator company-wide scope, and the reporting line — having direct reports — is what grants Manage Approvals. Do not reintroduce a binary admin flag.
- `P&A HRM Module Part 1.docx` is the visual source of truth. Its screenshots specify the dashboard, tile grid, balance cards, status tabs, filter drawer, approval log, and the exact confirmation wording; match them rather than inventing an equivalent.
- Every Employee Self-service application is one entry in `applicationDefinitions` (`src/hrmApplications.js`) describing its columns, filters, form fields and detail layout. `ApplicationWorkspace` renders whichever definition the route resolves to — never write a bespoke screen per application type.
- Shift Change and Assign Subordinates' Shift Schedule share a request type, so every filing records `definitionKey` in its details and each list filters on it. A definition marked `approverOnly` is hidden from employees; one marked `forSubordinate` files on behalf of the selected report and needs the on-behalf metadata the service enforces.
- Approvals route to the subject employee's own line manager (`assignedApproverFor`), so the queue a manager sees is the queue the workflow actually assigned. A hardcoded default approver silently blocks every decision.
- Dashboard widgets live in `DASHBOARD_WIDGETS`; the Manage widgets dialog and the widget grid both read it. The profile and time-clock widget is `locked` and always renders.
- Balances are derived, never stored twice: `remaining` is computed from accrued/used/forfeited on read, and onboarding progress is counted from the task list.

- Part 2 of the masterfile owns **Management & Approvals**, the approver's module. Its screens live in `managementScreens` (`src/hrmManagement.js`) and each entry's `kind` selects the component: `request` reuses a self-service definition's approval queue, `shift-assignment` is the assignment register, and the expense kinds are the reimbursement, cash advance and liquidation screens. Expense Management is the only group that splits its cards under Approvals / Management, via `column`.
- Shift Assignment (Assign Subordinate) is a register, not an approval workflow. It uses Upcoming / Active / Expired derived from the assignment's own dates (`shiftAssignmentStatus`), an Assign/Upload/Export toolbar, and View / Edit / **Delete** row actions — not Approve/Reject or Cancel Application.
- Expense records are line items: a reimbursement's total and a liquidation's balance are derived from their own records (`reimbursementTotal`, `liquidationSummary`), never stored alongside them.
- Expense approvals are decided in place on the transaction, not through `requestWorkflow` — they are not request-workflow rows. The masterfile's toast for every expense decision is "Status updated successfully!".
- Confirmation dialogs name their own buttons: cancelling an application offers Back / Cancel, deleting an assignment offers Cancel / Confirm.

- Part 3 of the masterfile adds Loan Management: Company Loan Approval/Management and Government Loan Approval/Management, registered in `managementScreens`. A company loan is filed by the employee with its repayment schedule (payroll cutoff, deduction amount, payment mode, frequency); interest is entered by the approver at decision time (`interestRate` → `interestAmount` → `totalLoan`), so a pending loan carries no interest or total. A government loan is *encoded* by the admin from the agency's own records — its interest, dates and totals are already known when entered, so the Approve modal for a government loan carries no interest field, only remarks. Company Loan Management uses 'Apply'; Government Loan Management uses 'Encode' — do not swap them.
- Loan Management screens carry a 'View Personal Records' toggle on the Management (not Approval) view, letting the signed-in user filter the roster down to their own filings. It is a real checkbox (`.hrm-toggle`); note that React only fires `onChange` for a checkbox on a native 'click' event, not 'change' — dispatch `element.click()` when driving it programmatically.

- Part 4 of the masterfile adds **Employee Requests Management** within Management & Approvals (`employee-requests-management` group). Its landing page splits into two columns via `column`:
  - **Approvals**: *Employee Resignation Approval* (`resignation-approval`), *Certificate of Employment Request Approval* (`coe-approval`), *Employee Onboarding Documents* (`onboarding-documents-approval`).
  - **Management**: *Employee Resignation Management* (`resignation-management`), *Certificate of Employment Management* (`coe-management`).
- **Resignation Approval & Management**: Table supports multi-selection with a purple bulk action bar (`.hrm-bulk-bar`) rendering `"{N} items selected. Please select action."` with Bulk Approve and Bulk Reject modals. Single-row Approve & Reject modals capture `Reason for Separation (BIR Reporting)` from `BIR_SEPARATION_REASONS` ('Termination', 'Resignation', 'Retirement', 'End of Contract', 'Health/Medical Reasons', 'Redundancy/Retrenchment') plus Approver Remarks. View Resignation Request modal displays submitted files (`sample-proof-document.docx`) with click-to-preview launching the `DocumentViewerModal`.
- **Certificate of Employment (COE) Request Approval & Management**: Dynamic pending row actions based on attachment status: if no file attached, shows `View` and `Add COE`; once attached, shows `View`, `Edit COE`, `Approve`, `Reject`. `Add Certificate of Employment` supports `System-generated` (auto-filling employee name, code, job title, department, division, purpose, salary info) and `File Upload` (drag-and-drop dropzone). `Edit Certificate of Employment` provides file deletion/replacement. Approve and Reject modals display company/institution name and recipient address alongside approver remarks.

- Part 5 of the masterfile adds **Enhanced Employee Onboarding Documents** and **Employee Self-Inquiry**:
  - **Enhanced Employee Onboarding Documents (`onboarding-documents-approval`)**:
    - Two top sub-tabs: `Job Description` and `Employment Contracts`.
    - Status tabs: `All Documents`, `Pending`, `Approved`, `Rejected`.
    - Multi-select checkbox bar with bulk approve / reject.
    - `+ Add` Onboarding Document modal supporting `System Content` (Job Title, About The Company, Job Summary, Key Responsibilities) and `File Upload`.
    - Two-step decision workflows for `Approve Request`, `Reject Request`, and `Undo Approval` (Step 1: Remarks input → Step 2: Review/Confirmation card with document details, preview, and final decision).
    - Status changes trigger `"Status updated successfully!"` notifications; Undo Approval transitions approved documents back to `Pending`.
  - **Employee Self-Inquiry (`SelfInquiryWorkspace` in `src/HRMSelfInquiry.jsx`)**:
    - Dedicated left navigation sidebar inside Self-Inquiry with 3 distinct screens:
      1. **Loan Inquiry (`loan-inquiry`)**: Lists Government and Company loans with status; drills into **View Loan Details** screen with 3-row KPI header, full **Deduction Matrix** amortization table, and bottom repayment summary.
      2. **Leave Balances & Ledger (`leave-ledger`)**: Admin/Approver directory with a `View Personal Records` toggle; drills into **View Leave Balance** screen with employee banner and leave type matrix (Opening Balance, Approved Leave, Leave for Approval, Converted Leave, Forfeited Leave, and Balance as of Today). Simple employees navigate directly to their personal balance view.
      3. **Attendance Summary (`attendance-summary`)**: Features 3 sub-tabs (`Daily Time Records`, `Tardiness / Undertime`, `Worked Hours Per Day`), cut-off period selector, and 4 top KPI metric cards per tab. Supports Approver roster view with `View Personal Records` toggle, drilling into employee detailed attendance, tardiness, undertime, and worked hour logs.

- Part 6 of the masterfile adds **Benefits Suite** and **Employee Offboarding Suite**:
  - **Benefits Suite (`BenefitsWorkspace` in `src/HRMBenefits.jsx`)**:
    - Left navigation sidebar (`Salary Information`, `Employee Allowances`, `Employee Benefits`).
    - **Salary Information**: Master employee roster, search, filter drawer, and 2-step Custom Export wizard with section selector. Drills down into **Salary Information Detail Screen** with 8 sub-tabs (`Basic Pay`, `Earnings`, `13th Month Pay and Bonuses`, `Statutory Deductions`, `Company Deductions`, `Loans`, `HDMF Contribution`, `Variable Allowances`), each with dedicated data tables, filters, and export.
    - **Employee Benefits**: Dual experience: Employee personal view vs. Admin roster view (`Benefits Assigned` semicolon-separated string). Drills down into **Employee Benefit Details Screen** with 4 status tabs (`All`, `Upcoming`, `Active`, `Expired`).
    - **Employee Allowances**: Master catalog of monthly company allowances (Meal, Transportation, Mobile, Uniform, Medical) with tax classifications and recipient metrics.
  - **Employee Offboarding Suite (`OffboardingWorkspace` in `src/HRMOffboarding.jsx`)**:
    - Left navigation sidebar (`Employee Clearance & Checklist`, `Employee Final Quit Claim`).
    - **Employee Clearance & Checklist Hub**: 4 sub-module navigation cards:
      1. *Employee Clearance Application*: Status tabs (`All`, `Pending`, `For Completion`, `For Review`, `Approved`, `Rejected`), `+ Apply` modal, `View` modal, and `See Checklist` action drilling into **Clearance Checklist Screen** (with completion checklist items, `Upload` modal, `Print`).
      2. *Employee Clearance Approval*: Status tabs with status-driven actions (`Pending` -> `Assign` via `Setup Offboarding Checklist` modal with `+ Add Checklist Item`; `For Completion` -> `See Checklist`; `For Review` -> `Approve` & `Reject` modals with submitted file previews and remarks).
      3. *Employee Clearance Management*: Monitoring table across all clearance cases.
      4. *Offboarding Checklist Management*: Template management with `+ Add`, `Edit`, `Delete` item modals, and `Leave without saving?` confirmation guard.
    - **Employee Final Quit Claim**:
      - Management table across status tabs (`All`, `Pending`, `For Action`, `Accepted`, `Rejected`, `For Release`, `Released`), `+ Create` button, `Import` modal, `Export`.
      - **Create Quit Claim Screen**: Document Title, Author, Submission Type (`File Upload` vs `Manual Input` rich editor) + `Recipient Information` modal (`Full Name`, `Email`, `Birthday`, `Acknowledgement Notice`).
      - Action workflows: `Generate Quit Claim` / `Edit Quit Claim`, `Mark for release` modal, and `Release Final Pay` (transitions status to `Released` and finalClaimStatus to `Completed`).

## HRM transaction posting

- A self-service filing and the register an administrator monitors are one transaction seen from two ends. `src/hrmPosting.js` is the only place that joins them: `syncRequestIntoRegisters` projects a request into `companyLoans`, `governmentLoans`, `cashAdvances`, `liquidations`, `reimbursements`, `resignations` or `coeRequests`. Never let a module write a register row for a request directly.
- Every posting is keyed on `sourceRequestId`, so posting the same request twice updates the row it already created. That is what makes it safe to call on submit, on edit and on every decision — the row appears as Pending when filed and tracks its own approval.
- Leave is deliberately *not* posted. `leaveLedgerFor` and `leaveBalancesFor(data, employeeId, requests)` derive the balance from the request store on read: approved days are spent, pending days are held back so a second application cannot claim credits the first one already committed, and a rejection restores them. There is no stored ledger — the old company-wide `leaveLedgers` table was one table shown for every employee and has been removed.
- An approval is not the end of a process, it is the start of the next one. Approving a resignation opens the clearance case (`openClearanceForSeparation`); approving a clearance drafts the quit claim (`openQuitClaimForClearance`); approving a loan writes the deduction schedule the employee then authorises (`openLoanScheduleForLoan` → `acknowledgeAuthorityToDeduct`). A decision that leaves nothing downstream is the defect these functions exist to prevent.
- A deduction schedule never collects more than the outstanding balance and stops once the balance clears, rather than listing periods that would collect nothing.
- Records are identified by `employeeId` / `employeeCode`, never `emp.id` / `emp.code`. The seed functions for salary information, benefits, clearance and quit claims previously used the latter and produced rows with `employeeId: undefined`, which silently defeated every per-employee filter.
- A new persisted store must be added to both `defaultHrmData` and `listFields` in `src/hrmData.js`, or it will not survive a reload.

## Payroll calculation rules

- Statutory rates, brackets and ceilings are versioned data, never constants in calculation code. Read them through `src/statutoryService.js` (`withholdingTax`, `deMinimisSplit`, `effectiveVersion`); the bonus non-taxable ceiling comes from the `bonus-ceilings` reference table.
- A statutory version that a payroll transaction has consumed is locked. Changes roll forward as a new version via "Create new version" so historical runs stay reproducible; `versionUsage` decides this and counts Draft/Calculated runs as used.
- Gross-up iterates against the effective withholding table. `net / (1 - rate)` is only valid for the flat/final-tax method — do not use it as the general formula.
- Row-level derivations live in `normalizePayrollRecord`; anything that depends on sibling rows or YTD utilisation (bonus ceiling, De Minimis ceiling) belongs in `recalculateSection`, which runs on save, on import and on load.
- A scheduled loan or deduction collection never exceeds the remaining balance, and a deduction terminates at a zero balance or a passed end date. Employee dates may be MM/DD/YYYY or ISO — compare them through `toIsoDate`.

## Timekeeping module

- `Timekeeping Module Part 1.docx` is the visual source of truth for this module. The rail's clock icon and the Core "Timekeeping" tile both open `TimekeepingPortal` (`src/TimekeepingPortal.jsx`), which renders the dashboard widgets, the gradient banner and the eleven-tile grid, then dispatches into `src/TimekeepingScreens.jsx`.
- Timekeeping and HRM share one roster, one signed-in identity and one Employee Masterfile — Part 1 shows the masterfile screens the HRM module already renders. The Timekeeping collections therefore live in the same company store (`readHrmData` / `updateHrmData`), and `accessFor` / `visibleEmployeeIds` decide scope exactly as they do in HRM.
- **`timeLogs` is the module's only transactional store.** Every KPI card, chart, year-to-date tab and summary table is derived from it on read (`attendanceKpis`, `tardinessKpis`, `teamAttendanceKpis`, `workHoursSummary`, `workHoursSeries`, `ytd*`, `absenceRows`, `tardinessRows`, `overtimeRows`, `otEarningRows`, `leaveBalanceRows`, `chargeCodeSummaryRows`). Do not add a stored aggregate — a corrected punch must never leave a stale total behind it.
- Punching in, punching out and the break clock write a real row for today via one `upsertTodayLog`; the displayed timer is recomputed from the start timestamp, never accumulated, so it cannot drift from the record it writes.
- One screen serves both experiences. `access.canApproveTeamRequests` is what adds the roster columns, the `View Personal Records` toggle and the employee drill-down — there is no second component per role. `scopeRows` is the single place that decides whose rows a screen shows (selected employee → that employee; personal toggle or no team → the signed-in user; otherwise the visible team).
- Approver-only surfaces that the employee view does not have at all: the `Team Attendance Logs` / `Missing Logs` tabs on Time In/Time Out, the `Time Report Approval` sub-view on Charge Codes (an employee sees only `Time Report Application` and `Charge Code Reports`), the `OT with Earning Logs` tab, and the employee multi-select on Work Hours Comparison.
- OT allowances are computed from the overtime hours and work location (`otEarningRows`), not entered: meal and transport unlock at 2 hours, allowance at 3, snack at 4, hazard pay only on a client site, and a remote day earns no home-location transport.
- Timekeeping tables are wide by design (the mocks scroll horizontally). `.tk-screen .hrm-table` sets `width: max-content; min-width: 100%` so headers stay readable inside `.hrm-table-scroll`; the scope is deliberate so HRM tables keep their current layout.
- The top bar's envelope icon is `onAnnouncements` and only renders where a module passes it. `BrandRail` takes `onTime` and `active="time"`; the clock button stays disabled where no handler is given.

## Reports

- A Timekeeping report is one entry in `timekeepingReportCatalog` (`src/timekeepingReports.js`) carrying its own `columns`, `build` and BRD id; `TimekeepingReportsScreen` renders whichever entry the selector resolves to. Adding a report means adding a catalog entry — never a bespoke screen, and never a second copy of the column list for the export, which writes from the same `columns`.
- Reports derive from `timeLogs` on read like every other Timekeeping surface. A report that stored its own totals would let a corrected punch leave a stale figure behind it; the "a corrected punch restates the report" test exists to keep that true.
- The grand total is a `<tfoot>` row via `DataTable`'s `footerRow`, so it pins below every page and stays out of the count the pager reports. `reportTotals` sums a peso column from its `*Value` companion (never by parsing formatted text), sums a wholly numeric column, and leaves identity and text columns blank.
- Unit reports price their units from the employee's own salary record through `rateForEmployee`, not from a constant — absences at the daily rate, tardiness and undertime at the per-minute rate, overtime at the hourly rate times the `OT_MULTIPLIERS` premium for its type.
- Timekeeping owns the timekeeping-domain reports and HRM's `reportCatalog` owns the HRM-domain ones. Overtime summary (HT193) lives in the Timekeeping catalog; do not add a second copy to HRM, because two registers must not share a label.
- Dates that resolve a period window are built from local calendar parts, never `toISOString()`. `toISOString` converts local midnight to UTC and returns the previous day everywhere east of Greenwich, which put the monthly window on 30 Apr – 30 May instead of 1 – 31 May.

## Shift schedule

- `SHIFT_SCHEDULE_CATALOG` in `src/hrmData.js` is the one list of schedules a company may assign, and it carries `shiftType` and `timezone` because HT259 names those options (regular, compressed work week, night, 24-hour, mother-country and other-country shifts). A screen must not infer the type from the time range.
- Shift Schedule Tracking (`src/TimekeepingShiftSchedule.jsx`) is a monitor, not a workflow — Assign Subordinate in HRM still owns creating and editing an assignment, so the only row action here is View. It reads the same `shiftAssignments` store and the same `shiftAssignmentStatus` helper the assignment register uses, so the two screens can never disagree about a schedule.
- An assignment appears in a period when its own effectivity window overlaps it, so an open-ended assignment stays visible in every future period.

## Leave conversion

- Converted leave credits are cashed out, so they leave the balance exactly as used and forfeited days do. `leaveBalancesFor` subtracts `converted` from `remaining`, and a conversion records its own `conversionDate` — HT192 reports on both and the balance must agree with that report.

## Payroll module

- `P&A Payroll.docx` is the visual source of truth for this module. Its Payroll grid is Earning Management, Deduction Management, Bonus Management, Paycode Management, Remittance Monitoring, Payroll Processing, Payslip Designer, Journal Entry, Reports, Statutory Table, Tax Tables — in that order. Billing and Audit Log follow it because the BRD files a Billing Transaction Module and an Audit Log Module under Payroll; the per-feature Figma frames simply predate them.
- **Statutory Table and Tax Tables are two tiles over one store, not two registers.** `agencyGroups` in `src/StatutoryTables.jsx` scopes the same component: `statutory` covers SSS / PhilHealth / Pag-IBIG / De Minimis, `tax` covers Annual / Compensation / Expanded / Final. The `tax` agency key is unchanged, so `withholdingTax()` keeps reading the table it always read — never give tax a second home.
- A statutory column renders as pesos only when its agency declares it numeric. `fieldType` reads the declared type off the agency's `fields`; the old hard-coded list of text keys made every new text column (ATC code, nature of the income payment) print as `₱ NaN`.
- Overtime has exactly one register. The `overtime` service module already owns overtime codes, day-type rates, work days per year and attendance conditions, so the mock's "Overtime Rate Management" is that module renamed — not a second one beside it.
- A register declares `statusTabs` and `RecordWorkspace` renders the filter strip; the tab counts read `.length` off the rows they describe. Earning is All/Active/Inactive/Expired, Bonus is All/Active/Scheduled/Processed/Completed, Remittance is All/Pending/Draft/Verified. Do not write a bespoke screen to get tabs.
- Earning, Deduction and Bonus bind their Employee field to `employeeDirectory` from `PolicyApplicability` like every other engine. The mock's sample names are placeholders — a seed row must name someone the roster actually contains, or the dropdown opens on a value it cannot offer.
- Remittance Monitoring records the filing, not just a receipt: who filed and who paid, transaction mode, statutory agency and type, the filing reference, the O.R. number and date. Changing that field set bumped its storage version, because v2 rows cannot satisfy it.
- One region, sector and municipality may have only one Active MWE rate — a superseded wage order goes Inactive rather than sitting beside its replacement.

### Core vs Payroll placement

- Reports is a Payroll register, not a Core one. `reportCatalog` in `src/EnhancedReports.jsx` is entirely payroll-domain (Payroll, Statutory, Remittance, Billing, Accounting, Audit) and the BRD files Reports/Report Generation under the Payroll module; HRM and Timekeeping each own their own catalog. Core no longer carries a tile for it — do not add one back.
- Pay Code is reachable from Settings *and* Payroll ("Paycode Management"). That is one workspace key with two entry points, which is allowed; two components behind one label is not.

## Actor access

- `src/moduleAccess.js` is the single authority for which doors exist. It is derived from the BRD's "Actor access" column, whose only four values are "All Users", "Employee", "P&A Admin, Client Admin" and "P&A Admin". Never re-derive an access rule from a role id at the call site.
- **Core, Payroll and Settings are administrator modules.** Not one of the 324 Phase 2 Payroll rows grants an employee a payroll register. HRM and Timekeeping are the only modules every actor opens.
- An employee's own BRD rows — payslip, loan, statutory contribution and payroll history inquiry, plus the COE / BIR 2316 / BIR 2307 certificate requests — are served by HRM. That is why gating Payroll costs an employee nothing.
- Billing is the one register the BRD reserves for P&A alone (`PA_ADMIN_ONLY_TILES`); the client does not see the register P&A bills them from. Everything else in Payroll and Settings is shared by both administrators.
- Statutory and tax tables are P&A-owned. The edit gate is `isPaAdmin`, never `isAdmin` — `isAdmin` also covers the Client Admin, whom the on-screen lock note tells to switch roles to publish a version.
- Access is enforced at three levels, and all three read `moduleAccess`: the rail hides a module's button, the hub filters its tiles, and `canAccessScreen` refuses the route. The route check is what stops a deep register from staying on screen when the actor changes beneath it.
- Changing actor lands on that actor's own default view (`landingScreen`) and resets the company sidebar. This is deliberate: the point of the switch is to see the application as that actor sees it from the start, and it guarantees nobody is left standing inside a screen they just lost.
- A surface that names modules must gate itself the same way. The HRM dashboard's scope strip goes through `visibleDashboardTabs`, because offering an employee a "Payroll" scope hands back the module the rail just took away.
- Any module every actor can open needs a route for actors with no Core to hop through. `HRMPortal` takes `onOpenTimekeeping` for exactly this reason — without it an employee had no way to reach Timekeeping at all.

## Navigation redundancy

- **The rail owns module navigation; no hub repeats it.** The people icon is the HRM button and the clock is Timekeeping — both were shipped `disabled` with an "unavailable" label, which is why Core grew an "HRM Portal" and a "Timekeeping" tile to compensate. The rail buttons now work, so those two Core tiles are gone. Do not add a tile that duplicates a rail destination.
- Every shell passes the full set of rail handlers (`onHrm`, `onTime`, `onPayroll`, `onSettings`). The masterfile and reference-table shells omitted `onTime`, which left a dead clock on those screens; a rail button with no handler renders disabled, so a missing prop reads to the user as "this module does not exist".
- `active` names the module the screen belongs to. The HRM portal reported `active="core"` while showing the HRM dashboard — the rail must highlight where the user actually is.
- **One workspace, one name.** Several registers were reachable from two surfaces under two labels, so one screen looked like two features: `accessRights` was "Access Right Configuration" in Core and "Access & Approvals" in Settings; `calendar` was "Payroll Calendar" and "Calendar Settings"; `faq` was "FAQ / Self-Learning" and "FAQ & Help"; `payCodes` was "Paycode Management" and "Pay Code". Each now carries the name its own screen renders. Multiple entry points remain deliberate — a register wearing two names is the defect.
- The HRM dashboard's scope strip (My Dashboard / Core / Timekeeping / HRM / Payroll) has been removed. It named the rail's own modules, its selection was never read, and no widget carries a module, so the Core and Payroll scopes could only ever have rendered an empty dashboard. If module dashboards are wanted later, give `DASHBOARD_WIDGETS` a module and make the strip filter — do not restore it as decoration.

## One employee roster

- `src/employeeRoster.js` is the **only** roster. Core's Employee Masterfile, HRM, Timekeeping and Payroll are four views of the same people, so they resolve to the same `employeeId`. `PolicyApplicability` re-exports it as `employeeDirectory`, `hrmData.seedEmployees()` projects the HRM/Timekeeping view from it, and `payrollEngine` reads its `payroll` / `government` / `banks` / `ytd` blocks as the 201 file. Two rosters is the defect this module exists to prevent — a payroll line could not read the punch record or the salary record of the employee it was paying.
- A payroll figure and an HRM figure must not come from two seeds. `seedSalaryInformation` derives every rate from the roster's `payroll` block, and `ytd` is computed from the employee's own rate against the statutory tables rather than typed in, so an opening balance can never contradict the rates the same file publishes.
- The roster carries the scenarios payroll has to handle rather than describing them: a daily-paid employee, a minimum-wage earner with ECOLA, a new hire inside the period, an employee with Pag-IBIG switched off, one separated inside the period and one on hold. Adding a payroll case means adding the attribute to a roster row, not a branch in the engine.

## Payroll computation

- `src/payrollEngine.js` is pure — it receives every dependency and returns a result — so the same computation runs on screen, in a test and behind an employee's payslip. `src/payrollRuns.js` is the browser adapter that gathers the dependencies; nothing in the engine reads storage.
- **Every amount is produced by a step, and every step names the Computational Basis code it applied.** Where the library publishes an evaluable expression the step evaluates *that* expression, so editing a formula in the library changes the payroll figure. A step that resolves by table lookup still records its code, its inputs, its detail and the module the values came from. This is what makes the "How it was computed" panel a report of the calculation rather than a description of it.
- `src/computationCatalog.js` holds the formula catalogue, the mapped field palette and the evaluator, because both `ComputationalBasis.jsx` and the engine need them; `ComputationalBasis.jsx` re-exports them since the rest of the prototype has always imported them from there.
- `src/statutorySchedules.js` holds the statutory and tax tables *and* their bracket arithmetic. `StatutoryTables.jsx` renders and versions those rows, `statutoryService.js` resolves the effective version out of the company store, the engine computes a contribution from the resolved version, and `hrmData` seeds the employee's contribution record from the same lookup. Nothing re-types a rate. (The file is `statutorySchedules.js`, not `statutoryTables.js`, because Windows would collide it with `StatutoryTables.jsx`.)
- A run resolves its tables by **payout date**, so a run dated last year computes on last year's schedule after this year's is published. Every published year stays Active for exactly that reason; `Inactive` means superseded, not "past".
- Timekeeping is read, never copied. The engine filters `timeLogs` for the run's own cut-off, so a corrected punch restates the line the next time the transaction is recalculated. A late or undertime day is a *rendered* day — the minutes are priced separately, and counting the day as unworked would collect twice. A daily- or hourly-paid employee is never deducted for absences, because unworked time is simply unpaid.
- A switch on the transaction can only ever turn a computation **off**. The employee's own 201 file still decides: `withSss` / `withPhilhealth` / `withHdmf` / `withWithholdingTax`, the exempt/non-exempt classifications, MWE status and the gross-up tag are all checked per employee, so ticking Compute Allowable Deduction never contributes for someone the masterfile excludes.
- A collection never exceeds its outstanding balance, a settled schedule stops collecting, and a loan whose authority to deduct is unacknowledged is held out of the run with an exception rather than collected silently.
- Annex C's "0 for all taxable" bonus threshold is a real choice. Read a configured threshold with a finite-number check, never `Number(x) || fallback` — that silently restored ₱90,000 and made the option do nothing.

## Policy engines in payroll

- The Take-Home Pay deferral algorithm lives once, in `payrollEngine.applyTakeHomePolicy`. `PolicyComputations.takeHomeResult` turns the simulator's scenario into that function's item list and presents its result as the engine's ledger, so the policy screen cannot describe a rule the payroll run does not apply.
- The engine reads the saved policies, the REF-011 deduction hierarchy and the reference tables the same way the policy screens do. Where a policy screen and a payroll line disagree, one of them is reading a second copy — find it.

## Payroll Processing

- `Payroll Processing.docx` is the visual source for the register, the Add Payroll wizard, the per-employee Edit payroll modal, the record-lock warning and the success/failure toasts. Annex C is the source for the *process*: prerequisites, transaction creation, timekeeping and HRM import, entry updates, review, approval, posting, locking and the sub-schedules. The mock is two steps; the work is not, so the wizard is four and the transaction has its own screen.
- `transactions` is a **delegated** workspace, not an `operationalDefinitions` entry. It had both, and the generic record table was a CRUD form standing in for a payroll run.
- The status machine is `payrollRuns.applyAction`, and `actionsFor` must only offer actions that machine will accept — there is a test that walks every status and asserts exactly that. Draft locks the figures so reports are stable; a reviewer can still edit, which is what Annex C's "can edit the transaction" means on those rows; a regular transaction can only be re-opened if it is the most recent one, while any special transaction can.
- Posted payroll is the source for everything downstream. Remittance Monitoring and Journal Entry bind their "Posted Payroll Payout" to the run store, `statutoryService.readPayrollTransactions` counts payroll runs so a consumed statutory version locks, and the Reports module's payroll-category reports build their rows from `payrollReportCatalog` against posted runs. A report the store cannot answer says so rather than producing a convincing empty file.
- A payroll report is a catalogue entry in `payrollReportCatalog` with its own columns, builder and group. Adding a schedule means adding an entry — never a bespoke screen, and never a second copy of the column list for the export.
- The screen's dialogs belong to the screen, not to one of its views. Returning the employee drill-down early without them is what made "Edit this line" do nothing.
- The record lock re-reads the stored run at both ends. Writing back the snapshot the effect captured discarded every recalculation that happened while the screen was open.
- A register only writes its rows to storage once somebody opens its screen, so payroll reads registers through `readRegisterRows` (`OperationalWorkspaces`), which falls back to the definition's own seed. Reading storage alone made every seeded bonus and deduction invisible to the computation until an administrator happened to visit the register.
- The payout calendar is where a payroll period is decided, not re-typed. A Payout calendar row carries the frequency, month, year, payroll period *and* timekeeping cut-off, and choosing one in the wizard fills all of them (Annex C 3.d). Payroll reads them through `readCalendars` in `CanonicalWorkspaces`, because the calendar is company-scoped and seeds itself on first read — the raw storage key is empty until then.
- `OperationalWorkspaces` imports `PayrollProcessing` to register the delegate, so the dependency points one way: the reader is passed in as `readRegister` rather than imported back.

## Where a payroll result is seen

- **Administrator**: Payroll ▸ Payroll Processing ▸ transaction ▸ employee. `PayrollLineDetail` shows the computation trail, earnings and bonuses, statutory and tax, deductions and loans, the timekeeping behind it, the crediting instruction and the year-to-date movement.
- **Employee**: HRM ▸ Employee Self-Inquiry ▸ Payslips & Payroll History. Payroll is an administrator module — not one Phase 2 Payroll row grants an employee a register — and the employee's payslip, statutory-contribution and payroll-history inquiries are BRD rows served by HRM. It renders the same line through the same `PayslipDocument`, so there is no second calculation.
- Only **Posted** and **Locked** runs reach the employee. A transaction still open or in review is not yet their pay, and its figures can still change.

## Timekeeping punch density

- `seedTimeLogs` generates every working day for the months a payroll run covers (`FULL_MONTHS`) and keeps the weekly sample for the rest of the year. A payroll cut-off has to have a real working month behind it; a four-day-a-month sample priced a fortnight from two punches.

## QA sweep findings (2026-08-18)

An end-to-end pass through every module, tile and sub-screen across all four actors surfaced four real defects, now fixed:

- **`versionUsage` read a stale storage key.** `statutoryService.js`'s `readPayrollTransactions()` was hardcoded to `atlas-operational-transactions-v1`, but the transactions register moved to `-v2` when its field set changed. This silently broke the "used by payroll" lock on statutory/tax table versions — P&A could have edited or deleted a table a posted payroll run already consumed, defeating the §7.1 historical-reproducibility guarantee the code's own comment describes. Fixed to check `-v2` first, falling back to `-v1`. A version register bump must be checked against every reader that keys off its storage name, not just its own workspace.
- **HRM and Timekeeping's Reports tile had no BRD-backed gate.** The HRM Reports Module and TK Reports Module BRD rows are 100% "P&A Admin, Client Admin" (27 + 22 rows, zero exceptions), yet the tile carried `experience: 'both'` (HRM) or no gate at all (Timekeeping) — any Employee or Approver could open Headcount, Medical Profiles, Compliance and CGI Configuration reports despite the screen's own "ACTOR SCOPE: OWN" badge. Fixed via `canViewReportsTile` in `moduleAccess.js`, the shared authority both portals now import. This is a distinct feature from the DTR Summary / leave-ledger self-inquiry every actor keeps under Attendance Summary — do not re-merge them.
- **A React key collision on `official-business`.** Its `columns` array declared its own `{ key: 'employeeName', ... }` entry, which collided with the one `RequestApprovalScreen` always prepends for the approval queue — every other application definition leaves that column out for exactly this reason. It also meant the *employee's own* Self-Service list rendered a blank "Employee Full Name" column, since `requestDetails` never stores the filer's own name. Removed the redundant column from the definition.
- **`ChargeCodesWorkspace` used `useState(subView)`.** Seeding state from a prop only sets it once at mount; the component never resynced when the sidebar's `onSelectSubView` changed the `subView` prop afterward, so **Time Report Approval and Charge Code Reports were completely unreachable** once Time Report Application had mounted first — the sidebar's `selected` class updated correctly while the content pane stayed frozen. Fixed with `useEffect(() => setActiveSubView(subView), [subView])`. This is a general anti-pattern: a component seeding local state from a prop with `useState(prop)` needs either that `useEffect` or a `key` remount at its call site (as `ComputationalBasis` already does correctly) — a bare `useState(prop)` only works if the prop is truly immutable for the component's lifetime.

When a workspace holds sub-navigation driven by a parent `route`/`view` object, verify the content pane actually changes on every sidebar entry, not just that the sidebar's own `selected` styling updates — the two can silently diverge exactly as they did here.
