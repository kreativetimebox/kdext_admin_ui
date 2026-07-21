/**
 * Validate a client-supplied sort column against a fixed whitelist and
 * build a safe `ORDER BY <column> <ASC|DESC> NULLS LAST` clause. Column
 * names can never be parameterized ($1, $2, ...) in SQL, so this whitelist
 * is what keeps arbitrary user input out of the query string. Falls back
 * to `defaultColumn` (always DESC) when sortBy is missing or not allowed.
 *
 * @param {string} sortBy
 * @param {string} sortOrder - "asc" | "desc"
 * @param {Set<string>} allowedColumns
 * @param {string} defaultColumn
 */
export function buildOrderByClause(sortBy, sortOrder, allowedColumns, defaultColumn) {
  const column = allowedColumns.has(sortBy) ? sortBy : defaultColumn;
  const direction = String(sortOrder).toLowerCase() === "asc" ? "ASC" : "DESC";
  return `ORDER BY ${column} ${direction} NULLS LAST`;
}
