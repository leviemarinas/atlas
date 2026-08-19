import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Buildings, ShieldStar, User, UserCheck } from '@phosphor-icons/react';
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
  pa_admin: {
    id: 'pa_admin',
    label: 'P&A Admin',
    short: 'P&A Admin',
    icon: ShieldStar,
    hint: 'Maintains statutory tables, approval overrides, and multi-client CGI system configurations.',
  },
};

const RoleContext = createContext({
  role: 'client_admin',
  isAdmin: false,
  isPaAdmin: false,
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
    const isPaAdmin = role === 'pa_admin' || role === 'admin';
    const isClientAdmin = role === 'client_admin' || role === 'client';
    const isApprover = role === 'approver';
    const isEmployee = role === 'employee';
    const isAdmin = isPaAdmin || isClientAdmin;
    return {
      role,
      setRole,
      isAdmin,
      isPaAdmin,
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
