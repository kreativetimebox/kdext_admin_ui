function escapeCsvField(value) {
  if (value === null || value === undefined) return "";
  const str = typeof value === "string" ? value : JSON.stringify(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Turn an array of row objects into a CSV string.
 * @param {object[]} rows
 * @param {{key: string, label: string}[]} columns
 */
export function rowsToCsv(rows, columns) {
  const header = columns.map((c) => escapeCsvField(c.label)).join(",");
  const lines = rows.map((row) =>
    columns.map((c) => escapeCsvField(row[c.key])).join(",")
  );
  return [header, ...lines].join("\r\n");
}
