/**
 * Minimal Excel reader for the Upload dialog, so the mock-up can import the same
 * .xlsx / .xlsm workbooks Atlas imports. It reads the first worksheet only and
 * returns a grid of strings (row 0 = worksheet row 1). No library is needed:
 * an .xlsx is a zip of XML files and the browser can inflate it natively.
 */

const u16 = (view, at) => view.getUint16(at, true);
const u32 = (view, at) => view.getUint32(at, true);

async function inflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Reads every entry of a zip into a Map of name -> Uint8Array. */
async function unzip(buffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (u32(view, i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('NOT_A_ZIP');
  const count = u16(view, eocd + 10);
  let at = u32(view, eocd + 16);
  const decoder = new TextDecoder();
  const entries = new Map();
  for (let n = 0; n < count; n++) {
    if (u32(view, at) !== 0x02014b50) throw new Error('BAD_ZIP');
    const method = u16(view, at + 10);
    const compressedSize = u32(view, at + 20);
    const nameLength = u16(view, at + 28);
    const extraLength = u16(view, at + 30);
    const commentLength = u16(view, at + 32);
    const localOffset = u32(view, at + 42);
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    const dataStart = localOffset + 30 + u16(view, localOffset + 26) + u16(view, localOffset + 28);
    const raw = bytes.subarray(dataStart, dataStart + compressedSize);
    entries.set(name, method === 0 ? raw : method === 8 ? await inflateRaw(raw) : null);
    at += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

const columnIndex = ref => {
  const letters = /^[A-Z]+/i.exec(ref || '')?.[0].toUpperCase() || 'A';
  return [...letters].reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0) - 1;
};
const rowIndex = ref => (parseInt(/\d+/.exec(ref || '')?.[0], 10) || 1) - 1;

/**
 * @param {File} file an .xlsx / .xlsm workbook
 * @returns {Promise<string[][]>} the first worksheet as rows of cell text
 * @throws Error with message LEGACY_XLS, NOT_A_ZIP, BAD_ZIP or NO_SHEET
 */
export async function readFirstSheet(file) {
  const buffer = await file.arrayBuffer();
  const head = new Uint8Array(buffer, 0, 4);
  if (head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0) throw new Error('LEGACY_XLS');
  const entries = await unzip(buffer);
  const decoder = new TextDecoder();
  const parse = name => {
    const data = entries.get(name);
    return data ? new DOMParser().parseFromString(decoder.decode(data), 'application/xml') : null;
  };
  const sheetName = entries.has('xl/worksheets/sheet1.xml')
    ? 'xl/worksheets/sheet1.xml'
    : [...entries.keys()].filter(key => /^xl\/worksheets\/[^/]+\.xml$/.test(key)).sort()[0];
  const sheet = sheetName && parse(sheetName);
  if (!sheet || sheet.querySelector('parsererror')) throw new Error('NO_SHEET');

  const shared = [];
  const sharedDoc = parse('xl/sharedStrings.xml');
  if (sharedDoc) sharedDoc.querySelectorAll('si').forEach(item => shared.push([...item.querySelectorAll('t')].map(node => node.textContent).join('')));

  const grid = [];
  sheet.querySelectorAll('sheetData > row > c').forEach(cell => {
    const ref = cell.getAttribute('r');
    const type = cell.getAttribute('t');
    let value = '';
    if (type === 'inlineStr') value = [...cell.querySelectorAll('t')].map(node => node.textContent).join('');
    else {
      const raw = cell.querySelector('v')?.textContent ?? '';
      value = type === 's' ? shared[Number(raw)] ?? '' : raw;
    }
    const r = rowIndex(ref);
    (grid[r] ||= [])[columnIndex(ref)] = value;
  });
  return Array.from(grid, row => Array.from(row || [], cell => cell ?? ''));
}
