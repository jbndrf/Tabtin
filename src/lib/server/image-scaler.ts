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
 * Scale an image to fit within a maximum dimension (longest side)
 *
 * @param buffer - The image as a Buffer
 * @param maxDimension - Maximum pixels for the longest side, or null for no scaling
 * @param quality - JPEG quality (0-100), default 85
 * @returns Scaled image buffer and metadata
 */
export async function scaleImageToMaxDimension(
	buffer: Buffer,
	maxDimension: number | null,
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

	// null = no scaling, just normalize (EXIF rotation + JPEG conversion)
	if (maxDimension === null) {
		const outputBuffer = await sharp(rotatedBuffer).jpeg({ quality }).toBuffer();

		console.log(
			`[ImageScaler] Normalized image: ${originalWidth}x${originalHeight} (no scaling, ${Math.round(outputBuffer.length / 1024)}KB)`
		);

		return {
			buffer: outputBuffer,
			mimeType: 'image/jpeg',
			width: originalWidth,
			height: originalHeight
		};
	}

	// Check if scaling is needed (only if longest side exceeds maxDimension)
	const longestSide = Math.max(originalWidth, originalHeight);
	if (longestSide <= maxDimension) {
		// Image is already small enough, just convert to JPEG
		const outputBuffer = await sharp(rotatedBuffer).jpeg({ quality }).toBuffer();

		console.log(
			`[ImageScaler] Image already fits: ${originalWidth}x${originalHeight} (max ${maxDimension}px, ${Math.round(outputBuffer.length / 1024)}KB)`
		);

		return {
			buffer: outputBuffer,
			mimeType: 'image/jpeg',
			width: originalWidth,
			height: originalHeight
		};
	}

	// Scale so longest side fits within maxDimension, preserving aspect ratio
	const scaledBuffer = await sharp(rotatedBuffer)
		.resize(maxDimension, maxDimension, {
			fit: 'inside', // Fit within box, preserve aspect ratio
			withoutEnlargement: true // Don't upscale small images
		})
		.jpeg({ quality })
		.toBuffer();

	// Get actual output dimensions
	const scaledMetadata = await sharp(scaledBuffer).metadata();
	const newWidth = scaledMetadata.width || 0;
	const newHeight = scaledMetadata.height || 0;

	console.log(
		`[ImageScaler] Scaled image from ${originalWidth}x${originalHeight} to ${newWidth}x${newHeight} (max ${maxDimension}px, ${Math.round(scaledBuffer.length / 1024)}KB)`
	);

	return {
		buffer: scaledBuffer,
		mimeType: 'image/jpeg',
		width: newWidth,
		height: newHeight
	};
}
