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
	// First apply EXIF rotation to normalize orientation
	// This ensures consistent behavior across platforms (Sharp's prebuilt binaries
	// handle EXIF differently on Alpine vs other systems)
	const rotatedBuffer = await sharp(buffer)
		.rotate() // Auto-rotate based on EXIF orientation tag
		.toBuffer();

	// Get metadata from the correctly-oriented image
	const metadata = await sharp(rotatedBuffer).metadata();
	const originalWidth = metadata.width || 0;
	const originalHeight = metadata.height || 0;

	// 100% or higher = no scaling needed, just convert to JPEG
	if (scalePercent >= 100) {
		const outputBuffer = await sharp(rotatedBuffer)
			.jpeg({ quality })
			.toBuffer();

		console.log(
			`[ImageScaler] Applied EXIF rotation: ${originalWidth}x${originalHeight} (100%, ${Math.round(outputBuffer.length / 1024)}KB)`
		);

		return {
			buffer: outputBuffer,
			mimeType: 'image/jpeg',
			width: originalWidth,
			height: originalHeight
		};
	}

	const scale = scalePercent / 100;
	const newWidth = Math.round(originalWidth * scale);
	const newHeight = Math.round(originalHeight * scale);

	const scaledBuffer = await sharp(rotatedBuffer)
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
