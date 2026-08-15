import { useState } from 'react';
import { Bell, CaretDown, Clock, Cube, CurrencyCircleDollar, Gear, House, MagnifyingGlass, SignOut, Sparkle, Users } from '@phosphor-icons/react';
import { RoleSwitch } from './RoleContext';
import { readCompanies } from './companyRepository';

/**
 * One primary navigation rail and one top bar for every screen. Employee
 * Masterfile and Reference Tables previously carried private copies whose
 * Core/Payroll/Settings buttons were inert, so those screens were navigational
 * dead ends and never showed the active company.
 */
export function BrandRail({ onHome, onCore = onHome, onPayroll, onSettings, active = 'core' }) {
  return (
    <aside className="brand-rail" aria-label="Primary navigation">
      <button className="brand-mark" onClick={onHome} aria-label="Home"><Sparkle weight="fill" /></button>
      <button className="rail-button" onClick={onHome} aria-label="Home"><House /></button>
      <button className={`rail-button ${active === 'core' ? 'active' : ''}`} onClick={onCore} aria-label="Core"><Cube weight="duotone" /></button>
      <button className="rail-button" disabled aria-label="Employees unavailable"><Users /></button>
      <button className="rail-button" disabled aria-label="Time unavailable"><Clock /></button>
      <button className={`rail-button ${active === 'payroll' ? 'active' : ''}`} onClick={onPayroll} aria-label="Payroll"><CurrencyCircleDollar weight="duotone" /></button>
      <div className="rail-spacer" />
      <button className={`rail-button ${active === 'settings' ? 'active' : ''}`} onClick={onSettings} aria-label="Settings"><Gear /></button>
      <button className="rail-button" disabled aria-label="Sign out unavailable"><SignOut /></button>
    </aside>
  );
}

export function Topbar({ company, companies = [], onSelectCompany }) {
  const [open, setOpen] = useState(false);
  // Read the repository when the menu opens so companies onboarded in another
  // workspace during this session are immediately selectable.
  const [live, setLive] = useState(null);
  const companyName = company?.displayName || company?.legalName || 'ABC Company Ltd';
  const fallback = companies.length ? companies : (company ? [company] : []);
  const selectable = live?.length ? live : fallback;
  const toggle = () => setOpen(value => { if (!value) setLive(readCompanies()); return !value; });
  return (
    <header className="topbar">
      <div className="menu-anchor company-switch-anchor">
        <button className="company-switch" onClick={toggle} aria-haspopup="listbox" aria-expanded={open}>{companyName} <small>{company?.companyCode || 'ABC-PH-001'}</small><CaretDown weight="bold" /></button>
        {open && <div className="company-switch-menu" role="listbox">
          <p className="company-switch-title">Switch company</p>
          {selectable.map(item => <button key={item.companyId} role="option" aria-selected={item.companyId === company?.companyId} className={item.companyId === company?.companyId ? 'selected' : ''} onClick={() => { onSelectCompany?.(item.companyId); setOpen(false); }}>
            <span><strong>{item.displayName || item.legalName}</strong><small>{item.companyCode}</small></span>
            <em className={`status-pill ${String(item.lifecycleStatus || 'Draft').toLowerCase().replaceAll(' ', '-')}`}>{item.lifecycleStatus || 'Draft'}</em>
          </button>)}
        </div>}
      </div>
      <div className="top-actions">
        <RoleSwitch />
        <button className="icon-button" aria-label="Search"><MagnifyingGlass /></button>
        <button className="icon-button notification" aria-label="Notifications"><Bell /></button>
        <div className="avatar">JD</div>
        <button className="profile">John Doe <CaretDown weight="bold" /></button>
      </div>
    </header>
  );
}
