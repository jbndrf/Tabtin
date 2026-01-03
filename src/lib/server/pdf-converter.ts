/**
 * Server-side PDF to Image Conversion Utility
 * Uses pdf.js with canvas to convert PDF pages to images
 */

import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas } from '@napi-rs/canvas';
import { pathToFileURL } from 'url';
import { resolve } from 'path';

// Configure worker for Node.js environment
const workerPath = resolve(process.cwd(), 'node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs');
pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;

/** Canvas factory for pdf.js server-side rendering */
function createNodeCanvasFactory() {
	return {
		create(width: number, height: number) {
			const canvas = createCanvas(width, height);
			const context = canvas.getContext('2d');
			return { canvas, context };
		},
		reset(canvasAndContext: { canvas: any; context: any }, width: number, height: number) {
			canvasAndContext.canvas.width = width;
			canvasAndContext.canvas.height = height;
		},
		destroy(canvasAndContext: { canvas: any; context: any }) {
			canvasAndContext.canvas = null;
			canvasAndContext.context = null;
		}
	};
}

export interface PdfConversionOptions {
	/** Scale factor for rendering (default: 8.333 for 600 DPI) */
	scale?: number;
	/** Maximum width in pixels (default: 7100 for A4 at 600 DPI) */
	maxWidth?: number;
	/** Maximum height in pixels (default: 7100 for A4 at 600 DPI) */
	maxHeight?: number;
	/** Output format */
	format?: 'png' | 'jpeg';
	/** JPEG quality (0.0 - 1.0, only used if format is 'jpeg') */
	quality?: number;
	/** Maximum number of pages to convert (default: 100) */
	maxPages?: number;
	/** Timeout in milliseconds (default: 300000 = 5 minutes) */
	timeout?: number;
}

// Security constants
const DEFAULT_MAX_PAGES = 100;
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Sanitize a filename to prevent path traversal attacks
 * Removes or replaces dangerous characters
 */
function sanitizeFileName(fileName: string): string {
	// Remove path components (directory traversal)
	const baseName = fileName.split(/[/\\]/).pop() || 'document';
	// Remove or replace dangerous characters
	return baseName
		.replace(/\.\./g, '') // Remove ..
		.replace(/[<>:"|?*\x00-\x1f]/g, '_') // Replace dangerous chars
		.replace(/^\.+/, '') // Remove leading dots
		.trim() || 'document';
}

export interface ConvertedPage {
	/** Page number (1-based) */
	pageNumber: number;
	/** Converted image as Buffer */
	buffer: Buffer;
	/** File name for the converted page */
	fileName: string;
	/** Mime type */
	mimeType: string;
	/** Extracted text content from the PDF page */
	extractedText: string;
}

export interface PdfConversionProgress {
	/** Current page being processed */
	currentPage: number;
	/** Total number of pages */
	totalPages: number;
	/** Percentage complete (0-100) */
	percentage: number;
}

/**
 * Convert a PDF buffer to multiple image buffers (one per page)
 *
 * @param pdfBuffer - The PDF file as Buffer
 * @param fileName - Original file name for naming output files
 * @param options - Conversion options
 * @param onProgress - Optional callback for progress updates
 * @returns Array of converted pages
 */
export async function convertPdfToImages(
	pdfBuffer: Buffer,
	fileName: string,
	options: PdfConversionOptions = {},
	onProgress?: (progress: PdfConversionProgress) => void
): Promise<ConvertedPage[]> {
	const {
		scale = 8.333, // 600 DPI (600 / 72 = 8.333)
		maxWidth = 7100,
		maxHeight = 7100,
		format = 'png',
		quality = 1.0,
		maxPages = DEFAULT_MAX_PAGES,
		timeout = DEFAULT_TIMEOUT_MS
	} = options;

	// Security: Sanitize the filename
	const safeFileName = sanitizeFileName(fileName);

	let pdf: any = null;
	const canvasFactory = createNodeCanvasFactory();
	let timeoutId: NodeJS.Timeout | null = null;
	let isTimedOut = false;

	// Create a timeout promise for the entire operation
	const timeoutPromise = new Promise<never>((_, reject) => {
		timeoutId = setTimeout(() => {
			isTimedOut = true;
			reject(new Error(`PDF conversion timed out after ${timeout / 1000} seconds`));
		}, timeout);
	});

	// Wrap the conversion in a function we can race against the timeout
	const conversionPromise = async (): Promise<ConvertedPage[]> => {
		try {
			const loadingTask = pdfjsLib.getDocument({
				data: new Uint8Array(pdfBuffer),
				isEvalSupported: false,
				useSystemFonts: true,
				canvasFactory
			} as any);
			pdf = await loadingTask.promise;
			const totalPages = pdf.numPages;

			// Security: Check page count limit
			if (totalPages > maxPages) {
				throw new Error(`PDF has ${totalPages} pages, which exceeds the maximum limit of ${maxPages} pages`);
			}

			console.log(`Converting PDF: ${safeFileName} (${totalPages} pages) at ${Math.round(scale * 72)} DPI`);

			const convertedPages: ConvertedPage[] = [];

			// Convert each page
			for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
				// Check for timeout between pages
				if (isTimedOut) {
					throw new Error('PDF conversion was cancelled due to timeout');
				}

				// Report progress
				if (onProgress) {
					onProgress({
						currentPage: pageNum,
						totalPages,
						percentage: Math.round(((pageNum - 1) / totalPages) * 100)
					});
				}

				// Get the page
				const page = await pdf.getPage(pageNum);

				// Extract text content from the page
				const textContent = await page.getTextContent();
				const extractedText = textContent.items
					.map((item: any) => item.str)
					.join(' ')
					.trim();

				// Calculate initial viewport with the provided scale
				const initialViewport = page.getViewport({ scale });

				// Calculate final scale factor respecting max width/height
				let finalScale = scale;
				const { width: initialWidth, height: initialHeight } = initialViewport;

				if (initialWidth > maxWidth || initialHeight > maxHeight) {
					const widthScale = maxWidth / initialWidth;
					const heightScale = maxHeight / initialHeight;
					const scaleReduction = Math.min(widthScale, heightScale);
					finalScale = scale * scaleReduction;
				}

				// Get the final viewport with the adjusted scale
				const finalViewport = page.getViewport({ scale: finalScale });

				// Create canvas with exact dimensions from the final viewport
				const canvas = createCanvas(finalViewport.width, finalViewport.height);
				const context = canvas.getContext('2d');

				// Render page to canvas
				const renderContext = {
					canvasContext: context,
					viewport: finalViewport
				};

				await page.render(renderContext as any).promise;

				// Convert canvas to buffer
				const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
				const buffer =
					format === 'jpeg'
						? canvas.toBuffer('image/jpeg', Math.round(quality * 100))
						: canvas.toBuffer('image/png');

				// Create file name using sanitized filename
				const originalName = safeFileName.replace(/\.pdf$/i, '');
				const extension = format === 'jpeg' ? 'jpg' : 'png';
				const outputFileName = `${originalName}_page_${pageNum}.${extension}`;

				convertedPages.push({
					pageNumber: pageNum,
					buffer,
					fileName: outputFileName,
					mimeType,
					extractedText
				});

				console.log(
					`Converted page ${pageNum}/${totalPages}: ${outputFileName} (${Math.round(buffer.length / 1024)}KB)`
				);
			}

			// Final progress update
			if (onProgress) {
				onProgress({
					currentPage: totalPages,
					totalPages,
					percentage: 100
				});
			}

			// Destroy PDF document to release memory
			pdf.destroy();

			console.log(`PDF conversion complete: ${convertedPages.length} pages`);
			return convertedPages;
		} catch (error) {
			// Destroy PDF document on error to prevent memory leak
			if (pdf) {
				try {
					pdf.destroy();
				} catch {
					// Ignore destroy errors
				}
			}
			throw error;
		}
	};

	try {
		// Race the conversion against the timeout
		const result = await Promise.race([conversionPromise(), timeoutPromise]);
		return result;
	} catch (error) {
		console.error('PDF conversion failed:', error);
		throw new Error(
			`Failed to convert PDF: ${error instanceof Error ? error.message : 'Unknown error'}`
		);
	} finally {
		// Clear the timeout
		if (timeoutId) {
			clearTimeout(timeoutId);
		}
	}
}

/**
 * Convert PDF to images using a worker thread (non-blocking)
 * Use this for background processing to avoid blocking the main event loop
 */
export async function convertPdfToImagesAsync(
	pdfBuffer: Buffer,
	fileName: string,
	options: PdfConversionOptions = {}
): Promise<ConvertedPage[]> {
	const { convertPdfInWorker, deserializeWorkerPages } = await import('./pdf-worker.js');
	const workerPages = await convertPdfInWorker(pdfBuffer, fileName, options);
	return deserializeWorkerPages(workerPages);
}

/**
 * Check if a file is a PDF by its name
 */
export function isPdfFile(fileName: string): boolean {
	return fileName.toLowerCase().endsWith('.pdf');
}

/**
 * Get file size in human-readable format
 */
export function formatFileSize(bytes: number): string {
	if (bytes === 0) return '0 Bytes';
	const k = 1024;
	const sizes = ['Bytes', 'KB', 'MB', 'GB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}
