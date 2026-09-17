/** Minimal CSV helpers for the two-column sku,stock_quantity format used
 *  by inventory export/import — no quoting/escaping needed since SKUs and
 *  stock counts never contain commas, so no CSV library dependency. */

export function toCsv(rows) {
  const header = 'sku,stock_quantity';
  const lines = rows.map((r) => `${r.sku},${r.stock_quantity}`);
  return [header, ...lines].join('\n');
}

export function downloadCsv(filename, csvText) {
  const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** Returns [{ sku, stockQuantity }] — throws with a readable message on a
 *  malformed row rather than silently skipping it. */
export function parseCsv(text) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) throw new Error('The file is empty');

  const startIndex = /^sku\s*,/i.test(lines[0]) ? 1 : 0; // tolerate an optional header row
  const rows = [];
  for (let i = startIndex; i < lines.length; i++) {
    const parts = lines[i].split(',');
    if (parts.length < 2) throw new Error(`Row ${i + 1} isn't in "sku,stock_quantity" format: "${lines[i]}"`);
    const sku = parts[0].trim();
    const stockQuantity = Number(parts[1].trim());
    if (!sku) throw new Error(`Row ${i + 1} is missing a SKU`);
    if (!Number.isInteger(stockQuantity) || stockQuantity < 0) {
      throw new Error(`Row ${i + 1} ("${sku}") has an invalid stock quantity: "${parts[1].trim()}"`);
    }
    rows.push({ sku, stockQuantity });
  }
  if (rows.length === 0) throw new Error('No data rows found');
  return rows;
}
