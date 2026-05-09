
export type SortKey = "title" | "rating" | "year" | "name" | "count";
export type SortOrder = "asc" | "desc";

/**
 * Generic sort function for library items.
 * Handles strings, numbers, and dates with null-safety.
 */
export function sortItems<T extends Record<string, unknown>>(items: T[], key: string, order: SortOrder): T[] {
  return [...items].sort((a: T, b: T) => {
    let valA = a[key];
    let valB = b[key];

    // Handle special case for genre sorting (name key should map to genre property)
    if (key === "name" && 'genre' in a && a.genre !== undefined) {
      valA = a.genre;
      valB = (b as Record<string, unknown>).genre;
    }

    // Handle nulls/undefineds (always push to end)
    if (valA === null || valA === undefined) return 1;
    if (valB === null || valB === undefined) return -1;

    // String comparison
    if (typeof valA === "string" && typeof valB === "string") {
      const strA = valA.toLowerCase();
      const strB = valB.toLowerCase();
      if (strA < strB) return order === "asc" ? -1 : 1;
      if (strA > strB) return order === "asc" ? 1 : -1;
      return 0;
    }

    // Numeric comparison
    const numA = Number(valA);
    const numB = Number(valB);
    if (!isNaN(numA) && !isNaN(numB)) {
      if (numA < numB) return order === "asc" ? -1 : 1;
      if (numA > numB) return order === "asc" ? 1 : -1;
      return 0;
    }

    return 0;
  });
}
