import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { convertPdfToImages } from '$lib/server/pdf-converter';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const formData = await request.formData();
		const pdfFile = formData.get('pdf') as File;

		if (!pdfFile) {
			return json({ error: 'No PDF file provided' }, { status: 400 });
		}

		if (!pdfFile.name.toLowerCase().endsWith('.pdf')) {
			return json({ error: 'File must be a PDF' }, { status: 400 });
		}

		// Convert File to Buffer
		const arrayBuffer = await pdfFile.arrayBuffer();
		const buffer = Buffer.from(arrayBuffer);

		console.log(`[PDF API] Converting ${pdfFile.name} (${Math.round(buffer.length / 1024)}KB)`);

		// Convert PDF to images
		const convertedPages = await convertPdfToImages(buffer, pdfFile.name);

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
