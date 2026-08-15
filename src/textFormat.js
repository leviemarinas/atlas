/** Pluralises a counted noun so a single row never reads "1 tickets". */
export function plural(count, singular, pluralForm = `${singular}s`) {
  return Number(count) === 1 ? singular : pluralForm;
}
