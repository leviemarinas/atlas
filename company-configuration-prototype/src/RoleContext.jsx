import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Buildings, ShieldStar } from '@phosphor-icons/react';

const STORAGE_KEY = 'atlas-active-role-v1';

export const ROLES = {
  client: { id: 'client', label: 'Client Admin', short: 'Client', icon: Buildings, hint: 'Assigns and configures within the controlled standard library.' },
  admin: { id: 'admin', label: 'P&A Admin', short: 'P&A Admin', icon: ShieldStar, hint: 'Maintains the standard formulas and statutory tables for every client.' },
};

const RoleContext = createContext({ role: 'client', isAdmin: false, setRole: () => {} });

export function RoleProvider({ children }) {
  const [role, setRole] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === 'admin' || saved === 'client' ? saved : 'client';
  });
  useEffect(() => { localStorage.setItem(STORAGE_KEY, role); }, [role]);
  const value = useMemo(() => ({ role, setRole, isAdmin: role === 'admin' }), [role]);
  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole() {
  return useContext(RoleContext);
}

/** Topbar control for switching between the Client and P&A Admin experience. */
export function RoleSwitch() {
  const { role, setRole } = useRole();
  return (
    <div className="role-switch" role="group" aria-label="Active experience">
      {Object.values(ROLES).map(({ id, short, icon: Icon, hint }) => (
        <button
          key={id}
          type="button"
          className={role === id ? 'active' : ''}
          aria-pressed={role === id}
          title={hint}
          onClick={() => setRole(id)}
        >
          <Icon weight={role === id ? 'fill' : 'regular'} />
          {short}
        </button>
      ))}
    </div>
  );
}
