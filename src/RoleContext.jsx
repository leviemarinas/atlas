import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Buildings, ShieldCheck, ShieldStar, User, UserCheck, UserGear } from '@phosphor-icons/react';
import { normalizeRole } from './moduleAccess';

const STORAGE_KEY = 'atlas-active-role-v2';

export const ROLES = {
  employee: {
    id: 'employee',
    label: 'Client Employee',
    short: 'Employee',
    icon: User,
    hint: 'Submits own applications and views personal inquiries, benefits, and clearances.',
  },
  approver: {
    id: 'approver',
    label: 'Client Approver',
    short: 'Approver',
    icon: UserCheck,
    hint: 'Reviews and approves team applications; views subordinate attendance and schedules.',
  },
  client_admin: {
    id: 'client_admin',
    label: 'Client Admin',
    short: 'Client Admin',
    icon: Buildings,
    hint: 'Administers company-wide masterfiles, employee records, benefits, templates, and company reports.',
  },
  // Same access as a P&A Admin, but only in the client companies a P&A Admin has assigned to them.
  pa_user: {
    id: 'pa_user',
    label: 'P&A User',
    short: 'P&A User',
    icon: UserGear,
    hint: 'Same access as a P&A Admin, limited to the client companies a P&A Admin has assigned (ABC Company Ltd and Northstar Retail).',
  },
  pa_admin: {
    id: 'pa_admin',
    label: 'P&A Admin',
    short: 'P&A Admin',
    icon: ShieldStar,
    hint: 'Maintains statutory tables, approval overrides, and multi-client CGI system configurations. Makes formula changes; a P&A SuperAdmin approves them.',
  },
  // Atlas keeps two P&A roles: "P&A Admin" and "P&A SuperAdmin" (the SSO super administrator).
  // The SuperAdmin approves what a P&A Admin makes (maker-checker), so the two are never the same person.
  pa_superadmin: {
    id: 'pa_superadmin',
    label: 'P&A SuperAdmin',
    short: 'P&A SuperAdmin',
    icon: ShieldCheck,
    hint: 'Approves the formula changes a P&A Admin submits, and holds every other P&A permission.',
  },
};

/**
 * The person the top bar names. The prototype has one signed-in persona, and
 * keeping the name here means an audit entry and the top bar can never
 * disagree about who made a change.
 */
export const SIGNED_IN_NAME = 'John Doe';

/** A second named person for the SuperAdmin, so "the maker cannot approve their own change" is demonstrable. */
export const SUPERADMIN_NAME = 'Maria Santos';
export const PA_ADMIN_NAME = 'Paolo Reyes';
export const PA_USER_NAME = 'Carla Mendoza';
export const personaName = role => (role === 'pa_superadmin' ? SUPERADMIN_NAME : role === 'pa_admin' ? PA_ADMIN_NAME : role === 'pa_user' ? PA_USER_NAME : SIGNED_IN_NAME);

const RoleContext = createContext({
  role: 'client_admin',
  actor: `${SIGNED_IN_NAME} (Client Admin)`,
  isAdmin: false,
  isPaAdmin: false,
  isPaSuperAdmin: false,
  isPaUser: false,
  isClientAdmin: false,
  isApprover: false,
  isEmployee: false,
  setRole: () => {},
});

export function RoleProvider({ children }) {
  const [role, setRoleState] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem('atlas-active-role-v1');
    return normalizeRole(saved);
  });

  const setRole = next => {
    const normalized = normalizeRole(next);
    setRoleState(normalized);
    localStorage.setItem(STORAGE_KEY, normalized);
  };

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, role);
  }, [role]);

  const value = useMemo(() => {
    const isPaSuperAdmin = role === 'pa_superadmin';
    const isPaUser = role === 'pa_user';
    // A P&A User has the same access as a P&A Admin; only their companies differ.
    const isPaAdmin = role === 'pa_admin' || role === 'admin' || isPaUser || isPaSuperAdmin;
    const isClientAdmin = role === 'client_admin' || role === 'client';
    const isApprover = role === 'approver';
    const isEmployee = role === 'employee';
    const isAdmin = isPaAdmin || isClientAdmin;
    return {
      role,
      // Change history records a named person, not just a role, so "who
      // changed this rate" has an answer a reviewer can follow up.
      actor: `${personaName(role)} (${ROLES[role]?.label || (isPaAdmin ? 'P&A Admin' : 'Client Admin')})`,
      setRole,
      isAdmin,
      isPaAdmin,
      isPaSuperAdmin,
      isPaUser,
      isClientAdmin,
      isApprover,
      isEmployee,
    };
  }, [role]);

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole() {
  return useContext(RoleContext);
}

/** Topbar control for switching between all 4 BRD actor experiences. */
export function RoleSwitch() {
  const { role, setRole } = useRole();
  const currentKey = normalizeRole(role);

  return (
    <div className="role-switch role-switch-4" role="group" aria-label="Active actor experience">
      {Object.values(ROLES).map(({ id, short, icon: Icon, hint }) => (
        <button
          key={id}
          type="button"
          className={currentKey === id ? 'active' : ''}
          aria-pressed={currentKey === id}
          title={hint}
          onClick={() => setRole(id)}
        >
          <Icon weight={currentKey === id ? 'fill' : 'regular'} size={15} />
          <span>{short}</span>
        </button>
      ))}
    </div>
  );
}
