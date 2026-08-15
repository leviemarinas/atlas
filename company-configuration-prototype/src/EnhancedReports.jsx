import { useMemo, useState } from 'react';
import { ArrowLeft, DownloadSimple, FileText, MagnifyingGlass, ShieldCheck } from '@phosphor-icons/react';
import { appendAuditEvent, readActiveCompanyId } from './companyRepository';
import { readReportProtection } from './securityServices';
import { publishNotificationEvent } from './notificationServices';
import { downloadFile } from './fileDownload';
import { plural } from './textFormat';

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
  ['RPT-AUD-001', 'Audit Log', 'Audit', 'PDF, Excel, CSV', 'Audit.View', 'Functional'],
].map(([reportKey, name, category, formats, requiredPermission, featureRef]) => ({ reportKey, name, category, formats, requiredPermission, featureRef, status: 'Active' }));

const companyId = () => readActiveCompanyId();
const readRuns = scope => { try { const saved = JSON.parse(localStorage.getItem('atlas-report-runs-v2')); return Array.isArray(saved) ? saved.filter(item => item.companyId === scope) : []; } catch { return []; } };
const writeRuns = (rows, scope) => { let saved = []; try { saved = JSON.parse(localStorage.getItem('atlas-report-runs-v2')) || []; } catch { saved = []; } localStorage.setItem('atlas-report-runs-v2', JSON.stringify([...rows, ...saved.filter(item => item.companyId !== scope)])); };
const Field = ({ label, value, onChange, type = 'text', options }) => <label className="canonical-form-field">{label}{options ? <select value={value || ''} onChange={event => onChange(event.target.value)}>{options.map(option => <option key={option}>{option}</option>)}</select> : <input type={type} value={value || ''} onChange={event => onChange(event.target.value)} />}</label>;

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
  const makeRun = (report, index = 0) => ({ id: `run-${Date.now()}-${index}`, companyId: scope, reportKey: report.reportKey, reportVersion: 1, parameters: { ...params, format: report.formats.split(',').map(value => value.trim()).includes(params.format) ? params.format : report.formats.split(',')[0].trim() }, dataAsOf: new Date().toISOString(), status: 'Generated', artifactRef: `artifact://${scope}/${report.reportKey}/${Date.now()}-${index}`, protectionSecretRef: protection.enabled ? protection.defaultSecretRef : '', delivery: params.delivery, createdAt: new Date().toISOString() });
  const persistRuns = generated => { const updated = [...generated, ...runs]; setRuns(updated); writeRuns(updated, scope); };
  const auditRun = (report, item) => { appendAuditEvent({ companyId: scope, actor: 'John Doe', action: 'ReportGenerated', entityType: 'ReportRun', entityId: item.id, correlationId: item.id, summary: `${report.reportKey} generated for ${params.dateFrom} to ${params.dateTo}.` }); if (params.delivery !== 'Download') publishNotificationEvent({ eventKey: 'ReportGenerated', companyId: scope, correlationId: item.id, summary: `${report.name} delivery link queued for authorized contacts.`, actor: 'John Doe' }); };
  const run = event => {
    event.preventDefault();
    if (!selected || !params.dateFrom || !params.dateTo || params.dateFrom > params.dateTo) return notify({ type: 'error', message: 'Choose a report and a valid date range.' });
    if (!availableFormats.includes(params.format)) return notify({ type: 'error', message: `Choose one of the supported formats: ${availableFormats.join(', ')}.` });
    const item = makeRun(selected);
    persistRuns([item]); auditRun(selected, item);
    notify({ type: 'success', message: `${selected.name} generated${params.delivery === 'Download' ? '' : ' and queued for secure link delivery'}.` });
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
    <div className="canonical-role-grid">{filtered.map(report => <button key={report.reportKey} className={`canonical-role-card ${selected?.reportKey === report.reportKey ? 'selected' : ''}`} onClick={() => chooseReport(report)}><strong>{report.name}</strong><small>{report.category} · {report.formats}</small><span>{report.featureRef} · {report.requiredPermission}</span></button>)}</div>
    {!filtered.length && <div className="empty-state"><MagnifyingGlass /><h3>No reports found</h3><p>Try a different report name, category or HTP feature number.</p></div>}
    <section className="canonical-card"><div className="canonical-card-header"><div><h2>Run {selected?.name}</h2><p>All outputs use approved parameters, immutable data-as-of metadata and the selected company scope.</p></div><span className="status-pill active">{protection.enabled ? 'Protected artifact' : 'Standard artifact'}</span></div><form onSubmit={run}><div className="canonical-form-grid"><Field label="Date from" type="date" value={params.dateFrom} onChange={value => setParams({ ...params, dateFrom: value })} /><Field label="Date to" type="date" value={params.dateTo} onChange={value => setParams({ ...params, dateTo: value })} /><Field label="Employee group" value={params.employeeGroup} onChange={value => setParams({ ...params, employeeGroup: value })} options={['All Employees', 'Rank and File', 'Managers', 'Custom Group']} /><Field label="Agency" value={params.agency} onChange={value => setParams({ ...params, agency: value })} options={['All agencies', 'BIR', 'SSS', 'PhilHealth', 'HDMF']} /><Field label="Group output by" value={params.grouping} onChange={value => setParams({ ...params, grouping: value })} options={['Employee', 'Department', 'Section', 'Position', 'Cost Center']} /><Field label="Format" value={params.format} onChange={value => setParams({ ...params, format: value })} options={availableFormats} /><Field label="Delivery" value={params.delivery} onChange={value => setParams({ ...params, delivery: value })} options={['Download', 'Authorized Contacts (secure email link)']} /></div><div className="canonical-actions"><button className="button primary"><FileText /> Generate report</button></div></form></section>
    <section className="canonical-card"><div className="canonical-card-header"><div><h2>Generated artifacts</h2><p>Reruns create new immutable artifacts. Bulk generation retains one row per report in the grouped package.</p></div></div><div className="table-card canonical-inner-table"><table><thead><tr><th>Run</th><th>Report</th><th>Date range</th><th>Format / delivery</th><th>Status</th><th>Protection</th></tr></thead><tbody>{runs.map(item => <tr key={item.id}><td><code>{item.id}</code><small>{String(item.createdAt).replace('T', ' ').slice(0, 16)}</small></td><td>{item.reportKey}</td><td>{item.parameters.dateFrom} to {item.parameters.dateTo}</td><td>{item.parameters.format}<small>{item.delivery}</small></td><td>{item.status}</td><td>{item.protectionSecretRef || 'None'}</td></tr>)}</tbody></table></div></section>
  </div>;
}

