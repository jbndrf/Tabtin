/**
 * Worker Thread for PDF to Image Conversion
 *
 * This module offloads CPU-intensive PDF rendering to a separate thread
 * to prevent blocking the main Node.js event loop.
 */

import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { fileURLToPath } from 'url';

// Type definitions
export interface WorkerPdfOptions {
	scale?: number;
	maxWidth?: number;
	maxHeight?: number;
	format?: 'png' | 'jpeg';
	quality?: number;
}

export interface WorkerConvertedPage {
	pageNumber: number;
	buffer: number[]; // Array representation for transfer (will be converted back to Buffer)
	fileName: string;
	mimeType: string;
	extractedText: string;
}

interface WorkerData {
	pdfBuffer: number[];
	fileName: string;
	options: WorkerPdfOptions;
}

interface WorkerResult {
	success: boolean;
	pages?: WorkerConvertedPage[];
	error?: string;
}

// Worker thread code (runs when this file is loaded as a worker)
if (!isMainThread && parentPort) {
	const { pdfBuffer, fileName, options } = workerData as WorkerData;

	// Dynamically import the PDF converter to avoid issues with ESM
	(async () => {
		try {
			// Convert array back to Buffer
			const buffer = Buffer.from(pdfBuffer);

			// Import the actual conversion function
			const { convertPdfToImages } = await import('./pdf-converter.js');

			// Perform the conversion
			const pages = await convertPdfToImages(buffer, fileName, options);

			// Convert Buffer objects to arrays for transfer
			const serializablePages: WorkerConvertedPage[] = pages.map((page) => ({
				pageNumber: page.pageNumber,
				buffer: Array.from(page.buffer),
				fileName: page.fileName,
				mimeType: page.mimeType,
				extractedText: page.extractedText
			}));

			parentPort!.postMessage({
				success: true,
				pages: serializablePages
			} as WorkerResult);
		} catch (error: any) {
			parentPort!.postMessage({
				success: false,
				error: error.message || 'Unknown error during PDF conversion'
			} as WorkerResult);
		}
	})();
}

/**
 * Convert PDF to images using a worker thread
 * This prevents blocking the main event loop during CPU-intensive rendering
 */
export async function convertPdfInWorker(
	pdfBuffer: Buffer,
	fileName: string,
	options: WorkerPdfOptions = {}
): Promise<WorkerConvertedPage[]> {
	return new Promise((resolve, reject) => {
		// Get the path to this file for the worker
		const workerPath = fileURLToPath(import.meta.url);

		// Serialize the buffer to array for transfer
		const workerDataPayload: WorkerData = {
			pdfBuffer: Array.from(pdfBuffer),
			fileName,
			options
		};

		const worker = new Worker(workerPath, {
			workerData: workerDataPayload
		});

		worker.on('message', (result: WorkerResult) => {
			if (result.success && result.pages) {
				resolve(result.pages);
			} else {
				reject(new Error(result.error || 'PDF conversion failed'));
			}
			worker.terminate();
		});

		worker.on('error', (error) => {
			reject(error);
			worker.terminate();
		});

		worker.on('exit', (code) => {
			if (code !== 0) {
				reject(new Error(`Worker stopped with exit code ${code}`));
			}
		});
	});
}

/**
 * Convert worker result pages back to proper Buffer objects
 * Use this in the main thread after receiving results from the worker
 */
export function deserializeWorkerPages(
	pages: WorkerConvertedPage[]
): Array<{
	pageNumber: number;
	buffer: Buffer;
	fileName: string;
	mimeType: string;
	extractedText: string;
}> {
	return pages.map((page) => ({
		pageNumber: page.pageNumber,
		buffer: Buffer.from(page.buffer),
		fileName: page.fileName,
		mimeType: page.mimeType,
		extractedText: page.extractedText
	}));
}
