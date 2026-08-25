import { useState } from 'react';
import { Bell, CaretDown, Clock, Cube, CurrencyCircleDollar, Gear, House, MagnifyingGlass, PlayCircle, SignOut, Sparkle, Tray, Users } from '@phosphor-icons/react';
import { RoleSwitch, useRole } from './RoleContext';
import { canAccessModule } from './moduleAccess';
import { readCompanies } from './companyRepository';

/**
 * One primary navigation rail and one top bar for every screen. Employee
 * Masterfile and Reference Tables previously carried private copies whose
 * Core/Payroll/Settings buttons were inert, so those screens were navigational
 * dead ends and never showed the active company.
 *
 * The rail is the first place actor access is enforced: Core, Payroll and
 * Settings are administrator modules per the BRD, so an employee or approver
 * is not offered a door they cannot walk through. `canAccessModule` is the one
 * authority — never re-derive the rule from the role id here.
 */
export function BrandRail({ onHome, onCore = onHome, onHrm, onTime, onPayroll, onSettings, active = 'core' }) {
  const { role } = useRole();
  const shows = moduleKey => canAccessModule(role, moduleKey);
  return (
    <aside className="brand-rail" aria-label="Primary navigation">
      <button className="brand-mark" onClick={onHome} aria-label="Home"><Sparkle weight="fill" /></button>
      <button className="rail-button" onClick={onHome} aria-label="Home"><House /></button>
      {shows('core') && <button className={`rail-button ${active === 'core' ? 'active' : ''}`} onClick={onCore} aria-label="Core"><Cube weight="duotone" /></button>}
      {shows('hrm') && <button className={`rail-button ${active === 'hrm' ? 'active' : ''}`} onClick={onHrm} disabled={!onHrm} aria-label={onHrm ? 'HRM' : 'HRM unavailable'}><Users weight={active === 'hrm' ? 'duotone' : 'regular'} /></button>}
      {shows('timekeeping') && <button className={`rail-button ${active === 'time' ? 'active' : ''}`} onClick={onTime} disabled={!onTime} aria-label={onTime ? 'Timekeeping' : 'Time unavailable'}><Clock weight={active === 'time' ? 'duotone' : 'regular'} /></button>}
      {shows('payroll') && <button className={`rail-button ${active === 'payroll' ? 'active' : ''}`} onClick={onPayroll} aria-label="Payroll"><CurrencyCircleDollar weight="duotone" /></button>}
      <div className="rail-spacer" />
      {shows('settings') && <button className={`rail-button ${active === 'settings' ? 'active' : ''}`} onClick={onSettings} aria-label="Settings"><Gear /></button>}
      <button className="rail-button" disabled aria-label="Sign out unavailable"><SignOut /></button>
    </aside>
  );
}

/**
 * The Scenario Studio embeds Atlas in an iframe with `?atlasLiveScenario=1`.
 * Offering the Studio launcher inside that frame would let a viewer open a
 * Scenario Studio inside the simulation it is already driving, so the entry is
 * withheld there — and only there.
 */
export function isEmbeddedScenarioFrame() {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('atlasLiveScenario') === '1';
}

export function Topbar({ company, companies = [], onSelectCompany, profileName = 'John Doe', profileInitials = 'JD', onNotifications, onAnnouncements }) {
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
        {!isEmbeddedScenarioFrame() && <button className="scenario-launcher" type="button" onClick={() => window.dispatchEvent(new CustomEvent('atlas:open-scenarios'))} aria-label="Open Atlas Scenario Studio">
          <PlayCircle weight="duotone" /><span>Scenarios</span>
        </button>}
        <RoleSwitch />
        <button className="icon-button" aria-label="Search"><MagnifyingGlass /></button>
        <button className="icon-button notification" aria-label="Notifications" onClick={onNotifications}><Bell /></button>
        {onAnnouncements && <button className="icon-button" aria-label="Announcements" onClick={onAnnouncements}><Tray /></button>}
        <div className="avatar">{profileInitials}</div>
        <button className="profile">{profileName} <CaretDown weight="bold" /></button>
      </div>
    </header>
  );
}
