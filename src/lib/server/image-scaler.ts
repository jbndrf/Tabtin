/**
 * Image scaling utility for resizing images before LLM processing
 */

import sharp from 'sharp';

// Disable cache and limit concurrency for predictable memory usage
sharp.cache(false);
sharp.concurrency(1);

export interface ScaleResult {
	buffer: Buffer;
	mimeType: string;
	width: number;
	height: number;
}

/**
 * Scale an image by a percentage
 *
 * @param buffer - The image as a Buffer
 * @param scalePercent - Scale percentage (100 = original, 50 = half size, etc.)
 * @param quality - JPEG quality (0-100), default 85
 * @returns Scaled image buffer and metadata
 */
export async function scaleImage(
	buffer: Buffer,
	scalePercent: number,
	quality: number = 85
): Promise<ScaleResult> {
	// Get image metadata first
	const metadata = await sharp(buffer).metadata();
	const originalWidth = metadata.width || 0;
	const originalHeight = metadata.height || 0;

	// 100% or higher = no scaling needed, just get dimensions
	if (scalePercent >= 100) {
		return {
			buffer,
			mimeType: 'image/jpeg',
			width: originalWidth,
			height: originalHeight
		};
	}

	const scale = scalePercent / 100;
	const newWidth = Math.round(originalWidth * scale);
	const newHeight = Math.round(originalHeight * scale);

	const scaledBuffer = await sharp(buffer)
		.resize(newWidth, newHeight, {
			fit: 'fill', // Exact dimensions
			withoutEnlargement: true // Don't upscale
		})
		.jpeg({ quality })
		.toBuffer();

	console.log(
		`[ImageScaler] Scaled image from ${originalWidth}x${originalHeight} to ${newWidth}x${newHeight} (${scalePercent}%, ${Math.round(scaledBuffer.length / 1024)}KB)`
	);

	return {
		buffer: scaledBuffer,
		mimeType: 'image/jpeg',
		width: newWidth,
		height: newHeight
	};
}
