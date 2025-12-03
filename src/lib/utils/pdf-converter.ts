/**
 * PDF to Image Conversion Utility
 *
 * Uses pdf.js to convert PDF pages to PNG images in the browser
 */

import { browser } from '$app/environment';

// Lazy import pdf.js only in browser context
let pdfjsLib: any = null;

async function initPdfJs() {
	if (!browser) {
		throw new Error('PDF conversion is only available in browser environment');
	}

	if (!pdfjsLib) {
		pdfjsLib = await import('pdfjs-dist');
		// Set worker source (required for pdf.js)
		// Use the worker from the npm package instead of CDN for reliability
		pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
			'pdfjs-dist/build/pdf.worker.min.mjs',
			import.meta.url
		).toString();
	}

	return pdfjsLib;
}

export interface PdfConversionOptions {
	/** Scale factor for rendering (higher = better quality, larger file) */
	scale?: number;
	/** Maximum width in pixels */
	maxWidth?: number;
	/** Maximum height in pixels */
	maxHeight?: number;
	/** Output format */
	format?: 'png' | 'jpeg';
	/** JPEG quality (0.0 - 1.0, only used if format is 'jpeg') */
	quality?: number;
}

export interface ConvertedPage {
	/** Page number (1-based) */
	pageNumber: number;
	/** Converted image as File object */
	file: File;
	/** Preview URL (must be revoked after use) */
	url: string;
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
 * Convert a PDF file to multiple image files (one per page)
 *
 * @param pdfFile - The PDF file to convert
 * @param options - Conversion options
 * @param onProgress - Optional callback for progress updates
 * @returns Array of converted pages
 */
export async function convertPdfToImages(
	pdfFile: File,
	options: PdfConversionOptions = {},
	onProgress?: (progress: PdfConversionProgress) => void
): Promise<ConvertedPage[]> {
	const {
		scale = 6.0,
		maxWidth = 3584,
		maxHeight = 3584,
		format = 'png',
		quality = 1.0
	} = options;

	try {
		// Initialize pdf.js (lazy load in browser only)
		const pdfjs = await initPdfJs();

		// Load the PDF document
		const arrayBuffer = await pdfFile.arrayBuffer();
		const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
		const totalPages = pdf.numPages;

		console.log(`Converting PDF: ${pdfFile.name} (${totalPages} pages)`);

		const convertedPages: ConvertedPage[] = [];

		// Convert each page
		for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
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
			const canvas = document.createElement('canvas');
			const context = canvas.getContext('2d');
			if (!context) {
				throw new Error('Failed to get canvas context');
			}

			canvas.width = finalViewport.width;
			canvas.height = finalViewport.height;

			// Render page to canvas
			const renderContext = {
				canvasContext: context,
				viewport: finalViewport
			};

			await page.render(renderContext as any).promise;

			// Convert canvas to blob
			const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
			const blob = await new Promise<Blob>((resolve, reject) => {
				canvas.toBlob(
					(blob) => {
						if (blob) {
							resolve(blob);
						} else {
							reject(new Error('Failed to convert canvas to blob'));
						}
					},
					mimeType,
					quality
				);
			});

			// Create File object
			const originalName = pdfFile.name.replace(/\.pdf$/i, '');
			const extension = format === 'jpeg' ? 'jpg' : 'png';
			const fileName = `${originalName}_page_${pageNum}.${extension}`;
			const file = new File([blob], fileName, { type: mimeType });

			// Create preview URL
			const url = URL.createObjectURL(file);

			convertedPages.push({
				pageNumber: pageNum,
				file,
				url,
				extractedText
			});

			console.log(`Converted page ${pageNum}/${totalPages}: ${fileName}`);
		}

		// Final progress update
		if (onProgress) {
			onProgress({
				currentPage: totalPages,
				totalPages,
				percentage: 100
			});
		}

		console.log(`PDF conversion complete: ${convertedPages.length} pages`);
		return convertedPages;
	} catch (error) {
		console.error('PDF conversion failed:', error);
		throw new Error(`Failed to convert PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
	}
}

/**
 * Check if a file is a PDF
 */
export function isPdfFile(file: File): boolean {
	return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

/**
 * Get file size in human-readable format
 */
export function formatFileSize(bytes: number): string {
	if (bytes === 0) return '0 Bytes';
	const k = 1024;
	const sizes = ['Bytes', 'KB', 'MB', 'GB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}
