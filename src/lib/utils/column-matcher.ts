/**
 * Column matching utility for finding columns by key or name
 * Extracts common pattern used across transformation functions
 */

export interface ColumnLike {
	id: string;
	name: string;
}

/**
 * Find a column by key, matching either the column ID exactly or the column name (case-insensitive)
 */
export function findColumnByKeyOrName<T extends ColumnLike>(
	columns: T[],
	key: string
): T | undefined {
	return columns.find((c) => {
		const nameMatch = c.name.toLowerCase() === key.toLowerCase();
		const idMatch = c.id === key;
		return nameMatch || idMatch;
	});
}
