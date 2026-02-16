const DEFAULT_QUALITY = 0.85;

/**
 * Resize a File (image) so its longest side fits within maxDimension.
 * Returns the original file untouched if it's a PDF or already small enough.
 */
export async function resizeImageFile(
	file: File,
	maxDimension: number,
	quality: number = DEFAULT_QUALITY
): Promise<File> {
	// Skip PDFs
	if (file.type === 'application/pdf') return file;
	// Skip non-image files
	if (!file.type.startsWith('image/')) return file;

	return resizeImageBlob(file, maxDimension, quality, file.name);
}

/**
 * Resize a Blob (image) so its longest side fits within maxDimension.
 * Returns a JPEG File. Skips resize if already within bounds.
 */
export async function resizeImageBlob(
	blob: Blob,
	maxDimension: number,
	quality: number = DEFAULT_QUALITY,
	filename: string = 'image.jpg'
): Promise<File> {
	const bitmap = await createImageBitmap(blob);
	const { width, height } = bitmap;

	// Already within bounds -- return as-is
	if (width <= maxDimension && height <= maxDimension) {
		bitmap.close();
		if (blob instanceof File) return blob;
		return new File([blob], filename, { type: blob.type || 'image/jpeg' });
	}

	// Calculate scaled dimensions keeping aspect ratio
	const scale = maxDimension / Math.max(width, height);
	const newWidth = Math.round(width * scale);
	const newHeight = Math.round(height * scale);

	// Draw to canvas
	const canvas = new OffscreenCanvas(newWidth, newHeight);
	const ctx = canvas.getContext('2d')!;
	ctx.drawImage(bitmap, 0, 0, newWidth, newHeight);
	bitmap.close();

	// Export as JPEG
	const outputBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality });

	// Ensure filename has .jpg extension
	const baseName = filename.replace(/\.[^.]+$/, '');
	return new File([outputBlob], `${baseName}.jpg`, { type: 'image/jpeg' });
}
