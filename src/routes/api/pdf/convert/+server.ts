import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { convertPdfToImages, type PdfConversionOptions } from '$lib/server/pdf-converter';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const formData = await request.formData();
		const pdfFile = formData.get('pdf') as File;
		const optionsJson = formData.get('options') as string | null;

		if (!pdfFile) {
			return json({ error: 'No PDF file provided' }, { status: 400 });
		}

		if (!pdfFile.name.toLowerCase().endsWith('.pdf')) {
			return json({ error: 'File must be a PDF' }, { status: 400 });
		}

		// Parse conversion options if provided
		let options: PdfConversionOptions = {};
		if (optionsJson) {
			try {
				const parsed = JSON.parse(optionsJson);
				options = {
					scale: parsed.dpi ? parsed.dpi / 72 : undefined, // Convert DPI to scale factor
					maxWidth: parsed.maxWidth,
					maxHeight: parsed.maxHeight,
					format: parsed.format,
					quality: parsed.quality ? parsed.quality / 100 : undefined // Convert percentage to 0-1
				};
			} catch (e) {
				console.warn('[PDF API] Failed to parse options, using defaults');
			}
		}

		// Convert File to Buffer
		const arrayBuffer = await pdfFile.arrayBuffer();
		const buffer = Buffer.from(arrayBuffer);

		const dpi = options.scale ? Math.round(options.scale * 72) : 600;
		console.log(`[PDF API] Converting ${pdfFile.name} (${Math.round(buffer.length / 1024)}KB) at ${dpi} DPI`);

		// Convert PDF to images with options
		const convertedPages = await convertPdfToImages(buffer, pdfFile.name, options);

		// Convert buffers to base64 for JSON transfer
		const responsePages = convertedPages.map((page) => ({
			pageNumber: page.pageNumber,
			fileName: page.fileName,
			mimeType: page.mimeType,
			extractedText: page.extractedText,
			imageData: page.buffer.toString('base64'),
			size: page.buffer.length
		}));

		console.log(
			`[PDF API] Conversion complete: ${responsePages.length} pages, total size: ${Math.round(responsePages.reduce((sum, p) => sum + p.size, 0) / 1024)}KB`
		);

		return json({
			success: true,
			pages: responsePages,
			totalPages: convertedPages.length
		});
	} catch (error) {
		console.error('[PDF API] Conversion error:', error);
		return json(
			{
				error: 'PDF conversion failed',
				message: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
