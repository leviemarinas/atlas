/**
 * The order Bonus, Deduction and Company Loan Configurations were created in.
 *
 * They carry no Effective Date, so a Bonus, Deduction or Company Loan Hierarchy that does not
 * rank an item (or no hierarchy at all) falls back to oldest first: the Date Created, then the
 * record's id. Ids only ever grow, add or upload, and an upload takes them in file order, so a
 * file of records created on the same day keeps the order of its rows. A record with no Date
 * Created, such as a seeded one, counts as the oldest.
 */
const createdTime = record => {
  const time = Date.parse(record?.dateCreated);
  return Number.isFinite(time) ? time : 0;
};

export const byCreation = (left, right) => createdTime(left) - createdTime(right)
  || (Number(left?.id) || 0) - (Number(right?.id) || 0)
  || String(left?.code || '').localeCompare(String(right?.code || ''), undefined, { numeric: true });
