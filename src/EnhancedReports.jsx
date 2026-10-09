import { useMemo, useState } from 'react';
import { ArrowLeft, DownloadSimple, FileText, MagnifyingGlass, ShieldCheck } from '@phosphor-icons/react';
import { appendAuditEvent, readActiveCompany, readActiveCompanyId } from './companyRepository';
import { readReportProtection } from './securityServices';
import { publishNotificationEvent } from './notificationServices';
import { downloadFile } from './fileDownload';
import { plural } from './textFormat';
import { aggregateReportRows, buildPayrollContext, payrollReport, readPayrollRuns, reportTotals } from './payrollRuns.js';
import { readHrmData } from './hrmData.js';
import { readRequests } from './requestService.js';
import { REQUEST_TYPES } from './requestWorkflow.js';
import { readCompanies } from './companyRepository';
import { readGrants } from './securityServices';
import { readServiceConfiguration } from './serviceModules';
import { readCalendars } from './CanonicalWorkspaces';
import { readManagedPolicies } from './policyManagement';
import { employeeRoster } from './employeeRoster.js';
import { leaveBalancesFor } from './hrmData.js';
import { readPolicies } from './PolicyComputations';
import { retirementResult } from './RetirementEngine';
import { readRegisterRows } from './OperationalWorkspaces';
import { bir1603Rows } from './payrollBenefits.js';
import { DateInput } from './DateInput.jsx';

export const phase2ReportCatalog = [
  ['RPT-HC-185', 'Headcount', 'Employee Masterfile', 'PDF, Excel', 'Reports.Employee', 'HTP185'],
  ['RPT-MF-186', 'Employee Masterfile', 'Employee Masterfile', 'Excel, CSV', 'Reports.Employee', 'HTP186'],
  ['RPT-MOV-187', 'Employee Movement History', 'Employee Masterfile', 'PDF, Excel', 'Reports.Employee', 'HTP187'],
  ['RPT-LOAN-188', 'Loan Balances', 'Employee Masterfile', 'PDF, Excel', 'Reports.Payroll', 'HTP188'],
  ['RPT-ERN-189', 'Earnings', 'Employee Masterfile', 'PDF, Excel, CSV', 'Reports.Payroll', 'HTP189'],
  ['RPT-DED-190', 'Deductions', 'Employee Masterfile', 'PDF, Excel, CSV', 'Reports.Payroll', 'HTP190'],
  ['RPT-ATT-192', 'Staff Attendance Summary', 'Time & Attendance', 'PDF, Excel', 'Reports.Attendance', 'HTP192'],
  ['RPT-LVE-193', 'Leave Ledger and Balances', 'Time & Attendance', 'PDF, Excel', 'Reports.Leave', 'HTP193'],
  ['RPT-LVC-194', 'Leave Conversion', 'Time & Attendance', 'PDF, Excel', 'Reports.Leave', 'HTP194'],
  ['RPT-OT-195', 'Overtime Summary', 'Time & Attendance', 'PDF, Excel', 'Reports.Overtime', 'HTP195'],
  ['RPT-CMP-196', 'Payroll Compliance', 'Payroll', 'PDF, Excel', 'Reports.Payroll', 'HTP196'],
  ['RPT-EXC-197', 'Payroll Exceptions', 'Payroll', 'PDF, Excel', 'Reports.Payroll', 'HTP197'],
  ['RPT-PAY-219', 'Payroll Register / Entry', 'Payroll', 'PDF, Excel, CSV', 'Reports.Payroll', 'HTP219'],
  ['RPT-PSL-221', 'Payslip Batch', 'Payroll', 'PDF', 'Reports.Payslip', 'HTP221'],
  ['RPT-GRU-222', 'Gross-up', 'Payroll', 'PDF, Excel', 'Reports.Payroll', 'HTP222'],
  ['RPT-FBT-223', 'Fringe Benefit Tax', 'Payroll', 'PDF, Excel', 'Reports.Payroll', 'HTP223'],
  ['RPT-FIN-224', 'Final Pay', 'Payroll', 'PDF, Excel', 'Reports.Payroll', 'HTP224'],
  ['RPT-MAT-225', 'Maternity Benefit', 'Payroll', 'PDF, Excel', 'Reports.Payroll', 'HTP225'],
  ['RPT-GL-226', 'General Ledger Entries', 'Accounting', 'Excel, CSV', 'Reports.Accounting', 'HTP226'],
  ['RPT-MDED-229', 'Monthly Deductions', 'Payroll', 'PDF, Excel', 'Reports.Payroll', 'HTP229'],
  ['RPT-REM-231', 'Remittance Converter', 'Remittance', 'Excel, CSV', 'Reports.Remittance', 'HTP231'],
  ['RPT-PROV-236', 'Provident Fund', 'Payroll', 'PDF, Excel', 'Reports.Payroll', 'HTP236'],
  ['RPT-PENS-237', 'Pension Fund', 'Payroll', 'PDF, Excel', 'Reports.Payroll', 'HTP237'],
  ['RPT-EMB-238', 'Expanded Maternity Benefit', 'Payroll', 'PDF, Excel', 'Reports.Payroll', 'HTP238'],
  ['RPT-RET-239', 'Retirement', 'Payroll', 'PDF, Excel', 'Reports.Payroll', 'HTP239'],
  ['RPT-1604F-208', 'BIR Form 1604-F', 'Statutory', 'PDF, Excel', 'Reports.Statutory', 'HTP208'],
  ['RPT-1603-209', 'BIR Form 1603', 'Statutory', 'PDF, Excel', 'Reports.Statutory', 'HTP209'],
  ['RPT-1604E-215', 'BIR Form 1604-E', 'Statutory', 'PDF, Excel', 'Reports.Statutory', 'HTP215'],
  ['RPT-1601C-244', 'BIR Form 1601-C', 'Statutory', 'PDF, Excel', 'Reports.Statutory', 'HTP244'],
  ['RPT-1604C-245', 'BIR Form 1604-C', 'Statutory', 'PDF, Excel', 'Reports.Statutory', 'HTP245'],
  ['RPT-1604CF-246', 'BIR Form 1604-CF', 'Statutory', 'PDF, Excel', 'Reports.Statutory', 'HTP246'],
  ['RPT-2316-247', 'BIR Form 2316', 'Statutory', 'PDF', 'Reports.Statutory', 'HTP247'],
  ['RPT-2306-248', 'BIR Form 2306', 'Statutory', 'PDF', 'Reports.Statutory', 'HTP248'],
  ['RPT-2307-249', 'BIR Form 2307', 'Statutory', 'PDF', 'Reports.Statutory', 'HTP249'],
  ['RPT-ALPHA-250', 'BIR Alphalist', 'Statutory', 'Excel, CSV', 'Reports.Statutory', 'HTP250'],
  ['RPT-PREM-254', 'SSS, PhilHealth and HDMF Premium Remittances', 'Remittance', 'PDF, Excel', 'Reports.Remittance', 'HTP254'],
  ['RPT-LREM-255', 'SSS and HDMF Loan Remittances', 'Remittance', 'PDF, Excel', 'Reports.Remittance', 'HTP255'],
  ['RPT-BILL-259', 'Billing', 'Billing', 'PDF, Excel', 'Reports.Billing', 'HTP259'],
  ['RPT-EBAL-210', 'Earnings with Balance', 'Payroll', 'Excel, CSV', 'Reports.Payroll', 'HTP210'],
  ['RPT-ACR-211', 'Payroll Accruals', 'Accounting', 'Excel, CSV', 'Reports.Accounting', 'HTP211'],
  ['RPT-1700-212', 'BIR 1700 Support Schedule', 'Statutory', 'PDF, Excel', 'Reports.Statutory', 'HTP212, HTP317'],
  ['RPT-FTAX-214', 'BIR Final Tax Text File', 'Statutory', 'DAT, CSV', 'Reports.Statutory', 'HTP214'],
  ['RPT-ETAX-216', 'BIR Expanded Tax Text File', 'Statutory', 'DAT, CSV', 'Reports.Statutory', 'HTP216'],
  ['RPT-CLR-217', 'Annual Tax Clearance', 'Statutory', 'Excel, CSV', 'Reports.Statutory', 'HTP217'],
  ['RPT-GOV-220', 'All Government Forms (package)', 'Statutory', 'Excel, CSV', 'Reports.Statutory', 'HTP220'],
  ['RPT-HMP2-234', 'Pag-IBIG Receipts and Remittance Schedule (with MP2)', 'Remittance', 'Excel, CSV', 'Reports.Remittance', 'HTP234'],
  ['RPT-MP2X-235', 'HDMF MP2 Excel Converter', 'Remittance', 'Excel, CSV', 'Reports.Remittance', 'HTP235'],
  ['RPT-PMRF-240', 'PhilHealth PMRF (Member Registration)', 'Statutory', 'PDF, Excel', 'Reports.Statutory', 'HTP240'],
  ['RPT-ER2-241', 'PhilHealth ER-2 (Report of Employee-Members)', 'Statutory', 'PDF, Excel', 'Reports.Statutory', 'HTP241'],
  ['RPT-1601EQ-243', 'BIR Form 1601-EQ', 'Statutory', 'PDF, Excel', 'Reports.Statutory', 'HTP243'],
  ['RPT-GREM-251', 'Monthly Government Remittance Returns', 'Remittance', 'PDF, Excel', 'Reports.Remittance', 'HTP251'],
  ['RPT-MAP-252', 'Monthly Alphalist of Payees (annual clearance)', 'Statutory', 'DAT, Excel, CSV', 'Reports.Statutory', 'HTP252'],
  ['RPT-AAL-253', 'Annual Alphalist (annual clearance)', 'Statutory', 'DAT, Excel, CSV', 'Reports.Statutory', 'HTP253'],
  ['RPT-MP2A-261', 'HDMF MP2 Account Numbers', 'Remittance', 'Excel, CSV', 'Reports.Remittance', 'HTP261'],
  ['RPT-CERT-191', 'Certifications', 'Employee Masterfile', 'Excel, CSV', 'Reports.Employee', 'HTP191'],
  ['RPT-ENG-218', 'Engagement Manual', 'Payroll', 'PDF, Excel', 'Reports.Payroll', 'HTP218'],
  ['RPT-CLA-330', 'Client Assignment', 'Audit', 'Excel, CSV', 'Reports.Audit', 'HTP330'],
  ['RPT-HLR-260', 'High Level Payroll Report', 'Payroll', 'PDF, Excel', 'Reports.Payroll', 'HTP260'],
  ['RPT-WP-309', 'Payroll Work Program', 'Payroll', 'PDF, Excel', 'Reports.Payroll', 'HTP309'],
  ['RPT-AUD-001', 'Audit Log', 'Audit', 'PDF, Excel, CSV', 'Audit.View', 'Functional'],
].map(([reportKey, name, category, formats, requiredPermission, featureRef]) => ({ reportKey, name, category, formats, requiredPermission, featureRef, status: 'Active' }));

const companyId = () => readActiveCompanyId();

/**
 * Which catalogue reports the payroll run store can actually answer.
 *
 * A report in this map is generated from the posted payroll transactions in the
 * selected window and downloads its real rows; a report outside it still
 * records a run, because its data source is not implemented in this prototype
 * and pretending otherwise would produce a convincing but empty file. The
 * builders themselves are `payrollReportCatalog` entries, so the schedule the
 * Reports module produces is the same schedule the transaction produces.
 */
const PAYROLL_BACKED_REPORTS = {
  'RPT-PAY-219': 'register',
  'RPT-EXC-197': 'exceptions',
  'RPT-LOAN-188': 'loans',
  'RPT-GL-226': 'journal',
  'RPT-1601C-244': 'tax',
  'RPT-PREM-254': 'statutory',
  'RPT-PSL-221': 'net-pay',
  'RPT-ERN-189': 'basic-pay',
  'RPT-OT-195': 'overtime',
  'RPT-ATT-192': 'lates-absences',
  'RPT-EBAL-210': 'earnings-balance',
  'RPT-ACR-211': 'accruals',
  'RPT-1700-212': 'bir-1700',
  'RPT-FTAX-214': 'final-tax',
  'RPT-1604F-208': 'final-tax',
  'RPT-ETAX-216': 'expanded-tax',
  'RPT-1604E-215': 'expanded-tax',
  'RPT-CLR-217': 'annual-clearance',
  'RPT-HMP2-234': 'hdmf-receipts',
  'RPT-MP2X-235': 'mp2-remittance',
  'RPT-PMRF-240': 'phic-pmrf',
  'RPT-ER2-241': 'phic-er2',
  'RPT-1601EQ-243': 'bir-1601eq',
  'RPT-GREM-251': 'gov-remittances',
  'RPT-MAP-252': 'alphalist-monthly',
  'RPT-AAL-253': 'alphalist-annual',
  'RPT-ALPHA-250': 'alphalist-annual',
  'RPT-MP2A-261': 'mp2-accounts',
  'RPT-HLR-260': 'payroll-summary',
  'RPT-DED-190': 'deductions-schedule',
  'RPT-MDED-229': 'monthly-deductions',
  'RPT-CMP-196': 'compliance',
  'RPT-GRU-222': 'gross-up',
  'RPT-FIN-224': 'final-pay',
  'RPT-REM-231': 'remittance-converter',
  'RPT-LREM-255': 'loan-remittances',
  'RPT-1604C-245': 'alphalist-annual',
  'RPT-1604CF-246': 'alphalist-annual',
  'RPT-2316-247': 'alphalist-annual',
  'RPT-2306-248': 'final-tax',
  'RPT-2307-249': 'expanded-tax',
  'RPT-PROV-236': 'provident-fund',
  'RPT-PENS-237': 'pension-fund',
};

/**
 * Reports whose rows come from somewhere other than posted payroll: the
 * certificate requests, the company's own configuration, and who is assigned
 * to which client. Each returns real rows from its store.
 */
const OTHER_BACKED_REPORTS = {
  'RPT-FBT-223': {
    source: 'Fringe Benefits (FBT) records',
    build: scope => ({
      columns: [{ key: 'code', label: 'Benefit' }, { key: 'employee', label: 'Employee' }, { key: 'benefitType', label: 'Type' }, { key: 'date', label: 'Date Given' }, { key: 'monetaryValue', label: 'Monetary Value' }, { key: 'grossedUpValue', label: 'Grossed-up Value' }, { key: 'fbtAmount', label: 'FBT (35%)' }, { key: 'status', label: 'Status' }],
      rows: readRegisterRows('fringeBenefits', scope).map(row => ({ key: row.code, ...row })),
    }),
  },
  'RPT-1603-209': {
    source: 'Fringe Benefits (FBT) records',
    build: scope => ({
      columns: [{ key: 'quarter', label: 'Quarter' }, { key: 'benefits', label: 'Benefits' }, { key: 'monetaryValue', label: 'Monetary Value' }, { key: 'grossedUp', label: 'Grossed-up Value' }, { key: 'fbt', label: 'FBT Due' }],
      rows: bir1603Rows(readRegisterRows('fringeBenefits', scope)).map(row => ({ key: row.quarter, ...row })),
    }),
  },
  ...Object.fromEntries([['RPT-MAT-225', false], ['RPT-EMB-238', true]].map(([reportKey, differentialOnly]) => [reportKey, {
    source: 'SSS Maternity and Sickness Benefits records',
    build: scope => ({
      columns: [{ key: 'code', label: 'Claim' }, { key: 'employee', label: 'Employee' }, { key: 'benefitType', label: 'Benefit' }, { key: 'startDate', label: 'Leave Start' }, { key: 'days', label: 'Days' }, { key: 'averageDailySalaryCredit', label: 'ADSC' }, { key: 'sssBenefit', label: 'SSS Benefit (estimate)' }, { key: 'salaryDifferential', label: 'Salary Differential' }, { key: 'status', label: 'Status' }],
      rows: readRegisterRows('sssBenefits', scope).filter(row => !differentialOnly || String(row.benefitType).startsWith('Maternity')).map(row => ({ key: row.code, ...row })),
    }),
  }])),
  'RPT-CERT-191': {
    source: 'Certificate and document requests',
    build: scope => ({
      columns: [
        { key: 'requestId', label: 'Request' }, { key: 'employee', label: 'Employee' }, { key: 'certificate', label: 'Certificate / Document' },
        { key: 'purpose', label: 'Purpose' }, { key: 'filed', label: 'Filed' }, { key: 'status', label: 'Status' },
      ],
      rows: readRequests(scope, { activeCompanyId: scope })
        .filter(request => [REQUEST_TYPES.COE_REQUEST, REQUEST_TYPES.DOCUMENT_REQUEST].includes(request.requestType))
        .map(request => ({
          key: request.requestId, requestId: request.requestId,
          employee: request.onBehalfOf?.employeeName || request.requester?.employeeName || request.requester?.displayName || request.employeeId || '',
          certificate: request.requestType === REQUEST_TYPES.COE_REQUEST ? 'Certificate of Employment' : request.requestDetails?.documentType || 'Document',
          purpose: request.requestDetails?.purpose || '', filed: String(request.submittedAt || request.createdAt || '').slice(0, 10), status: request.status,
        })),
    }),
  },
  'RPT-ENG-218': {
    source: 'Company configuration',
    build: scope => {
      const company = readActiveCompany() || {};
      const rows = [];
      const add = (section, item, detail) => rows.push({ key: `${section}-${rows.length}`, section, item, detail });
      add('Company', company.displayName || company.name || scope, `TIN ${company.tin || '—'}`);
      readCalendars(scope).filter(row => row.status === 'Active').forEach(row => add('Calendar', row.calendarCode, `${row.calendarType}${row.frequency ? ` · ${row.frequency}` : ''}${row.payoutDate ? ` · payout ${row.payoutDate}` : ''}${row.processDate ? ` · process ${row.processDate}` : ''}`));
      [['earnings', 'Earning'], ['deductions', 'Deduction'], ['bonuses', 'Bonus'], ['loans', 'Company Loan'], ['payrollControls', 'Payroll Control']].forEach(([key, label]) => {
        let rowsFor = [];
        try { rowsFor = readServiceConfiguration(key, scope); } catch { rowsFor = []; }
        rowsFor.filter(row => (row.status || 'Active') === 'Active').forEach(row => add(`${label} setup`, `${row.code} ${row.name || ''}`.trim(), [row.type, row.frequency, row.taxTreatment || row.taxability, row.computationCode && `formula ${row.computationCode}`].filter(Boolean).join(' · ')));
      });
      readManagedPolicies(scope).filter(policy => policy.status === 'Active').forEach(policy => add('Policy', `${policy.policyCode} v${policy.version}`, `${policy.subcategory || ''}${policy.effectiveFrom ? ` · from ${policy.effectiveFrom}` : ''}`));
      return { columns: [{ key: 'section', label: 'Section' }, { key: 'item', label: 'Item' }, { key: 'detail', label: 'Detail' }], rows };
    },
  },
  'RPT-HC-185': {
    source: 'The employee roster',
    build: () => {
      const groups = new Map();
      employeeRoster.forEach(employee => {
        const key = `${employee.department}|${employee.employmentStatus}|${employee.employmentType}`;
        groups.set(key, (groups.get(key) || 0) + 1);
      });
      return {
        columns: [{ key: 'department', label: 'Department' }, { key: 'status', label: 'Employment Status' }, { key: 'type', label: 'Employment Type' }, { key: 'headcount', label: 'Headcount' }],
        rows: [...groups.entries()].map(([key, count]) => { const [department, status, type] = key.split('|'); return { key, department, status, type, headcount: count }; }),
      };
    },
  },
  'RPT-MF-186': {
    source: 'The employee roster',
    build: () => ({
      columns: ['employeeCode', 'name', 'position', 'department', 'costCenter', 'employmentType', 'employmentStatus', 'dateHired', 'paymentMode', 'tin'].map(key => ({ key, label: { employeeCode: 'Employee No.', name: 'Name', position: 'Position', department: 'Department', costCenter: 'Cost Center', employmentType: 'Employment Type', employmentStatus: 'Status', dateHired: 'Date Hired', paymentMode: 'Payment Mode', tin: 'TIN' }[key] })),
      rows: employeeRoster.map(employee => ({ key: employee.employeeId, ...employee, paymentMode: employee.payroll?.paymentMode, tin: employee.government?.tin })),
    }),
  },
  'RPT-LVE-193': {
    source: 'HRM leave balances and approved leave',
    build: scope => {
      const data = readHrmData(scope);
      const requests = readRequests(scope, { activeCompanyId: scope });
      return {
        columns: [{ key: 'name', label: 'Employee' }, { key: 'leaveType', label: 'Leave Type' }, { key: 'accrued', label: 'Accrued' }, { key: 'used', label: 'Used' }, { key: 'pending', label: 'Pending' }, { key: 'converted', label: 'Converted' }, { key: 'forfeited', label: 'Forfeited' }, { key: 'remaining', label: 'Remaining' }],
        rows: employeeRoster.flatMap(employee => leaveBalancesFor(data, employee.employeeId, requests).map(row => ({ key: `${employee.employeeId}-${row.leaveType}`, name: employee.name, ...row }))),
      };
    },
  },
  'RPT-LVC-194': {
    source: 'HRM leave balances',
    build: scope => {
      const data = readHrmData(scope);
      return {
        columns: [{ key: 'name', label: 'Employee' }, { key: 'leaveType', label: 'Leave Type' }, { key: 'converted', label: 'Days Converted' }, { key: 'conversionDate', label: 'Conversion Date' }],
        rows: employeeRoster.flatMap(employee => leaveBalancesFor(data, employee.employeeId, []).filter(row => Number(row.converted) > 0).map(row => ({ key: `${employee.employeeId}-${row.leaveType}`, name: employee.name, leaveType: row.leaveType, converted: row.converted, conversionDate: row.conversionDate || '' }))),
      };
    },
  },
  'RPT-RET-239': {
    source: 'The Retirement Pay policy engine',
    build: scope => {
      const policy = readPolicies(scope).retirement;
      return {
        columns: [{ key: 'name', label: 'Employee' }, { key: 'age', label: 'Age at Retirement Date' }, { key: 'service', label: 'Credited Years' }, { key: 'eligible', label: 'Eligible' }, { key: 'statutory', label: 'Statutory (RA 7641)' }, { key: 'company', label: 'Company Plan' }, { key: 'selected', label: 'Benefit' }, { key: 'tax', label: 'Tax Treatment' }],
        rows: policy ? employeeRoster.filter(employee => employee.retirementDate).map(employee => {
          const outcome = retirementResult(policy, employee);
          const money = value => Math.round((Number(value) || 0) * 100) / 100;
          return { key: employee.employeeId, name: employee.name, age: outcome.age.years, service: outcome.roundedYears, eligible: outcome.eligible ? 'Yes' : 'No', statutory: money(outcome.statutory), company: money(outcome.company), selected: money(outcome.selected), tax: outcome.eligible ? (outcome.taxExempt ? `Exempt — ${outcome.taxBasis}` : `Taxable — ${outcome.taxBasis}`) : '' };
        }) : [],
      };
    },
  },
  'RPT-BILL-259': {
    source: 'Billing transactions',
    build: scope => {
      const rows = readRegisterRows('billing', scope);
      return {
        columns: [{ key: 'code', label: 'Billing Code' }, { key: 'service', label: 'Service' }, { key: 'period', label: 'Period' }, { key: 'basis', label: 'Basis' }, { key: 'quantity', label: 'Quantity' }, { key: 'unitRate', label: 'Rate' }, { key: 'amount', label: 'Amount' }, { key: 'reviewStage', label: 'Review Stage' }, { key: 'status', label: 'Status' }],
        rows: rows.map((row, index) => ({ key: row.code || `bill-${index}`, ...row, amount: row.amount ?? row.total ?? row.billAmount ?? '' })),
      };
    },
  },
  'RPT-WP-309': {
    source: 'Payroll transactions and their audit trail',
    // The payroll work program: every step of each transaction's process,
    // whether it is done, and who did it when, read from the transaction's
    // own audit trail.
    build: scope => {
      const steps = [
        ['Filed', /^Filed$/], ['Computed', /Recalculated/], ['Posted as draft', /Posted as draft/], ['Submitted for review', /^Submitted for review/],
        ['Submitted for approval', /^Submitted for approval/], ['Approved', /^Approved$/], ['Bank file generated', /bank file/i], ['Posted', /^Posted$/], ['Locked', /^Locked/],
      ];
      return {
        columns: [
          { key: 'transactionNumber', label: 'Payroll Transaction' }, { key: 'payoutDate', label: 'Payout Date' }, { key: 'step', label: 'Step' },
          { key: 'state', label: 'Done' }, { key: 'by', label: 'By' }, { key: 'at', label: 'When' },
        ],
        rows: readPayrollRuns(scope).filter(run => run.status !== 'Cancelled').flatMap(run => steps.map(([step, pattern]) => {
          const entry = [...(run.audit || [])].reverse().find(item => pattern.test(item.action || ''));
          return { key: `${run.id}-${step}`, transactionNumber: run.transactionNumber, payoutDate: run.payoutDate, step, state: entry ? 'Done' : 'Pending', by: entry?.actor || '', at: entry?.at || '' };
        })),
      };
    },
  },
  'RPT-CLA-330': {
    source: 'Companies and access grants',
    build: () => ({
      columns: [
        { key: 'company', label: 'Client' }, { key: 'companyCode', label: 'Company Code' }, { key: 'user', label: 'Assigned User' },
        { key: 'role', label: 'Role' }, { key: 'module', label: 'Module' }, { key: 'permission', label: 'Access' }, { key: 'status', label: 'Status' },
      ],
      rows: readCompanies().flatMap(company => {
        const grants = readGrants(company.companyId);
        const base = { company: company.displayName || company.name, companyCode: company.companyCode || company.companyId };
        return grants.length
          ? grants.map(grant => ({ key: `${company.companyId}-${grant.id}`, ...base, user: grant.user, role: grant.role, module: grant.module, permission: grant.permission, status: grant.status }))
          : [{ key: `${company.companyId}-none`, ...base, user: 'No one assigned', role: '', module: '', permission: '', status: '' }];
      }),
    }),
  },
};

/**
 * "All government forms" is a package, not a report of its own: every
 * statutory and remittance report the posted payroll can answer, in one file.
 */
const BUNDLE_REPORTS = {
  'RPT-GOV-220': report => ['Statutory', 'Remittance'].includes(report.category) && Boolean(PAYROLL_BACKED_REPORTS[report.reportKey]),
};

/**
 * The posted transactions whose payout date falls inside the report window.
 * A report never reads an open or rejected run: those figures can still change.
 */
function postedRunsIn(scope, from, to) {
  return readPayrollRuns(scope)
    .filter(run => ['Posted', 'Locked'].includes(run.status) && run.result)
    .filter(run => (!from || run.payoutDate >= from) && (!to || run.payoutDate <= to))
    .sort((left, right) => String(left.payoutDate).localeCompare(String(right.payoutDate)));
}

/** The rows a payroll-backed report produces across every run in the window. */
function payrollReportRows(scope, reportKey, from, to) {
  const definition = payrollReport(PAYROLL_BACKED_REPORTS[reportKey]);
  const runs = postedRunsIn(scope, from, to);
  const hrmData = readHrmData(scope);
  let lastContext = {};
  const perRun = runs.flatMap(run => {
    const context = { ...buildPayrollContext({ companyId: scope, run, hrmData }), serviceConfig: { deductions: readServiceConfiguration('deductions', scope) } };
    lastContext = context;
    return definition.build(run.result, context).map(row => ({ ...row, transactionNumber: run.transactionNumber, payoutDate: run.payoutDate }));
  });
  // A per-employee (or per-month, per-agency) report rolls the runs up; the
  // others list each run's rows under the transaction they came from.
  if (definition.perEmployee) {
    const rows = aggregateReportRows(definition, perRun, lastContext);
    const columns = [...definition.columns, { key: 'runs', label: 'Runs' }];
    return { definition, columns, rows, runs, totals: reportTotals(definition, rows) };
  }
  const columns = [
    { key: 'transactionNumber', label: 'Payroll Transaction' },
    { key: 'payoutDate', label: 'Payout Date' },
    ...definition.columns,
  ];
  return { definition, columns, rows: perRun, runs, totals: reportTotals(definition, perRun) };
}

const readRuns = scope => { try { const saved = JSON.parse(localStorage.getItem('atlas-report-runs-v2')); return Array.isArray(saved) ? saved.filter(item => item.companyId === scope) : []; } catch { return []; } };
const writeRuns = (rows, scope) => { let saved = []; try { saved = JSON.parse(localStorage.getItem('atlas-report-runs-v2')) || []; } catch { saved = []; } localStorage.setItem('atlas-report-runs-v2', JSON.stringify([...rows, ...saved.filter(item => item.companyId !== scope)])); };
const Field = ({ label, value, onChange, type = 'text', options }) => <label className="canonical-form-field">{label}{options ? <select value={value || ''} onChange={event => onChange(event.target.value)}>{options.map(option => <option key={option}>{option}</option>)}</select> : (type === 'date' ? <DateInput value={value || ''} onChange={onChange} /> : <input type={type} value={value || ''} onChange={event => onChange(event.target.value)} />)}</label>;

export function EnhancedReportShellWorkspace({ onBack, notify }) {
  const scope = companyId();
  const reports = phase2ReportCatalog;
  const [runs, setRuns] = useState(() => readRuns(scope));
  const [selected, setSelected] = useState(reports.find(report => report.category === 'Payroll'));
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('Payroll');
  const [params, setParams] = useState({ dateFrom: '2026-08-01', dateTo: '2026-08-31', employeeGroup: 'All Employees', agency: 'All agencies', grouping: 'Employee', format: 'PDF', delivery: 'Download' });
  const protection = readReportProtection(scope);
  const categories = ['All categories', ...new Set(reports.map(report => report.category))];
  const filtered = useMemo(() => reports.filter(report => (category === 'All categories' || report.category === category) && `${report.name} ${report.category} ${report.featureRef}`.toLowerCase().includes(query.toLowerCase())), [reports, category, query]);
  const availableFormats = selected?.formats.split(',').map(value => value.trim()) || ['PDF'];
  const chooseReport = report => { setSelected(report); setParams(previous => ({ ...previous, format: report.formats.split(',')[0].trim() })); };
  // A run records what it actually produced: which posted transactions it read
  // and how many rows came out, so "Generated" is a claim the row can support.
  const makeRun = (report, index = 0) => ({ id: `run-${Date.now()}-${index}`, companyId: scope, reportKey: report.reportKey, reportVersion: 1, ...payrollEvidence(report), parameters: { ...params, format: report.formats.split(',').map(value => value.trim()).includes(params.format) ? params.format : report.formats.split(',')[0].trim() }, dataAsOf: new Date().toISOString(), status: 'Generated', artifactRef: `artifact://${scope}/${report.reportKey}/${Date.now()}-${index}`, protectionSecretRef: protection.enabled ? protection.defaultSecretRef : '', delivery: params.delivery, createdAt: new Date().toISOString() });
  const bundleMembers = report => (BUNDLE_REPORTS[report.reportKey] ? reports.filter(BUNDLE_REPORTS[report.reportKey]) : []);
  const payrollEvidence = report => {
    if (BUNDLE_REPORTS[report.reportKey]) {
      const parts = bundleMembers(report).map(member => payrollReportRows(scope, member.reportKey, params.dateFrom, params.dateTo));
      return {
        dataSource: 'Posted payroll transactions (government forms package)',
        rowCount: parts.reduce((total, part) => total + part.rows.length, 0),
        sourceTransactions: [...new Set(parts.flatMap(part => part.runs.map(item => item.transactionNumber)))],
      };
    }
    if (OTHER_BACKED_REPORTS[report.reportKey]) {
      const { rows } = OTHER_BACKED_REPORTS[report.reportKey].build(scope);
      return { dataSource: OTHER_BACKED_REPORTS[report.reportKey].source, rowCount: rows.length, sourceTransactions: [] };
    }
    if (!PAYROLL_BACKED_REPORTS[report.reportKey]) return { dataSource: 'Not implemented in this prototype', rowCount: 0, sourceTransactions: [] };
    const { rows, runs: sourceRuns } = payrollReportRows(scope, report.reportKey, params.dateFrom, params.dateTo);
    return {
      dataSource: 'Posted payroll transactions',
      rowCount: rows.length,
      sourceTransactions: sourceRuns.map(item => item.transactionNumber),
    };
  };

  const cell = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const csvLines = ({ columns, rows, totals }) => {
    const body = rows.map(row => columns.map(column => cell(row[column.key])).join(','));
    if (totals) body.push(columns.map((column, index) => cell(index === 0 ? 'GRAND TOTAL' : totals[column.key] ?? '')).join(','));
    return [columns.map(column => cell(column.label)).join(','), ...body];
  };

  /**
   * A BIR text file in the alphalist / QAP layout: a header naming the form,
   * the employer TIN and the period, one detail line per payee, and a control
   * line with the count and the money totals.
   */
  const datFile = (report, { definition, columns, rows, totals }) => {
    const tin = String(readActiveCompany()?.tin || readActiveCompany()?.taxIdentificationNumber || '').replace(/\D/g, '');
    const plain = value => String(value ?? '').replaceAll(',', ' ');
    const moneyColumns = columns.filter(column => column.money);
    return [
      ['H', definition.dat, tin, params.dateFrom, params.dateTo].join(','),
      ...rows.map(row => ['D', definition.dat, ...columns.filter(column => column.key !== 'runs').map(column => (column.money ? Number(row[column.key] || 0).toFixed(2) : plain(row[column.key])))].join(',')),
      ['C', definition.dat, rows.length, ...moneyColumns.map(column => Number(totals?.[column.key] || 0).toFixed(2))].join(','),
    ].join('\n');
  };

  /** A payroll-backed report downloads its real rows, closed by a grand total. */
  const downloadPayrollReport = report => {
    const stem = `${report.reportKey}-${params.dateFrom}-to-${params.dateTo}`;
    if (OTHER_BACKED_REPORTS[report.reportKey]) {
      const part = OTHER_BACKED_REPORTS[report.reportKey].build(scope);
      if (!part.rows.length) return false;
      downloadFile(`${stem}.csv`, csvLines({ ...part, totals: null }).join('\n'), 'text/csv');
      return true;
    }
    if (BUNDLE_REPORTS[report.reportKey]) {
      const sections = bundleMembers(report)
        .map(member => ({ member, part: payrollReportRows(scope, member.reportKey, params.dateFrom, params.dateTo) }))
        .filter(({ part }) => part.rows.length);
      if (!sections.length) return false;
      downloadFile(`${stem}.csv`, sections.flatMap(({ member, part }) => [cell(`${member.name} (${member.reportKey})`), ...csvLines(part), '']).join('\n'), 'text/csv');
      return true;
    }
    const part = payrollReportRows(scope, report.reportKey, params.dateFrom, params.dateTo);
    if (!part.rows.length) return false;
    if (params.format === 'DAT' && part.definition.dat) {
      downloadFile(`${stem}.dat`, datFile(report, part), 'text/plain');
      return true;
    }
    downloadFile(`${stem}.csv`, csvLines(part).join('\n'), 'text/csv');
    return true;
  };

  const persistRuns = generated => { const updated = [...generated, ...runs]; setRuns(updated); writeRuns(updated, scope); };
  const auditRun = (report, item) => { appendAuditEvent({ companyId: scope, actor: 'John Doe', action: 'ReportGenerated', entityType: 'ReportRun', entityId: item.id, correlationId: item.id, summary: `${report.reportKey} generated for ${params.dateFrom} to ${params.dateTo}.` }); if (params.delivery !== 'Download') publishNotificationEvent({ eventKey: 'ReportGenerated', companyId: scope, correlationId: item.id, summary: `${report.name} delivery link queued for authorized contacts.`, actor: 'John Doe' }); };
  const run = event => {
    event.preventDefault();
    if (!selected || !params.dateFrom || !params.dateTo || params.dateFrom > params.dateTo) return notify({ type: 'error', message: 'Choose a report and a valid date range.' });
    if (!availableFormats.includes(params.format)) return notify({ type: 'error', message: `Choose one of the supported formats: ${availableFormats.join(', ')}.` });
    const item = makeRun(selected);
    persistRuns([item]); auditRun(selected, item);
    if (OTHER_BACKED_REPORTS[selected.reportKey]) {
      if (!item.rowCount) return notify({ type: 'error', message: `${selected.name} has nothing to report yet.` });
      if (params.delivery === 'Download') downloadPayrollReport(selected);
      return notify({ type: 'success', message: `${selected.name} generated from ${item.dataSource.toLowerCase()} — ${item.rowCount} ${plural(item.rowCount, 'row')}${params.delivery === 'Download' ? ' downloaded' : ' queued for secure link delivery'}.` });
    }
    if (PAYROLL_BACKED_REPORTS[selected.reportKey] || BUNDLE_REPORTS[selected.reportKey]) {
      if (!item.rowCount) return notify({ type: 'error', message: `No posted payroll transaction pays out between ${params.dateFrom} and ${params.dateTo}, so ${selected.name} has nothing to report.` });
      if (params.delivery === 'Download') downloadPayrollReport(selected);
      return notify({ type: 'success', message: `${selected.name} generated from ${item.sourceTransactions.join(', ')} — ${item.rowCount} ${plural(item.rowCount, 'row')}${params.delivery === 'Download' ? ' downloaded' : ' queued for secure link delivery'}.` });
    }
    notify({ type: 'success', message: `${selected.name} generated${params.delivery === 'Download' ? '' : ' and queued for secure link delivery'}. Its data source is not implemented in this prototype, so the run records the request rather than the rows.` });
  };
  const generateVisible = () => {
    if (!filtered.length) return;
    const generated = filtered.map(makeRun);
    persistRuns(generated); generated.forEach((item, index) => auditRun(filtered[index], item));
    notify({ type: 'success', message: `${generated.length} ${plural(generated.length, 'report')} generated as a protected grouped package.` });
  };
  const exportRuns = () => downloadFile('report-run-history.csv', ['Run,Report,From,To,Format,Delivery,Status,Data As Of', ...runs.map(item => [item.id, item.reportKey, item.parameters.dateFrom, item.parameters.dateTo, item.parameters.format, item.delivery, item.status, item.dataAsOf].map(value => `"${String(value || '').replaceAll('"', '""')}"`).join(','))].join('\n'), 'text/csv');

  return <div className="page-content operational-workspace canonical-workspace">
    <button className="inline-back" onClick={onBack}><ArrowLeft /> Back</button>
    <div className="page-heading"><div><p className="breadcrumb">Atlas / Reports</p><h1>Reports</h1><p className="page-description">Generate Phase 2 payroll, employee, time, accounting, statutory, remittance and billing outputs backed by implemented Atlas data sources.</p></div><span className="controlled-badge"><ShieldCheck /> Phase 2 Report Catalog + Run service</span></div>
    <div className="canonical-toolbar"><div><strong>{reports.length}</strong><span> available {plural(reports.length, 'report')}</span></div><div className="toolbar-spacer" /><button className="button secondary" onClick={generateVisible}><FileText /> Generate visible ({filtered.length})</button><button className="button secondary" onClick={exportRuns}><DownloadSimple /> Export run history</button></div>
    <div className="config-toolbar"><div className="search-box"><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search report or HTP feature..." /><MagnifyingGlass /></div><label className="toolbar-select">Category<select value={category} onChange={event => setCategory(event.target.value)}>{categories.map(item => <option key={item}>{item}</option>)}</select></label></div>
    <div className="canonical-role-grid">{filtered.map(report => <button key={report.reportKey} className={`canonical-role-card ${selected?.reportKey === report.reportKey ? 'selected' : ''}`} onClick={() => chooseReport(report)}><strong>{report.name}</strong><small>{report.category} · {report.formats}</small><span>{report.featureRef} · {report.requiredPermission}</span>{(PAYROLL_BACKED_REPORTS[report.reportKey] || BUNDLE_REPORTS[report.reportKey]) && <em className="status-pill active">Reads posted payroll</em>}{OTHER_BACKED_REPORTS[report.reportKey] && <em className="status-pill active">Reads {OTHER_BACKED_REPORTS[report.reportKey].source.toLowerCase()}</em>}</button>)}</div>
    {!filtered.length && <div className="empty-state"><MagnifyingGlass /><h3>No reports found</h3><p>Try a different report name, category or HTP feature number.</p></div>}
    <section className="canonical-card"><div className="canonical-card-header"><div><h2>Run {selected?.name}</h2><p>All outputs use approved parameters, immutable data-as-of metadata and the selected company scope.</p></div><span className="status-pill active">{protection.enabled ? 'Protected artifact' : 'Standard artifact'}</span></div><form onSubmit={run}><div className="canonical-form-grid"><Field label="Date from" type="date" value={params.dateFrom} onChange={value => setParams({ ...params, dateFrom: value })} /><Field label="Date to" type="date" value={params.dateTo} onChange={value => setParams({ ...params, dateTo: value })} /><Field label="Employee group" value={params.employeeGroup} onChange={value => setParams({ ...params, employeeGroup: value })} options={['All Employees', 'Rank and File', 'Managers', 'Custom Group']} /><Field label="Agency" value={params.agency} onChange={value => setParams({ ...params, agency: value })} options={['All agencies', 'BIR', 'SSS', 'PhilHealth', 'HDMF']} /><Field label="Group output by" value={params.grouping} onChange={value => setParams({ ...params, grouping: value })} options={['Employee', 'Department', 'Section', 'Position', 'Cost Center']} /><Field label="Format" value={params.format} onChange={value => setParams({ ...params, format: value })} options={availableFormats} /><Field label="Delivery" value={params.delivery} onChange={value => setParams({ ...params, delivery: value })} options={['Download', 'Authorized Contacts (secure email link)']} /></div><div className="canonical-actions"><button className="button primary"><FileText /> Generate report</button></div></form></section>
    <section className="canonical-card"><div className="canonical-card-header"><div><h2>Generated artifacts</h2><p>Reruns create new immutable artifacts. Bulk generation retains one row per report in the grouped package.</p></div></div><div className="table-card canonical-inner-table"><table><thead><tr><th>Run</th><th>Report</th><th>Date range</th><th>Source</th><th>Rows</th><th>Format / delivery</th><th>Status</th><th>Protection</th></tr></thead><tbody>{runs.map(item => <tr key={item.id}><td><code>{item.id}</code><small>{String(item.createdAt).replace('T', ' ').slice(0, 16)}</small></td><td>{item.reportKey}</td><td>{item.parameters.dateFrom} to {item.parameters.dateTo}</td><td>{(item.sourceTransactions || []).join(', ') || item.dataSource || '\u2014'}</td><td>{item.rowCount ?? '\u2014'}</td><td>{item.parameters.format}<small>{item.delivery}</small></td><td>{item.status}</td><td>{item.protectionSecretRef || 'None'}</td></tr>)}</tbody></table></div></section>
  </div>;
}

