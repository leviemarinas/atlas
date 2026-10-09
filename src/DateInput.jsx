import React, { useEffect, useRef, useState } from 'react';
import { formatUsDate, parseUsDate } from './textFormat.js';

/**
 * A date field that always reads mm/dd/yyyy.
 *
 * `<input type="date">` paints itself in the browser's locale, so the same
 * transaction read dd/mm/yyyy on one machine and mm/dd/yyyy on another. This one
 * types and prints mm/dd/yyyy, still offers the browser's calendar, and hands
 * its parent an ISO string — the form every store and comparison already uses.
 */
export function DateInput({ value, onChange, disabled, min, max, id, 'aria-label': ariaLabel }) {
  const [text, setText] = useState(formatUsDate(value));
  const [invalid, setInvalid] = useState(false);
  const picker = useRef(null);

  useEffect(() => { setText(formatUsDate(value)); setInvalid(false); }, [value]);

  const commit = raw => {
    setText(raw);
    if (!raw.trim()) { setInvalid(false); onChange(''); return; }
    const iso = parseUsDate(raw);
    setInvalid(!iso);
    if (iso) onChange(iso);
  };

  return <span className="date-input">
    <input
      id={id}
      type="text"
      inputMode="numeric"
      placeholder="mm/dd/yyyy"
      maxLength={10}
      value={text}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-invalid={invalid || undefined}
      className={invalid ? 'invalid' : undefined}
      onChange={event => commit(event.target.value)}
      onBlur={() => { if (invalid) { setText(formatUsDate(value)); setInvalid(false); } }}
    />
    <button type="button" className="date-input-picker" disabled={disabled} aria-label="Open calendar" onClick={() => picker.current?.showPicker?.()}>
      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="3" width="12" height="11" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.3" /><path d="M2 6.5h12M5 1.5v3M11 1.5v3" stroke="currentColor" strokeWidth="1.3" fill="none" /></svg>
    </button>
    <input ref={picker} type="date" tabIndex={-1} aria-hidden="true" className="date-input-native" value={value || ''} min={min} max={max} onChange={event => event.target.value && onChange(event.target.value)} />
  </span>;
}
