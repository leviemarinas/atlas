# Scenario Studio live simulation validation

- Date: 2026-08-20
- Unit/integration regression: 196 tests passed.
- Production build: Vite build and Sites packaging passed.
- Browser: the original storyboard remains above the new live section.
- Browser: the live section renders the same-origin Atlas application and remains manually interactive.
- Browser: Create a regular payroll switched to Client Admin, opened Payroll, opened Payroll Processing, created a wizard draft, selected a configured payout calendar, filled Remarks, traversed Computation and Employees, and reached Review.
- Browser: File an overtime request switched to Employee, opened HRM, Employee Self-service, Overtime Request Application, opened the real Add Overtime Application modal, and populated its required date, time, and reason fields.
- Safety: final Create transaction and Submit actions are left to the user so replaying a demonstration does not silently persist payroll or HR records.

## Full-catalog remediation

- Catalog-to-plan parity: 56 of 56 stories have an explicit live route; an automated test fails if a future story has none.
- Shared runner: executes every remaining catalog step using visible live controls, fills real fields and selects real options, and highlights the final committing action.
- Browser coverage: Employee payslip and leave, Approver leave, Client Admin earning and policy, P&A statutory, and multi-company switching passed.
- Multi-company gap: Northstar Retail is now a company-scoped seeded tenant, and the scenario switched to Northstar Payroll Processing and back to ABC successfully.
- Regression/build: 197 tests passed; production build and Sites packaging passed.

## Full end-to-end all-actors extension

- Added two distinct tenants: a resettable `Atlas Simulator Sandbox` and a populated `Meridian Consumer Products` production-like sample. Both are explicitly labeled synthetic.
- Payroll journey browser pass: Employee overtime input → Approver approval → Client Admin calculation/review → P&A approval/posting → Employee payslip → company Reports.
- Persisted payroll result: `PR-2025-11-E2E`, Posted, 7 employee lines, approved overtime included, and employee/company net-pay metrics visible.
- Policy journey browser pass: 30% take-home baseline → 45% policy change → Timekeeping verification → recomputation/posting → employee payslip → company Reports.
- Cross-module effect verified: protected minimum and company net pay changed after the policy update; the posted result continued to use the same approved Timekeeping source.
- Production-like tenant verified in Payroll Processing with posted `PR-2025-11-014`, 7 employee lines, and company-scoped totals.
- Final regression/build: 198 Node tests passed; Vite production build and Sites packaging passed.

## Human-simulator and alternate-branch extension

- Human interaction verified inside the real same-origin Atlas iframe: animated pointer movement, mouseover/hover dispatch, smooth scroll, modal opening, field focus, incremental text entry, select/date/time entry, and final-decision review.
- Overtime form browser evidence showed the real Add Overtime Application modal populated with 2025-11-14 18:00–20:00, derived 2 hours, and a typed reason before Submit.
- Payroll rejection/resubmission browser pass: Created → For Approval → rejected to Open with remarks → corrected → resubmitted → approved/posted → employee payslip.
- Earning/deduction browser pass: added ₱3,000 earning and ₱850 deduction through their real forms; payroll posted with employee net ₱34,499.65 and company net ₱148,046.92.
- Time-correction browser pass: filed → rejected → corrected/resubmitted → approved → Timekeeping showed 0 late minutes → payroll posted → employee payslip.
- State-aware integration handles actions the visible Atlas UI commits immediately, preventing the domain continuation from repeating a status transition.
- Regression: 198 Node tests passed; Vite build and Sites packaging passed.

## Guided computation-lineage extension

- Every stage in all eight end-to-end journeys now includes conversational Atlas Guide narration plus a visible `Reads → Applies → Writes → Proves` lineage.
- Added three component-focused journeys: `Computational Basis to payroll line`, `Statutory tables to payslip and remittance`, and `Deduction hierarchy and take-home protection`.
- Formula browser pass: Settings ERN-002 → approved Timekeeping input → Payroll calculation → computation evidence → P&A posting → employee payslip → company Reports. Posted `PR-2025-11-E2E` exposed ERN-002 inputs `488.51 × 2 × 1.25` and result `₱1,221.28`.
- Statutory browser pass: effective tables → payout-date calculation → lookup evidence → posting → employee deductions → company report. John’s calculated line showed `₱2,037.50` employee and `₱2,927.50` employer contributions with GOV-001/002/003 sources.
- Protection browser pass: real deduction form → REF-011/THP policy inspection → calculation → evidence → posting → employee explanation → company report. A `₱25,000` due deduction produced a real `₱6,450.13` THP-002 deferral.
- Computation evidence panel reads the actual employee line’s code, expression or lookup, captured inputs, source, bracket/detail text, and result; it is not a parallel demonstration calculation.
- Regression: 200 Node tests passed, including new guidance completeness and real formula/statutory/deferral journey assertions. Vite production build and Sites packaging passed.

## UI-based source and policy audit extension

- Added one shared traceability map so Scenario Studio and Payroll employee-line details name the same owning ATLAS feature and exact UI path.
- The posted deduction-protection journey rendered 18 ordered checks: transaction controls; company pay basis; employee basic pay; approved time; earnings; deductions; loan schedules; formula references; shared Reference Table; company assignments; computations; statutory and tax versions; REF-011 hierarchy; Minimum Take-Home Pay; payroll line; payslip; and Reports.
- Checked-but-empty inputs remain explicit (`No applicable rows` / `No active schedule`) instead of disappearing from the audit.
- All 20 actual computation steps now show the source feature, governed code path, Standard Computation Library path, client assignment path, and any effective-table or policy paths.
- Browser policy evidence: REF-011 ordered five deduction rows and one loan row; THP-001/THP-002 protected ₱15,388.20, collected ₱25,517.60, deferred ₱6,450.13, and produced ₱16,049.78 net pay.
- Browser route verification: Settings exposed the canonical Reference Table tile; the end-to-end iframe finished on the real Payroll Reports screen after employee and company proof stages.
- Regression: 204 Node tests passed. Vite production build and Sites packaging passed. `git diff --check` passed with line-ending warnings only.
