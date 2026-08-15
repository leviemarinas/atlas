import { useMemo, useState } from 'react';
import { ArrowRight, CheckCircle, MagnifyingGlass, MapPin, SealCheck } from '@phosphor-icons/react';
import { moduleFeatureAreas, moduleFeatureCatalog } from './moduleFeatureCatalog';
import { plural } from './textFormat';

const uniqueRefs = modules => new Set(modules.flatMap(module => module.features.flatMap(feature => feature.refs))).size;

export function ModulesFeaturesTab({ onOpenModule }) {
  const [query, setQuery] = useState('');
  const [area, setArea] = useState('All modules');
  const filtered = useMemo(() => moduleFeatureCatalog.filter(module => {
    const searchable = [module.name, module.area, module.description, module.location, ...module.features.flatMap(feature => [feature.name, ...feature.refs])].join(' ').toLowerCase();
    return (area === 'All modules' || module.area === area) && searchable.includes(query.trim().toLowerCase());
  }), [area, query]);
  const featureCount = moduleFeatureCatalog.reduce((total, module) => total + module.features.length, 0);
  const referenceCount = uniqueRefs(moduleFeatureCatalog);

  return <section className="module-feature-register">
    <div className="module-feature-heading">
      <div><span className="module-feature-kicker"><SealCheck weight="fill" /> Phase 2 implementation register</span><h2>Modules & Features</h2><p>Only project-plan requirements with an implemented Atlas screen or control are listed. Planned-only and Phase 1 self-service items are intentionally excluded.</p></div>
      <div className="module-feature-summary" aria-label="Implementation summary">
        <div><strong>{moduleFeatureCatalog.length}</strong><span>implemented {plural(moduleFeatureCatalog.length, 'module')}</span></div>
        <div><strong>{featureCount}</strong><span>traced {plural(featureCount, 'feature group')}</span></div>
        <div><strong>{referenceCount}</strong><span>project-plan {plural(referenceCount, 'reference')}</span></div>
      </div>
    </div>

    <div className="module-feature-source"><CheckCircle weight="fill" /><span>Aligned to <strong>Modules and Features</strong>, <strong>Payroll (Phase 2)</strong>, <strong>UI Status</strong>, <strong>Functional</strong> and <strong>Reports</strong> in the project plan.</span></div>

    <div className="module-feature-toolbar">
      <div className="search-box"><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search module, feature or HTP number..." aria-label="Search modules and features" /><MagnifyingGlass /></div>
      <div className="module-area-filters" aria-label="Filter by area">{moduleFeatureAreas.map(item => {
        const count = item === 'All modules' ? moduleFeatureCatalog.length : moduleFeatureCatalog.filter(module => module.area === item).length;
        return <button key={item} className={area === item ? 'active' : ''} onClick={() => setArea(item)}>{item}<span>{count}</span></button>;
      })}</div>
    </div>

    {filtered.length ? <div className="module-feature-grid">{filtered.map(module => <article className="module-feature-card" key={module.id}>
      <header><div><small>{module.area}</small><h3>{module.name}</h3></div><span className="implemented-pill"><CheckCircle weight="fill" /> Implemented</span></header>
      <p>{module.description}</p>
      <div className="module-feature-items">{module.features.map(feature => <div key={`${module.id}-${feature.name}`}><span>{feature.name}</span><small>{feature.refs.map(reference => <code key={reference}>{reference}</code>)}</small></div>)}</div>
      <footer><span><MapPin /> {module.location}</span><button className="button secondary" onClick={() => onOpenModule(module.target)}>Open module <ArrowRight /></button></footer>
    </article>)}</div> : <div className="module-feature-empty"><MagnifyingGlass /><h3>No implemented module found</h3><p>Try a different module name, capability or HTP feature number.</p></div>}
  </section>;
}

