const xmlEscape = value => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&apos;');

const ascii = value => String(value ?? '')
  .normalize('NFKD').replace(/[^\x20-\x7E]/g, match => (match === '₱' ? 'PHP ' : '-'));

export function spreadsheetXml(title, columns, rows) {
  const rowXml = values => `<Row>${values.map(value => {
    const numeric = typeof value === 'number' && Number.isFinite(value);
    return `<Cell><Data ss:Type="${numeric ? 'Number' : 'String'}">${xmlEscape(value)}</Data></Cell>`;
  }).join('')}</Row>`;
  return `<?xml version="1.0"?>\n<?mso-application progid="Excel.Sheet"?>\n`
    + `<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">`
    + `<Worksheet ss:Name="${xmlEscape(String(title || 'Payroll').slice(0, 31))}"><Table>`
    + rowXml(columns) + rows.map(rowXml).join('')
    + '</Table></Worksheet></Workbook>';
}

const pdfEscape = value => ascii(value).replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');

/** A small dependency-free, landscape PDF writer for auditable payroll tables. */
export function simpleTablePdf(title, columns, rows) {
  const tableLines = [columns, ...rows].map(values => values.map(value => ascii(value)).join(' | ').slice(0, 155));
  const pages = [];
  for (let index = 0; index < tableLines.length; index += 52) {
    pages.push([ascii(title), `Rows ${index + 1}-${Math.min(index + 52, tableLines.length)} of ${tableLines.length}`, '', ...tableLines.slice(index, index + 52)]);
  }
  if (!pages.length) pages.push([ascii(title), 'No rows']);

  const objects = new Map();
  const pageRefs = pages.map((_, index) => 3 + index * 2);
  const fontRef = 3 + pages.length * 2;
  objects.set(1, '<< /Type /Catalog /Pages 2 0 R >>');
  objects.set(2, `<< /Type /Pages /Kids [${pageRefs.map(ref => `${ref} 0 R`).join(' ')}] /Count ${pages.length} >>`);
  pages.forEach((lines, index) => {
    const pageRef = pageRefs[index];
    const contentRef = pageRef + 1;
    const commands = `BT /F1 7 Tf 24 584 Td 9.5 TL ${lines.map(line => `(${pdfEscape(line)}) Tj T*`).join(' ')} ET`;
    objects.set(pageRef, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 792 612] /Resources << /Font << /F1 ${fontRef} 0 R >> >> /Contents ${contentRef} 0 R >>`);
    objects.set(contentRef, `<< /Length ${commands.length} >>\nstream\n${commands}\nendstream`);
  });
  objects.set(fontRef, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (let ref = 1; ref <= fontRef; ref += 1) {
    offsets[ref] = pdf.length;
    pdf += `${ref} 0 obj\n${objects.get(ref)}\nendobj\n`;
  }
  const xref = pdf.length;
  pdf += `xref\n0 ${fontRef + 1}\n0000000000 65535 f \n`;
  for (let ref = 1; ref <= fontRef; ref += 1) pdf += `${String(offsets[ref]).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${fontRef + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

