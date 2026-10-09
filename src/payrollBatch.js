const TYPES = Object.freeze(['Earning', 'Bonus', 'Deduction', 'Overtime', 'Work Days', 'Work Hours', 'Withholding Tax', 'Tax Forecast', 'Variable Allowance', 'Leave Conversion']);

function csvRows(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const source = String(text || '').replace(/^\uFEFF/, '');
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === '"') {
      if (quoted && source[index + 1] === '"') { cell += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === ',' && !quoted) { row.push(cell.trim()); cell = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && source[index + 1] === '\n') index += 1;
      row.push(cell.trim());
      if (row.some(value => value !== '')) rows.push(row);
      row = []; cell = '';
    } else cell += char;
  }
  row.push(cell.trim());
  if (row.some(value => value !== '')) rows.push(row);
  return rows;
}

/**
 * `conversion` describes the transaction's Convert leave credits setting, so a
 * Leave Conversion row can be checked against it: whether the switch is on, the
 * leave types it covers, and the conversion window (blank dates are open-ended).
 */
export function parsePayrollBatch(text, { employees = [], payrollType = 'Regular', conversion = null } = {}) {
  const [headers = [], ...rows] = csvRows(text);
  const lower = headers.map(value => value.toLowerCase());
  const required = ['employee code', 'pay item', 'amount'];
  const missing = required.filter(header => !lower.includes(header));
  if (missing.length) return { headers, entries: [], errors: [`Missing required columns: ${missing.join(', ')}`] };
  const at = (row, name) => row[lower.indexOf(name)] || '';
  const entries = rows.map((row, index) => ({
    row: index + 2,
    code: at(row, 'employee code'),
    type: at(row, 'pay item type') || 'Earning',
    item: at(row, 'pay item'),
    amount: Number(at(row, 'amount')),
    date: at(row, 'conversion date'),
    rate: at(row, 'rate'),
  }));
  const errors = [];
  const seen = new Set();
  entries.forEach(entry => {
    if (!employees.some(employee => employee.code === entry.code)) errors.push(`Row ${entry.row}: employee code "${entry.code}" is not in the roster.`);
    if (!TYPES.includes(entry.type)) errors.push(`Row ${entry.row}: Pay Item Type must be ${TYPES.join(', ')}.`);
    if (!entry.item) errors.push(`Row ${entry.row}: Pay Item is required.`);
    if (!Number.isFinite(entry.amount) || entry.amount < 0) errors.push(`Row ${entry.row}: Amount must be a non-negative number.`);
    if (entry.type === 'Variable Allowance') {
      if (!(Number(entry.rate) > 0)) errors.push(`Row ${entry.row}: a variable allowance needs a Rate per hour greater than zero.`);
      if (!(entry.amount > 0)) errors.push(`Row ${entry.row}: Amount is the hours worked and must be greater than zero.`);
    }
    if (entry.type === 'Leave Conversion') {
      if (conversion && !conversion.enabled) errors.push(`Row ${entry.row}: turn on Convert leave credits on this transaction before uploading a leave conversion.`);
      if (!(entry.amount > 0)) errors.push(`Row ${entry.row}: a leave conversion needs a number of days greater than zero in Amount.`);
      if (conversion?.leaveTypes?.length && entry.item && !conversion.leaveTypes.includes(entry.item)) errors.push(`Row ${entry.row}: ${entry.item} is not one of the leave types selected for conversion (${conversion.leaveTypes.join(', ')}).`);
      if (entry.date) {
        const iso = /^\d{4}-\d{2}-\d{2}$/.test(entry.date) ? entry.date : (/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(entry.date) ? entry.date.replace(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, (_, m, d, y) => `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`) : '');
        const window = conversion?.window || {};
        if (!iso) errors.push(`Row ${entry.row}: Conversion Date must be mm/dd/yyyy.`);
        else if ((window.start && iso < window.start) || (window.end && iso > window.end)) errors.push(`Row ${entry.row}: conversion date ${entry.date} falls outside the conversion window.`);
        else entry.date = iso;
      }
    }
    const identity = `${entry.code}|${entry.type}|${entry.item}`.toLowerCase();
    if (seen.has(identity)) errors.push(`Row ${entry.row}: duplicate employee, type and pay item in this file.`);
    seen.add(identity);
  });
  return { headers, entries: errors.length ? [] : entries, errors };
}

export function applyPayrollBatch(overrides = {}, entries = [], employees = [], batchName = '') {
  const source = `Batch ${batchName}`;
  const next = structuredClone(overrides);
  entries.forEach(entry => {
    const employee = employees.find(row => row.code === entry.code);
    if (!employee) return;
    const current = next[employee.employeeId] || {};
    if (entry.type === 'Variable Allowance') {
      current.variableAllowances = [...(current.variableAllowances || []), { code: entry.item, rate: Number(entry.rate), hours: entry.amount, source }];
    } else if (entry.type === 'Leave Conversion') {
      current.leaveConversions = [...(current.leaveConversions || []), { leaveType: entry.item, days: entry.amount, date: entry.date || '', source }];
    } else if (entry.type === 'Earning' || entry.type === 'Overtime') {
      const name = entry.type === 'Overtime' ? `Overtime — ${entry.item}` : entry.item;
      current.earnings = [...(current.earnings || []), { code: entry.type === 'Overtime' ? 'MAN-OT' : 'BATCH', name, classification: 'Taxable Allowance', amount: entry.amount, source }];
    } else if (entry.type === 'Bonus') {
      current.bonuses = [...(current.bonuses || []), { name: entry.item, amount: entry.amount, source }];
    } else if (entry.type === 'Deduction') {
      current.deductions = [...(current.deductions || []), { code: 'BATCH-DED', name: entry.item, group: 'Deduction', kind: 'Company', due: entry.amount, outstanding: entry.amount, rank: 55, canAdjust: true, source }];
    } else {
      const field = entry.type === 'Work Days' ? 'daysInPeriod' : entry.type === 'Work Hours' ? 'hoursInPeriod' : entry.type === 'Tax Forecast' ? 'taxForecast' : 'withholdingTax';
      current[field] = entry.amount;
      current.batchFields = { ...(current.batchFields || {}), [field]: source };
    }
    next[employee.employeeId] = current;
  });
  return next;
}

export function rollbackPayrollBatch(overrides = {}, batchName = '') {
  const source = `Batch ${batchName}`;
  return Object.fromEntries(Object.entries(overrides).map(([employeeId, current]) => {
    const next = {
      ...current,
      earnings: (current.earnings || []).filter(row => row.source !== source),
      bonuses: (current.bonuses || []).filter(row => row.source !== source),
      deductions: (current.deductions || []).filter(row => row.source !== source),
      leaveConversions: (current.leaveConversions || []).filter(row => row.source !== source),
      variableAllowances: (current.variableAllowances || []).filter(row => row.source !== source),
    };
    Object.entries(current.batchFields || {}).forEach(([field, owner]) => {
      if (owner === source) delete next[field];
    });
    next.batchFields = Object.fromEntries(Object.entries(current.batchFields || {}).filter(([, owner]) => owner !== source));
    return [employeeId, next];
  }));
}

export { TYPES as PAYROLL_BATCH_TYPES };

