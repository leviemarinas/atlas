/**
 * Employee Offboarding Suite (Part 6):
 * - Employee Clearance & Checklist Hub
 *   1. Employee Clearance Application (+ Apply modal, See Checklist, View modal)
 *   2. Employee Clearance Approval (Assign Checklist, Approve/Reject review modals)
 *   3. Employee Clearance Management (Master tracking across statuses)
 *   4. Offboarding Checklist Management (Template CRUD: Add, Edit, Delete modals)
 * - Employee Final Quit Claim (Lifecycle: Pending -> For Action -> Accepted -> For Release -> Released)
 *   - Create Quit Claim (File Upload vs Manual Input + Recipient Information modal)
 *   - Mark for Release & Release Final Pay
 *   - Interactive Employee Submission Portal (Email & Form verification flow)
 */

import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle,
  ClipboardText,
  Clock,
  DownloadSimple,
  DotsThreeVertical,
  EnvelopeSimple,
  Eye,
  FileDoc,
  FilePdf,
  FileText,
  FileXls,
  Funnel,
  ListChecks,
  ListNumbers,
  MagnifyingGlass,
  Paperclip,
  PencilSimple,
  Plus,
  Printer,
  ShieldCheck,
  Trash,
  UploadSimple,
  User,
  UserMinus,
  Users,
  Warning,
  X,
} from '@phosphor-icons/react';
import {
  Breadcrumbs,
  DataTable,
  DetailList,
  DocumentViewerModal,
  EmployeeBanner,
  EmptyState,
  ExportMenu,
  Field,
  FilterButton,
  FilterDrawer,
  GhostButton,
  Modal,
  PageHeading,
  Pagination,
  PrimaryButton,
  SearchInput,
  StatCard,
  StatCardRow,
  StatusPill,
  StatusTabs,
  StatusText,
  formatCell,
  formatDate,
  initialsOf,
  paginate,
  shortStatus,
  useTableState,
} from './HRMKit.jsx';
import { downloadFile } from './fileDownload.js';
import { openQuitClaimForClearance } from './hrmPosting.js';

const today = () => new Date().toISOString().slice(0, 10);

const toCsv = (headers, rows) => [headers.join(','), ...rows.map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');

/* ----------------------------------------------------------------- Sidebar */

export function OffboardingSidebar({ subView = 'clearance-checklist', onSelectSubView, onBack }) {
  const menuItems = [
    { key: 'clearance-checklist', label: 'Employee Clearance & Checklist', icon: ListChecks },
    { key: 'final-quit-claim', label: 'Employee Final Quit Claim', icon: FileDoc },
  ];

  return <aside className="hrm-ss-sidebar">
    <button type="button" className="hrm-ss-back" onClick={onBack}><ArrowLeft size={14} /> Back to HRM</button>
    <h2>Employee<br />Offboarding</h2>
    <nav aria-label="Offboarding navigation">
      {menuItems.map(item => {
        const Icon = item.icon;
        const isActive = subView === item.key;
        return (
          <button
            key={item.key}
            type="button"
            className={isActive ? 'selected' : ''}
            onClick={() => onSelectSubView(item.key)}
          >
            <Icon size={15} />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  </aside>;
}

/* ========================================================================= */
/* 1. Employee Clearance & Checklist Module                                  */
/* ========================================================================= */

function ClearanceChecklistDashboard({ access, onNavigate }) {
  const isEmployee = access?.role === 'employee';
  const cards = [
    { key: 'clearance-application', title: 'Employee Clearance Application', description: 'Submit and track employee exit clearance requests.' },
    ...(!isEmployee ? [
      { key: 'clearance-approval', title: 'Employee Clearance Approval', description: 'Assign offboarding checklists and approve/reject clearance submissions.' },
      { key: 'clearance-management', title: 'Employee Clearance Management', description: 'Monitor master clearance records and separation status across departments.' },
      { key: 'offboarding-checklist-management', title: 'Offboarding Checklist Management', description: 'Configure master offboarding tasks and operational checklist templates.' },
    ] : []),
  ];

  return <div className="hrm-ss-content">
    <PageHeading title="Employee Clearance &amp; Checklist" />

    <div style={{ display: 'grid', gridTemplateColumns: isEmployee ? '1fr' : 'repeat(2, 1fr)', gap: 20, marginTop: 10 }}>
      {cards.map(c => (
        <div
          key={c.key}
          onClick={() => onNavigate(c.key)}
          style={{
            background: '#fff',
            border: '1px solid var(--border-color)',
            borderRadius: 10,
            padding: '24px 28px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            transition: 'all .15s ease',
            boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
          }}
          onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--violet)'}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-color)'}
        >
          <div>
            <h3 style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 700, color: '#1e293b' }}>{c.title}</h3>
            <p style={{ margin: 0, fontSize: 11, color: '#64748b', lineHeight: 1.4 }}>{c.description}</p>
          </div>
          <ArrowRight size={20} color="var(--violet)" />
        </div>
      ))}
    </div>
  </div>;
}

/* ------------------------------------------- 1.1 Clearance Application */

function ApplyClearanceModal({ onApply, onClose }) {
  const [appDate, setAppDate] = useState('04/23/2025');
  const [empCode, setEmpCode] = useState('0011223345');
  const [requester, setRequester] = useState('John Collins Doe');
  const [jobTitle, setJobTitle] = useState('Sr. Software Developer');
  const [division, setDivision] = useState('Product Development');
  const [department, setDepartment] = useState('IT Department');

  function handleSubmit(e) {
    e.preventDefault();
    onApply({
      applicationDate: appDate,
      employeeCode: empCode,
      employeeName: requester,
      requester,
      jobTitle,
      division,
      department,
      effectivityDate: '04/30/2025',
      filedBy: requester,
      actionedBy: '-',
      approverRemarks: '-',
      status: 'Pending',
      statusDate: appDate,
      checklist: [],
      submittedFiles: [],
    });
  }

  return <div className="hrm-modal-backdrop" role="dialog" aria-modal="true">
    <div className="hrm-modal-card" style={{ maxWidth: 460 }}>
      <div className="hrm-modal-header">
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--violet)' }}>Apply for Employee Clearance</h3>
        <button type="button" className="hrm-icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '16px 0' }}>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#334155', marginBottom: 4 }}>Application Date</label>
          <input
            type="text"
            value={appDate}
            onChange={e => setAppDate(e.target.value)}
            style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border-color)', fontSize: 11 }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#334155', marginBottom: 4 }}>Employee Code *</label>
          <input
            type="text"
            value={empCode}
            onChange={e => setEmpCode(e.target.value)}
            required
            style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border-color)', fontSize: 11 }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#334155', marginBottom: 4 }}>Requester *</label>
          <input
            type="text"
            value={requester}
            onChange={e => setRequester(e.target.value)}
            required
            style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border-color)', fontSize: 11 }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#334155', marginBottom: 4 }}>Job Title *</label>
          <input
            type="text"
            value={jobTitle}
            onChange={e => setJobTitle(e.target.value)}
            required
            style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border-color)', fontSize: 11 }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#334155', marginBottom: 4 }}>Division *</label>
          <input
            type="text"
            value={division}
            onChange={e => setDivision(e.target.value)}
            required
            style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border-color)', fontSize: 11 }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#334155', marginBottom: 4 }}>Department *</label>
          <input
            type="text"
            value={department}
            onChange={e => setDepartment(e.target.value)}
            required
            style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border-color)', fontSize: 11 }}
          />
        </div>

        <div className="hrm-modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, borderTop: '1px solid var(--border-color)', paddingTop: 14, marginTop: 6 }}>
          <GhostButton onClick={onClose}>Cancel</GhostButton>
          <PrimaryButton type="submit">Submit</PrimaryButton>
        </div>
      </form>
    </div>
  </div>;
}

function ViewClearanceApplicationModal({ clearance, onClose, onPreviewFile }) {
  return <div className="hrm-modal-backdrop" role="dialog" aria-modal="true">
    <div className="hrm-modal-card" style={{ maxWidth: 480 }}>
      <div className="hrm-modal-header">
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--violet)' }}>View Clearance Application</h3>
        <button type="button" className="hrm-icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
      </div>

      <div className="hrm-modal-body" style={{ padding: '16px 0', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#334155' }}>Application Date</label>
          <span style={{ fontSize: 11, color: '#64748b' }}>{clearance.applicationDate}</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, borderTop: '1px solid #f1f5f9', paddingTop: 10 }}>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#334155' }}>Employee Name</label>
            <span style={{ fontSize: 11, color: '#64748b' }}>{clearance.employeeName}</span>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#334155' }}>Employee Code</label>
            <span style={{ fontSize: 11, color: '#64748b' }}>{clearance.employeeCode}</span>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#334155' }}>Department</label>
            <span style={{ fontSize: 11, color: '#64748b' }}>{clearance.department}</span>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#334155' }}>Division</label>
            <span style={{ fontSize: 11, color: '#64748b' }}>{clearance.division}</span>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#334155' }}>Job Title</label>
            <span style={{ fontSize: 11, color: '#64748b' }}>{clearance.jobTitle}</span>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#334155' }}>Effectivity Date</label>
            <span style={{ fontSize: 11, color: '#64748b' }}>{clearance.effectivityDate}</span>
          </div>
        </div>

        {clearance.submittedFiles?.length > 0 && (
          <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 10 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#334155', marginBottom: 6 }}>Submitted File</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {clearance.submittedFiles.map(file => (
                <div key={file.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: '#f8fafc', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 11 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <FileDoc size={16} color="var(--violet)" />
                    <span>{file.name}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <button type="button" onClick={() => onPreviewFile?.(file.name)} style={{ border: 'none', background: 'none', color: 'var(--violet)', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>Preview</button>
                    <span style={{ fontSize: 10, color: '#94a3b8' }}>{file.size}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, borderTop: '1px solid #f1f5f9', paddingTop: 10 }}>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#334155' }}>Filed By</label>
            <span style={{ fontSize: 11, color: '#64748b' }}>{clearance.filedBy || '-'}</span>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#334155' }}>Actioned By</label>
            <span style={{ fontSize: 11, color: '#64748b' }}>{clearance.actionedBy || '-'}</span>
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#334155' }}>Approver Remarks</label>
            <span style={{ fontSize: 11, color: '#64748b' }}>{clearance.approverRemarks || '-'}</span>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#334155' }}>Status</label>
            <span style={{ fontSize: 11, fontWeight: 700, color: clearance.status === 'Approved' ? '#16a34a' : clearance.status === 'Rejected' ? '#dc2626' : 'var(--violet)' }}>
              {clearance.status}
            </span>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#334155' }}>Status Date</label>
            <span style={{ fontSize: 11, color: '#64748b' }}>{clearance.statusDate}</span>
          </div>
        </div>
      </div>

      <div className="hrm-modal-footer" style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <GhostButton onClick={onClose}>Close</GhostButton>
      </div>
    </div>
  </div>;
}

function ClearanceChecklistScreen({ clearance, onBack, onUpdateChecklist, onNotify }) {
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [items, setItems] = useState(clearance.checklist?.length ? clearance.checklist : [
    { id: 'chk-1', title: 'Set a meeting with the employee', done: false },
    { id: 'chk-2', title: 'Inform team members', done: false },
    { id: 'chk-3', title: 'Inform relevant departments', done: false },
    { id: 'chk-4', title: 'Scheduled meeting with the newly hired replacement', done: false },
    { id: 'chk-5', title: 'Training new employee', done: false },
    { id: 'chk-6', title: 'Share important contacts & resources', done: false },
    { id: 'chk-7', title: 'Recover asset - Laptop', done: false },
    { id: 'chk-8', title: 'Recover asset - Access (Drive)', done: false },
  ]);

  function toggleItem(id) {
    const next = items.map(it => it.id === id ? { ...it, done: !it.done } : it);
    setItems(next);
  }

  function handleUploadComplete() {
    onUpdateChecklist({ ...clearance, status: 'For Review', checklist: items, submittedFiles: [{ name: 'clearance-checklist-signed.pdf', size: '1.8MB' }] });
    setUploadModalOpen(false);
    onNotify('Checklist sent successfully!');
  }

  return <div className="hrm-ss-content">
    <Breadcrumbs items={[
      { label: 'Employee Clearance & Checklist', onClick: onBack },
      { label: 'Employee Clearance Application', onClick: onBack },
      { label: 'Clearance Checklist' },
    ]} />

    <PageHeading title="Clearance Checklist" />

    {/* Employee Banner */}
    <div style={{ background: 'linear-gradient(135deg, #441a6b, #6b21a8)', borderRadius: 10, padding: '20px 24px', color: '#fff', display: 'flex', alignItems: 'center', gap: 20, marginBottom: 20 }}>
      <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'grid', placeItems: 'center', fontSize: 20, fontWeight: 700 }}>
        {initialsOf(clearance.employeeName)}
      </div>
      <div>
        <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{clearance.employeeName} ({clearance.employeeCode})</h3>
        <p style={{ margin: '4px 0 0', fontSize: 11, opacity: 0.9 }}>{clearance.jobTitle} | {clearance.department}</p>
        <span style={{ display: 'inline-block', marginTop: 4, fontSize: 10, opacity: 0.8 }}>Application Date: {clearance.applicationDate}</span>
      </div>
    </div>

    {/* Toolbar */}
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginBottom: 14 }}>
      <button
        type="button"
        className="hrm-btn primary"
        onClick={() => setUploadModalOpen(true)}
      >
        <UploadSimple size={14} /> Upload
      </button>
      <button
        type="button"
        className="hrm-btn outline"
        onClick={() => window.print()}
      >
        <Printer size={14} /> Print
      </button>
    </div>

    {/* Checklist items */}
    <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: 10, overflow: 'hidden' }}>
      {items.map((item, idx) => (
        <div
          key={item.id || idx}
          onClick={() => toggleItem(item.id)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            padding: '14px 20px',
            borderBottom: idx < items.length - 1 ? '1px solid #f1f5f9' : 'none',
            cursor: 'pointer',
            background: item.done ? '#faf5ff' : '#fff',
            transition: 'background .12s ease',
          }}
        >
          <div style={{
            width: 22,
            height: 22,
            borderRadius: '50%',
            border: item.done ? 'none' : '2px solid #cbd5e1',
            background: item.done ? 'var(--violet)' : 'transparent',
            display: 'grid',
            placeItems: 'center',
            color: '#fff',
            flexShrink: 0,
          }}>
            {item.done && <Check size={13} weight="bold" />}
          </div>
          <span style={{ fontSize: 12, fontWeight: 500, color: item.done ? '#1e293b' : '#475569' }}>
            {item.title}
          </span>
        </div>
      ))}
    </div>

    {/* Upload Modal */}
    {uploadModalOpen && <div className="hrm-modal-backdrop" role="dialog" aria-modal="true">
      <div className="hrm-modal-card" style={{ maxWidth: 440 }}>
        <div className="hrm-modal-header">
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--violet)' }}>Upload Clearance Checklist</h3>
          <button type="button" className="hrm-icon-btn" onClick={() => setUploadModalOpen(false)} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="hrm-modal-body" style={{ padding: '20px 0' }}>
          <div style={{ border: '2px dashed var(--border-color)', borderRadius: 8, padding: '36px 20px', textAlign: 'center', background: '#fafafb', cursor: 'pointer' }}>
            <UploadSimple size={36} color="var(--violet)" style={{ margin: '0 auto 10px' }} />
            <h4 style={{ margin: '0 0 4px', fontSize: 12, fontWeight: 600, color: '#334155' }}>Click or drag file to this area to upload</h4>
            <p style={{ margin: 0, fontSize: 10.5, color: '#94a3b8' }}>Support for a single or bulk upload. Maximum file size 2MB.</p>
          </div>
        </div>
        <div className="hrm-modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, borderTop: '1px solid var(--border-color)', paddingTop: 14 }}>
          <GhostButton onClick={() => setUploadModalOpen(false)}>Cancel</GhostButton>
          <PrimaryButton onClick={handleUploadComplete}>Submit</PrimaryButton>
        </div>
      </div>
    </div>}
  </div>;
}

function ClearanceApplicationScreen({ data, setData, user, onBack, onNotify }) {
  const [statusTab, setStatusTab] = useState('All');
  const table = useTableState();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [applyModalOpen, setApplyModalOpen] = useState(false);
  const [viewingClearance, setViewingClearance] = useState(null);
  const [checkingClearance, setCheckingClearance] = useState(null);
  const [previewDoc, setPreviewDoc] = useState(null);

  const statusTabs = ['All', 'Pending', 'For Completion', 'For Review', 'Approved', 'Rejected'];
  const list = data.clearanceApplications || [];

  const filtered = useMemo(() => {
    return list.filter(row => {
      if (statusTab !== 'All' && row.status !== statusTab) return false;
      if (table.search.trim()) {
        const term = table.search.trim().toLowerCase();
        const matches = [row.applicationDate, row.employeeCode, row.requester, row.jobTitle, row.division, row.department]
          .some(v => String(v ?? '').toLowerCase().includes(term));
        if (!matches) return false;
      }
      return true;
    });
  }, [list, statusTab, table.search]);

  const pageRows = paginate(filtered, table.page, table.pageSize);

  function handleAddApplication(newRecord) {
    setData(prev => ({
      ...prev,
      clearanceApplications: [newRecord, ...(prev.clearanceApplications || [])],
    }));
    setApplyModalOpen(false);
    onNotify('Request sent successfully!');
  }

  function handleUpdateChecklist(updatedRecord) {
    setData(prev => ({
      ...prev,
      clearanceApplications: (prev.clearanceApplications || []).map(r => r.id === updatedRecord.id ? updatedRecord : r),
    }));
    setCheckingClearance(null);
  }

  function exportClearances(format) {
    const headers = ['Application Date', 'Employee Code', 'Requester', 'Job Title', 'Division', 'Status'];
    const rows = filtered.map(r => [r.applicationDate, r.employeeCode, r.requester, r.jobTitle, r.division, r.status]);
    downloadFile(`clearance-applications.${format === 'PDF' ? 'txt' : 'csv'}`, toCsv(headers, rows));
    onNotify(`Clearance applications exported to ${format}.`);
  }

  if (checkingClearance) {
    return <ClearanceChecklistScreen
      clearance={checkingClearance}
      onBack={() => setCheckingClearance(null)}
      onUpdateChecklist={handleUpdateChecklist}
      onNotify={onNotify}
    />;
  }

  return <div className="hrm-ss-content">
    <Breadcrumbs items={[
      { label: 'Employee Clearance & Checklist', onClick: onBack },
      { label: 'Employee Clearance Application' },
    ]} />

    <PageHeading title="Employee Clearance Application" />

    {/* Status Tabs */}
    <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid var(--border-color)', marginBottom: 16, overflowX: 'auto' }}>
      {statusTabs.map(st => (
        <button
          key={st}
          type="button"
          onClick={() => { setStatusTab(st); table.setPage(1); }}
          style={{
            padding: '8px 14px',
            border: 'none',
            background: 'none',
            fontSize: 11,
            fontWeight: statusTab === st ? 700 : 500,
            color: statusTab === st ? 'var(--violet)' : '#64748b',
            borderBottom: statusTab === st ? '2px solid var(--violet)' : '2px solid transparent',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {st}
        </button>
      ))}
    </div>

    {/* Toolbar */}
    <div className="hrm-toolbar">
      <div className="hrm-toolbar-left">
        <SearchInput value={table.search} onChange={table.setSearch} />
        <FilterButton onClick={() => setDrawerOpen(true)} active={Object.values(table.filters).some(Boolean)} />
      </div>
      <div className="hrm-toolbar-right" style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          className="hrm-btn primary"
          onClick={() => setApplyModalOpen(true)}
        >
          <Plus size={14} /> Apply
        </button>
        <ExportMenu onExport={exportClearances} disabled={filtered.length === 0} />
      </div>
    </div>

    <DataTable
      columns={[
        { key: 'applicationDate', label: 'Application Date', type: 'date' },
        { key: 'employeeCode', label: 'Employee Code' },
        { key: 'requester', label: 'Requester' },
        { key: 'jobTitle', label: 'Job Title' },
        { key: 'division', label: 'Division' },
      ]}
      rows={pageRows}
      total={filtered.length}
      rowKey={row => row.id}
      page={table.page}
      pageSize={table.pageSize}
      onPageChange={table.setPage}
      onPageSizeChange={table.setPageSize}
      empty="No clearance applications found."
      actions={row => {
        const act = [{ kind: 'view', label: 'View', onSelect: () => setViewingClearance(row) }];
        if (row.status === 'For Completion') {
          act.push({ kind: 'edit', label: 'See Checklist', onSelect: () => setCheckingClearance(row) });
        }
        return act;
      }}
    />

    {drawerOpen && <FilterDrawer
      fields={[
        { key: 'employeeCode', label: 'Employee Code' },
        { key: 'department', label: 'Department', options: [...new Set(list.map(r => r.department))] },
        { key: 'division', label: 'Division', options: [...new Set(list.map(r => r.division))] },
      ]}
      value={table.filters}
      onApply={next => { table.setFilters(next); setDrawerOpen(false); }}
      onClose={() => setDrawerOpen(false)}
    />}

    {applyModalOpen && <ApplyClearanceModal
      onApply={handleAddApplication}
      onClose={() => setApplyModalOpen(false)}
    />}

    {viewingClearance && <ViewClearanceApplicationModal
      clearance={viewingClearance}
      onClose={() => setViewingClearance(null)}
      onPreviewFile={name => setPreviewDoc({ name, title: name })}
    />}

    {previewDoc && <DocumentViewerModal
      document={previewDoc}
      onClose={() => setPreviewDoc(null)}
    />}
  </div>;
}

/* ----------------------------------------------- 1.2 Clearance Approval */

function SetupChecklistModal({ clearance, templates, onAssign, onClose }) {
  const [selectedItems, setSelectedItems] = useState(templates.slice(0, 2).map(t => t.id));

  function addDropdown() {
    const unselected = templates.find(t => !selectedItems.includes(t.id));
    if (unselected) {
      setSelectedItems([...selectedItems, unselected.id]);
    }
  }

  function handleAssign() {
    const items = templates.filter(t => selectedItems.includes(t.id)).map(t => ({ ...t, done: false }));
    onAssign(items);
  }

  return <div className="hrm-modal-backdrop" role="dialog" aria-modal="true">
    <div className="hrm-modal-card" style={{ maxWidth: 480 }}>
      <div className="hrm-modal-header">
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--violet)' }}>Setup Offboarding Checklist</h3>
        <button type="button" className="hrm-icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
      </div>

      <div className="hrm-modal-body" style={{ padding: '16px 0', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#1e293b' }}>Assign Checklist</label>

        {selectedItems.map((selId, idx) => (
          <div key={idx} style={{ border: '1px solid var(--border-color)', borderRadius: 8, padding: '10px 12px' }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
              Checklist Item {idx + 1}
            </label>
            <select
              value={selId}
              onChange={e => {
                const next = [...selectedItems];
                next[idx] = e.target.value;
                setSelectedItems(next);
              }}
              style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border-color)', fontSize: 11 }}
            >
              {templates.map(t => (
                <option key={t.id} value={t.id}>{t.title}</option>
              ))}
            </select>
          </div>
        ))}

        <button
          type="button"
          onClick={addDropdown}
          style={{
            border: '1px dashed var(--violet)',
            borderRadius: 6,
            background: '#faf5ff',
            color: 'var(--violet)',
            padding: '8px 12px',
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
          }}
        >
          <Plus size={14} /> Add Checklist Item
        </button>

        <p style={{ margin: '6px 0 0', fontSize: 10.5, color: '#64748b', fontStyle: 'italic' }}>
          Note: By clicking &apos;Finish &amp; Send&apos;, uploaded Job Description and Employment Contract will now be sent to the employee&apos;s e-mail.
        </p>
      </div>

      <div className="hrm-modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, borderTop: '1px solid var(--border-color)', paddingTop: 14 }}>
        <GhostButton onClick={onClose}>Cancel</GhostButton>
        <PrimaryButton onClick={handleAssign}>Assign</PrimaryButton>
      </div>
    </div>
  </div>;
}

function DecisionModal({ type, clearance, onConfirm, onClose, onPreviewFile }) {
  const [remarks, setRemarks] = useState('');
  const isApprove = type === 'Approve';

  return <div className="hrm-modal-backdrop" role="dialog" aria-modal="true">
    <div className="hrm-modal-card" style={{ maxWidth: 460 }}>
      <div className="hrm-modal-header">
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: isApprove ? '#16a34a' : '#dc2626' }}>
          {isApprove ? 'Approve Request' : 'Reject Request'}
        </h3>
        <button type="button" className="hrm-icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
      </div>

      <div className="hrm-modal-body" style={{ padding: '16px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: '#64748b' }}>Application Date</label>
            <span style={{ fontSize: 11, color: '#1e293b' }}>{clearance.applicationDate}</span>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: '#64748b' }}>Requester</label>
            <span style={{ fontSize: 11, color: '#1e293b' }}>{clearance.requester}</span>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: '#64748b' }}>Employee Code</label>
            <span style={{ fontSize: 11, color: '#1e293b' }}>{clearance.employeeCode}</span>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: '#64748b' }}>Department</label>
            <span style={{ fontSize: 11, color: '#1e293b' }}>{clearance.department}</span>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: '#64748b' }}>Division</label>
            <span style={{ fontSize: 11, color: '#1e293b' }}>{clearance.division}</span>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: '#64748b' }}>Effectivity Date</label>
            <span style={{ fontSize: 11, color: '#1e293b' }}>{clearance.effectivityDate}</span>
          </div>
        </div>

        {clearance.submittedFiles?.length > 0 && (
          <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 10 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#334155', marginBottom: 6 }}>File Submission</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {clearance.submittedFiles.map(file => (
                <div key={file.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: '#f8fafc', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 11 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <FileDoc size={16} color="var(--violet)" />
                    <span>{file.name}</span>
                  </div>
                  <button type="button" onClick={() => onPreviewFile?.(file.name)} style={{ border: 'none', background: 'none', color: 'var(--violet)', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>Preview</button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 10 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#334155', marginBottom: 4 }}>Approver Remarks</label>
          <textarea
            rows={3}
            value={remarks}
            onChange={e => setRemarks(e.target.value)}
            placeholder="Input approver remarks"
            style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border-color)', fontSize: 11 }}
          />
        </div>
      </div>

      <div className="hrm-modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, borderTop: '1px solid var(--border-color)', paddingTop: 14 }}>
        <GhostButton onClick={onClose}>Cancel</GhostButton>
        <button
          type="button"
          className="hrm-btn"
          style={{ background: isApprove ? '#16a34a' : '#dc2626', color: '#fff', border: 'none' }}
          onClick={() => onConfirm(remarks)}
        >
          {isApprove ? 'Approve' : 'Reject'}
        </button>
      </div>
    </div>
  </div>;
}

function ClearanceApprovalScreen({ data, setData, user, onBack, onNotify }) {
  const [statusTab, setStatusTab] = useState('Pending');
  const table = useTableState();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [viewingClearance, setViewingClearance] = useState(null);
  const [assigningClearance, setAssigningClearance] = useState(null);
  const [decisionModal, setDecisionModal] = useState(null); // { type: 'Approve'|'Reject', clearance }
  const [checkingClearance, setCheckingClearance] = useState(null);
  const [previewDoc, setPreviewDoc] = useState(null);

  const statusTabs = ['All', 'Pending', 'For Completion', 'For Review', 'Approved', 'Rejected'];
  const list = data.clearanceApplications || [];
  const templates = data.offboardingChecklistTemplates || [];

  const filtered = useMemo(() => {
    return list.filter(row => {
      if (statusTab !== 'All' && row.status !== statusTab) return false;
      if (table.search.trim()) {
        const term = table.search.trim().toLowerCase();
        const matches = [row.applicationDate, row.employeeCode, row.requester, row.jobTitle, row.division, row.department]
          .some(v => String(v ?? '').toLowerCase().includes(term));
        if (!matches) return false;
      }
      return true;
    });
  }, [list, statusTab, table.search]);

  const pageRows = paginate(filtered, table.page, table.pageSize);

  function handleAssignItems(assignedItems) {
    setData(prev => ({
      ...prev,
      clearanceApplications: (prev.clearanceApplications || []).map(r => r.id === assigningClearance.id ? {
        ...r,
        status: 'For Completion',
        checklist: assignedItems,
      } : r),
    }));
    setAssigningClearance(null);
    onNotify('Checklist assigned successfully!');
  }

  function handleDecision(remarks) {
    const isApprove = decisionModal.type === 'Approve';
    setData(prev => {
      const rows = (prev.clearanceApplications || []).map(r => r.id === decisionModal.clearance.id ? {
        ...r,
        status: isApprove ? 'Approved' : 'Rejected',
        actionedBy: user.displayName || 'Mark Santos',
        approverRemarks: remarks || (isApprove ? 'Approved.' : 'Rejected.'),
        statusDate: today(),
      } : r);
      // Clearing an employee is what entitles them to their quit claim and
      // final pay, so the approval drafts the claim instead of leaving the
      // separation stalled between two modules.
      const decided = rows.find(r => r.id === decisionModal.clearance.id);
      return openQuitClaimForClearance({ ...prev, clearanceApplications: rows }, decided);
    });
    setDecisionModal(null);
    onNotify('Status updated successfully!');
  }

  if (checkingClearance) {
    return <ClearanceChecklistScreen
      clearance={checkingClearance}
      onBack={() => setCheckingClearance(null)}
      onUpdateChecklist={r => {
        setData(prev => ({ ...prev, clearanceApplications: (prev.clearanceApplications || []).map(x => x.id === r.id ? r : x) }));
        setCheckingClearance(null);
      }}
      onNotify={onNotify}
    />;
  }

  return <div className="hrm-ss-content">
    <Breadcrumbs items={[
      { label: 'Employee Clearance & Checklist', onClick: onBack },
      { label: 'Employee Clearance Approval' },
    ]} />

    <PageHeading title="Employee Clearance Approval" />

    {/* Status Tabs */}
    <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid var(--border-color)', marginBottom: 16, overflowX: 'auto' }}>
      {statusTabs.map(st => (
        <button
          key={st}
          type="button"
          onClick={() => { setStatusTab(st); table.setPage(1); }}
          style={{
            padding: '8px 14px',
            border: 'none',
            background: 'none',
            fontSize: 11,
            fontWeight: statusTab === st ? 700 : 500,
            color: statusTab === st ? 'var(--violet)' : '#64748b',
            borderBottom: statusTab === st ? '2px solid var(--violet)' : '2px solid transparent',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {st}
        </button>
      ))}
    </div>

    {/* Toolbar */}
    <div className="hrm-toolbar">
      <div className="hrm-toolbar-left">
        <SearchInput value={table.search} onChange={table.setSearch} />
        <FilterButton onClick={() => setDrawerOpen(true)} active={Object.values(table.filters).some(Boolean)} />
      </div>
      <div className="hrm-toolbar-right">
        <ExportMenu onExport={fmt => onNotify(`Clearance approvals exported to ${fmt}.`)} disabled={filtered.length === 0} />
      </div>
    </div>

    <DataTable
      columns={[
        { key: 'applicationDate', label: 'Application Date', type: 'date' },
        { key: 'employeeCode', label: 'Employee Code' },
        { key: 'requester', label: 'Requester' },
        { key: 'department', label: 'Department' },
        { key: 'division', label: 'Division' },
      ]}
      rows={pageRows}
      total={filtered.length}
      rowKey={row => row.id}
      page={table.page}
      pageSize={table.pageSize}
      onPageChange={table.setPage}
      onPageSizeChange={table.setPageSize}
      empty="No approvals in this queue."
      actions={row => {
        const act = [{ kind: 'view', label: 'View', onSelect: () => setViewingClearance(row) }];
        if (row.status === 'Pending') {
          act.push({ kind: 'edit', label: 'Assign', onSelect: () => setAssigningClearance(row) });
        } else if (row.status === 'For Completion') {
          act.push({ kind: 'edit', label: 'See Checklist', onSelect: () => setCheckingClearance(row) });
        } else if (row.status === 'For Review') {
          act.push({ kind: 'view', label: 'Approve', onSelect: () => setDecisionModal({ type: 'Approve', clearance: row }) });
          act.push({ kind: 'cancel', label: 'Reject', onSelect: () => setDecisionModal({ type: 'Reject', clearance: row }) });
        }
        return act;
      }}
    />

    {drawerOpen && <FilterDrawer
      fields={[
        { key: 'employeeCode', label: 'Employee Code' },
        { key: 'department', label: 'Department', options: [...new Set(list.map(r => r.department))] },
        { key: 'division', label: 'Division', options: [...new Set(list.map(r => r.division))] },
      ]}
      value={table.filters}
      onApply={next => { table.setFilters(next); setDrawerOpen(false); }}
      onClose={() => setDrawerOpen(false)}
    />}

    {assigningClearance && <SetupChecklistModal
      clearance={assigningClearance}
      templates={templates}
      onAssign={handleAssignItems}
      onClose={() => setAssigningClearance(null)}
    />}

    {decisionModal && <DecisionModal
      type={decisionModal.type}
      clearance={decisionModal.clearance}
      onConfirm={handleDecision}
      onClose={() => setDecisionModal(null)}
      onPreviewFile={name => setPreviewDoc({ name, title: name })}
    />}

    {viewingClearance && <ViewClearanceApplicationModal
      clearance={viewingClearance}
      onClose={() => setViewingClearance(null)}
      onPreviewFile={name => setPreviewDoc({ name, title: name })}
    />}

    {previewDoc && <DocumentViewerModal
      document={previewDoc}
      onClose={() => setPreviewDoc(null)}
    />}
  </div>;
}

/* ------------------------------------------- 1.3 Clearance Management */

function ClearanceManagementScreen({ data, onBack, onNotify }) {
  const [statusTab, setStatusTab] = useState('All');
  const table = useTableState();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [viewingClearance, setViewingClearance] = useState(null);

  const statusTabs = ['All', 'Pending', 'For Completion', 'For Review', 'Approved', 'Rejected'];
  const list = data.clearanceApplications || [];

  const filtered = useMemo(() => {
    return list.filter(row => {
      if (statusTab !== 'All' && row.status !== statusTab) return false;
      if (table.search.trim()) {
        const term = table.search.trim().toLowerCase();
        const matches = [row.applicationDate, row.employeeCode, row.employeeName, row.department, row.division]
          .some(v => String(v ?? '').toLowerCase().includes(term));
        if (!matches) return false;
      }
      return true;
    });
  }, [list, statusTab, table.search]);

  const pageRows = paginate(filtered, table.page, table.pageSize);

  return <div className="hrm-ss-content">
    <Breadcrumbs items={[
      { label: 'Employee Clearance & Checklist', onClick: onBack },
      { label: 'Employee Clearance Management' },
    ]} />

    <PageHeading title="Employee Clearance Management" />

    {/* Status Tabs */}
    <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid var(--border-color)', marginBottom: 16, overflowX: 'auto' }}>
      {statusTabs.map(st => (
        <button
          key={st}
          type="button"
          onClick={() => { setStatusTab(st); table.setPage(1); }}
          style={{
            padding: '8px 14px',
            border: 'none',
            background: 'none',
            fontSize: 11,
            fontWeight: statusTab === st ? 700 : 500,
            color: statusTab === st ? 'var(--violet)' : '#64748b',
            borderBottom: statusTab === st ? '2px solid var(--violet)' : '2px solid transparent',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {st}
        </button>
      ))}
    </div>

    {/* Toolbar */}
    <div className="hrm-toolbar">
      <div className="hrm-toolbar-left">
        <SearchInput value={table.search} onChange={table.setSearch} />
        <FilterButton onClick={() => setDrawerOpen(true)} active={Object.values(table.filters).some(Boolean)} />
      </div>
      <div className="hrm-toolbar-right">
        <ExportMenu onExport={fmt => onNotify(`Clearance management data exported to ${fmt}.`)} disabled={filtered.length === 0} />
      </div>
    </div>

    <DataTable
      columns={[
        { key: 'applicationDate', label: 'Application Date', type: 'date' },
        { key: 'employeeCode', label: 'Employee Code' },
        { key: 'employeeName', label: 'Employee Name' },
        { key: 'department', label: 'Department' },
        { key: 'division', label: 'Division' },
      ]}
      rows={pageRows}
      total={filtered.length}
      rowKey={row => row.id}
      page={table.page}
      pageSize={table.pageSize}
      onPageChange={table.setPage}
      onPageSizeChange={table.setPageSize}
      empty="No clearances found."
      actions={row => [
        { kind: 'view', label: 'View', onSelect: () => setViewingClearance(row) },
      ]}
    />

    {drawerOpen && <FilterDrawer
      fields={[
        { key: 'employeeCode', label: 'Employee Code' },
        { key: 'department', label: 'Department', options: [...new Set(list.map(r => r.department))] },
        { key: 'division', label: 'Division', options: [...new Set(list.map(r => r.division))] },
      ]}
      value={table.filters}
      onApply={next => { table.setFilters(next); setDrawerOpen(false); }}
      onClose={() => setDrawerOpen(false)}
    />}

    {viewingClearance && <ViewClearanceApplicationModal
      clearance={viewingClearance}
      onClose={() => setViewingClearance(null)}
    />}
  </div>;
}

/* -------------------------------- 1.4 Offboarding Checklist Management */

function OffboardingChecklistManagementScreen({ data, setData, onBack, onNotify }) {
  const table = useTableState();
  const [modalMode, setModalMode] = useState(null); // 'add' | 'edit' | 'delete'
  const [targetItem, setTargetItem] = useState(null);
  const [itemTitle, setItemTitle] = useState('');

  const templates = data.offboardingChecklistTemplates || [];

  const filtered = useMemo(() => {
    if (!table.search.trim()) return templates;
    return templates.filter(t => t.title.toLowerCase().includes(table.search.trim().toLowerCase()));
  }, [templates, table.search]);

  function handleSaveAdd() {
    if (!itemTitle.trim()) return;
    const newItem = {
      id: `chk-${Date.now()}`,
      title: itemTitle.trim(),
      category: 'General',
    };
    setData(prev => ({
      ...prev,
      offboardingChecklistTemplates: [...(prev.offboardingChecklistTemplates || []), newItem],
    }));
    setModalMode(null);
    setItemTitle('');
    onNotify('Checklist item added successfully!');
  }

  function handleSaveEdit() {
    if (!itemTitle.trim() || !targetItem) return;
    setData(prev => ({
      ...prev,
      offboardingChecklistTemplates: (prev.offboardingChecklistTemplates || []).map(t => t.id === targetItem.id ? { ...t, title: itemTitle.trim() } : t),
    }));
    setModalMode(null);
    setTargetItem(null);
    setItemTitle('');
    onNotify('Checklist item updated successfully!');
  }

  function handleDelete() {
    if (!targetItem) return;
    setData(prev => ({
      ...prev,
      offboardingChecklistTemplates: (prev.offboardingChecklistTemplates || []).filter(t => t.id !== targetItem.id),
    }));
    setModalMode(null);
    setTargetItem(null);
    onNotify('Checklist item deleted successfully!');
  }

  return <div className="hrm-ss-content">
    <Breadcrumbs items={[
      { label: 'Employee Clearance & Checklist', onClick: onBack },
      { label: 'Offboarding Checklist Management' },
    ]} />

    <PageHeading title="Offboarding Checklist Management" />

    {/* Toolbar */}
    <div className="hrm-toolbar">
      <div className="hrm-toolbar-left">
        <SearchInput value={table.search} onChange={table.setSearch} />
      </div>
      <div className="hrm-toolbar-right" style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          className="hrm-btn primary"
          onClick={() => { setItemTitle(''); setModalMode('add'); }}
        >
          <Plus size={14} /> Add
        </button>
        <ExportMenu onExport={fmt => onNotify(`Checklist templates exported to ${fmt}.`)} disabled={filtered.length === 0} />
      </div>
    </div>

    {/* Checklist Templates list */}
    <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: 10, overflow: 'hidden' }}>
      {filtered.map((item, idx) => (
        <div
          key={item.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 20px',
            borderBottom: idx < filtered.length - 1 ? '1px solid #f1f5f9' : 'none',
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 500, color: '#334155' }}>
            {item.title}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="hrm-icon-btn"
              onClick={() => { setTargetItem(item); setItemTitle(item.title); setModalMode('edit'); }}
              aria-label="Edit item"
            >
              <PencilSimple size={14} />
            </button>
            <button
              type="button"
              className="hrm-icon-btn"
              onClick={() => { setTargetItem(item); setModalMode('delete'); }}
              aria-label="Delete item"
            >
              <Trash size={14} color="#dc2626" />
            </button>
          </div>
        </div>
      ))}
    </div>

    {/* Add Modal */}
    {modalMode === 'add' && <div className="hrm-modal-backdrop" role="dialog" aria-modal="true">
      <div className="hrm-modal-card" style={{ maxWidth: 420 }}>
        <div className="hrm-modal-header">
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--violet)' }}>Add Checklist Item</h3>
          <button type="button" className="hrm-icon-btn" onClick={() => setModalMode(null)} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="hrm-modal-body" style={{ padding: '16px 0' }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#334155', marginBottom: 4 }}>Checklist Item Title *</label>
          <input
            type="text"
            value={itemTitle}
            onChange={e => setItemTitle(e.target.value)}
            placeholder="Input checklist item title"
            style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border-color)', fontSize: 11 }}
          />
        </div>
        <div className="hrm-modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, borderTop: '1px solid var(--border-color)', paddingTop: 14 }}>
          <GhostButton onClick={() => setModalMode(null)}>Cancel</GhostButton>
          <PrimaryButton onClick={handleSaveAdd}>Add</PrimaryButton>
        </div>
      </div>
    </div>}

    {/* Edit Modal */}
    {modalMode === 'edit' && <div className="hrm-modal-backdrop" role="dialog" aria-modal="true">
      <div className="hrm-modal-card" style={{ maxWidth: 420 }}>
        <div className="hrm-modal-header">
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--violet)' }}>Edit Checklist Item</h3>
          <button type="button" className="hrm-icon-btn" onClick={() => setModalMode(null)} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="hrm-modal-body" style={{ padding: '16px 0' }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#334155', marginBottom: 4 }}>Checklist Item Title *</label>
          <input
            type="text"
            value={itemTitle}
            onChange={e => setItemTitle(e.target.value)}
            style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border-color)', fontSize: 11 }}
          />
        </div>
        <div className="hrm-modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, borderTop: '1px solid var(--border-color)', paddingTop: 14 }}>
          <GhostButton onClick={() => setModalMode(null)}>Cancel</GhostButton>
          <PrimaryButton onClick={handleSaveEdit}>Save</PrimaryButton>
        </div>
      </div>
    </div>}

    {/* Delete Confirmation Modal */}
    {modalMode === 'delete' && <div className="hrm-modal-backdrop" role="dialog" aria-modal="true">
      <div className="hrm-modal-card" style={{ maxWidth: 400 }}>
        <div className="hrm-modal-header">
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#dc2626' }}>Delete Item</h3>
          <button type="button" className="hrm-icon-btn" onClick={() => setModalMode(null)} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="hrm-modal-body" style={{ padding: '16px 0' }}>
          <p style={{ margin: 0, fontSize: 11, color: '#475569' }}>
            Are you sure you want to delete this item? This action is irreversible.
          </p>
        </div>
        <div className="hrm-modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, borderTop: '1px solid var(--border-color)', paddingTop: 14 }}>
          <GhostButton onClick={() => setModalMode(null)}>Cancel</GhostButton>
          <button
            type="button"
            className="hrm-btn"
            style={{ background: '#dc2626', color: '#fff', border: 'none' }}
            onClick={handleDelete}
          >
            Delete
          </button>
        </div>
      </div>
    </div>}
  </div>;
}

/* ========================================================================= */
/* 2. Employee Final Quit Claim Module                                       */
/* ========================================================================= */

function CreateQuitClaimScreen({ data, user, onBack, onSave, onNotify }) {
  const [docTitle, setDocTitle] = useState('Quitclaim & Release');
  const [submissionType, setSubmissionType] = useState('File Upload'); // 'File Upload' | 'Manual Input'
  const [content, setContent] = useState('');
  const [recipientModalOpen, setRecipientModalOpen] = useState(false);

  const [fullName, setFullName] = useState('John Collins Doe');
  const [email, setEmail] = useState('john.doe@abccompany.com');
  const [birthday, setBirthday] = useState('1992-05-15');
  const [ackNotice, setAckNotice] = useState('Please review and execute the attached quitclaim within 5 working days.');

  function handleFinalSubmit(e) {
    e.preventDefault();
    const newQc = {
      id: `qc-${Date.now()}`,
      applicationDate: '04/23/2025',
      employeeCode: '0011223345',
      employeeName: fullName,
      department: 'IT Department',
      division: 'Product Development',
      jobTitle: 'Sr. Software Developer',
      quitClaimStatus: 'Pending',
      finalClaimStatus: 'Pending',
      statusDate: '04/23/2025',
      documentTitle: docTitle,
      author: user.displayName || 'John Doe',
      submissionType,
      content,
      recipient: {
        fullName,
        email,
        birthday,
        acknowledgementNotice: ackNotice,
      },
      files: [{ name: 'sample-proof-document.docx', size: '1.7MB' }],
    };
    onSave(newQc);
  }

  return <div className="hrm-ss-content">
    <Breadcrumbs items={[
      { label: 'Employee Final Quit Claim', onClick: onBack },
      { label: 'Create Quit Claim' },
    ]} />

    <PageHeading title="Create Quit Claim" />

    <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: 10, padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#334155', marginBottom: 4 }}>Document Title *</label>
        <input
          type="text"
          value={docTitle}
          onChange={e => setDocTitle(e.target.value)}
          placeholder="Input title"
          style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border-color)', fontSize: 11 }}
        />
      </div>

      <div>
        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#334155', marginBottom: 4 }}>Author</label>
        <input
          type="text"
          value={user.displayName || 'John Doe'}
          disabled
          style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border-color)', fontSize: 11, background: '#f8fafc' }}
        />
      </div>

      <div>
        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#334155', marginBottom: 6 }}>Submission Type *</label>
        <div style={{ display: 'flex', gap: 18 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer' }}>
            <input
              type="radio"
              checked={submissionType === 'File Upload'}
              onChange={() => setSubmissionType('File Upload')}
            />
            <span>File Upload</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer' }}>
            <input
              type="radio"
              checked={submissionType === 'Manual Input'}
              onChange={() => setSubmissionType('Manual Input')}
            />
            <span>Manual Input</span>
          </label>
        </div>
      </div>

      {submissionType === 'File Upload' ? (
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#334155', marginBottom: 6 }}>Please upload your document. *</label>
          <div style={{ border: '2px dashed var(--border-color)', borderRadius: 8, padding: '36px 20px', textAlign: 'center', background: '#fafafb', cursor: 'pointer' }}>
            <UploadSimple size={36} color="var(--violet)" style={{ margin: '0 auto 10px' }} />
            <h4 style={{ margin: '0 0 4px', fontSize: 12, fontWeight: 600, color: '#334155' }}>Click or drag file to this area to upload</h4>
            <p style={{ margin: 0, fontSize: 10.5, color: '#94a3b8' }}>Upload .PDF here. Maximum file size is 5MB.</p>
          </div>
        </div>
      ) : (
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#334155', marginBottom: 6 }}>Document Content *</label>
          <div style={{ border: '1px solid var(--border-color)', borderRadius: 8, overflow: 'hidden' }}>
            {/* Toolbar */}
            <div style={{ background: '#f8fafc', borderBottom: '1px solid var(--border-color)', padding: '6px 10px', display: 'flex', gap: 8, fontSize: 11, color: '#64748b' }}>
              <span>14px</span> | <strong>B</strong> <em>I</em> <u>U</u>
            </div>
            <textarea
              rows={8}
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="Input your content here"
              style={{ width: '100%', padding: 12, border: 'none', outline: 'none', fontSize: 11 }}
            />
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, borderTop: '1px solid var(--border-color)', paddingTop: 14 }}>
        <GhostButton onClick={onBack}>Cancel</GhostButton>
        <PrimaryButton onClick={() => setRecipientModalOpen(true)}>Send</PrimaryButton>
      </div>
    </div>

    {/* Recipient Information Modal */}
    {recipientModalOpen && <div className="hrm-modal-backdrop" role="dialog" aria-modal="true">
      <div className="hrm-modal-card" style={{ maxWidth: 480 }}>
        <div className="hrm-modal-header">
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--violet)' }}>Recipient Information</h3>
          <button type="button" className="hrm-icon-btn" onClick={() => setRecipientModalOpen(false)} aria-label="Close"><X size={16} /></button>
        </div>

        <form onSubmit={handleFinalSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '16px 0' }}>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#334155', marginBottom: 4 }}>Full Name *</label>
            <input
              type="text"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              required
              style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border-color)', fontSize: 11 }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#334155', marginBottom: 4 }}>Email *</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border-color)', fontSize: 11 }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#334155', marginBottom: 4 }}>Birthday *</label>
            <input
              type="date"
              value={birthday}
              onChange={e => setBirthday(e.target.value)}
              required
              style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border-color)', fontSize: 11 }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#334155', marginBottom: 4 }}>Acknowledgement Notice *</label>
            <textarea
              rows={3}
              value={ackNotice}
              onChange={e => setAckNotice(e.target.value)}
              required
              style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border-color)', fontSize: 11 }}
            />
          </div>

          <div className="hrm-modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, borderTop: '1px solid var(--border-color)', paddingTop: 14 }}>
            <GhostButton onClick={() => setRecipientModalOpen(false)}>Cancel</GhostButton>
            <PrimaryButton type="submit">Submit</PrimaryButton>
          </div>
        </form>
      </div>
    </div>}
  </div>;
}

function ViewQuitClaimModal({ quitClaim, onClose, onPreviewFile }) {
  return <div className="hrm-modal-backdrop" role="dialog" aria-modal="true">
    <div className="hrm-modal-card" style={{ maxWidth: 480 }}>
      <div className="hrm-modal-header">
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--violet)' }}>View Quit Claim</h3>
        <button type="button" className="hrm-icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
      </div>

      <div className="hrm-modal-body" style={{ padding: '16px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: '#64748b' }}>Application Date</label>
          <span style={{ fontSize: 11, color: '#1e293b' }}>{quitClaim.applicationDate}</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, borderTop: '1px solid #f1f5f9', paddingTop: 10 }}>
          <div>
            <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: '#64748b' }}>Employee Name</label>
            <span style={{ fontSize: 11, color: '#1e293b' }}>{quitClaim.employeeName}</span>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: '#64748b' }}>Employee Code</label>
            <span style={{ fontSize: 11, color: '#1e293b' }}>{quitClaim.employeeCode}</span>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: '#64748b' }}>Department</label>
            <span style={{ fontSize: 11, color: '#1e293b' }}>{quitClaim.department}</span>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: '#64748b' }}>Division</label>
            <span style={{ fontSize: 11, color: '#1e293b' }}>{quitClaim.division}</span>
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: '#64748b' }}>Job Title</label>
            <span style={{ fontSize: 11, color: '#1e293b' }}>{quitClaim.jobTitle}</span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, borderTop: '1px solid #f1f5f9', paddingTop: 10 }}>
          <div>
            <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: '#64748b' }}>Quit Claim Status</label>
            <span style={{ fontSize: 11, fontWeight: 700, color: quitClaim.quitClaimStatus === 'Released' || quitClaim.quitClaimStatus === 'Accepted' ? '#16a34a' : 'var(--violet)' }}>
              {quitClaim.quitClaimStatus}
            </span>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: '#64748b' }}>Status Date</label>
            <span style={{ fontSize: 11, color: '#1e293b' }}>{quitClaim.statusDate}</span>
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: '#64748b' }}>Employee Remarks</label>
            <span style={{ fontSize: 11, color: '#1e293b' }}>{quitClaim.employeeRemarks || '-'}</span>
          </div>
        </div>

        <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 10 }}>
          <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: '#64748b', marginBottom: 6 }}>Quit Claim</label>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: '#f8fafc', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 11 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <FileDoc size={16} color="var(--violet)" />
              <span>sample-proof-document.docx</span>
            </div>
            <button type="button" onClick={() => onPreviewFile?.('sample-proof-document.docx')} style={{ border: 'none', background: 'none', color: 'var(--violet)', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>Preview</button>
          </div>
        </div>

        {quitClaim.signedFile && (
          <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 10 }}>
            <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: '#64748b', marginBottom: 6 }}>Signed Quit Claim</label>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: '#f8fafc', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 11 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <FilePdf size={16} color="var(--violet)" />
                <span>{quitClaim.signedFile.name}</span>
              </div>
              <button type="button" onClick={() => onPreviewFile?.(quitClaim.signedFile.name)} style={{ border: 'none', background: 'none', color: 'var(--violet)', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>Preview</button>
            </div>
          </div>
        )}

        <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 10 }}>
          <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: '#64748b' }}>Final Claim Status</label>
          <span style={{ fontSize: 11, fontWeight: 700, color: quitClaim.finalClaimStatus === 'Completed' ? '#16a34a' : '#eab308' }}>
            {quitClaim.finalClaimStatus || 'Pending'}
          </span>
        </div>
      </div>

      <div className="hrm-modal-footer" style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <GhostButton onClick={onClose}>Close</GhostButton>
      </div>
    </div>
  </div>;
}

function MarkReleaseModal({ quitClaim, onConfirm, onClose }) {
  const [remarks, setRemarks] = useState('');

  return <div className="hrm-modal-backdrop" role="dialog" aria-modal="true">
    <div className="hrm-modal-card" style={{ maxWidth: 460 }}>
      <div className="hrm-modal-header">
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--violet)' }}>Mark Quit Claim for Release</h3>
        <button type="button" className="hrm-icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
      </div>

      <div className="hrm-modal-body" style={{ padding: '16px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: '#64748b' }}>Application Date</label>
            <span style={{ fontSize: 11, color: '#1e293b' }}>{quitClaim.applicationDate}</span>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: '#64748b' }}>Employee Code</label>
            <span style={{ fontSize: 11, color: '#1e293b' }}>{quitClaim.employeeCode}</span>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: '#64748b' }}>Employee Name</label>
            <span style={{ fontSize: 11, color: '#1e293b' }}>{quitClaim.employeeName}</span>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: '#64748b' }}>Department</label>
            <span style={{ fontSize: 11, color: '#1e293b' }}>{quitClaim.department}</span>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: '#64748b' }}>Division</label>
            <span style={{ fontSize: 11, color: '#1e293b' }}>{quitClaim.division}</span>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: '#64748b' }}>Job Title</label>
            <span style={{ fontSize: 11, color: '#1e293b' }}>{quitClaim.jobTitle}</span>
          </div>
        </div>

        <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 10 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#334155', marginBottom: 4 }}>Approver Remarks</label>
          <textarea
            rows={3}
            value={remarks}
            onChange={e => setRemarks(e.target.value)}
            placeholder="Input approver remarks"
            style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border-color)', fontSize: 11 }}
          />
        </div>
      </div>

      <div className="hrm-modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, borderTop: '1px solid var(--border-color)', paddingTop: 14 }}>
        <GhostButton onClick={onClose}>Cancel</GhostButton>
        <PrimaryButton onClick={() => onConfirm(remarks)}>Mark for Release</PrimaryButton>
      </div>
    </div>
  </div>;
}

function FinalQuitClaimScreen({ data, setData, user, onNotify }) {
  const [statusTab, setStatusTab] = useState('All');
  const table = useTableState();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [viewingQc, setViewingQc] = useState(null);
  const [markReleaseQc, setMarkReleaseQc] = useState(null);
  const [previewDoc, setPreviewDoc] = useState(null);

  const statusTabs = ['All', 'Pending', 'For Action', 'Accepted', 'Rejected', 'For Release', 'Released'];
  const list = data.finalQuitClaims || [];

  const filtered = useMemo(() => {
    return list.filter(row => {
      if (statusTab !== 'All' && row.quitClaimStatus !== statusTab) return false;
      if (table.search.trim()) {
        const term = table.search.trim().toLowerCase();
        const matches = [row.applicationDate, row.employeeCode, row.employeeName, row.department, row.division]
          .some(v => String(v ?? '').toLowerCase().includes(term));
        if (!matches) return false;
      }
      return true;
    });
  }, [list, statusTab, table.search]);

  const pageRows = paginate(filtered, table.page, table.pageSize);

  function handleSaveNewQc(newRecord) {
    setData(prev => ({
      ...prev,
      finalQuitClaims: [newRecord, ...(prev.finalQuitClaims || [])],
    }));
    setCreating(false);
    onNotify('Quit claim created successfully!');
  }

  function handleConfirmMarkRelease(remarks) {
    setData(prev => ({
      ...prev,
      finalQuitClaims: (prev.finalQuitClaims || []).map(r => r.id === markReleaseQc.id ? {
        ...r,
        quitClaimStatus: 'For Release',
        approverRemarks: remarks || 'Marked for release.',
      } : r),
    }));
    setMarkReleaseQc(null);
    onNotify('Quit claim marked for release.');
  }

  function handleReleaseFinalPay(row) {
    setData(prev => ({
      ...prev,
      finalQuitClaims: (prev.finalQuitClaims || []).map(r => r.id === row.id ? {
        ...r,
        quitClaimStatus: 'Released',
        finalClaimStatus: 'Completed',
        statusDate: '04/23/2025',
      } : r),
    }));
    onNotify('Final pay released successfully!');
  }

  if (creating) {
    return <CreateQuitClaimScreen
      data={data}
      user={user}
      onBack={() => setCreating(false)}
      onSave={handleSaveNewQc}
      onNotify={onNotify}
    />;
  }

  return <div className="hrm-ss-content">
    <PageHeading title="Employee Final Quit Claim" />

    {/* Status Tabs */}
    <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid var(--border-color)', marginBottom: 16, overflowX: 'auto' }}>
      {statusTabs.map(st => (
        <button
          key={st}
          type="button"
          onClick={() => { setStatusTab(st); table.setPage(1); }}
          style={{
            padding: '8px 14px',
            border: 'none',
            background: 'none',
            fontSize: 11,
            fontWeight: statusTab === st ? 700 : 500,
            color: statusTab === st ? 'var(--violet)' : '#64748b',
            borderBottom: statusTab === st ? '2px solid var(--violet)' : '2px solid transparent',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {st}
        </button>
      ))}
    </div>

    {/* Toolbar */}
    <div className="hrm-toolbar">
      <div className="hrm-toolbar-left">
        <SearchInput value={table.search} onChange={table.setSearch} />
        <FilterButton onClick={() => setDrawerOpen(true)} active={Object.values(table.filters).some(Boolean)} />
      </div>
      <div className="hrm-toolbar-right" style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          className="hrm-btn primary"
          onClick={() => setCreating(true)}
        >
          <Plus size={14} /> Create
        </button>
        <ExportMenu onExport={fmt => onNotify(`Quit claims exported to ${fmt}.`)} disabled={filtered.length === 0} />
      </div>
    </div>

    <DataTable
      columns={[
        { key: 'applicationDate', label: 'Application Date', type: 'date' },
        { key: 'employeeCode', label: 'Employee Code' },
        { key: 'employeeName', label: 'Employee Name' },
        { key: 'department', label: 'Department' },
        { key: 'division', label: 'Division' },
      ]}
      rows={pageRows}
      total={filtered.length}
      rowKey={row => row.id}
      page={table.page}
      pageSize={table.pageSize}
      onPageChange={table.setPage}
      onPageSizeChange={table.setPageSize}
      empty="No quit claim records found."
      actions={row => {
        const act = [{ kind: 'view', label: 'View', onSelect: () => setViewingQc(row) }];
        if (row.quitClaimStatus === 'Pending') {
          act.push({ kind: 'edit', label: 'Generate Quit Claim', onSelect: () => setViewingQc(row) });
        } else if (row.quitClaimStatus === 'Accepted') {
          act.push({ kind: 'edit', label: 'Mark for release', onSelect: () => setMarkReleaseQc(row) });
          act.push({ kind: 'view', label: 'Resend', onSelect: () => onNotify('Quit claim resent to employee.') });
        } else if (row.quitClaimStatus === 'For Release') {
          act.push({ kind: 'edit', label: 'Release Final Pay', onSelect: () => handleReleaseFinalPay(row) });
        }
        return act;
      }}
    />

    {drawerOpen && <FilterDrawer
      fields={[
        { key: 'employeeCode', label: 'Employee Code' },
        { key: 'department', label: 'Department', options: [...new Set(list.map(r => r.department))] },
        { key: 'division', label: 'Division', options: [...new Set(list.map(r => r.division))] },
      ]}
      value={table.filters}
      onApply={next => { table.setFilters(next); setDrawerOpen(false); }}
      onClose={() => setDrawerOpen(false)}
    />}

    {viewingQc && <ViewQuitClaimModal
      quitClaim={viewingQc}
      onClose={() => setViewingQc(null)}
      onPreviewFile={name => setPreviewDoc({ name, title: name })}
    />}

    {markReleaseQc && <MarkReleaseModal
      quitClaim={markReleaseQc}
      onConfirm={handleConfirmMarkRelease}
      onClose={() => setMarkReleaseQc(null)}
    />}

    {previewDoc && <DocumentViewerModal
      document={previewDoc}
      onClose={() => setPreviewDoc(null)}
    />}
  </div>;
}

/* ----------------------------------------------- Root Offboarding Workspace */

export function OffboardingWorkspace({ data, setData, user, access, subView = 'clearance-checklist', onBack, onNotify }) {
  const [navKey, setNavKey] = useState(null); // 'clearance-application' | 'clearance-approval' | 'clearance-management' | 'offboarding-checklist-management'

  if (subView === 'final-quit-claim') {
    return <FinalQuitClaimScreen data={data} setData={setData} user={user} onNotify={onNotify} />;
  }

  if (navKey === 'clearance-application') {
    return <ClearanceApplicationScreen data={data} setData={setData} user={user} onBack={() => setNavKey(null)} onNotify={onNotify} />;
  }

  if (navKey === 'clearance-approval') {
    return <ClearanceApprovalScreen data={data} setData={setData} user={user} onBack={() => setNavKey(null)} onNotify={onNotify} />;
  }

  if (navKey === 'clearance-management') {
    return <ClearanceManagementScreen data={data} onBack={() => setNavKey(null)} onNotify={onNotify} />;
  }

  if (navKey === 'offboarding-checklist-management') {
    return <OffboardingChecklistManagementScreen data={data} setData={setData} onBack={() => setNavKey(null)} onNotify={onNotify} />;
  }

  return <ClearanceChecklistDashboard access={access} onNavigate={setNavKey} />;
}
