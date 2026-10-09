/** Pluralises a counted noun so a single row never reads "1 tickets". */
export function plural(count, singular, pluralForm = `${singular}s`) {
  return Number(count) === 1 ? singular : pluralForm;
}

/**
 * A date as mm/dd/yyyy. The stores mix ISO (2026-10-07) and MM/DD/YYYY, and a
 * native date input paints itself in the browser's locale, so anything the
 * payroll screens print goes through here and reads the same everywhere.
 */
export function formatUsDate(value) {
  if (!value) return '';
  const raw = String(value).trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (iso) return `${iso[2]}/${iso[3]}/${iso[1]}`;
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw);
  if (us) return `${us[1].padStart(2, '0')}/${us[2].padStart(2, '0')}/${us[3]}`;
  return raw;
}

/** mm/dd/yyyy typed by a person → ISO, or '' when it is not a real calendar date. */
export function parseUsDate(text) {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(text || '').trim());
  if (!match) return '';
  const [month, day, year] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const probe = new Date(year, month - 1, day);
  if (probe.getFullYear() !== year || probe.getMonth() !== month - 1 || probe.getDate() !== day) return '';
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** "2026-09-28 06:14:02" → "09/28/2026 06:14:02"; anything else is returned as written. */
export function stampUs(value) {
  const raw = String(value ?? '');
  const match = /^(\d{4}-\d{2}-\d{2})[ T](.*)$/.exec(raw);
  return match ? `${formatUsDate(match[1])} ${match[2].replace(/\.\d+Z?$/, '').replace(/Z$/, '')}`.trim() : formatUsDate(raw);
}
