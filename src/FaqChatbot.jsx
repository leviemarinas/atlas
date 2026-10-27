/**
 * Core ▸ FAQ (FAQ Category Management and FAQ Management) and the floating
 * Atlas chatbot that answers from the published FAQs, as in Atlas Core.
 *
 * The chatbot is a scripted conversation, not free text: type "help", pick a
 * category by number, pick a question by number, read the answer, then say
 * YES or NO. `createFaqChatFlow` mirrors Atlas Core's FaqChatFlow line for line.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ChatDots, MagnifyingGlass, PaperPlaneRight, PencilSimple, Plus, Trash, X } from '@phosphor-icons/react';
import { appendAuditEvent, readActiveCompanyId } from './companyRepository';
import { useRole } from './RoleContext';
import { downloadFile } from './fileDownload';

/* ------------------------------------------------------------------ store */

const storeKey = companyId => `atlas-faq-${companyId}-v1`;
const today = () => {
  const now = new Date();
  const pad = value => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};
const seedStore = () => ({
  categories: [
    { id: 'faqc-1', name: 'Payroll' },
    { id: 'faqc-2', name: 'Leave' },
    { id: 'faqc-3', name: 'Account' },
  ],
  faqs: [
    { id: 'faq-1', categoryId: 'faqc-1', question: 'When is payday?', answer: 'Salaries are released every 15th and last day of the month. When payday falls on a weekend or holiday, it is released on the working day before.', author: 'Client Admin', publish: 'Now', publishDate: '2026-09-01', lastUpdated: '2026-09-01' },
    { id: 'faq-2', categoryId: 'faqc-1', question: 'Where can I see my payslip?', answer: 'Go to HRM ▸ Employee Self-inquiry ▸ Payslips & Payroll History.', author: 'Client Admin', publish: 'Now', publishDate: '2026-09-01', lastUpdated: '2026-09-01' },
    { id: 'faq-3', categoryId: 'faqc-2', question: 'How do I file a leave?', answer: 'Go to HRM ▸ Employee Self-Service ▸ Leave Application, then click Apply for Leave.', author: 'Client Admin', publish: 'Now', publishDate: '2026-09-01', lastUpdated: '2026-09-01' },
    { id: 'faq-4', categoryId: 'faqc-3', question: 'How do I reset my password?', answer: 'Click Forgot Password on the sign-in page and follow the link sent to your email.', author: 'Client Admin', publish: 'Later', publishDate: '2026-12-01', lastUpdated: '2026-10-01' },
  ],
});

export function readFaqStore(companyId = readActiveCompanyId()) {
  try { return JSON.parse(localStorage.getItem(storeKey(companyId))) || seedStore(); } catch { return seedStore(); }
}
function writeFaqStore(companyId, store) {
  try { localStorage.setItem(storeKey(companyId), JSON.stringify(store)); } catch { /* keep the in-memory copy */ }
}

export const isPublished = (faq, on = today()) => faq.publish === 'Now' || (faq.publishDate && faq.publishDate <= on);
export const faqStatus = faq => isPublished(faq) ? 'Published' : 'Scheduled';

/** Published FAQs grouped by category, in category order; empty categories are left out. */
export function publishedFaqGroups(store) {
  return store.categories
    .map(category => [category.name, store.faqs.filter(faq => faq.categoryId === category.id && isPublished(faq))])
    .filter(([, faqs]) => faqs.length > 0);
}

/* ------------------------------------------------------------ chat flow */

export const WELCOME_TEXT = "Welcome to Atlas chatbot. Please type 'help' to show all queries.";

export function createFaqChatFlow(groups) {
  let categories = groups;
  let state = 'default';
  let categoryIndex = -1;
  const reply = (...lines) => [lines];
  const showCategories = heading => {
    if (!categories.length) { state = 'default'; return reply('There are no FAQs available yet. Please contact your administrator for your concerns.'); }
    state = 'category';
    return reply(heading, ...categories.map(([name], index) => `${index + 1}. ${name}`));
  };
  return {
    get state() { return state; },
    /** Swaps in a fresh FAQ list, only between conversations so numbers already shown stay valid. */
    updateCategories(next) { if (state !== 'default') return false; categories = next; return true; },
    respond(input) {
      const text = String(input ?? '').trim().toLowerCase();
      if (text === 'help') return showCategories('Please type option number below:');
      if (state === 'category') {
        const number = Number.parseInt(text, 10);
        if (!/^\d+$/.test(text)) return reply('Invalid response. Please enter a category number.');
        if (number < 1 || number > categories.length) return reply('Invalid option. Select another.');
        categoryIndex = number - 1;
        const [name, faqs] = categories[categoryIndex];
        state = 'question';
        return [[`${name} FAQs:`, ...faqs.map((faq, index) => `${index + 1}. ${faq.question}`)], ['Please select a question number to view the answer.']];
      }
      if (state === 'question') {
        const faqs = categories[categoryIndex][1];
        const number = Number.parseInt(text, 10);
        if (!/^\d+$/.test(text)) return reply('Invalid response. Please enter a question number.');
        if (number < 1 || number > faqs.length) return reply('Invalid question number. Please select another.');
        state = 'confirm';
        return [[faqs[number - 1].answer], ['Did you find the answer you were looking for? Type YES or NO.']];
      }
      if (state === 'confirm') {
        if (text === 'yes') { state = 'default'; return reply(WELCOME_TEXT); }
        if (text === 'no') { state = 'more'; return reply('Please choose an option:', '1. More options', '2. Contact administrator'); }
        return reply('Please type YES or NO.');
      }
      if (state === 'more') {
        if (text === '1' || text === 'more options') return showCategories('Other available categories:');
        if (text === '2' || text === 'contact administrator') { state = 'default'; return reply('Please contact your administrator for your concerns.'); }
        return reply('Invalid option. Please choose 1 or 2.');
      }
      return reply("Invalid response. Please type 'help' to show all queries.");
    },
  };
}

/* ---------------------------------------------------------- chat widget */

const timeLabel = date => date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

export function FaqChatbot() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState(() => [{ from: 'bot', lines: [WELCOME_TEXT], at: new Date() }]);
  const flow = useRef(createFaqChatFlow(publishedFaqGroups(readFaqStore())));
  const body = useRef(null);

  const toggle = () => {
    // FAQs change (and so can the company): pick up the current list on every open.
    if (!open) flow.current.updateCategories(publishedFaqGroups(readFaqStore()));
    setOpen(!open);
  };
  useEffect(() => {
    const openChat = () => { flow.current.updateCategories(publishedFaqGroups(readFaqStore())); setOpen(true); };
    window.addEventListener('atlas:open-chat', openChat);
    return () => window.removeEventListener('atlas:open-chat', openChat);
  }, []);
  useEffect(() => { if (open && body.current) body.current.scrollTop = body.current.scrollHeight; }, [messages, open]);

  const send = () => {
    const text = message.trim();
    if (!text) return;
    const at = new Date();
    // The flow is stateful, so it answers once here, never inside the state updater (which may run twice).
    const replies = flow.current.respond(text).map(lines => ({ from: 'bot', lines, at }));
    setMessages(previous => [...previous, { from: 'you', lines: [text], at }, ...replies]);
    setMessage('');
  };

  if (!open) return <button type="button" className="faq-chat-toggle" onClick={toggle} aria-label="Open chat" title="Open chat"><ChatDots size={24} weight="fill" /></button>;
  return <section className="faq-chat-window" aria-label="Chat">
    <header><span>Chat</span><button type="button" onClick={toggle} aria-label="Close chat" title="Close chat"><X size={14} weight="bold" /></button></header>
    <div className="faq-chat-body" ref={body} role="log" aria-live="polite">
      {messages.map((entry, index) => <div key={index} className={`faq-chat-row ${entry.from}`}>
        <div className="faq-chat-bubble">{entry.lines.map((line, lineIndex) => <div key={lineIndex}>{line}</div>)}<small>{timeLabel(entry.at)}</small></div>
      </div>)}
    </div>
    <footer>
      <input value={message} maxLength={200} autoComplete="off" placeholder="Type a message..." aria-label="Type a message" onChange={event => setMessage(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') send(); }} />
      <button type="button" onClick={send} disabled={!message.trim()} aria-label="Send message" title="Send message"><PaperPlaneRight size={16} weight="fill" /></button>
    </footer>
  </section>;
}

/* ------------------------------------------------------ FAQ management */

export function FaqManagementWorkspace({ onBack, notify, companyId = readActiveCompanyId() }) {
  const { actor } = useRole();
  const [store, setStore] = useState(() => readFaqStore(companyId));
  const [tab, setTab] = useState('categories');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const persist = (next, action, summary) => {
    setStore(next); writeFaqStore(companyId, next);
    appendAuditEvent({ companyId, actor, action, entityType: 'FAQ', entityId: companyId, summary });
  };
  const categoryName = id => store.categories.find(category => category.id === id)?.name || '—';
  const needle = query.toLowerCase();
  const categories = store.categories.filter(category => category.name.toLowerCase().includes(needle));
  const faqs = store.faqs.filter(faq => `${faq.question} ${faq.answer} ${categoryName(faq.categoryId)}`.toLowerCase().includes(needle));

  const saveCategory = event => {
    event.preventDefault();
    const name = editing.name.trim();
    if (!name) return notify({ type: 'error', message: 'Name is required.' });
    if (store.categories.some(category => category.id !== editing.id && category.name.toLowerCase() === name.toLowerCase())) return notify({ type: 'error', message: `${name} already exists.` });
    const categoriesNext = editing.id ? store.categories.map(category => category.id === editing.id ? { ...category, name } : category) : [...store.categories, { id: `faqc-${Date.now()}`, name }];
    persist({ ...store, categories: categoriesNext }, 'FaqCategorySaved', `FAQ category ${name} ${editing.id ? 'updated' : 'added'}.`);
    setEditing(null);
    notify({ type: 'success', message: `FAQ category ${editing.id ? 'updated' : 'added'}.` });
  };
  const saveFaq = event => {
    event.preventDefault();
    const draft = { ...editing, question: editing.question.trim(), answer: editing.answer.trim() };
    if (!draft.categoryId || !draft.question || !draft.answer) return notify({ type: 'error', message: 'FAQ Category, Question and Answer are required.' });
    if (draft.publish === 'Later' && !draft.publishDate) return notify({ type: 'error', message: 'Publish Date is required when publishing later.' });
    if (draft.publish === 'Later' && draft.publishDate <= today()) return notify({ type: 'error', message: 'A later publish date must be after today. Choose Publish Now to publish today.' });
    const prepared = { ...draft, publishDate: draft.publish === 'Now' ? today() : draft.publishDate, author: draft.author || actor, lastUpdated: today() };
    const faqsNext = draft.id ? store.faqs.map(faq => faq.id === draft.id ? prepared : faq) : [...store.faqs, { ...prepared, id: `faq-${Date.now()}` }];
    persist({ ...store, faqs: faqsNext }, 'FaqSaved', `FAQ "${prepared.question}" ${draft.id ? 'updated' : 'added'} (${faqStatus(prepared)}).`);
    setEditing(null);
    notify({ type: 'success', message: `FAQ ${draft.id ? 'updated' : 'added'}${prepared.publish === 'Later' ? ` and scheduled for ${prepared.publishDate}` : ' and published'}.` });
  };
  const confirmDelete = () => {
    if (deleting.kind === 'category') {
      if (store.faqs.some(faq => faq.categoryId === deleting.row.id)) { setDeleting(null); return notify({ type: 'error', message: 'This category still has FAQs. Move or delete them first.' }); }
      persist({ ...store, categories: store.categories.filter(category => category.id !== deleting.row.id) }, 'FaqCategoryDeleted', `FAQ category ${deleting.row.name} deleted.`);
    } else {
      persist({ ...store, faqs: store.faqs.filter(faq => faq.id !== deleting.row.id) }, 'FaqDeleted', `FAQ "${deleting.row.question}" deleted.`);
    }
    setDeleting(null);
    notify({ type: 'success', message: 'Deleted.' });
  };
  const exportRows = () => {
    const rows = tab === 'categories'
      ? [['FAQ Category'], ...categories.map(category => [category.name])]
      : [['FAQ Category', 'Question', 'Answer', 'Author', 'Publish now or later options', 'Publish Date', 'Status', 'Last Updated'], ...faqs.map(faq => [categoryName(faq.categoryId), faq.question, faq.answer, faq.author, faq.publish === 'Now' ? 'Publish Now' : 'Publish Later', faq.publishDate, faqStatus(faq), faq.lastUpdated])];
    downloadFile(tab === 'categories' ? 'faq-categories.csv' : 'faqs.csv', rows.map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n'), 'text/csv');
    notify({ type: 'success', message: `${rows.length - 1} row(s) exported.` });
  };

  return <div className="page-content operational-workspace">
    <button className="inline-back" onClick={onBack}><ArrowLeft /> Back</button>
    <div className="page-heading"><div><p className="breadcrumb">Core / FAQ / {tab === 'categories' ? 'FAQ Category Management' : 'FAQ Management'}</p><h1>FAQ Management</h1><p className="page-description">Published FAQs are what the Atlas chatbot answers from.</p></div></div>
    <nav className="employee-tabs">{[['categories', 'FAQ Category Management'], ['faqs', 'FAQ Management']].map(([key, label]) => <button key={key} className={key === tab ? 'active' : ''} onClick={() => { setTab(key); setQuery(''); }}>{label}</button>)}</nav>
    <div className="config-toolbar">
      <div className="search-box"><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search..." /><MagnifyingGlass /></div>
      <button className="button secondary" onClick={exportRows}>Export</button>
      <button className="button primary" onClick={() => setEditing(tab === 'categories' ? { kind: 'category', name: '' } : { kind: 'faq', categoryId: '', question: '', answer: '', publish: 'Now', publishDate: '' })}><Plus /> Add</button>
    </div>
    {tab === 'categories'
      ? <div className="table-card"><table><thead><tr><th>FAQ Category</th><th>FAQs</th><th>Action</th></tr></thead><tbody>{categories.length ? categories.map(category => <tr key={category.id}><td>{category.name}</td><td>{store.faqs.filter(faq => faq.categoryId === category.id).length}</td><td><div className="row-actions always"><button aria-label="Edit" onClick={() => setEditing({ kind: 'category', ...category })}><PencilSimple /></button><button aria-label="Delete" onClick={() => setDeleting({ kind: 'category', row: category })}><Trash /></button></div></td></tr>) : <tr><td colSpan={3}>No data found.</td></tr>}</tbody></table></div>
      : <div className="table-card"><table><thead><tr><th>FAQ Category</th><th>Question</th><th>Answer</th><th>Author</th><th>Publish now or later options</th><th>Status</th><th>Last Updated</th><th>Action</th></tr></thead><tbody>{faqs.length ? faqs.map(faq => <tr key={faq.id}><td>{categoryName(faq.categoryId)}</td><td>{faq.question}</td><td className="faq-answer-cell">{faq.answer}</td><td>{faq.author}</td><td>{faq.publish === 'Now' ? 'Publish Now' : `Publish Later (${faq.publishDate})`}</td><td><span className={`status-pill ${isPublished(faq) ? 'active' : 'pending'}`}>{faqStatus(faq)}</span></td><td>{faq.lastUpdated}</td><td><div className="row-actions always"><button aria-label="Edit" onClick={() => setEditing({ kind: 'faq', ...faq })}><PencilSimple /></button><button aria-label="Delete" onClick={() => setDeleting({ kind: 'faq', row: faq })}><Trash /></button></div></td></tr>) : <tr><td colSpan={8}>No data found.</td></tr>}</tbody></table></div>}

    {editing?.kind === 'category' && <div className="modal-backdrop"><section className="modal canonical-modal"><header><h2>{editing.id ? 'Edit FAQ Category' : 'Add FAQ Category'}</h2><button className="icon-button" onClick={() => setEditing(null)}><X /></button></header><form onSubmit={saveCategory}><div className="canonical-form-grid"><label>Name<span className="required">*</span><input required maxLength={100} value={editing.name} onChange={event => setEditing({ ...editing, name: event.target.value })} placeholder="Input name" /></label></div><footer className="modal-actions"><button type="button" className="button secondary" onClick={() => setEditing(null)}>Cancel</button><button className="button primary">Save</button></footer></form></section></div>}
    {editing?.kind === 'faq' && <div className="modal-backdrop"><section className="modal canonical-modal"><header><h2>{editing.id ? 'Edit FAQ' : 'Add FAQ'}</h2><button className="icon-button" onClick={() => setEditing(null)}><X /></button></header><form onSubmit={saveFaq}><div className="canonical-form-grid">
      <label>FAQ Category<span className="required">*</span><select required value={editing.categoryId} onChange={event => setEditing({ ...editing, categoryId: event.target.value })}><option value="" disabled>Please select</option>{store.categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
      <label>Question<span className="required">*</span><input required maxLength={300} value={editing.question} onChange={event => setEditing({ ...editing, question: event.target.value })} placeholder="Input question" /></label>
      <label>Answer<span className="required">*</span><textarea required maxLength={2000} value={editing.answer} onChange={event => setEditing({ ...editing, answer: event.target.value })} placeholder="Input answer" /></label>
      <div className="faq-publish-options"><label className="checkbox-row"><input type="radio" name="publish" checked={editing.publish === 'Now'} onChange={() => setEditing({ ...editing, publish: 'Now' })} /> Publish Now</label><label className="checkbox-row"><input type="radio" name="publish" checked={editing.publish === 'Later'} onChange={() => setEditing({ ...editing, publish: 'Later' })} /> Publish Later</label></div>
      {editing.publish === 'Later' && <label>Publish Date<span className="required">*</span><input type="date" min={today()} value={editing.publishDate} onChange={event => setEditing({ ...editing, publishDate: event.target.value })} /></label>}
    </div><footer className="modal-actions"><button type="button" className="button secondary" onClick={() => setEditing(null)}>Cancel</button><button className="button primary">Save</button></footer></form></section></div>}
    {deleting && <div className="modal-backdrop"><section className="modal canonical-modal"><header><h2>Delete Item</h2><button className="icon-button" onClick={() => setDeleting(null)}><X /></button></header><div className="modal-body"><p>Delete “{deleting.kind === 'category' ? deleting.row.name : deleting.row.question}”? This cannot be undone.</p></div><footer className="modal-actions"><button type="button" className="button secondary" onClick={() => setDeleting(null)}>Cancel</button><button className="button primary" onClick={confirmDelete}>Delete</button></footer></section></div>}
  </div>;
}
