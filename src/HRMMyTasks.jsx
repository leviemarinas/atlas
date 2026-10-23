/**
 * HRM ▸ My Tasks ▸ Tasks of the Day, as in Atlas Core.
 *
 * A personal list of tasks and events for the signed-in user: All Tasks, To
 * Do and Done tabs, an overdue-only switch, and a task form with an optional
 * repeat (daily, weekly on chosen days, or monthly) that ends on a date.
 * Completing a repeating task schedules its next occurrence.
 */
import { useMemo, useState } from 'react';
import { CheckCircle, Circle, ClipboardText, PencilSimple, Trash } from '@phosphor-icons/react';
import { EmptyState, ExportMenu, Field, GhostButton, Modal, PageHeading, PrimaryButton, StatusTabs } from './HRMKit.jsx';
import { createHrmId } from './hrmData.js';
import { downloadFile } from './fileDownload.js';

const TABS = ['All Tasks', 'To Do', 'Done'];
const TASK_TYPES = ['Task', 'Event'];
const REPEATS = ['Daily', 'Weekly', 'Monthly'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const pad = value => String(value).padStart(2, '0');
const toLocalInput = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
const dueLabel = value => {
  if (!value) return '—';
  const date = new Date(value);
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
};
const isOverdue = (task, now = new Date()) => !task.completed && task.due && new Date(task.due) < now;

function seedTasks(ownerId) {
  const today = new Date();
  const at = (days, hours, minutes = 0) => { const date = new Date(today); date.setDate(date.getDate() + days); date.setHours(hours, minutes, 0, 0); return toLocalInput(date); };
  return [
    { id: 'task-seed-1', ownerId, type: 'Task', description: 'Review pending leave applications', due: at(0, 17), repeat: false, completed: false },
    { id: 'task-seed-2', ownerId, type: 'Event', description: 'Team stand-up', due: at(1, 9, 30), repeat: true, repeats: 'Weekly', repeatsEvery: 1, days: ['Mon', 'Wed', 'Fri'], endsOn: '', completed: false },
    { id: 'task-seed-3', ownerId, type: 'Task', description: 'Submit time report for last week', due: at(-1, 12), repeat: false, completed: false },
    { id: 'task-seed-4', ownerId, type: 'Task', description: 'Update emergency contact details', due: at(-3, 15), repeat: false, completed: true },
  ];
}

/** The next due date of a repeating task, or null once it passes `endsOn`. */
export function nextOccurrence(task) {
  if (!task.repeat || !task.due) return null;
  const every = Math.max(1, Number(task.repeatsEvery) || 1);
  const next = new Date(task.due);
  if (task.repeats === 'Daily') next.setDate(next.getDate() + every);
  else if (task.repeats === 'Monthly') next.setMonth(next.getMonth() + every);
  else {
    const chosen = (task.days?.length ? task.days : [DAYS[next.getDay()]]).map(day => DAYS.indexOf(day));
    let guard = 0;
    do {
      next.setDate(next.getDate() + 1);
      // Moving past Saturday into a new week skips the weeks in between.
      if (next.getDay() === 0 && every > 1) next.setDate(next.getDate() + 7 * (every - 1));
      guard += 1;
    } while (!chosen.includes(next.getDay()) && guard < 400);
  }
  if (task.endsOn && toLocalInput(next).slice(0, 10) > task.endsOn) return null;
  return toLocalInput(next);
}

function validate(draft) {
  const errors = {};
  if (!draft.description?.trim()) errors.description = 'Task Description is required.';
  if (!draft.due) errors.due = 'Due Date & Time is required.';
  if (draft.repeat) {
    if (!(Number(draft.repeatsEvery) >= 1)) errors.repeatsEvery = 'Repeats Every must be 1 or more.';
    if (draft.repeats === 'Weekly' && !draft.days?.length) errors.days = 'Choose at least one day.';
    if (draft.endsOn && draft.due && draft.endsOn < draft.due.slice(0, 10)) errors.endsOn = 'Ends On cannot be before the due date.';
  }
  return errors;
}

function TaskForm({ draft, setDraft, errors }) {
  const set = patch => setDraft(previous => ({ ...previous, ...patch }));
  return <div className="hrm-form"><div className="hrm-form-grid">
    <Field label="Type" required>
      <div className="hrm-radio-row">{TASK_TYPES.map(type => <label key={type}><input type="radio" name="taskType" checked={draft.type === type} onChange={() => set({ type })} /> {type}</label>)}</div>
    </Field>
    <Field label="Task Description" required error={errors.description}>
      <textarea value={draft.description} onChange={event => set({ description: event.target.value })} placeholder="Input task description" maxLength={300} />
    </Field>
    <Field label="Due Date & Time" required error={errors.due}>
      <input type="datetime-local" value={draft.due} onChange={event => set({ due: event.target.value })} />
    </Field>
    <Field label="Repeat">
      <div className="hrm-radio-row"><label><input type="radio" name="repeat" checked={!draft.repeat} onChange={() => set({ repeat: false })} /> No</label><label><input type="radio" name="repeat" checked={draft.repeat} onChange={() => set({ repeat: true })} /> Yes</label></div>
    </Field>
    {draft.repeat && <>
      <Field label="Repeats"><select value={draft.repeats} onChange={event => set({ repeats: event.target.value })}>{REPEATS.map(option => <option key={option}>{option}</option>)}</select></Field>
      <Field label="Repeats Every" error={errors.repeatsEvery} hint={draft.repeats === 'Daily' ? 'day(s)' : draft.repeats === 'Weekly' ? 'week(s)' : 'month(s)'}>
        <input type="number" min="1" value={draft.repeatsEvery} onChange={event => set({ repeatsEvery: event.target.value })} placeholder="e.g., 1" />
      </Field>
      {draft.repeats === 'Weekly' && <Field label="Specific Days" error={errors.days}>
        <div className="hrm-day-picker">{DAYS.map(day => {
          const on = draft.days?.includes(day);
          return <button key={day} type="button" className={`hrm-btn tiny ${on ? 'primary' : 'outline'}`} aria-pressed={on} onClick={() => set({ days: on ? draft.days.filter(item => item !== day) : [...(draft.days || []), day] })}>{day}</button>;
        })}</div>
      </Field>}
      <Field label="Ends On" error={errors.endsOn} hint="Leave blank to repeat with no end date.">
        <input type="date" value={draft.endsOn || ''} onChange={event => set({ endsOn: event.target.value })} />
      </Field>
    </>}
  </div></div>;
}

export function MyTasksWorkspace({ data, setData, user, onBack, onNotify }) {
  const ownerId = user.employeeId;
  const allTasks = data.myTasks ?? seedTasks(ownerId);
  const tasks = useMemo(() => allTasks.filter(task => task.ownerId === ownerId), [allTasks, ownerId]);
  const [tab, setTab] = useState('All Tasks');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [editing, setEditing] = useState(null);
  const [errors, setErrors] = useState({});
  const [viewing, setViewing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const save = next => setData(current => ({ ...current, myTasks: next }));
  const now = new Date();
  const visible = tasks
    .filter(task => tab === 'All Tasks' || (tab === 'Done' ? task.completed : !task.completed))
    .filter(task => !overdueOnly || tab === 'Done' || isOverdue(task, now))
    .sort((a, b) => String(a.due).localeCompare(String(b.due)));
  const counts = { 'All Tasks': tasks.length, 'To Do': tasks.filter(task => !task.completed).length, Done: tasks.filter(task => task.completed).length };

  const toggle = task => {
    const completing = !task.completed;
    let next = allTasks.map(item => item.id === task.id ? { ...item, completed: completing, completedAt: completing ? new Date().toISOString() : '' } : item);
    const following = completing ? nextOccurrence(task) : null;
    if (following) next = [...next, { ...task, id: createHrmId('task'), due: following, completed: false, completedAt: '' }];
    save(next);
    onNotify(completing ? (following ? `Task done. Next one is due ${dueLabel(following)}.` : 'Task marked as done.') : 'Task moved back to To Do.');
  };
  const submit = () => {
    const problems = validate(editing);
    setErrors(problems);
    if (Object.keys(problems).length) return;
    const record = { ...editing, description: editing.description.trim(), repeatsEvery: Number(editing.repeatsEvery) || 1, days: editing.repeats === 'Weekly' ? editing.days : [] };
    save(record.id ? allTasks.map(item => item.id === record.id ? record : item) : [...allTasks, { ...record, id: createHrmId('task'), ownerId, completed: false }]);
    setEditing(null);
    onNotify(record.id ? 'Task updated successfully!' : 'Task added successfully!');
  };
  const exportTasks = format => {
    if (format !== 'Excel') return onNotify('Tasks export to Excel only.', 'bad');
    const header = ['Type', 'Task Description', 'Due Date & Time', 'Repeats', 'Status'];
    const rows = visible.map(task => [task.type, task.description, dueLabel(task.due), task.repeat ? `${task.repeats} every ${task.repeatsEvery}${task.days?.length ? ` (${task.days.join(', ')})` : ''}` : 'No', task.completed ? 'Done' : isOverdue(task, now) ? 'Overdue' : 'To Do']);
    downloadFile('my-tasks.csv', [header, ...rows].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n'), 'text/csv');
    onNotify(`${rows.length} task(s) exported.`);
  };
  const blank = () => { setErrors({}); setEditing({ type: 'Task', description: '', due: toLocalInput(new Date(Date.now() + 3600000)), repeat: false, repeats: 'Daily', repeatsEvery: 1, days: [], endsOn: '' }); };

  return <div className="hrm-workspace">
    <PageHeading title="Tasks of the Day" eyebrow="My Tasks" onBack={onBack} actions={<div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      {tab !== 'Done' && <label className="hrm-switch"><input type="checkbox" checked={overdueOnly} onChange={event => setOverdueOnly(event.target.checked)} /> View Only Overdue Tasks</label>}
      <PrimaryButton onClick={blank}>Add Task</PrimaryButton>
      <ExportMenu onExport={exportTasks} disabled={!visible.length} />
    </div>} />
    <StatusTabs tabs={TABS} value={tab} onChange={setTab} counts={counts} />
    {visible.length === 0
      ? <EmptyState title="No tasks found" icon={ClipboardText}>{overdueOnly ? 'Nothing is overdue.' : 'Add a task or event to plan your day.'}</EmptyState>
      : <ul className="hrm-mytask-list">{visible.map(task => {
          const overdue = isOverdue(task, now);
          return <li key={task.id} className={task.completed ? 'done' : overdue ? 'overdue' : ''}>
            <button type="button" className="hrm-task-check" aria-label={task.completed ? 'Mark as not done' : 'Mark as done'} onClick={() => toggle(task)}>{task.completed ? <CheckCircle size={22} weight="fill" color="#16a34a" /> : <Circle size={22} />}</button>
            <button type="button" className="hrm-task-body" onClick={() => setViewing(task)}>
              <strong>{task.description}</strong>
              <small>{task.type} · Due {dueLabel(task.due)}{task.repeat ? ` · Repeats ${task.repeats.toLowerCase()}` : ''}{overdue ? ' · Overdue' : ''}</small>
            </button>
            {!task.completed && <div className="row-actions always">
              <button type="button" aria-label="Edit" onClick={() => { setErrors({}); setEditing({ ...task }); }}><PencilSimple /></button>
              <button type="button" aria-label="Delete" onClick={() => setDeleting(task)}><Trash /></button>
            </div>}
          </li>;
        })}</ul>}

    {editing && <Modal title={editing.id ? 'Edit Task' : 'Add Task'} onClose={() => setEditing(null)} footer={<><GhostButton onClick={() => setEditing(null)}>Cancel</GhostButton><PrimaryButton icon={false} onClick={submit}>Save</PrimaryButton></>}>
      <TaskForm draft={editing} setDraft={setEditing} errors={errors} />
    </Modal>}
    {viewing && <Modal title="View Task" onClose={() => setViewing(null)} footer={<GhostButton onClick={() => setViewing(null)}>Close</GhostButton>}>
      <dl className="hrm-detail-list">
        <dt>Type</dt><dd>{viewing.type}</dd>
        <dt>Task Description</dt><dd>{viewing.description}</dd>
        <dt>Due Date & Time</dt><dd>{dueLabel(viewing.due)}</dd>
        <dt>Repeat</dt><dd>{viewing.repeat ? `${viewing.repeats}, every ${viewing.repeatsEvery}${viewing.days?.length ? ` on ${viewing.days.join(', ')}` : ''}${viewing.endsOn ? `, until ${viewing.endsOn}` : ''}` : 'No'}</dd>
        <dt>Status</dt><dd>{viewing.completed ? 'Done' : isOverdue(viewing, now) ? 'Overdue' : 'To Do'}</dd>
      </dl>
    </Modal>}
    {deleting && <Modal title="Delete Task" onClose={() => setDeleting(null)} footer={<><GhostButton onClick={() => setDeleting(null)}>Cancel</GhostButton><button type="button" className="hrm-btn danger" onClick={() => { save(allTasks.filter(item => item.id !== deleting.id)); setDeleting(null); onNotify('Task deleted.'); }}>Delete</button></>}>
      <p>Delete “{deleting.description}”? This cannot be undone.</p>
    </Modal>}
  </div>;
}
