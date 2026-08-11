# Design QA — Atlas Payroll Prototype

## Source visual truth

- Statutory Table Settings and Payroll screenshots: `C:\Users\Levie Anne\OneDrive\Documents\ChatGPT\Atlas\.review\statutory-tables\media\`
- Statutory screenshot contact sheets: `C:\Users\Levie Anne\OneDrive\Documents\ChatGPT\Atlas\.review\statutory-tables\contact-sheets\`
- Take-home and retirement scenarios: `Takehome_Final_Retirement.xlsx`, limited to the Take Home Pay and Retirement Pay sheets. Final Pay was intentionally excluded.
- BRD rows reviewed: Computational Basis, Reference Table Setup, deduction/loan hierarchy, Take Home Pay Setup, Retirement Setup, Rules Setup, SSS, PhilHealth, Pag-IBIG, and Retirement Report.
- Existing source sets for Company Configuration, Company Rules, Earnings, Bonuses, Deductions, Company Loans, Employee Masterfile, and Computational Basis remain part of the full-app comparison baseline.
- Latest Employee Masterfile screenshots: `Employee Masterfile_1.docx` (47 embedded UI captures), covering Employee Information, Account Settings, all profile tabs, forms, tables, and CRUD states.
- Reference Table screenshots: `Reference Tables.docx` (7 embedded UI captures), covering Core placement, grouped catalogue, list editor, table editor, search, tabs, Add, Upload, Export, and pagination.

## Screen and ownership comparison

- Passed: Settings landing keeps controlled statutory versioning in Settings; reusable generic and client reference values are placed in Core to match the Reference Table source screens.
- Passed: Settings → Statutory Tables uses the same Atlas shell, agency sidebar, version list, code/effective-date metadata, compact contribution table, Add/Import/Export controls, entry modal, status treatment, and confirmation feedback seen in the source states.
- Passed: Payroll landing places Statutory Table beside Payroll Processing, Payslip Designer, Remittance Monitoring, Journal Entry, and Reports. Only the requested table module is enabled.
- Passed: Payroll → Statutory Tables exposes the active effective version as read-only, with agency switching, search, export, and detailed row inspection.
- Passed: SSS fields cover monthly compensation, MSC regular/MPF, regular SS/EC, MPF, employee/employer totals, and overall total. PhilHealth and Pag-IBIG support amount and percentage units with employee/employer shares.
- Passed: Take-home and retirement qualifiers are represented in Company Rules while calculations, assignments, formula versioning, and scenario testing remain in Computational Basis.
- Passed: Statutory reference cards in Computational Basis are explicitly linked and managed in Settings, avoiding duplicate editing locations.
- Passed: Computational Basis rows expose a Built-in standard or Admin-defined source indicator. Settings → Standard Computation Library remains the source of truth for Atlas standards, while company-owned computations are created and maintained in Computational Basis without modifying built-ins.
- Passed: Core → Reference Table matches the supplied Atlas catalogue and list/table templates, with Generic Information, Client-specific, and Others navigation; all reference entries support persisted add, edit, delete, search, CSV upload, CSV export, usage context, and audit states.
- Passed: Core → Employee Masterfile now opens on the Employee Information directory, then exposes the source-aligned Personal Details, Employee Record, Benefits, Time Off, Payroll & Allocation, and Contacts tabs. Account Settings Information remains a separate sidebar module.
- Passed: Employee sections cover personal/government data, IDs, passport, visa, education, employment history, organizations, social links, employment records, contracts, assignments, job/promotion/performance/history records, benefits, leave balances, contacts, emergency contacts, bank/allotment/payroll entry/cost allocation, and existing payroll records.

## Policy scenario verification

- Take-home simulator applies mandatory BIR/SSS/PhilHealth/Pag-IBIG deductions in full, then loan and attendance caps, then the ranked adjustment hierarchy.
- Rank 1 is adjusted first and only by the amount needed; later ranks are reached only when the threshold remains unmet.
- Deferred deductions show due, deducted, deferred, carry-forward, payslip tagging, notification, and exception states.
- Threshold bases support Basic Pay, Gross Pay, and Gross Pay less reimbursements/receivables; thresholds support percentage or fixed amount.
- Retirement supports statutory, company-plan, and more-beneficial-plan selection; divisor, days per year, salary basis, additional benefits, age/service eligibility, six-month rounding, min/max guarantees, plan membership, and prototype tax-exemption checks are configurable.
- Default retirement scenario verified: age 62 years 7 months, service 12 years 6 months, rounded to 13 years, statutory value ₱585,000, company-plan value ₱795,000, selected value ₱795,000.
- Changing the separation reason to Resignation changes the scenario to Not eligible; changing it back to Retirement restores eligibility.
- Final Pay workflow, computation, assignments, and UI were not added.

## Three synchronized variants

- Original: `http://127.0.0.1:4173/`
- Client wireframe: `http://127.0.0.1:4173/wireframe`
- Exact-layout monochrome: `http://127.0.0.1:4173/monochrome`
- Passed: all routes render the same DOM, data, localStorage records, navigation, CRUD controls, policy simulations, and exports.
- Passed: wireframe removes gradients, radii, elevation, and color while preserving hierarchy and interaction affordances.
- Passed: monochrome preserves the original dimensions and component treatment with black, white, and neutral-gray tokens.

## Functional and visual verification

- Browser-tested original Settings version list, new-version editor, SSS detail, Add Entry dialog, Payroll active-version view, Take-Home policy output, and Retirement eligibility updates.
- Browser-tested Reference Table catalogue, Civil Status list editor, add-entry persistence, Country table template, Usage tab, Audit Log tab, and Core placement.
- Browser-tested Employee Information directory, profile selection, all six profile tabs, Account Settings Information, and persisted source-aligned records.
- Browser-tested PhilHealth and Pag-IBIG version navigation.
- Browser-tested Settings → Standard Computation Library, formula test preview, built-in/admin-defined toggle, add/delete confirmation flow, and persistence cleanup.
- Browser-tested Computational Basis built-in formula badges and contextual help popovers for Take-Home Pay and Retirement Pay configuration/simulator fields.
- Browser-tested Settings statutory navigation on `/wireframe` and Payroll statutory navigation on `/monochrome`.
- HTTP 200 verified for all three routes.
- Production build passed with 4,601 modules transformed.
- Sites packaging tests passed: 4 passed, 0 failed.
- Source and implementation were compared at the same list/detail states; the app retains responsive containment when the Codex browser panel is narrower than the supplied source captures.
- No actionable P0, P1, or P2 visual or interaction findings remain.

## August 10, 2026 focused comparison

- Compared the four supplied Computational Basis and Take-Home Pay screenshots with the live implementation at the same browser viewport.
- Browser-tested the company-computation lifecycle in both Client and P&A Admin views: create CTA, approved field/operator builder, validation, persistence, edit/delete controls, assignment protection, confirmation, and test-data cleanup.
- Browser-tested the policy-code table after removing Linkage. The remaining columns are Code, Policy code, Applies to, Parameters, Status, and Action; Parameters is the only compact numeric metric.
- Browser-tested Take-Home Pay after removing the five-step pipeline and shared-engine notice. The hierarchy now uses Priority, Collection, Amount due, and Carry-forward balance while preserving linked source/classification context and editable balances.
- Production build and Sites packaging tests passed after the final visual corrections: 4 passed, 0 failed.

final result: passed
