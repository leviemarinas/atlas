# Placement & Coverage Audit — Company Configuration Prototype

Sources of truth:
- `Phase 2 BRD Audit Summary.xlsx` → `brd.tsv` (336 rows, 1 sheet "Overall status")
- `Takehome_Final_Retirement.xlsx` → `thp.tsv` (3 sheets: Take Home Pay, Retirement Pay, Final Pay)
- Prototype: `company-configuration-prototype/src/`

Every BRD citation below is `brd.tsv` row number.

---

## 1. Your questions, answered from the BRD

### Q: Is "company rule" different from "policy"?

**No — the BRD uses them as the same thing.** BRD row 61, Rules Settings:

> "Rules Set Up **Client-defined Rules** … Setting up of rules **or Setting up of company Payroll related policies/practices** (Date format, number format, absent if did not work…, Leave Accrual, Overtime, …, **Take home pays**, Part timers, OJT, piece rate, **final pay**, etc.)"

So Company Rules *is* the policy register. The distinction that actually matters is a different one:

| | Company Rules (BRD row 61) | Computational Basis (BRD row 19) |
|---|---|---|
| Nature | Client-defined **narrative** policy/practice | Controlled **executable** formula |
| Who authors | Client Admin | P&A provides; client edits within limits |
| Creation allowed? | **Yes** — "Customizable and unlimited entries" | **No** — "No creation of new computation" |
| Free text? | Yes | No — "available fields and operators only" |

### Q: What is the purpose of "Apply New Rule"?

It is **legitimate** — but only for the Company Rules sense of "rule". BRD row 61 explicitly grants clients unlimited custom entries. What is *not* legitimate is creating a new **computation**; BRD row 19 says "No creation of new computation", and the prototype correctly omits an Add button from client-side Computational Basis.

The current UI blurs this: Company Rules rows 13–20 (`src/App.jsx:94-101`) are take-home and retirement *parameters* dressed up as free-text rules. Those are computation config, not client policy. That is the real duplication.

### Q: Do the policies need to be part of Services Information?

**The policies belong in Computational Basis — which is correct today.** Two BRD rows settle it:

- Row 47 (Priority/Hierarchy of deductions/loans): *"take home pay setup **to be included in computational basis** (percentage of x pay)"*
- Row 56 (Retirement set up): *"**included in computational basis, no need for separate setup**"*
- Row 19 lists Computational Basis contents as including *"… Minimum Take Home Pay, Commission, Piece rate, Standard 13th month, Pro-rated 13th month, **retirement**, **final pay**, maternity benefit …"*

Settings → Payroll Settings rows 54/55/56 exist as *feature points*, but their Additional Description column redirects the actual setup into Computational Basis. So the Policy Engines tab is in the right module.

**One placement is wrong:** BRD row 47 also says the deduction/loan hierarchy is *"setup under reference table for hierarchy"*. Today the hierarchy is hard-coded inside the policy engine (`PolicyComputations.jsx:32-40`) while `REF-011 Deduction and Loan Hierarchy` (`ComputationalBasis.jsx:181`) is an unwired stub with two placeholder rows.

**One structural oddity:** "Services Information" is simultaneously a section *inside* Company Information (`App.jsx:117`) and a sibling nav item beside it (`App.jsx:70`). BRD row 19 files Computational Basis Set Up under "Company Information/Profile Settings", so the nesting is defensible, but the duplicated entry point is not.

---

## 2. Take Home Pay — workbook vs prototype

Workbook "Possible Company Set Up" (`thp.tsv` rows 114–157), 14 items:

| # | Requirement | Status | Where / gap |
|---|---|---|---|
| 1 | Enable Net Pay Protection | Met | `policy.enabled` |
| 2 | Select Base | Met | `policy.base`, 3 options |
| 3 | Set Threshold (% or amount) | Met | `thresholdType` + `threshold` |
| 4 | **Deductions Cap** with selectable base | **Partial** | Only a *loan* cap exists; base hard-coded to gross (`PolicyComputations.jsx:159`). Workbook wants a general deductions cap with its own base. |
| 5 | LAUT Cap with selectable base | **Partial** | Cap types exist; base hard-coded to gross (line 167). |
| 6a/6b | **Separate** deduction and loan hierarchies | **Partial** | One combined ranked list. Workbook rows 124–129 want two. |
| 7 | Auto-defer / stagger | Met | `autoDefer` |
| 8 | Carry-forward to next payroll | **Partial** | Toggle only; no balance is actually carried. |
| 9 | Link deferred to next payroll (outstanding amount, rescheduled date, new balance) | **Missing** | Not modeled. |
| 10 | Payslip tagging, fields a–g | **Partial** | Ledger shows Due/Deducted/Deferred. Missing **Accumulated amount** and **Remaining balance** (workbook rows 148–149). |
| 11 | Deduction ledger / loan tracker | **Missing** | No multi-cutoff tracking. |
| 12 | Employee group assignment | Met | `employeeGroup` |
| 13 | Net pay validation | Met | `result.exception` |
| 14 | Exception alert to admin | Met | `notifyEmployee` |

Additional workbook item (row 108): *"Choose what to prioritize — Take Home Pay or Loan Deduction Cap"*.

> **Defect.** The `priorityChoice` field is seeded (`PolicyComputations.jsx:23`) and rendered (line 225) but **never read** by `takeHomeResult()`. The order is hard-coded: loan cap → attendance cap → take-home top-up. Changing the dropdown does nothing.

Correctly implemented: statutory deductions are never deferred (workbook rows 160–165) — `mandatory` is subtracted outside the deferral loop.

Computation steps (workbook rows 167–183): steps 1–4 and 6 met; step 5 (shortfall carried to next payroll) is displayed but not carried; **step 7 Audit Log is missing** — `Save take-home policy` only fires a toast (line 239), it writes nothing to change history.

---

## 3. Retirement Pay — workbook vs prototype

Workbook "Possible Company Set Up" (`thp.tsv` rows 11–50), 9 items:

| # | Requirement | Status | Where / gap |
|---|---|---|---|
| 1 | Enable retirement module | Met | toggle |
| 2 | Plan type (statutory / company / override) | Met | 3 options incl. "Best of" |
| 3 | Employee group level | Met | |
| 4a | Statutory formula: divisor, 22.5 days, 6-month rounding, product | Met | `retirementResult()` lines 186–194 |
| 4 b1–b2 | Divisor and days-per-year configurable | Met | |
| 4 b3 | Salary basis "basic pay, average salary, last 36 months, etc." | **Partial** | Only 2 options; no general "average salary". |
| 4 b4 | Additional benefits **configurable** | **Misplaced** | Lives in `policy.test.additionalBenefits` — a *simulator* input, not a plan setting. |
| 4 b5 | Service-year rounding **configurable** | **Not configurable** | Select has exactly one option (line 278). |
| 4 b6 | Max cap / min guarantee | Met | |
| 4 | `MAX(Statutory, CompanyPlan)` | Met | line 198 |
| 5 | Eligibility: 60 / 65 / 5 yrs / early age | Met | |
| 5 | Auto-identify eligible employees | **Missing** | Single-scenario simulator only. |
| 6 | RA 7641 and RA 4917 taxation | **Defective** | See below. |
| 6 | Store whether pay is tax exempt | **Missing** | Recomputed, never stored. |
| 7 | Link to Employee Masterfile (plan-member tag) | **Missing** | `memberPlan` is a simulator field. Masterfile has `birthdate`, `dateHired`, `dateSeparated`, `jobLevel`, `reasonSeparation` but **no Retirement Date, no Plan Type Indicator**. |
| 8 | Link to Final Pay | **Missing** | Explicitly out of scope in prototype copy (line 300). |
| 9 | Audit trail | **Missing** | |

> **Defect.** `taxExempt = eligible && (policy.companyPlanApproved || policy.taxExemption.includes('RA 7641'))` (line 199). Selecting **"Taxable company benefit"** still returns tax-exempt whenever the BIR-approved toggle is on. The taxation dropdown cannot make the result taxable.

---

## 4. Final Pay — entirely absent

The workbook's third sheet (`thp.tsv`, Final Pay, 35 rows) specifies a full module: 6 mandatory components, 6 optional, 10 company rules (leave conversion, separation pay by cause, retirement plan, daily-rate divisor, rounding, advance 13th-month, last cutoff, government/company loan balances, negative net pay), timekeeping/leave linkage, deduction auto-offset, admin notification, breakdown output.

BRD row 55 carries it as a feature; BRD row 19 lists "final pay" inside Computational Basis. **Nothing exists in the prototype.**

---

## 5. Computational Basis vs BRD

Correct today:
- 219 computations seeded — matches BRD row 19 "currently 219 computations and 18 reference tables".
- 18 reference tables, "/ 30 target" — matches "There will be 30 reference tables".
- Operator/field whitelist enforced by `lexExpression()` — matches "available fields and operators only".
- No client-side Add button — matches "No creation of new computation".
- Reference tables enable/disable per client, upload new version, CSV download — matches BRD row 24.
- Statutory tables managed in Settings, consumed read-only in Payroll.

Problems:

> **This is the change you asked for.** Built-in formulas are *fully editable from the client screen*. `FormulaEditor` (`ComputationalBasis.jsx:401`) lets a Client Admin rewrite `draft.expression` on any `isBuiltIn` computation. It should be read-only there and editable only in Settings → Standard Computation Library.

> **Root cause.** `ComputationalBasis` and `StandardComputationAdmin` both read *and write* the same localStorage key `atlas-computational-basis-library-v2` (`ComputationalBasis.jsx:23`, `StandardComputationAdmin.jsx:17`). There is no admin/client separation to enforce, so client edits silently overwrite the admin library.

> **Duplicate reference-table stores.** The Core "Reference Table" module persists to `atlas-reference-tables-v2` (`ReferenceTables.jsx:119`) while the Computational Basis tab persists to `atlas-computational-basis-references-v1`. Two divergent copies of the same concept.

> **Hierarchy not in a reference table.** BRD row 47 requires it; `REF-011` is a stub.

---

## 6. Proposed changes (not yet applied)

**A. Lock built-ins to Settings** — add an `isAdmin` role context. In client view, `FormulaEditor` shows the expression read-only with an "Editable in Settings" note; name/description/category/status stay locked too for built-ins. Split storage so Settings owns the library and the client owns overrides/assignments.

**B. Role switcher** — a persistent Client / P&A Admin toggle in the topbar, stored in localStorage so it survives reloads. Admin unlocks: standard formula editing, Add/Delete computation, statutory table edits. Client gets assignments, reference enable/disable, policy parameters.

**C. Fix the three defects** — wire `priorityChoice` into `takeHomeResult()`; fix the `taxExempt` precedence; make service rounding actually configurable.

**D. Move deduction/loan hierarchy into REF-011** and have the take-home engine read it, per BRD row 47. Split into deduction vs loan hierarchies per workbook rows 124–129.

**E. Complete take-home** — separate deductions cap with selectable base, accumulated + remaining balance columns, deferred-deduction carry-forward ledger.

**F. Complete retirement** — promote `additionalBenefits` to plan config, add plan-type indicator + retirement date to the masterfile, store the tax-exempt determination.

**G. Add Final Pay** as a third policy engine, consuming retirement output.

**H. Company Rules cleanup** — make the take-home/retirement rows read-only reflections of the Computational Basis config instead of editable free-text duplicates. Keep "Apply New Rule" for genuine client-defined policies (BRD row 61).

**I. Audit trail** on policy saves, writing into the existing Change History.
