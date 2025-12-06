/**
 * Map coordinate format to bbox order string for prompt examples
 */
export function getBboxOrder(coordinateFormat: string): string {
	switch (coordinateFormat) {
		case 'normalized_1000_yxyx':
		case 'normalized_1024_yxyx':
			return '[y_min, x_min, y_max, x_max]';
		case 'normalized_1000':
		case 'normalized_1':
		case 'pixels':
		case 'yolo':
		default:
			return '[x1, y1, x2, y2]';
	}
}
