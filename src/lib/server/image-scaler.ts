/**
 * Image scaling utility for resizing images before LLM processing
 * Uses @napi-rs/canvas for server-side image manipulation
 */

import { createCanvas, loadImage } from '@napi-rs/canvas';

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
	// 100% or higher = no scaling needed
	if (scalePercent >= 100) {
		const image = await loadImage(buffer);
		return {
			buffer,
			mimeType: 'image/jpeg',
			width: image.width,
			height: image.height
		};
	}

	const scale = scalePercent / 100;

	// Load the original image
	const image = await loadImage(buffer);
	const originalWidth = image.width;
	const originalHeight = image.height;

	// Calculate new dimensions
	const newWidth = Math.round(originalWidth * scale);
	const newHeight = Math.round(originalHeight * scale);

	// Create canvas with new dimensions
	const canvas = createCanvas(newWidth, newHeight);
	const ctx = canvas.getContext('2d');

	// Draw scaled image
	ctx.drawImage(image, 0, 0, newWidth, newHeight);

	// Convert to JPEG buffer
	const scaledBuffer = canvas.toBuffer('image/jpeg', quality);

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
