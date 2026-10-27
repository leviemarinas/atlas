/** Local-date helpers shared by the Atlas Core screens (never UTC, so "today" is the user's today). */
export const todayIso = () => {
  const now = new Date();
  const pad = value => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

export const formatUs = value => {
  if (!value || !/^\d{4}-\d{2}-\d{2}/.test(value)) return value || '—';
  const [year, month, day] = value.slice(0, 10).split('-');
  return `${month}/${day}/${year}`;
};
