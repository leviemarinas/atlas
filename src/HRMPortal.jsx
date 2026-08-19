/**
 * The HRM module shell.
 *
 * Renders the gradient HRM banner and the role-aware tile grid from the P&A
 * HRM masterfile, then routes into the feature workspaces and the Employee
 * Self-service shell.  The signed-in user comes from the application session;
 * the Client / P&A Admin switch in the shared top bar decides whether the
 * module shows the employee experience or the administrator experience.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Bank,
  Bell,
  Buildings,
  CalendarBlank,
  CalendarCheck,
  ChartLine,
  CheckSquare,
  Door,
  Gift,
  Hand,
  Heartbeat,
  Medal,
  Question,
  Suitcase,
  Umbrella,
  UserMinus,
  UserPlus,
  ThumbsUp,
} from '@phosphor-icons/react';
import { BrandRail, Topbar } from './AppChrome';
import { useRole } from './RoleContext';
import { canViewReportsTile } from './moduleAccess';
import { readNotificationEvents } from './notificationServices';
import { readRequests, seedRequestsIfEmpty } from './requestService.js';
import { seedApplications } from './hrmApplications.js';
import {
  ApplicationWorkspace,
  SelfServiceGroupHome,
  SelfServiceSidebar,
} from './HRMSelfService.jsx';
import {
  ManagementGroupHome,
  ManagementScreen,
  ManagementSidebar,
} from './HRMManagement.jsx';
import { SelfInquirySidebar } from './HRMSelfInquiry.jsx';
import { BenefitsSidebar } from './HRMBenefits.jsx';
import { OffboardingSidebar } from './HRMOffboarding.jsx';
import {
  BenefitsWorkspace,
  CalendarWorkspace,
  HealthWellnessWorkspace,
  LeaveBalancesWorkspace,
  MdoBalancesWorkspace,
  OffboardingWorkspace,
  PreboardingWorkspace,
  ReportsWorkspace,
  SelfInquiryWorkspace,
} from './HRMWorkspaces.jsx';
import { HRMDashboard } from './HRMDashboard.jsx';
import { LeavePlannerWorkspace } from './HRMLeavePlanner.jsx';
import { EmailNotificationModal, EmptyState, PageHeading, Toasts, formatDate, useToasts } from './HRMKit.jsx';
import {
  accessFor,
  hrmActor,
  readHrmData,
  scopeNotificationEvents,
  signedInUser,
  updateHrmData,
  visibleEmployeeIds,
} from './hrmData.js';

/* ---------------------------------------------------------------- tile grid */

/**
 * Modules exposed on the HRM landing grid (P&A HRM Module Masterfile Part 1-6).
 */
const moduleTiles = [
  { key: 'wellness', label: 'Health and Wellness', icon: Heartbeat, experience: 'both' },
  { key: 'leave', label: 'Leave Balances', icon: Suitcase, experience: 'both' },
  { key: 'leave-planner', label: 'Leave Planner', icon: CalendarCheck, experience: 'both' },
  { key: 'mdo', label: 'Mandatory Day-off Balances', icon: Umbrella, experience: 'both' },
  { key: 'onboarding', label: 'Employee Onboarding', icon: UserPlus, experience: 'both' },
  { key: 'management', label: 'Manage Approvals', icon: ThumbsUp, experience: 'approver' },
  { key: 'self-service', label: 'Employee Self-service', icon: Hand, experience: 'both' },
  { key: 'self-inquiry', label: 'Employee Self-inquiry', icon: Question, experience: 'both' },
  { key: 'benefits', label: 'Benefits', icon: Gift, experience: 'both' },
  { key: 'loans', label: 'Loan Management', icon: Bank, experience: 'both' },
  // The HRM and TK Reports Module BRD rows are 100% "P&A Admin, Client Admin" —
  // not one of the 49 rows across both modules grants Employee or Approver
  // access, unlike every other tile here which the BRD marks "both".
  { key: 'reports', label: 'Reports', icon: ChartLine, experience: 'admin' },
  { key: 'resignation', label: 'Resignation', icon: Door, experience: 'both' },
  { key: 'offboarding', label: 'Employee Offboarding', icon: UserMinus, experience: 'both' },
  { key: 'certification', label: 'Certification Request', icon: Medal, experience: 'both' },
  { key: 'calendar', label: 'Calendar and Events', icon: CalendarBlank, experience: 'both' },
];

/** Active interactive workspaces */
const routedTiles = new Set([
  'wellness',
  'leave',
  'leave-planner',
  'mdo',
  'onboarding',
  'management',
  'self-service',
  'self-inquiry',
  'benefits',
  'loans',
  'reports',
  'resignation',
  'offboarding',
  'certification',
  'calendar',
  'notifications',
]);

export function tilesFor(access) {
  return moduleTiles.filter(tile => {
    if (tile.key === 'management') return access.canApproveTeamRequests;
    if (tile.experience === 'admin') return canViewReportsTile(access);
    return true;
  });
}

function HrmLanding({ user, access, onOpen, children }) {
  const tiles = tilesFor(access);
  return <div className="hrm-landing">
    <div className="hrm-banner">
      <h1>HRM</h1>
      <p>
        {access.isPaAdmin
          ? 'Standard statutory tables, approval overrides, and multi-client system configuration.'
          : access.isClientAdmin
          ? 'Company-wide masterfiles, clearance management, employee benefits catalog, and company reports.'
          : access.isApprover
          ? `Manage Approvals queue, direct reports attendance, and self-service for ${user.displayName}.`
          : `Personal balances, self-service applications, benefits, and self-inquiries for ${user.displayName}.`}
      </p>
    </div>
    <div className="hrm-tile-grid">
      {tiles.map(tile => {
        const Icon = tile.icon;
        return <button key={tile.key} type="button" className="hrm-tile" onClick={() => onOpen(tile.key)}>
          <Icon size={28} />
          <span>{tile.label}</span>
        </button>;
      })}
    </div>
    {children}
  </div>;
}

/* ------------------------------------------------------------ notifications */

function NotificationsWorkspace({ events, onBack, onNavigateSelfService }) {
  const [emailPreview, setEmailPreview] = useState(null);

  const sampleApproved = {
    type: 'Application Approved',
    title: 'Time In/Out Correction request has been approved',
    employeeName: 'John Collins Doe',
    recipient: 'John Collins Doe <john.doe@abccompany.com>',
    applicationType: 'Time In/Out Correction',
    date: '04/23/2026',
    status: 'Approved',
    remarks: 'Verified against turnstile biometric punch records.',
  };

  const sampleRejected = {
    type: 'Application Rejected',
    title: 'Time In/Out Correction request has been rejected',
    employeeName: 'John Collins Doe',
    recipient: 'John Collins Doe <john.doe@abccompany.com>',
    applicationType: 'Time In/Out Correction',
    date: '04/23/2026',
    status: 'Rejected',
    remarks: 'Correction time does not match security CCTV footage log.',
  };

  return <div className="hrm-workspace">
    <PageHeading
      title="Notifications"
      onBack={onBack}
      actions={<div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="hrm-btn tiny outline" onClick={() => setEmailPreview(sampleApproved)}>
          ✉ Preview Approved Email
        </button>
        <button type="button" className="hrm-btn tiny outline" onClick={() => setEmailPreview(sampleRejected)}>
          ✉ Preview Rejected Email
        </button>
      </div>}
    />
    {events.length === 0
      ? <EmptyState title="Nothing to read" icon={Bell}>Notifications appear here as applications move through approval.</EmptyState>
      : <ul className="hrm-notification-list">
          {events.map(event => <li key={event.eventId || event.id} style={{ cursor: 'pointer' }} onClick={() => setEmailPreview(event)}>
            <span className="hrm-notification-dot" />
            <div>
              <strong>{event.title || event.type || 'HRM update'}</strong>
              <p>{event.message || event.body || event.summary}</p>
              <small>{formatDate(String(event.at || event.createdAt || '').slice(0, 10))} · Click to preview email notification</small>
            </div>
          </li>)}
        </ul>}

    {emailPreview && <EmailNotificationModal
      event={emailPreview}
      onClose={() => setEmailPreview(null)}
      onNavigate={() => { setEmailPreview(null); onNavigateSelfService?.(); }}
    />}
  </div>;
}

/* -------------------------------------------------------------- the module */

export function HRMPortal({ company, companies = [], companyId, onSelectCompany, onExit, onOpenTimekeeping, notify }) {
  const { role } = useRole();
  // `route` is { view, group?, application? } so self-service can restore the
  // exact application screen a breadcrumb or a tile navigated to.
  const [route, setRoute] = useState({ view: 'home' });
  const [data, setDataState] = useState(() => readHrmData(companyId));
  const [requests, setRequests] = useState([]);
  const [events, setEvents] = useState(() => readNotificationEvents(companyId));
  const { toasts, push, dismiss } = useToasts();

  const user = useMemo(() => signedInUser(data), [data]);
  const access = useMemo(() => accessFor(role, data), [role, data]);
  const actor = useMemo(() => hrmActor(role, data), [role, data]);
  const teamEmployeeIds = useMemo(() => visibleEmployeeIds(data, role), [data, role]);
  const visibleEvents = useMemo(() => scopeNotificationEvents(events, data, role), [events, data, role]);

  const flash = (message, tone = 'ok') => {
    push(message, tone);
    notify?.({ type: tone === 'ok' ? 'success' : 'error', message });
  };

  const refreshRequests = () => setRequests(readRequests(companyId, { activeCompanyId: companyId }));

  // Seed the company's applications the first time it is opened so the status
  // tabs reflect real filed history rather than an empty table.
  useEffect(() => {
    const loaded = readHrmData(companyId);
    setDataState(loaded);
    seedRequestsIfEmpty(companyId, seedApplications(loaded.employees || []));
    setRequests(readRequests(companyId, { activeCompanyId: companyId }));
    setEvents(readNotificationEvents(companyId));
    setRoute({ view: 'home' });
  }, [companyId]);

  // Switching experience returns to the tile grid, because the Employee and
  // Administrator grids do not offer the same destinations.
  useEffect(() => { setRoute({ view: 'home' }); }, [role]);

  const setData = updater => {
    const next = updateHrmData(companyId, typeof updater === 'function' ? updater : () => updater);
    setDataState(next);
    return next;
  };

  const goHome = () => setRoute({ view: 'home' });
  const inSelfService = route.view === 'self-service';
  const inManagement = route.view === 'management';
  const inSelfInquiry = route.view === 'self-inquiry';
  const inBenefits = route.view === 'benefits';
  const inOffboarding = route.view === 'offboarding';
  const openTile = moduleTiles.find(tile => tile.key === route.view);

  const workspaceProps = { data, setData, requests, user, access, onBack: goHome, onNotify: flash };

  return <div className="app-shell core-screen hrm-shell">
    <BrandRail onHome={onExit} onCore={onExit} onHrm={goHome} onTime={onOpenTimekeeping} onPayroll={() => onExit?.()} onSettings={() => onExit?.()} active="hrm" />
    {inSelfService && <SelfServiceSidebar
      group={route.group}
      onSelectGroup={group => setRoute({ view: 'self-service', group })}
      onBack={goHome}
    />}
    {inManagement && <ManagementSidebar
      group={route.group}
      onSelectGroup={group => setRoute({ view: 'management', group })}
      onBack={goHome}
    />}
    {inSelfInquiry && <SelfInquirySidebar
      subView={route.subView || 'loan-inquiry'}
      onSelectSubView={subView => setRoute({ view: 'self-inquiry', subView })}
      onBack={goHome}
    />}
    {inBenefits && <BenefitsSidebar
      subView={route.subView || 'salary-information'}
      onSelectSubView={subView => setRoute({ view: 'benefits', subView })}
      onBack={goHome}
    />}
    {inOffboarding && <OffboardingSidebar
      subView={route.subView || 'clearance-checklist'}
      onSelectSubView={subView => setRoute({ view: 'offboarding', subView })}
      onBack={goHome}
    />}
    <main className="shell-main hrm-main">
      <Topbar
        company={company}
        companies={companies}
        onSelectCompany={onSelectCompany}
        profileName={user.displayName}
        profileInitials={user.initials}
        onNotifications={() => setRoute({ view: 'notifications' })}
      />
      <div className="hrm-content">
        {route.view === 'home' && <>
          <HRMDashboard
            data={data}
            setData={setData}
            requests={requests}
            user={user}
            access={access}
            onOpenWorkspace={key => setRoute(key === 'approvals' ? { view: 'management', group: 'time-management' } : { view: key })}
            onNotify={flash}
          />
          <HrmLanding
            user={user}
            access={access}
            onOpen={key => {
              if (key === 'self-service') setRoute({ view: 'self-service', group: 'time-tracking' });
              else if (key === 'management') setRoute({ view: 'management', group: 'time-management' });
              else if (key === 'self-inquiry') setRoute({ view: 'self-inquiry', subView: 'loan-inquiry' });
              else if (key === 'benefits') setRoute({ view: 'benefits', subView: 'salary-information' });
              else if (key === 'offboarding') setRoute({ view: 'offboarding', subView: 'clearance-checklist' });
              else if (key === 'leave') setRoute({ view: 'self-inquiry', subView: 'leave-ledger' });
              else if (key === 'loans') {
                if (access.canApproveTeamRequests) setRoute({ view: 'management', group: 'loan-management' });
                else setRoute({ view: 'self-service', group: 'loans', application: 'company-loan' });
              }
              else if (key === 'resignation') {
                if (access.canApproveTeamRequests) setRoute({ view: 'management', group: 'employee-requests-management', screen: 'resignation-approval' });
                else setRoute({ view: 'self-service', group: 'employee-requests', application: 'resignation' });
              }
              else if (key === 'certification') {
                if (access.canApproveTeamRequests) setRoute({ view: 'management', group: 'employee-requests-management', screen: 'coe-request-approval' });
                else setRoute({ view: 'self-service', group: 'employee-requests', application: 'coe-request' });
              }
              else setRoute({ view: key });
            }}
          />
        </>}

        {inSelfService && (route.application
          ? <ApplicationWorkspace
              definitionKey={route.application}
              requests={requests}
              data={data}
              setData={setData}
              user={user}
              access={access}
              actor={actor}
              companyId={companyId}
              onRefresh={refreshRequests}
              onNotify={flash}
              onBackToGroup={() => setRoute({ view: 'self-service', group: route.group })}
            />
          : <SelfServiceGroupHome
              groupKey={route.group}
              access={access}
              onOpenApplication={application => setRoute({ view: 'self-service', group: route.group, application })}
            />)}

        {route.view === 'wellness' && <HealthWellnessWorkspace {...workspaceProps} />}
        {route.view === 'leave' && <LeaveBalancesWorkspace {...workspaceProps} />}
        {route.view === 'leave-planner' && <LeavePlannerWorkspace {...workspaceProps} />}
        {route.view === 'mdo' && <MdoBalancesWorkspace {...workspaceProps} />}
        {route.view === 'calendar' && <CalendarWorkspace data={data} onBack={goHome} onNotify={flash} />}
        {route.view === 'onboarding' && <PreboardingWorkspace {...workspaceProps} />}
        {inManagement && (route.screen
          ? <ManagementScreen
              screenKey={route.screen}
              requests={requests}
              data={data}
              setData={setData}
              actor={actor}
              teamEmployeeIds={teamEmployeeIds}
              onBack={() => setRoute({ view: 'management', group: route.group })}
              onRefresh={refreshRequests}
              onNotify={flash}
            />
          : <ManagementGroupHome
              groupKey={route.group}
              onOpenScreen={screenKey => setRoute({ view: 'management', group: route.group, screen: screenKey })}
            />)}
        {route.view === 'reports' && <ReportsWorkspace
          data={data}
          requests={requests}
          access={access}
          teamEmployeeIds={teamEmployeeIds}
          onBack={goHome}
          onNotify={flash}
        />}
        {route.view === 'self-inquiry' && <SelfInquiryWorkspace
          subView={route.subView || 'loan-inquiry'}
          requests={requests}
          onNavigateSelfService={target => setRoute({ view: 'self-service', ...target })}
          {...workspaceProps}
        />}
        {route.view === 'benefits' && <BenefitsWorkspace subView={route.subView || 'salary-information'} {...workspaceProps} />}
        {route.view === 'offboarding' && <OffboardingWorkspace subView={route.subView || 'clearance-checklist'} {...workspaceProps} />}
        {route.view === 'notifications' && <NotificationsWorkspace
          events={visibleEvents}
          onBack={goHome}
          onNavigateSelfService={() => setRoute({ view: 'self-service', group: 'time-tracking' })}
        />}

        {openTile && !routedTiles.has(route.view) && <div className="hrm-workspace">
          <PageHeading title={openTile.label} onBack={goHome} />
          <EmptyState title={`${openTile.label} is scoped to a later phase`} icon={openTile.icon}>
            Health and Wellness, Leave Balances, Mandatory Day Off Balances, Employee Onboarding, Calendar and
            Events, Manage Approvals, Reports and Employee Self-service are built against the HRM masterfile and
            reachable from this grid.
          </EmptyState>
        </div>}
      </div>
    </main>
    <Toasts toasts={toasts} onDismiss={dismiss} />
  </div>;
}
