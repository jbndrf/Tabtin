/**
 * Client-side PDF conversion utilities
 * Uses server-side PDF conversion API
 */

/**
 * Convert a PDF file to multiple image files using the server-side API
 *
 * @param file - The PDF file to convert
 * @returns Array of converted image files (one per PDF page)
 * @throws Error if conversion fails
 */
export async function convertPdfToImages(file: File): Promise<File[]> {
	const formData = new FormData();
	formData.append('pdf', file);

	const response = await fetch('/api/pdf/convert', {
		method: 'POST',
		body: formData
	});

	if (!response.ok) {
		const error = await response.json();
		throw new Error(error.error || 'PDF conversion failed');
	}

	const data = await response.json();

	// Convert base64 images back to Files
	const imageFiles: File[] = [];
	for (const page of data.pages) {
		const binary = atob(page.imageData);
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) {
			bytes[i] = binary.charCodeAt(i);
		}
		const blob = new Blob([bytes], { type: page.mimeType });
		const imageFile = new File([blob], page.fileName, { type: page.mimeType });
		imageFiles.push(imageFile);
	}

	return imageFiles;
}

/**
 * Check if a file is a PDF
 */
export function isPdfFile(file: File): boolean {
	return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}
