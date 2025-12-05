<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { pb, currentUser } from '$lib/stores/auth';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import { t } from '$lib/i18n';
	import { toast } from '$lib/utils/toast';
	import { Check, X, ZoomIn, ZoomOut, Maximize2, MoreVertical, Search, MapPin, Edit, Settings, Trash2, Crop, RotateCcw, FileText } from 'lucide-svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import * as Select from '$lib/components/ui/select';
	import { Input } from '$lib/components/ui/input';
	import { Switch } from '$lib/components/ui/switch';
	import type { ImageBatchesResponse, ImagesResponse, ProjectsResponse } from '$lib/pocketbase-types';
	import type { PageData } from './$types';

	interface ExtractionResult {
		column_id: string;
		column_name: string;
		value: string | null;
		image_index: number;
		bbox_2d: [number, number, number, number];
		confidence: number;
		redone?: boolean;
	}

	interface ColumnDefinition {
		id: string;
		name: string;
		type: string;
		description?: string;
		allowed_values?: string[];
	}

	// Virtual image type that can be either a regular image or a PDF page
	interface VirtualImage {
		id: string;           // Original image ID (or image_id + _page_N for PDFs)
		originalImage: ImagesResponse;
		isPdf: boolean;
		pageNumber?: number;  // 1-based page number for PDFs
		pdfCanvas?: HTMLCanvasElement;  // Pre-rendered PDF page
	}

	let { data }: { data: PageData } = $props();

	let project = $state<ProjectsResponse | null>(null);
	let batches = $state<(ImageBatchesResponse & { images?: ImagesResponse[] })[]>([]);
	let allBatches = $state<ImageBatchesResponse[]>([]);
	let columns = $state<ColumnDefinition[]>([]);
	let currentBatchIndex = $state(0);
	let currentImageIndex = $state(0);
	let currentRowIndex = $state(0);
	let extractionRows = $state<any[]>([]);
	let isLoading = $state(true);
	let loadingBatchImages = $state(false);
	let canvasElements = $state<HTMLCanvasElement[]>([]);
	let imageElements = $state<HTMLImageElement[]>([]);
	let cardElement = $state<HTMLDivElement>();

	// Expanded images list (includes individual PDF pages)
	let expandedImages = $state<VirtualImage[]>([]);
	let loadingPdfs = $state(false);

	// pdf.js library reference
	let pdfjsLib: any = null;

	// Swipe state for card
	let isDragging = $state(false);
	let startX = $state(0);
	let startY = $state(0);
	let currentX = $state(0);
	let currentY = $state(0);
	let offsetX = $state(0);
	let offsetY = $state(0);
	let rotation = $state(0);
	let isAnimating = $state(false);

	// Swipe state for image carousel
	let imageSwipeStartX = $state(0);
	let imageSwipeCurrentX = $state(0);
	let isImageSwiping = $state(false);
	let imageSwipeOffsetX = $state(0);

	// Zoom and pan state (per image)
	let zoomLevels = $state<number[]>([]);
	let panX = $state<number[]>([]);
	let panY = $state<number[]>([]);
	let isPanning = $state(false);
	let panStartX = $state(0);
	let panStartY = $state(0);
	let lastPinchDistance = $state(0);
	let isPinching = $state(false);

	// Edit mode state - track which fields are being edited individually
	let editingFields = $state<Set<string>>(new Set());
	let editedValues = $state<Record<string, string | null>>({});

	// Card swipe-to-discard state
	let cardSwipeState = $state<Record<string, { offsetX: number; offsetY: number; isDragging: boolean; startX: number; startY: number; isAnimating: boolean; isHorizontalSwipe: boolean }>>({});

	// Redo state - track which columns are marked for redo
	let redoColumns = $state<Set<string>>(new Set());

	// Derived state to check if any columns need redo
	let hasRedoColumns = $derived(redoColumns.size > 0);

	// Crop mode state
	let cropModeColumnId = $state<string | null>(null);
	let isCropMode = $derived(cropModeColumnId !== null);
	let cropDrawing = $state(false);
	let cropStartX = $state(0);
	let cropStartY = $state(0);
	let cropCurrentX = $state(0);
	let cropCurrentY = $state(0);

	// Store custom bounding boxes for redo columns (one per column)
	// Format: { columnId: { imageId: string, bbox: [x1, y1, x2, y2] in normalized 0-1 coordinates } }
	let customBoundingBoxes = $state<Record<string, { imageId: string; bbox: [number, number, number, number] }>>({});

	// Settings state - persisted across batches
	let showBboxLabels = $state(true);
	let showBboxValues = $state(true);
	let coordinateFormat = $state<'normalized_1000' | 'normalized_1000_yxyx'>('normalized_1000');

	// PDF detection helper
	function isPdfFile(filename: string): boolean {
		return filename.toLowerCase().endsWith('.pdf');
	}

	// Initialize pdf.js library
	async function initPdfJs() {
		if (pdfjsLib) return pdfjsLib;

		pdfjsLib = await import('pdfjs-dist');
		// Set worker source
		pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
			'pdfjs-dist/build/pdf.worker.min.mjs',
			import.meta.url
		).toString();

		return pdfjsLib;
	}

	// Render all pages of a PDF to canvases
	async function renderPdfPages(image: ImagesResponse): Promise<HTMLCanvasElement[]> {
		const url = pb.files.getURL(image, image.image);
		const pdfjs = await initPdfJs();

		// Fetch PDF data
		const response = await fetch(url);
		const arrayBuffer = await response.arrayBuffer();

		// Load PDF document
		const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
		const totalPages = pdf.numPages;
		const canvases: HTMLCanvasElement[] = [];

		// Render each page
		for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
			const page = await pdf.getPage(pageNum);

			// Use scale factor similar to the client-side converter for good quality
			const scale = 4.0;
			const viewport = page.getViewport({ scale });

			// Create canvas for this page
			const canvas = document.createElement('canvas');
			const context = canvas.getContext('2d');
			if (!context) {
				throw new Error('Failed to get canvas context');
			}

			canvas.width = viewport.width;
			canvas.height = viewport.height;

			// Render page to canvas
			await page.render({
				canvasContext: context,
				viewport
			}).promise;

			canvases.push(canvas);
		}

		return canvases;
	}

	// Expand batch images to include individual PDF pages
	async function expandBatchImages(images: ImagesResponse[]): Promise<VirtualImage[]> {
		const expanded: VirtualImage[] = [];

		for (const image of images) {
			if (isPdfFile(image.image)) {
				try {
					const pages = await renderPdfPages(image);
					pages.forEach((canvas, pageIdx) => {
						expanded.push({
							id: `${image.id}_page_${pageIdx + 1}`,
							originalImage: image,
							isPdf: true,
							pageNumber: pageIdx + 1,
							pdfCanvas: canvas
						});
					});
				} catch (error) {
					console.error('Failed to render PDF:', image.image, error);
					// Still add a placeholder so the image count is preserved
					expanded.push({
						id: image.id,
						originalImage: image,
						isPdf: true,
						pageNumber: 1
					});
				}
			} else {
				expanded.push({
					id: image.id,
					originalImage: image,
					isPdf: false
				});
			}
		}

		return expanded;
	}

	onMount(() => {
		// Handle keyboard shortcuts
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape' && isCropMode) {
				exitCropMode();
				renderCanvas(currentImageIndex);
			}
		};

		window.addEventListener('keydown', handleKeyDown);

		const loadData = async () => {
			try {
				// Load project to get column definitions
				project = await pb.collection('projects').getOne<ProjectsResponse>(data.projectId, {
					filter: `user = '${$currentUser?.id}'`,
					requestKey: `review_project_${data.projectId}`
				});

				if (project.settings && typeof project.settings === 'object' && 'columns' in project.settings) {
					columns = project.settings.columns as ColumnDefinition[];
				}

				// Load coordinate format from project settings
				if (project.settings && typeof project.settings === 'object' && 'coordinateFormat' in project.settings) {
					coordinateFormat = project.settings.coordinateFormat as typeof coordinateFormat;
					console.log('Loaded coordinate format from project settings:', coordinateFormat);
				} else {
					console.log('No coordinate format in project settings, using default:', coordinateFormat);
				}

				// Load all batches that are in review status
				allBatches = await pb.collection('image_batches').getFullList<ImageBatchesResponse>({
					filter: `project = '${data.projectId}' && status = 'review'`,
					sort: '-id',
					requestKey: `review_batches_${data.projectId}`
				});

				if (allBatches.length === 0) {
					toast.info(t('images.review.toast.no_batches_to_review'));
					goto(`/projects/${data.projectId}`);
					return;
				}

				// Load images only for the first batch initially (lazy loading for performance)
				await loadBatchImages(0);
			} catch (error: any) {
				// Ignore auto-cancellation errors
				if (error?.isAbort) {
					return;
				}
				console.error('Failed to load batches:', error);
				toast.error(t('images.review.toast.failed_to_load'));
				goto(`/projects/${data.projectId}`);
			} finally {
				isLoading = false;
			}
		};

		loadData();

		// Cleanup
		return () => {
			window.removeEventListener('keydown', handleKeyDown);
		};
	});

	// Track the current batch ID to detect batch changes reliably
	let currentBatchId = $state<string | null>(null);
	// Unique key to force complete re-render of canvas elements
	let canvasKey = $state(0);

	$effect(() => {
		console.log('Render effect check:', {
			canvasElementsLength: canvasElements.length,
			imageElementsLength: imageElements.length,
			expandedImagesLength: expandedImages.length
		});
		// For PDFs, we don't need imageElements (they render from pdfCanvas)
		// For regular images, we need imageElements to be loaded
		if (canvasElements.length > 0 && expandedImages.length > 0) {
			renderAllCanvases();
		}
	});

	// Initialize zoom/pan arrays when expandedImages changes
	$effect(() => {
		if (expandedImages.length > 0) {
			// Only resize arrays if needed (keep existing values)
			if (zoomLevels.length !== expandedImages.length) {
				zoomLevels = Array(expandedImages.length).fill(1);
				panX = Array(expandedImages.length).fill(0);
				panY = Array(expandedImages.length).fill(0);
			}
		}
	});

	// Reset all state when batch changes (triggered by batch ID change)
	$effect(() => {
		const batch = getCurrentBatch();
		const batchId = batch?.id || null;

		// Only reset if batch ID actually changed
		if (batchId !== currentBatchId) {
			console.log('Batch changed, resetting state:', { from: currentBatchId, to: batchId });

			// Reset all state
			currentImageIndex = 0;
			currentBatchId = batchId;

			// Force complete re-creation of canvas/image elements by changing key
			canvasKey++;

			// Clear canvas arrays to force re-render
			canvasElements = [];
			imageElements = [];

			// Clear expandedImages - will be repopulated when batch images load
			expandedImages = [];

			// Reset zoom/pan state (will be properly sized by effect when expandedImages loads)
			zoomLevels = [];
			panX = [];
			panY = [];

			// Reset swipe/gesture state
			isDragging = false;
			isImageSwiping = false;
			isPanning = false;
			isPinching = false;
			imageSwipeOffsetX = 0;
			offsetX = 0;
			offsetY = 0;
			rotation = 0;

			// Reset edit mode
			editingFields = new Set();
			editedValues = {};

			// Reset card swipe state
			cardSwipeState = {};

			// Reset redo columns
			redoColumns = new Set();

			// Reset crop mode and custom bounding boxes
			exitCropMode();
			customBoundingBoxes = {};
		}
	});

	async function loadBatchImages(batchIndex: number) {
		if (batchIndex >= allBatches.length) return;

		loadingBatchImages = true;
		try {
			const batch = allBatches[batchIndex];
			const images = await pb.collection('images').getFullList<ImagesResponse>({
				filter: `batch = '${batch.id}'`,
				sort: 'order',
				requestKey: `review_images_${batch.id}`
			});

			// Load extraction_rows for this batch
			const rows = await pb.collection('extraction_rows').getFullList({
				filter: `batch = '${batch.id}' && status = 'review'`,
				sort: 'row_index',
				requestKey: `review_extraction_rows_${batch.id}`
			});

			extractionRows = rows;
			currentRowIndex = 0;

			// Add to batches array if not already loaded
			if (!batches[batchIndex]) {
				batches[batchIndex] = { ...batch, images };
			}

			// Expand images to handle PDFs (renders PDF pages to canvases)
			loadingPdfs = true;
			try {
				expandedImages = await expandBatchImages(images);
				console.log('Expanded images:', expandedImages.length, 'from', images.length, 'original files');
			} finally {
				loadingPdfs = false;
			}
		} catch (error: any) {
			if (!error?.isAbort) {
				console.error('Failed to load batch images:', error);
			}
		} finally {
			loadingBatchImages = false;
		}
	}

	function getCurrentBatch() {
		return batches[currentBatchIndex];
	}

	function getCurrentImage(): VirtualImage | undefined {
		return expandedImages[currentImageIndex];
	}

	function getImageUrl(image: ImagesResponse) {
		return pb.files.getURL(image, image.image);
	}

	function getCurrentRow() {
		return extractionRows[currentRowIndex];
	}

	function getCurrentExtractions(): ExtractionResult[] {
		const row = getCurrentRow();
		if (!row?.row_data) return [];
		const extractions = row.row_data as ExtractionResult[];
		return extractions.filter((e: ExtractionResult) => e.image_index === currentImageIndex);
	}

	function getAllExtractions(): ExtractionResult[] {
		const row = getCurrentRow();
		if (!row?.row_data) return [];
		return row.row_data as ExtractionResult[];
	}

	// Convert bbox coordinates based on selected format
	// Returns [x1, y1, x2, y2] in 0-1 normalized range
	function convertBboxCoordinates(bbox: [number, number, number, number], imageWidth: number, imageHeight: number): [number, number, number, number] {
		let result: [number, number, number, number];

		switch (coordinateFormat) {
			case 'normalized_1000':
				// Qwen3-VL: [x1, y1, x2, y2] format, 0-1000 range
				// Both X and Y are independently normalized to 0-1000
				result = [
					bbox[0] / 1000,
					bbox[1] / 1000,
					bbox[2] / 1000,
					bbox[3] / 1000
				];
				break;
			case 'normalized_1000_yxyx':
				// Gemini 2.0: [y_min, x_min, y_max, x_max] format, 0-1000 range
				// Both X and Y are independently normalized to 0-1000
				// Swap to [x1, y1, x2, y2] format
				result = [
					bbox[1] / 1000, // x_min
					bbox[0] / 1000, // y_min
					bbox[3] / 1000, // x_max
					bbox[2] / 1000  // y_max
				];
				break;
			default:
				result = bbox;
		}

		console.log(`Converting bbox with format ${coordinateFormat}:`, {
			input: bbox,
			output: result,
			imageSize: { width: imageWidth, height: imageHeight }
		});

		return result;
	}

	// Helper to find the actual column ID for an extraction (handles LLM using different ID formats)
	function getActualColumnId(extraction: ExtractionResult): string | null {
		// First try direct match
		const directMatch = columns.find(c => c.id === extraction.column_id);
		if (directMatch) return directMatch.id;
		// Fall back to matching by column_name
		const nameMatch = columns.find(c => c.name === extraction.column_name);
		if (nameMatch) return nameMatch.id;
		return null;
	}

	function getColumnValue(columnId: string): { value: string | null; confidence: number; redone?: boolean } | null {
		const allExtractions = getAllExtractions();
		const column = columns.find(c => c.id === columnId);
		// Match by column_id first, then fall back to column_name if LLM used different ID format
		const extraction = allExtractions.find(e =>
			e.column_id === columnId ||
			(column && e.column_name === column.name)
		);
		return extraction ? { value: extraction.value, confidence: extraction.confidence, redone: extraction.redone } : null;
	}

	function renderAllCanvases() {
		if (expandedImages.length === 0) return;

		expandedImages.forEach((_, imageIdx) => {
			renderCanvas(imageIdx);
		});
	}

	function renderCanvas(imageIdx: number) {
		const canvas = canvasElements[imageIdx];
		const vImage = expandedImages[imageIdx];

		if (!canvas || !vImage) {
			console.log('Canvas render skipped (no canvas or vImage):', { imageIdx, hasCanvas: !!canvas, hasVImage: !!vImage });
			return;
		}

		// Determine source element and dimensions
		let sourceElement: HTMLImageElement | HTMLCanvasElement;
		let sourceWidth: number;
		let sourceHeight: number;

		if (vImage.isPdf && vImage.pdfCanvas) {
			// Use pre-rendered PDF canvas
			sourceElement = vImage.pdfCanvas;
			sourceWidth = vImage.pdfCanvas.width;
			sourceHeight = vImage.pdfCanvas.height;
		} else {
			// Use regular image element
			const img = imageElements[imageIdx];
			if (!img || !img.complete || img.naturalWidth === 0) {
				console.log('Canvas render skipped (img not ready):', { imageIdx, hasImg: !!img, imgComplete: img?.complete, imgWidth: img?.naturalWidth });
				return;
			}
			sourceElement = img;
			sourceWidth = img.naturalWidth;
			sourceHeight = img.naturalHeight;
		}

		const ctx = canvas.getContext('2d', { alpha: false });
		if (!ctx) {
			console.error('Failed to get canvas context for image:', imageIdx);
			return;
		}

		// Get canvas container dimensions
		const container = canvas.parentElement;
		if (!container) {
			console.error('Canvas has no parent container:', imageIdx);
			return;
		}

		const containerWidth = container.clientWidth;
		const containerHeight = container.clientHeight;

		if (containerWidth === 0 || containerHeight === 0) {
			console.warn('Container has zero dimensions:', { width: containerWidth, height: containerHeight });
			return;
		}

		// High-DPI rendering - reset canvas completely
		const dpr = window.devicePixelRatio || 1;
		canvas.width = containerWidth * dpr;
		canvas.height = containerHeight * dpr;
		canvas.style.width = `${containerWidth}px`;
		canvas.style.height = `${containerHeight}px`;

		// Save context state
		ctx.save();

		// Scale context for high-DPI
		ctx.scale(dpr, dpr);

		// Clear canvas
		ctx.clearRect(0, 0, containerWidth, containerHeight);

		// Calculate image dimensions to fit container while maintaining aspect ratio
		const imgAspect = sourceWidth / sourceHeight;
		const containerAspect = containerWidth / containerHeight;

		let baseDrawWidth, baseDrawHeight, baseOffsetX, baseOffsetY;

		if (imgAspect > containerAspect) {
			baseDrawWidth = containerWidth;
			baseDrawHeight = containerWidth / imgAspect;
			baseOffsetX = 0;
			baseOffsetY = (containerHeight - baseDrawHeight) / 2;
		} else {
			baseDrawHeight = containerHeight;
			baseDrawWidth = containerHeight * imgAspect;
			baseOffsetX = (containerWidth - baseDrawWidth) / 2;
			baseOffsetY = 0;
		}

		// Apply zoom and pan
		const zoom = zoomLevels[imageIdx] || 1;
		const currentPanX = panX[imageIdx] || 0;
		const currentPanY = panY[imageIdx] || 0;

		const drawWidth = baseDrawWidth * zoom;
		const drawHeight = baseDrawHeight * zoom;

		// Center zoom around the middle of the image
		const offsetX = baseOffsetX - (drawWidth - baseDrawWidth) / 2 + currentPanX;
		const offsetY = baseOffsetY - (drawHeight - baseDrawHeight) / 2 + currentPanY;

		// Draw image (works with both HTMLImageElement and HTMLCanvasElement)
		ctx.drawImage(sourceElement, offsetX, offsetY, drawWidth, drawHeight);

		// Draw bounding boxes for this specific image (excluding redo columns)
		// Use getActualColumnId to handle LLM using different column_id formats
		const extractions = getAllExtractions().filter(e => {
			if (e.image_index !== imageIdx) return false;
			const actualColId = getActualColumnId(e);
			return actualColId ? !redoColumns.has(actualColId) : true;
		});
		extractions.forEach((extraction) => {
			if (extraction.bbox_2d[0] === 0 && extraction.bbox_2d[1] === 0) return;

			// Convert coordinates based on selected format (result is always 0-1 normalized)
			const normalizedBbox = convertBboxCoordinates(extraction.bbox_2d, sourceWidth, sourceHeight);

			// Apply to actual rendered dimensions
			const x1 = normalizedBbox[0] * drawWidth + offsetX;
			const y1 = normalizedBbox[1] * drawHeight + offsetY;
			const x2 = normalizedBbox[2] * drawWidth + offsetX;
			const y2 = normalizedBbox[3] * drawHeight + offsetY;

			const width = x2 - x1;
			const height = y2 - y1;

			// Draw bounding box - use orange for current row, confidence colors for others
			// Current row is highlighted in orange/amber
			ctx.strokeStyle = '#f97316'; // Orange for current row
			ctx.lineWidth = 3 * zoom; // Thicker line for current row
			ctx.strokeRect(x1, y1, width, height);

			// Draw label if enabled
			if (showBboxLabels || showBboxValues) {
				ctx.fillStyle = ctx.strokeStyle;
				const labelPadding = 4;
				const fontSize = 12 * Math.min(zoom, 1.5); // Scale font slightly with zoom
				ctx.font = `${fontSize}px sans-serif`;

				// Build label text based on settings
				let labelText = '';
				if (showBboxLabels && showBboxValues && extraction.value) {
					labelText = `${extraction.column_name}: ${extraction.value}`;
				} else if (showBboxLabels) {
					labelText = extraction.column_name;
				} else if (showBboxValues && extraction.value) {
					labelText = extraction.value;
				}

				if (labelText) {
					const textMetrics = ctx.measureText(labelText);
					const labelWidth = textMetrics.width + labelPadding * 2;
					const labelHeight = fontSize + labelPadding * 2;

					ctx.fillRect(x1, y1 - labelHeight, labelWidth, labelHeight);

					// Draw label text
					ctx.fillStyle = '#ffffff';
					ctx.fillText(labelText, x1 + labelPadding, y1 - labelPadding);
				}
			}
		});

		// Draw custom bounding boxes for redo columns on this image
		const currentVImage = expandedImages[imageIdx];

		Object.entries(customBoundingBoxes).forEach(([columnId, box]) => {
			// Only draw if this box is for the current image (compare by ID)
			if (!currentVImage || box.imageId !== currentVImage.id) return;

			const column = columns.find(c => c.id === columnId);
			if (!column) return;

			// Convert normalized bbox to screen coordinates
			const x1 = box.bbox[0] * drawWidth + offsetX;
			const y1 = box.bbox[1] * drawHeight + offsetY;
			const x2 = box.bbox[2] * drawWidth + offsetX;
			const y2 = box.bbox[3] * drawHeight + offsetY;

			const width = x2 - x1;
			const height = y2 - y1;

			// Draw bounding box in blue for redo columns
			ctx.strokeStyle = '#3b82f6';
			ctx.lineWidth = 3 * zoom;
			ctx.strokeRect(x1, y1, width, height);

			// Draw label
			if (showBboxLabels) {
				ctx.fillStyle = '#3b82f6';
				const labelPadding = 4;
				const fontSize = 12 * Math.min(zoom, 1.5);
				ctx.font = `${fontSize}px sans-serif`;

				const labelText = column.name;
				const textMetrics = ctx.measureText(labelText);
				const labelWidth = textMetrics.width + labelPadding * 2;
				const labelHeight = fontSize + labelPadding * 2;

				ctx.fillRect(x1, y1 - labelHeight, labelWidth, labelHeight);

				ctx.fillStyle = '#ffffff';
				ctx.fillText(labelText, x1 + labelPadding, y1 - labelPadding);
			}
		});

		// Draw the current crop rectangle if in crop mode and drawing
		if (isCropMode && cropDrawing && imageIdx === currentImageIndex) {
			const x1 = Math.min(cropStartX, cropCurrentX);
			const y1 = Math.min(cropStartY, cropCurrentY);
			const width = Math.abs(cropCurrentX - cropStartX);
			const height = Math.abs(cropCurrentY - cropStartY);

			// Draw semi-transparent fill
			ctx.fillStyle = 'rgba(59, 130, 246, 0.2)';
			ctx.fillRect(x1, y1, width, height);

			// Draw border
			ctx.strokeStyle = '#3b82f6';
			ctx.lineWidth = 2;
			ctx.setLineDash([5, 5]);
			ctx.strokeRect(x1, y1, width, height);
			ctx.setLineDash([]);
		}

		// Restore context state
		ctx.restore();
	}

	function handleImageLoad(event: Event) {
		const img = event.target as HTMLImageElement;
		console.log('Image loaded:', {
			src: img.src.substring(img.src.lastIndexOf('/') + 1),
			naturalWidth: img.naturalWidth,
			naturalHeight: img.naturalHeight,
			complete: img.complete
		});
		renderAllCanvases();
	}

	function handleImageError(event: Event) {
		const img = event.target as HTMLImageElement;
		console.error('Image failed to load:', {
			src: img.src,
			complete: img.complete
		});
	}

	function handleTouchStart(e: TouchEvent) {
		if (isAnimating) return;
		isDragging = true;
		startX = e.touches[0].clientX;
		startY = e.touches[0].clientY;
		currentX = startX;
		currentY = startY;
	}

	function handleTouchMove(e: TouchEvent) {
		if (!isDragging || isAnimating) return;
		currentX = e.touches[0].clientX;
		currentY = e.touches[0].clientY;
		offsetX = currentX - startX;
		offsetY = currentY - startY;
		rotation = offsetX / 20;
	}

	function handleTouchEnd() {
		if (!isDragging || isAnimating) return;
		isDragging = false;

		const threshold = 100;
		if (Math.abs(offsetX) > threshold) {
			if (offsetX > 0) {
				animateSwipe('right');
			} else {
				animateSwipe('left');
			}
		} else {
			resetCard();
		}
	}

	function handleMouseDown(e: MouseEvent) {
		if (isAnimating) return;
		isDragging = true;
		startX = e.clientX;
		startY = e.clientY;
		currentX = startX;
		currentY = startY;
	}

	function handleMouseMove(e: MouseEvent) {
		if (!isDragging || isAnimating) return;
		currentX = e.clientX;
		currentY = e.clientY;
		offsetX = currentX - startX;
		offsetY = currentY - startY;
		rotation = offsetX / 20;
	}

	function handleMouseUp() {
		if (!isDragging || isAnimating) return;
		isDragging = false;

		const threshold = 100;
		if (Math.abs(offsetX) > threshold) {
			if (offsetX > 0) {
				animateSwipe('right');
			} else {
				animateSwipe('left');
			}
		} else {
			resetCard();
		}
	}

	function resetCard() {
		offsetX = 0;
		offsetY = 0;
		rotation = 0;
	}

	async function animateSwipe(direction: 'left' | 'right') {
		isAnimating = true;
		const targetX = direction === 'right' ? 1000 : -1000;
		const targetRotation = direction === 'right' ? 30 : -30;

		const startOffset = offsetX;
		const startRotation = rotation;
		const duration = 300;
		const startTime = Date.now();

		const animate = () => {
			const elapsed = Date.now() - startTime;
			const progress = Math.min(elapsed / duration, 1);
			const easeOut = 1 - Math.pow(1 - progress, 3);

			offsetX = startOffset + (targetX - startOffset) * easeOut;
			rotation = startRotation + (targetRotation - startRotation) * easeOut;

			if (progress < 1) {
				requestAnimationFrame(animate);
			} else {
				if (direction === 'right') {
					handleAccept();
				} else {
					handleDecline();
				}
			}
		};

		animate();
	}

	async function handleAccept() {
		const row = getCurrentRow();
		if (!row) return;

		try {
			const now = new Date().toISOString();
			const batch = getCurrentBatch();
			if (!batch) return;

			// For multi-row batches, approve ALL remaining rows at once using batch API
			const allRemainingRows = await pb.collection('extraction_rows').getFullList({
				filter: `batch = '${batch.id}' && status = 'review'`
			});

			if (allRemainingRows.length > 0) {
				// Use batch API for atomic transaction
				const updateBatch = pb.createBatch();
				for (const r of allRemainingRows) {
					updateBatch.collection('extraction_rows').update(r.id, {
						status: 'approved',
						approved_at: now
					});
				}
				await updateBatch.send();

				toast.success(t('images.review.toast.accepted') + ` (${allRemainingRows.length} row${allRemainingRows.length > 1 ? 's' : ''})`);
			}

			// All rows approved, update batch status
			await pb.collection('image_batches').update(batch.id, {
				status: 'approved'
			});

			// Move to next batch
			moveToNextBatch();
		} catch (error) {
			console.error('Failed to accept row:', error);
			toast.error(t('images.review.toast.failed_to_accept'));
			resetCard();
			isAnimating = false;
		}
	}

	async function handleDecline() {
		const row = getCurrentRow();
		if (!row) return;

		try {
			const now = new Date().toISOString();
			const batch = getCurrentBatch();
			if (!batch) return;

			// For multi-row batches, decline ALL remaining rows at once using batch API
			const allRemainingRows = await pb.collection('extraction_rows').getFullList({
				filter: `batch = '${batch.id}' && status = 'review'`
			});

			if (allRemainingRows.length > 0) {
				// Use batch API for atomic transaction
				const updateBatch = pb.createBatch();
				for (const r of allRemainingRows) {
					updateBatch.collection('extraction_rows').update(r.id, {
						status: 'deleted',
						deleted_at: now
					});
				}
				await updateBatch.send();

				toast.success(t('images.review.toast.declined') + ` (${allRemainingRows.length} row${allRemainingRows.length > 1 ? 's' : ''})`);
			}

			// Check if any rows were approved before declining (use getList for count only)
			const approvedResult = await pb.collection('extraction_rows').getList(1, 1, {
				filter: `batch = '${batch.id}' && status = 'approved'`
			});

			// Update batch status based on whether any rows were approved
			await pb.collection('image_batches').update(batch.id, {
				status: approvedResult.totalItems > 0 ? 'approved' : 'failed'
			});

			// Move to next batch
			moveToNextBatch();
		} catch (error) {
			console.error('Failed to decline row:', error);
			toast.error(t('images.review.toast.failed_to_decline'));
			resetCard();
			isAnimating = false;
		}
	}

	async function moveToNextBatch() {
		console.log('Moving to next batch, current batches:', batches.length);

		// Reset card animation state first
		resetCard();
		isAnimating = false;

		// Remove current batch from arrays
		batches = batches.filter((_, i) => i !== currentBatchIndex);
		allBatches = allBatches.filter((_, i) => i !== currentBatchIndex);

		if (allBatches.length === 0) {
			toast.info(t('images.review.toast.all_reviewed'));
			goto(`/projects/${data.projectId}`);
			return;
		}

		// Load images for the next batch if not already loaded
		if (!batches[currentBatchIndex]) {
			await loadBatchImages(currentBatchIndex);
		}

		// Force complete state reset by clearing batch ID and triggering reactivity
		// Step 1: Clear the batch ID to force the $effect to reset everything
		currentBatchId = null;

		// Step 2: Trigger Svelte reactivity by creating a new array reference
		batches = [...batches];

		// Step 3: After DOM updates, ensure canvases are re-rendered
		requestAnimationFrame(() => {
			console.log('Forcing canvas re-render after batch transition');
			renderAllCanvases();
		});

		// Preload next batch images in background
		if (currentBatchIndex + 1 < allBatches.length && !batches[currentBatchIndex + 1]) {
			loadBatchImages(currentBatchIndex + 1);
		}
	}

	function handlePreviousImage() {
		if (expandedImages.length === 0 || currentImageIndex === 0) return;
		currentImageIndex--;
	}

	function handleNextImage() {
		if (expandedImages.length === 0 || currentImageIndex >= expandedImages.length - 1) return;
		currentImageIndex++;
	}

	function getMostCommonImageIndexForRow(rowData: ExtractionResult[]): number {
		if (!rowData || rowData.length === 0) return 0;

		// Count occurrences of each image_index
		const imageIndexCounts = new Map<number, number>();
		rowData.forEach(extraction => {
			const count = imageIndexCounts.get(extraction.image_index) || 0;
			imageIndexCounts.set(extraction.image_index, count + 1);
		});

		// Find the image_index with the most fields
		let maxCount = 0;
		let mostCommonIndex = 0;
		imageIndexCounts.forEach((count, imageIndex) => {
			if (count > maxCount) {
				maxCount = count;
				mostCommonIndex = imageIndex;
			}
		});

		return mostCommonIndex;
	}

	function handlePreviousRow() {
		if (currentRowIndex === 0) return;
		currentRowIndex--;

		// Jump to the image with the most fields for this row
		const row = getCurrentRow();
		if (row?.row_data) {
			currentImageIndex = getMostCommonImageIndexForRow(row.row_data);
		}

		renderAllCanvases();
	}

	function handleNextRow() {
		if (currentRowIndex >= extractionRows.length - 1) return;
		currentRowIndex++;

		// Jump to the image with the most fields for this row
		const row = getCurrentRow();
		if (row?.row_data) {
			currentImageIndex = getMostCommonImageIndexForRow(row.row_data);
		}

		renderAllCanvases();
	}

	// Image carousel swipe handlers
	function handleImageSwipeStart(e: TouchEvent | MouseEvent) {
		// If in crop mode, use crop handlers instead
		if (isCropMode) {
			handleCropStart(e);
			return;
		}

		e.stopPropagation();

		// Check if this is a pinch gesture (two fingers)
		if ('touches' in e && e.touches.length === 2) {
			isPinching = true;
			const distance = getPinchDistance(e.touches[0], e.touches[1]);
			lastPinchDistance = distance;
			return;
		}

		// Check if we're zoomed in - if so, enable panning instead of carousel swiping
		const zoom = zoomLevels[currentImageIndex] || 1;
		if (zoom > 1) {
			isPanning = true;
			const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
			const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
			panStartX = clientX;
			panStartY = clientY;
			return;
		}

		// Normal carousel swipe
		isImageSwiping = true;
		const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
		imageSwipeStartX = clientX;
		imageSwipeCurrentX = clientX;
	}

	function handleImageSwipeMove(e: TouchEvent | MouseEvent) {
		// If in crop mode, use crop handlers instead
		if (isCropMode) {
			handleCropMove(e);
			return;
		}

		e.stopPropagation();

		// Handle pinch-to-zoom
		if ('touches' in e && e.touches.length === 2 && isPinching) {
			e.preventDefault(); // Prevent browser zoom
			const distance = getPinchDistance(e.touches[0], e.touches[1]);
			const scale = distance / lastPinchDistance;

			const currentZoom = zoomLevels[currentImageIndex] || 1;
			let newZoom = currentZoom * scale;

			// Clamp zoom between 1x and 5x
			newZoom = Math.max(1, Math.min(5, newZoom));

			zoomLevels[currentImageIndex] = newZoom;
			lastPinchDistance = distance;

			// If zoomed out to 1x, reset pan
			if (newZoom === 1) {
				panX[currentImageIndex] = 0;
				panY[currentImageIndex] = 0;
			}

			renderCanvas(currentImageIndex);
			return;
		}

		// Handle panning when zoomed
		if (isPanning) {
			if ('touches' in e) {
				e.preventDefault(); // Prevent scroll when panning
			}
			const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
			const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

			const deltaX = clientX - panStartX;
			const deltaY = clientY - panStartY;

			panX[currentImageIndex] = (panX[currentImageIndex] || 0) + deltaX;
			panY[currentImageIndex] = (panY[currentImageIndex] || 0) + deltaY;

			panStartX = clientX;
			panStartY = clientY;

			renderCanvas(currentImageIndex);
			return;
		}

		// Handle carousel swipe
		if (!isImageSwiping) return;
		const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
		imageSwipeCurrentX = clientX;
		imageSwipeOffsetX = imageSwipeCurrentX - imageSwipeStartX;
	}

	function handleImageSwipeEnd(e: TouchEvent | MouseEvent) {
		// If in crop mode, use crop handlers instead
		if (isCropMode) {
			handleCropEnd(e);
			return;
		}

		e.stopPropagation();

		// Reset pinch state
		if (isPinching) {
			isPinching = false;
			lastPinchDistance = 0;
			return;
		}

		// Reset pan state
		if (isPanning) {
			isPanning = false;
			return;
		}

		// Handle carousel swipe
		if (!isImageSwiping) return;
		isImageSwiping = false;

		const threshold = 50;
		if (Math.abs(imageSwipeOffsetX) > threshold) {
			if (imageSwipeOffsetX > 0) {
				handlePreviousImage();
			} else {
				handleNextImage();
			}
		}

		imageSwipeOffsetX = 0;
	}

	function getPinchDistance(touch1: Touch, touch2: Touch): number {
		const dx = touch1.clientX - touch2.clientX;
		const dy = touch1.clientY - touch2.clientY;
		return Math.sqrt(dx * dx + dy * dy);
	}

	function handleZoomIn() {
		const currentZoom = zoomLevels[currentImageIndex] || 1;
		const newZoom = Math.min(5, currentZoom + 0.5);
		zoomLevels[currentImageIndex] = newZoom;
		renderCanvas(currentImageIndex);
	}

	function handleZoomOut() {
		const currentZoom = zoomLevels[currentImageIndex] || 1;
		const newZoom = Math.max(1, currentZoom - 0.5);
		zoomLevels[currentImageIndex] = newZoom;

		// Reset pan when zooming out to 1x
		if (newZoom === 1) {
			panX[currentImageIndex] = 0;
			panY[currentImageIndex] = 0;
		}

		renderCanvas(currentImageIndex);
	}

	function handleResetZoom() {
		zoomLevels[currentImageIndex] = 1;
		panX[currentImageIndex] = 0;
		panY[currentImageIndex] = 0;
		renderCanvas(currentImageIndex);
	}

	function handleZoomToRegion(columnId: string) {
		const extraction = getAllExtractions().find(e => e.column_id === columnId);
		if (!extraction) return;

		const imageIdx = extraction.image_index;
		const canvas = canvasElements[imageIdx];
		const img = imageElements[imageIdx];

		if (!canvas || !img || !img.complete) return;

		const container = canvas.parentElement;
		if (!container) return;

		const containerWidth = container.clientWidth;
		const containerHeight = container.clientHeight;

		// Calculate base image dimensions
		const imgAspect = img.naturalWidth / img.naturalHeight;
		const containerAspect = containerWidth / containerHeight;

		let baseDrawWidth, baseDrawHeight;

		if (imgAspect > containerAspect) {
			baseDrawWidth = containerWidth;
			baseDrawHeight = containerWidth / imgAspect;
		} else {
			baseDrawHeight = containerHeight;
			baseDrawWidth = containerHeight * imgAspect;
		}

		// Convert bbox coordinates based on selected format (result is 0-1 normalized)
		const normalizedBbox = convertBboxCoordinates(extraction.bbox_2d, img.naturalWidth, img.naturalHeight);

		// Get bbox center in normalized coordinates (0-1)
		const bboxCenterX = (normalizedBbox[0] + normalizedBbox[2]) / 2;
		const bboxCenterY = (normalizedBbox[1] + normalizedBbox[3]) / 2;

		// Calculate bbox dimensions (0-1 normalized)
		const bboxWidth = normalizedBbox[2] - normalizedBbox[0];
		const bboxHeight = normalizedBbox[3] - normalizedBbox[1];

		// Calculate zoom to fit bbox with some padding
		const zoomX = (containerWidth / (bboxWidth * baseDrawWidth)) * 0.7;
		const zoomY = (containerHeight / (bboxHeight * baseDrawHeight)) * 0.7;
		const targetZoom = Math.min(Math.max(Math.min(zoomX, zoomY), 1), 5);

		// Set zoom
		zoomLevels[imageIdx] = targetZoom;

		// Calculate pan to center the bbox (already normalized to 0-1)
		const normalizedCenterX = bboxCenterX;
		const normalizedCenterY = bboxCenterY;

		// Pan to center the bbox
		panX[imageIdx] = -(normalizedCenterX - 0.5) * baseDrawWidth * targetZoom;
		panY[imageIdx] = -(normalizedCenterY - 0.5) * baseDrawHeight * targetZoom;

		// Switch to the image if not already there
		if (currentImageIndex !== imageIdx) {
			currentImageIndex = imageIdx;
		}

		// Render the canvas
		setTimeout(() => renderCanvas(imageIdx), 50);
	}

	function toggleEditField(columnId: string) {
		if (editingFields.has(columnId)) {
			// Cancel editing this field
			editingFields.delete(columnId);
			delete editedValues[columnId];
		} else {
			// Start editing this field
			editingFields.add(columnId);
			const extracted = getColumnValue(columnId);
			editedValues[columnId] = extracted?.value || null;
		}
		// Trigger reactivity
		editingFields = new Set(editingFields);
	}

	async function handleSaveField(columnId: string) {
		const batch = getCurrentBatch();
		if (!batch) return;

		try {
			// Update the processed_data with the new value for this specific field
			const updatedExtractions = getAllExtractions().map(extraction => {
				if (extraction.column_id === columnId) {
					return { ...extraction, value: editedValues[columnId] || null };
				}
				return extraction;
			});

			const processedData = batch.processed_data && typeof batch.processed_data === 'object'
				? { ...batch.processed_data, extractions: updatedExtractions }
				: { extractions: updatedExtractions };

			await pb.collection('image_batches').update(batch.id, {
				processed_data: processedData
			});

			toast.success(t('images.review.toast.saved'));

			// Remove from editing fields
			editingFields.delete(columnId);
			delete editedValues[columnId];
			editingFields = new Set(editingFields);

			// Reload the batch data
			const updatedBatch = await pb.collection('image_batches').getOne<ImageBatchesResponse>(batch.id);
			batches[currentBatchIndex] = { ...batches[currentBatchIndex], ...updatedBatch };
		} catch (error) {
			console.error('Failed to save edits:', error);
			toast.error(t('images.review.toast.failed_to_save'));
		}
	}

	function handleCancelField(columnId: string) {
		editingFields.delete(columnId);
		delete editedValues[columnId];
		editingFields = new Set(editingFields);
	}

	// Card swipe-to-discard handlers
	function initCardSwipeState(columnId: string) {
		if (!cardSwipeState[columnId]) {
			cardSwipeState[columnId] = { offsetX: 0, offsetY: 0, isDragging: false, startX: 0, startY: 0, isAnimating: false, isHorizontalSwipe: false };
		}
	}

	function handleCardSwipeStart(e: TouchEvent | MouseEvent, columnId: string) {
		e.stopPropagation();
		initCardSwipeState(columnId);

		const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
		const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
		cardSwipeState[columnId].isDragging = true;
		cardSwipeState[columnId].startX = clientX;
		cardSwipeState[columnId].startY = clientY;
		cardSwipeState[columnId].offsetX = 0;
		cardSwipeState[columnId].offsetY = 0;
		cardSwipeState[columnId].isHorizontalSwipe = false;
	}

	function handleCardSwipeMove(e: TouchEvent | MouseEvent, columnId: string) {
		if (!cardSwipeState[columnId]?.isDragging || cardSwipeState[columnId]?.isAnimating) return;

		const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
		const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

		const deltaX = clientX - cardSwipeState[columnId].startX;
		const deltaY = clientY - cardSwipeState[columnId].startY;

		// Determine swipe direction only if we haven't decided yet
		if (!cardSwipeState[columnId].isHorizontalSwipe && (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10)) {
			// Require horizontal movement to be at least 2x the vertical movement
			// and horizontal movement to be at least 30px
			if (Math.abs(deltaX) > Math.abs(deltaY) * 2 && Math.abs(deltaX) > 30) {
				cardSwipeState[columnId].isHorizontalSwipe = true;
				e.stopPropagation();
			} else if (Math.abs(deltaY) > Math.abs(deltaX)) {
				// Clearly vertical, cancel the drag
				cardSwipeState[columnId].isDragging = false;
				return;
			}
		}

		// Only allow horizontal movement if this is confirmed as a horizontal swipe
		if (cardSwipeState[columnId].isHorizontalSwipe) {
			e.stopPropagation();
			e.preventDefault();
			cardSwipeState[columnId].offsetX = deltaX;
		}
	}

	function handleCardSwipeEnd(e: TouchEvent | MouseEvent, columnId: string) {
		if (!cardSwipeState[columnId]?.isDragging || cardSwipeState[columnId]?.isAnimating) return;

		e.stopPropagation();
		cardSwipeState[columnId].isDragging = false;

		// Only process swipe if it was confirmed as horizontal
		if (cardSwipeState[columnId].isHorizontalSwipe) {
			const threshold = 120;
			const offsetX = cardSwipeState[columnId].offsetX;

			if (Math.abs(offsetX) > threshold) {
				if (offsetX < 0) {
					// Swipe left - delete content
					handleCardSwipeDiscard(columnId);
				} else {
					// Swipe right - mark as redo
					handleCardSwipeRedo(columnId);
				}
			} else {
				// Reset position
				cardSwipeState[columnId].offsetX = 0;
				cardSwipeState[columnId].isHorizontalSwipe = false;
			}
		} else {
			// Reset state
			cardSwipeState[columnId].offsetX = 0;
			cardSwipeState[columnId].offsetY = 0;
			cardSwipeState[columnId].isHorizontalSwipe = false;
		}
	}

	async function handleCardSwipeDiscard(columnId: string) {
		const batch = getCurrentBatch();
		if (!batch) return;

		// Animate card flying away to the left
		cardSwipeState[columnId].isAnimating = true;
		const targetX = -500;
		const startOffset = cardSwipeState[columnId].offsetX;
		const duration = 200;
		const startTime = Date.now();

		const animate = () => {
			const elapsed = Date.now() - startTime;
			const progress = Math.min(elapsed / duration, 1);
			const easeOut = 1 - Math.pow(1 - progress, 3);

			cardSwipeState[columnId].offsetX = startOffset + (targetX - startOffset) * easeOut;

			if (progress < 1) {
				requestAnimationFrame(animate);
			} else {
				// Clear the field value
				clearCardContent(columnId);
			}
		};

		animate();
	}

	async function handleCardSwipeRedo(columnId: string) {
		// Animate card flying away to the right
		cardSwipeState[columnId].isAnimating = true;
		const targetX = 500;
		const startOffset = cardSwipeState[columnId].offsetX;
		const duration = 200;
		const startTime = Date.now();

		const animate = () => {
			const elapsed = Date.now() - startTime;
			const progress = Math.min(elapsed / duration, 1);
			const easeOut = 1 - Math.pow(1 - progress, 3);

			cardSwipeState[columnId].offsetX = startOffset + (targetX - startOffset) * easeOut;

			if (progress < 1) {
				requestAnimationFrame(animate);
			} else {
				// Mark column as redo
				markColumnAsRedo(columnId);
			}
		};

		animate();
	}

	function markColumnAsRedo(columnId: string) {
		redoColumns.add(columnId);
		redoColumns = new Set(redoColumns); // Trigger reactivity

		// Reset card state
		cardSwipeState[columnId].offsetX = 0;
		cardSwipeState[columnId].offsetY = 0;
		cardSwipeState[columnId].isAnimating = false;
		cardSwipeState[columnId].isHorizontalSwipe = false;

		toast.info('Column marked for redo. Use crop tool to set region.');
	}

	function unmarkColumnAsRedo(columnId: string) {
		redoColumns.delete(columnId);
		redoColumns = new Set(redoColumns); // Trigger reactivity

		// Clear custom bounding boxes for this column
		delete customBoundingBoxes[columnId];

		toast.info('Column unmarked from redo');
	}

	function startCropMode(columnId: string) {
		cropModeColumnId = columnId;

		// Clear existing bounding box for this column if it exists
		if (customBoundingBoxes[columnId]) {
			delete customBoundingBoxes[columnId];
			renderAllCanvases();
		}

		toast.info('Draw a bounding box on the image');
	}

	function exitCropMode() {
		cropModeColumnId = null;
		cropDrawing = false;
		cropStartX = 0;
		cropStartY = 0;
		cropCurrentX = 0;
		cropCurrentY = 0;
	}

	function handleCropStart(e: MouseEvent | TouchEvent) {
		if (!isCropMode) return;

		e.stopPropagation();
		e.preventDefault();

		const canvas = canvasElements[currentImageIndex];
		if (!canvas) return;

		const rect = canvas.getBoundingClientRect();
		const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
		const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

		cropStartX = clientX - rect.left;
		cropStartY = clientY - rect.top;
		cropCurrentX = cropStartX;
		cropCurrentY = cropStartY;
		cropDrawing = true;
	}

	function handleCropMove(e: MouseEvent | TouchEvent) {
		if (!isCropMode || !cropDrawing) return;

		e.stopPropagation();
		e.preventDefault();

		const canvas = canvasElements[currentImageIndex];
		if (!canvas) return;

		const rect = canvas.getBoundingClientRect();
		const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
		const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

		cropCurrentX = clientX - rect.left;
		cropCurrentY = clientY - rect.top;

		// Re-render canvas to show the drawing box
		renderCanvas(currentImageIndex);
	}

	function handleCropEnd(e: MouseEvent | TouchEvent) {
		if (!isCropMode || !cropDrawing) return;

		e.stopPropagation();
		e.preventDefault();

		cropDrawing = false;

		// Calculate the bounding box in normalized coordinates
		const canvas = canvasElements[currentImageIndex];
		const vImage = expandedImages[currentImageIndex];
		if (!canvas || !vImage || !cropModeColumnId) return;

		// Get source dimensions (from PDF canvas or image element)
		let sourceWidth: number;
		let sourceHeight: number;

		if (vImage.isPdf && vImage.pdfCanvas) {
			sourceWidth = vImage.pdfCanvas.width;
			sourceHeight = vImage.pdfCanvas.height;
		} else {
			const img = imageElements[currentImageIndex];
			if (!img || !img.complete) return;
			sourceWidth = img.naturalWidth;
			sourceHeight = img.naturalHeight;
		}

		const rect = canvas.getBoundingClientRect();

		// Get the drawn rectangle coordinates
		const x1 = Math.min(cropStartX, cropCurrentX);
		const y1 = Math.min(cropStartY, cropCurrentY);
		const x2 = Math.max(cropStartX, cropCurrentX);
		const y2 = Math.max(cropStartY, cropCurrentY);

		// Check if the box is too small
		if (Math.abs(x2 - x1) < 10 || Math.abs(y2 - y1) < 10) {
			toast.error('Bounding box too small. Please draw a larger area.');
			exitCropMode();
			renderCanvas(currentImageIndex);
			return;
		}

		// Convert to normalized coordinates relative to the actual image
		const containerWidth = rect.width;
		const containerHeight = rect.height;

		// Calculate image dimensions as rendered in the canvas
		const imgAspect = sourceWidth / sourceHeight;
		const containerAspect = containerWidth / containerHeight;

		let baseDrawWidth, baseDrawHeight, baseOffsetX, baseOffsetY;

		if (imgAspect > containerAspect) {
			baseDrawWidth = containerWidth;
			baseDrawHeight = containerWidth / imgAspect;
			baseOffsetX = 0;
			baseOffsetY = (containerHeight - baseDrawHeight) / 2;
		} else {
			baseDrawHeight = containerHeight;
			baseDrawWidth = containerHeight * imgAspect;
			baseOffsetX = (containerWidth - baseDrawWidth) / 2;
			baseOffsetY = 0;
		}

		// Apply zoom and pan
		const zoom = zoomLevels[currentImageIndex] || 1;
		const currentPanX = panX[currentImageIndex] || 0;
		const currentPanY = panY[currentImageIndex] || 0;

		const drawWidth = baseDrawWidth * zoom;
		const drawHeight = baseDrawHeight * zoom;

		const imageOffsetX = baseOffsetX - (drawWidth - baseDrawWidth) / 2 + currentPanX;
		const imageOffsetY = baseOffsetY - (drawHeight - baseDrawHeight) / 2 + currentPanY;

		// Convert canvas coordinates to image coordinates
		const normalizedX1 = (x1 - imageOffsetX) / drawWidth;
		const normalizedY1 = (y1 - imageOffsetY) / drawHeight;
		const normalizedX2 = (x2 - imageOffsetX) / drawWidth;
		const normalizedY2 = (y2 - imageOffsetY) / drawHeight;

		// Clamp to 0-1 range
		const clampedBbox: [number, number, number, number] = [
			Math.max(0, Math.min(1, normalizedX1)),
			Math.max(0, Math.min(1, normalizedY1)),
			Math.max(0, Math.min(1, normalizedX2)),
			Math.max(0, Math.min(1, normalizedY2))
		];

		// Store the bounding box using the virtual image ID
		customBoundingBoxes[cropModeColumnId] = {
			imageId: vImage.id,
			bbox: clampedBbox
		};

		toast.success('Bounding box saved');
		exitCropMode();
		renderCanvas(currentImageIndex);
	}

	async function clearCardContent(columnId: string) {
		const batch = getCurrentBatch();
		if (!batch) return;

		try {
			// Update the processed_data with null value for this field
			const updatedExtractions = getAllExtractions().map(extraction => {
				if (extraction.column_id === columnId) {
					return { ...extraction, value: null };
				}
				return extraction;
			});

			const processedData = batch.processed_data && typeof batch.processed_data === 'object'
				? { ...batch.processed_data, extractions: updatedExtractions }
				: { extractions: updatedExtractions };

			await pb.collection('image_batches').update(batch.id, {
				processed_data: processedData
			});

			toast.success(t('images.review.toast.content_cleared'));

			// Reload the batch data
			const updatedBatch = await pb.collection('image_batches').getOne<ImageBatchesResponse>(batch.id);
			batches[currentBatchIndex] = { ...batches[currentBatchIndex], ...updatedBatch };

			// Reset card state
			cardSwipeState[columnId].offsetX = 0;
			cardSwipeState[columnId].offsetY = 0;
			cardSwipeState[columnId].isAnimating = false;
			cardSwipeState[columnId].isHorizontalSwipe = false;
		} catch (error) {
			console.error('Failed to clear card content:', error);
			toast.error(t('images.review.toast.failed_to_clear'));
			cardSwipeState[columnId].offsetX = 0;
			cardSwipeState[columnId].offsetY = 0;
			cardSwipeState[columnId].isAnimating = false;
			cardSwipeState[columnId].isHorizontalSwipe = false;
		}
	}

	function handleExit() {
		goto(`/projects/${data.projectId}`);
	}

	async function handleRedoProcessing() {
		const batch = getCurrentBatch();
		if (!batch || redoColumns.size === 0) {
			toast.error('No columns marked for redo');
			return;
		}

		// Check if all redo columns have bounding boxes
		const missingBboxColumns = Array.from(redoColumns).filter(
			colId => !customBoundingBoxes[colId]
		);

		if (missingBboxColumns.length > 0) {
			const missingNames = missingBboxColumns
				.map(colId => columns.find(c => c.id === colId)?.name)
				.filter(Boolean)
				.join(', ');
			toast.error(`Please draw bounding boxes for: ${missingNames}`);
			return;
		}

		try {
			isAnimating = true;
			toast.info('Uploading cropped images...');

			// Upload cropped images to PocketBase
			const croppedImageIds: Record<string, string> = {};
			const sourceImageIds: Record<string, string> = {}; // Track which source image each crop came from
			let orderCounter = (batch.images?.length || 0) + 1;

			for (const [columnId, box] of Object.entries(customBoundingBoxes)) {
				// Find the virtual image by ID
				const vImageIndex = expandedImages.findIndex(vi => vi.id === box.imageId);
				if (vImageIndex === -1) {
					console.error('Could not find virtual image with ID:', box.imageId);
					continue;
				}

				const vImage = expandedImages[vImageIndex];

				// Get source dimensions and drawable element
				let sourceWidth: number;
				let sourceHeight: number;
				let sourceElement: HTMLImageElement | HTMLCanvasElement;

				if (vImage.isPdf && vImage.pdfCanvas) {
					sourceWidth = vImage.pdfCanvas.width;
					sourceHeight = vImage.pdfCanvas.height;
					sourceElement = vImage.pdfCanvas;
				} else {
					const img = imageElements[vImageIndex];
					if (!img || !img.complete) continue;
					sourceWidth = img.naturalWidth;
					sourceHeight = img.naturalHeight;
					sourceElement = img;
				}

				// Create a canvas for cropping
				const canvas = document.createElement('canvas');
				const ctx = canvas.getContext('2d');
				if (!ctx) continue;

				// Calculate crop dimensions from normalized bbox (0-1 range)
				const cropX = box.bbox[0] * sourceWidth;
				const cropY = box.bbox[1] * sourceHeight;
				const cropW = (box.bbox[2] - box.bbox[0]) * sourceWidth;
				const cropH = (box.bbox[3] - box.bbox[1]) * sourceHeight;

				// Set canvas size to crop dimensions
				canvas.width = cropW;
				canvas.height = cropH;

				// Draw the cropped region
				ctx.drawImage(
					sourceElement,
					cropX, cropY, cropW, cropH,  // source
					0, 0, cropW, cropH           // destination
				);

				// Convert to blob
				const blob = await new Promise<Blob>((resolve) => {
					canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.9);
				});

				// Create FormData and upload to PocketBase
				const formData = new FormData();
				formData.append('image', blob, `crop_${columnId}_${Date.now()}.jpg`);
				formData.append('batch', batch.id);
				formData.append('order', String(orderCounter++));
				// Parent is the original image record
				formData.append('parent_image', vImage.originalImage.id);
				formData.append('column_id', columnId);
				formData.append('bbox_used', JSON.stringify(box.bbox));
				formData.append('is_cropped', 'true');

				const croppedImageRecord = await pb.collection('images').create(formData);

				croppedImageIds[columnId] = croppedImageRecord.id;
				sourceImageIds[columnId] = vImage.originalImage.id; // Store the source image ID

				console.log('Uploaded cropped image for column:', columnId, {
					imageId: croppedImageRecord.id,
					parentImageId: vImage.originalImage.id,
					isParentCropped: vImage.originalImage.is_cropped,
					isPdf: vImage.isPdf,
					cropX, cropY, cropW, cropH
				});
			}

			console.log('Uploaded', Object.keys(croppedImageIds).length, 'cropped images');
			toast.info('Adding redo processing to queue...');

			// Call the queue redo endpoint with cropped image IDs and source image IDs
			const response = await fetch('/api/queue/redo', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					batchId: batch.id,
					projectId: data.projectId,
					redoColumnIds: Array.from(redoColumns),
					croppedImageIds,
					sourceImageIds, // Pass the source image IDs for proper bbox mapping
					priority: 5
				})
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.error || 'Failed to enqueue redo processing');
			}

			const result = await response.json();
			console.log('Redo processing enqueued:', result);
			toast.success('Redo processing added to queue');

			// Move to next batch immediately after sending the request
			moveToNextBatch();

		} catch (error) {
			console.error('Failed to process redo:', error);
			toast.error(error instanceof Error ? error.message : 'Failed to process redo');
			isAnimating = false;
		}
	}
</script>

{#if isLoading}
	<div class="flex h-screen items-center justify-center bg-background">
		<div class="text-center">
			<div class="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
			<p class="text-lg font-medium">{t('images.review.loading')}</p>
		</div>
	</div>
{:else if batches.length === 0}
	<div class="flex h-screen items-center justify-center bg-background">
		<div class="text-center">
			<p class="mb-2 text-xl font-medium">{t('images.review.no_batches')}</p>
			<p class="mb-6 text-sm text-muted-foreground">All caught up!</p>
			<Button href="/projects/{data.projectId}">
				{t('images.review.back_to_project')}
			</Button>
		</div>
	</div>
{:else}
	<div class="flex h-screen flex-col bg-background">
		<!-- Settings Button -->
		<div class="absolute left-3 top-3 z-50">
			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					{#snippet child({ props })}
						<button
							{...props}
							class="flex h-9 w-9 items-center justify-center rounded-md bg-background/80 backdrop-blur-sm border shadow-sm hover:bg-accent transition-colors"
						>
							<Settings class="h-5 w-5" />
						</button>
					{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="start" class="w-80">
					<DropdownMenu.Label>{t('images.review.settings.title')}</DropdownMenu.Label>
					<DropdownMenu.Separator />
					<div class="px-2 py-2 space-y-3">
						<div class="flex items-center justify-between">
							<label for="show-field-names" class="text-sm font-medium">
								{t('images.review.settings.show_field_names')}
							</label>
							<Switch id="show-field-names" bind:checked={showBboxLabels} onCheckedChange={() => renderAllCanvases()} />
						</div>
						<div class="flex items-center justify-between">
							<label for="show-values" class="text-sm font-medium">
								{t('images.review.settings.show_extracted_values')}
							</label>
							<Switch id="show-values" bind:checked={showBboxValues} onCheckedChange={() => renderAllCanvases()} />
						</div>
						<div class="space-y-2">
							<Label class="text-sm font-medium">
								{t('images.review.settings.coordinate_format')}
							</Label>
							<select
								bind:value={coordinateFormat}
								onchange={() => renderAllCanvases()}
								class="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
							>
								<option value="normalized_1000">{t('images.review.settings.coordinate_format_normalized_1000')}</option>
								<option value="normalized_1000_yxyx">{t('images.review.settings.coordinate_format_normalized_1000_yxyx')}</option>
							</select>
						</div>
					</div>
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		</div>

		<!-- Exit Button -->
		<div class="absolute right-3 top-3 z-50">
			<button
				onclick={handleExit}
				class="flex h-9 w-9 items-center justify-center rounded-full bg-background/80 backdrop-blur-sm border shadow-sm hover:bg-destructive hover:text-destructive-foreground hover:border-destructive transition-all"
			>
				<X class="h-5 w-5" />
			</button>
		</div>

		<!-- Batch Counter -->
		<div class="absolute left-1/2 top-3 z-40 -translate-x-1/2">
			<div class="rounded-full bg-black/50 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm">
				{currentBatchIndex + 1} / {batches.length}
			</div>
		</div>

		<!-- Main Content - Fullscreen -->
		<div class="relative flex flex-1 flex-col overflow-hidden">
			<!-- Stack effect - background cards -->
			{#if batches.length > 1}
				<div class="absolute inset-x-4 top-2 bottom-0 rounded-t-3xl bg-card shadow-lg" style="transform: scale(0.97); z-index: 0;"></div>
			{/if}
			{#if batches.length > 2}
				<div class="absolute inset-x-4 top-4 bottom-0 rounded-t-3xl bg-card shadow-md" style="transform: scale(0.94); z-index: 0;"></div>
			{/if}

			<!-- Current Card - Fullscreen -->
			<div
				bind:this={cardElement}
				class="absolute inset-0"
				style="
					transform: translate({offsetX}px, {offsetY}px) rotate({rotation}deg);
					transform-origin: center center;
					transition: {isDragging || isAnimating ? 'none' : 'transform 0.3s ease-out'};
					z-index: 10;
				"
				onmousedown={handleMouseDown}
				onmousemove={handleMouseMove}
				onmouseup={handleMouseUp}
				onmouseleave={handleMouseUp}
				ontouchstart={handleTouchStart}
				ontouchmove={handleTouchMove}
				ontouchend={handleTouchEnd}
			>
				<div class="flex h-full flex-col overflow-hidden rounded-t-3xl bg-card shadow-2xl">
					<!-- Image Viewer - 2/3 of screen -->
					<div
						class="relative bg-muted overflow-hidden border-b"
						style="height: 66.666vh; touch-action: none;"
						onmousedown={handleImageSwipeStart}
						onmousemove={handleImageSwipeMove}
						onmouseup={handleImageSwipeEnd}
						onmouseleave={handleImageSwipeEnd}
						ontouchstart={handleImageSwipeStart}
						ontouchmove={handleImageSwipeMove}
						ontouchend={handleImageSwipeEnd}
					>
						<!-- Loading overlay for images/PDFs -->
						{#if loadingBatchImages || loadingPdfs}
							<div class="absolute inset-0 z-50 flex items-center justify-center bg-muted/80 backdrop-blur-sm">
								<div class="text-center">
									<div class="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
									<p class="text-sm font-medium text-muted-foreground">
										{#if loadingPdfs}
											{t('images.review.loading_pdfs')}
										{:else}
											{t('images.review.loading_images')}
										{/if}
									</p>
								</div>
							</div>
						{/if}
						{#key canvasKey}
							<div
								class="flex h-full w-full"
								style="
									transform: translateX(calc(-{currentImageIndex * 100}% + {imageSwipeOffsetX}px));
									transition: {isImageSwiping ? 'none' : 'transform 0.3s ease-out'};
								"
							>
								{#each expandedImages as vImage, idx}
									<div class="relative h-full w-full flex-shrink-0">
										<div class="relative h-full w-full">
											<canvas
												bind:this={canvasElements[idx]}
												class="h-full w-full"
											></canvas>
										</div>

										<!-- Image type indicator -->
										{#if vImage.isPdf}
											<div class="absolute top-4 left-4 z-20">
												<div class="rounded-lg bg-amber-500/90 backdrop-blur-sm px-3 py-1.5 text-xs font-medium text-white shadow-lg flex items-center gap-1.5">
													<FileText class="h-3.5 w-3.5" />
													<span>PDF Page {vImage.pageNumber}</span>
												</div>
											</div>
										{:else if vImage.originalImage.is_cropped}
											<div class="absolute top-4 left-4 z-20">
												<div class="rounded-lg bg-purple-500/90 backdrop-blur-sm px-3 py-1.5 text-xs font-medium text-white shadow-lg flex items-center gap-1.5">
													<Crop class="h-3.5 w-3.5" />
													<span>ROI: {columns.find(c => c.id === vImage.originalImage.column_id)?.name || 'Unknown'}</span>
												</div>
											</div>
										{:else}
											<div class="absolute top-4 left-4 z-20">
												<div class="rounded-lg bg-blue-500/90 backdrop-blur-sm px-3 py-1.5 text-xs font-medium text-white shadow-lg">
													Original
												</div>
											</div>
										{/if}

										<!-- Hidden image element for non-PDF images -->
										{#if !vImage.isPdf}
											<img
												bind:this={imageElements[idx]}
												src={getImageUrl(vImage.originalImage)}
												alt="Image {idx + 1}"
												class="hidden"
												crossorigin="anonymous"
												onload={handleImageLoad}
												onerror={handleImageError}
											/>
										{/if}
									</div>
								{/each}
							</div>
						{/key}

						<!-- Image dots -->
						{#if expandedImages.length > 1}
							<div class="absolute left-0 right-0 top-3 flex justify-center gap-1.5 z-10">
								{#each expandedImages as _, idx}
									<button
										class="h-1.5 rounded-full transition-all {idx === currentImageIndex
											? 'w-8 bg-white shadow-lg'
											: 'w-1.5 bg-white/50'}"
										onclick={() => (currentImageIndex = idx)}
									></button>
								{/each}
							</div>
						{/if}

						<!-- Swipe indicators -->
						{#if isDragging && !isAnimating}
							<div
								class="pointer-events-none absolute inset-0 flex items-center justify-center z-20"
								style="opacity: {Math.min(Math.abs(offsetX) / 100, 1)}"
							>
								{#if offsetX > 0}
									<div class="rounded-lg border-4 border-green-500 bg-green-500/20 px-8 py-4 rotate-12">
										<Check class="h-16 w-16 text-green-500" />
									</div>
								{:else if offsetX < 0}
									{#if hasRedoColumns}
										<div class="rounded-lg border-4 border-blue-500 bg-blue-500/20 px-8 py-4 -rotate-12">
											<RotateCcw class="h-16 w-16 text-blue-500" />
										</div>
									{:else}
										<div class="rounded-lg border-4 border-red-500 bg-red-500/20 px-8 py-4 -rotate-12">
											<X class="h-16 w-16 text-red-500" />
										</div>
									{/if}
								{/if}
							</div>
						{/if}

						<!-- Crop mode indicator -->
						{#if isCropMode}
							<div class="absolute top-3 left-1/2 -translate-x-1/2 z-30">
								<div class="rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white shadow-lg backdrop-blur-sm flex items-center gap-2">
									<Crop class="h-4 w-4" />
									<span>Draw bounding box for {columns.find(c => c.id === cropModeColumnId)?.name}</span>
									<button
										onclick={(e) => {
											e.stopPropagation();
											exitCropMode();
											renderCanvas(currentImageIndex);
										}}
										class="ml-2 flex h-5 w-5 items-center justify-center rounded-full hover:bg-blue-600 transition-colors"
									>
										<X class="h-4 w-4" />
									</button>
								</div>
							</div>
						{/if}

						<!-- Image counter hint -->
						{#if expandedImages.length > 1 && !isDragging && !isCropMode}
							<div class="absolute bottom-3 left-1/2 -translate-x-1/2 z-10">
								<div class="rounded-full bg-black/50 px-3 py-1 text-xs text-white backdrop-blur-sm">
									{currentImageIndex + 1} / {expandedImages.length}
								</div>
							</div>
						{/if}

						<!-- Zoom Controls -->
						{#if !isCropMode}
							<div class="absolute right-4 top-16 z-20 flex flex-col gap-2">
								<button
									onclick={(e) => {
										e.stopPropagation();
										handleZoomIn();
									}}
									class="flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white shadow-lg hover:bg-black/70 active:scale-95 transition-all backdrop-blur-sm"
									disabled={zoomLevels[currentImageIndex] >= 5}
								>
									<ZoomIn class="h-5 w-5" />
								</button>
								<button
									onclick={(e) => {
										e.stopPropagation();
										handleZoomOut();
									}}
									class="flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white shadow-lg hover:bg-black/70 active:scale-95 transition-all backdrop-blur-sm"
									disabled={zoomLevels[currentImageIndex] <= 1}
								>
									<ZoomOut class="h-5 w-5" />
								</button>
								{#if zoomLevels[currentImageIndex] > 1}
									<button
										onclick={(e) => {
											e.stopPropagation();
											handleResetZoom();
										}}
										class="flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white shadow-lg hover:bg-black/70 active:scale-95 transition-all backdrop-blur-sm"
									>
										<Maximize2 class="h-5 w-5" />
									</button>
								{/if}
							</div>
						{/if}

						<!-- Zoom level indicator -->
						{#if zoomLevels[currentImageIndex] > 1}
							<div class="absolute left-4 top-16 z-20">
								<div class="rounded-full bg-black/50 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm">
									{zoomLevels[currentImageIndex].toFixed(1)}x
								</div>
							</div>
						{/if}

						<!-- Approve/Decline/Redo action buttons -->
						<div class="absolute bottom-4 left-4 z-20">
							{#if hasRedoColumns}
								<!-- Redo button when columns are marked for redo -->
								<button
									onclick={(e) => {
										e.stopPropagation();
										handleRedoProcessing();
									}}
									class="flex h-12 w-12 items-center justify-center rounded-full bg-blue-500 text-white shadow-lg hover:bg-blue-600 active:scale-95 transition-all"
									disabled={isAnimating}
								>
									<RotateCcw class="h-6 w-6" />
								</button>
							{:else}
								<!-- Decline button -->
								<button
									onclick={(e) => {
										e.stopPropagation();
										animateSwipe('left');
									}}
									class="flex h-12 w-12 items-center justify-center rounded-full bg-red-500 text-white shadow-lg hover:bg-red-600 active:scale-95 transition-all"
									disabled={isAnimating}
								>
									<X class="h-6 w-6" />
								</button>
							{/if}
						</div>
						<div class="absolute bottom-4 right-4 z-20">
							<button
								onclick={(e) => {
									e.stopPropagation();
									animateSwipe('right');
								}}
								class="flex h-12 w-12 items-center justify-center rounded-full bg-green-500 text-white shadow-lg hover:bg-green-600 active:scale-95 transition-all"
								disabled={isAnimating}
							>
								<Check class="h-6 w-6" />
							</button>
						</div>
					</div>

					<!-- Extracted Data - 1/3 of screen -->
					<div
						class="flex flex-col flex-1 overflow-hidden bg-background"
						ontouchstart={(e) => e.stopPropagation()}
						ontouchmove={(e) => e.stopPropagation()}
						ontouchend={(e) => e.stopPropagation()}
						onmousedown={(e) => e.stopPropagation()}
					>
						<!-- Row navigation -->
						{#if extractionRows.length > 1}
							<div class="border-b px-4 py-3 bg-muted/30">
								<div class="flex items-center justify-between">
									<button
										onclick={(e) => {
											e.stopPropagation();
											handlePreviousRow();
										}}
										disabled={currentRowIndex === 0}
										class="flex h-9 w-9 items-center justify-center rounded-md bg-background border shadow-sm hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
									>
										<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
									</button>
									<div class="flex flex-col items-center">
										<span class="text-sm font-medium">Row {currentRowIndex + 1} of {extractionRows.length}</span>
										<span class="text-xs text-muted-foreground">Use buttons to navigate</span>
									</div>
									<button
										onclick={(e) => {
											e.stopPropagation();
											handleNextRow();
										}}
										disabled={currentRowIndex >= extractionRows.length - 1}
										class="flex h-9 w-9 items-center justify-center rounded-md bg-background border shadow-sm hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
									>
										<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
									</button>
								</div>
							</div>
						{/if}

						<!-- Extraction cards -->
						<div class="flex-1 overflow-y-auto px-4 py-4">
							{#key canvasKey}
								<div class="space-y-2.5">
									{#each columns as column}
										{@const extracted = getColumnValue(column.id)}
										{@const isEditing = editingFields.has(column.id)}
										{@const swipeState = cardSwipeState[column.id] || { offsetX: 0, offsetY: 0, isDragging: false, startX: 0, startY: 0, isAnimating: false, isHorizontalSwipe: false }}
										<div
											class="rounded-lg border bg-card p-3 relative overflow-visible"
											style="
												transform: translateX({swipeState.isHorizontalSwipe ? swipeState.offsetX : 0}px);
												transition: {swipeState.isDragging || swipeState.isAnimating ? 'none' : 'transform 0.3s ease-out'};
												opacity: {swipeState.isHorizontalSwipe && swipeState.isDragging ? Math.max(0.3, 1 - Math.abs(swipeState.offsetX) / 300) : 1};
											"
											ontouchstart={(e) => handleCardSwipeStart(e, column.id)}
											ontouchmove={(e) => handleCardSwipeMove(e, column.id)}
											ontouchend={(e) => handleCardSwipeEnd(e, column.id)}
											onmousedown={(e) => handleCardSwipeStart(e, column.id)}
											onmousemove={(e) => handleCardSwipeMove(e, column.id)}
											onmouseup={(e) => handleCardSwipeEnd(e, column.id)}
											onmouseleave={(e) => {
												if (cardSwipeState[column.id]?.isDragging) {
													handleCardSwipeEnd(e, column.id);
												}
											}}
										>
											<!-- Swipe indicator - only show when horizontal swipe is confirmed -->
											{#if swipeState.isHorizontalSwipe && Math.abs(swipeState.offsetX) > 30}
												<div
													class="absolute inset-0 flex items-center justify-center pointer-events-none z-10 rounded-lg"
													style="opacity: {Math.min(Math.abs(swipeState.offsetX) / 120, 1)}"
												>
													{#if swipeState.offsetX < 0}
														<!-- Swipe left - delete -->
														<div class="flex items-center gap-2 rounded-lg bg-red-500/90 px-4 py-2 text-white shadow-lg">
															<Trash2 class="h-5 w-5" />
															<span class="text-sm font-medium">Clear content</span>
														</div>
													{:else}
														<!-- Swipe right - mark as redo -->
														<div class="flex items-center gap-2 rounded-lg bg-blue-500/90 px-4 py-2 text-white shadow-lg">
															<RotateCcw class="h-5 w-5" />
															<span class="text-sm font-medium">Mark for redo</span>
														</div>
													{/if}
												</div>
											{/if}

											<div class="mb-1.5 flex items-center justify-between gap-2">
												<Label class="text-sm font-semibold">{column.name}</Label>
												<div class="flex items-center gap-2">
													{#if redoColumns.has(column.id)}
														<!-- Redo badge and crop button -->
														<span class="shrink-0 rounded-full px-2 py-0.5 text-xs font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
															Redo {#if customBoundingBoxes[column.id]}(1){/if}
														</span>
														<button
															onclick={(e) => {
																e.stopPropagation();
																startCropMode(column.id);
															}}
															class="flex h-8 w-8 items-center justify-center rounded-md {isCropMode && cropModeColumnId === column.id ? 'bg-blue-600 ring-2 ring-blue-400' : 'bg-blue-500'} text-white hover:bg-blue-600 transition-colors shadow-sm"
														>
															<Crop class="h-4 w-4" />
														</button>
														<button
															onclick={(e) => {
																e.stopPropagation();
																unmarkColumnAsRedo(column.id);
															}}
															class="flex h-6 w-6 items-center justify-center rounded hover:bg-muted transition-colors"
														>
															<X class="h-4 w-4" />
														</button>
													{:else if extracted?.redone}
														<!-- Redone badge for fields that were re-extracted -->
														<span class="shrink-0 rounded-full px-2 py-0.5 text-xs font-bold bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
															Redone
														</span>
													{:else if extracted && !isEditing}
														<span
															class="shrink-0 rounded-full px-2 py-0.5 text-xs font-bold {extracted.confidence >= 0.8
																? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
																: extracted.confidence >= 0.5
																	? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
																	: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}"
														>
															{Math.round(extracted.confidence * 100)}%
														</span>
													{/if}
													{#if !isEditing && !redoColumns.has(column.id)}
														<DropdownMenu.Root>
															<DropdownMenu.Trigger>
																{#snippet child({ props })}
																	<button
																		{...props}
																		class="flex h-6 w-6 items-center justify-center rounded hover:bg-muted transition-colors"
																	>
																		<MoreVertical class="h-4 w-4" />
																	</button>
																{/snippet}
															</DropdownMenu.Trigger>
															<DropdownMenu.Content align="end">
																<DropdownMenu.Item onclick={() => handleZoomToRegion(column.id)}>
																	<Search class="mr-2 h-4 w-4" />
																	{t('images.review.zoom_to_region')}
																</DropdownMenu.Item>
																<DropdownMenu.Item disabled>
																	<MapPin class="mr-2 h-4 w-4" />
																	{t('images.review.mark_region')}
																</DropdownMenu.Item>
																<DropdownMenu.Separator />
																<DropdownMenu.Item onclick={() => toggleEditField(column.id)}>
																	<Edit class="mr-2 h-4 w-4" />
																	{t('images.review.edit')}
																</DropdownMenu.Item>
															</DropdownMenu.Content>
														</DropdownMenu.Root>
													{/if}
												</div>
											</div>

											{#if isEditing}
												<div class="space-y-2">
													{#if column.allowed_values && column.allowed_values.length > 0}
														<!-- Dropdown for allowed values -->
														<select
															bind:value={editedValues[column.id]}
															class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
														>
															<option value="">Select...</option>
															{#each column.allowed_values as value}
																<option value={value}>{value}</option>
															{/each}
														</select>
													{:else}
														<!-- Text input for other types -->
														<Input
															type="text"
															bind:value={editedValues[column.id]}
															placeholder={column.name}
															class="w-full"
														/>
													{/if}
													<!-- Save/Cancel buttons -->
													<div class="flex gap-2 justify-end">
														<Button variant="ghost" size="sm" onclick={() => handleCancelField(column.id)}>
															{t('images.review.cancel')}
														</Button>
														<Button variant="default" size="sm" onclick={() => handleSaveField(column.id)}>
															{t('images.review.save_changes')}
														</Button>
													</div>
												</div>
											{:else if redoColumns.has(column.id)}
												<!-- Show custom bounding box info -->
												{@const box = customBoundingBoxes[column.id]}
												{#if box}
													{@const batch = getCurrentBatch()}
													{@const imageIndex = batch?.images?.findIndex(img => img.id === box.imageId)}
													<div class="text-sm text-blue-600 dark:text-blue-400">
														Region marked on image {imageIndex !== undefined && imageIndex >= 0 ? imageIndex + 1 : 'unknown'}
													</div>
												{:else}
													<p class="text-sm leading-relaxed text-muted-foreground italic">
														No region marked. Click crop button to add.
													</p>
												{/if}
											{:else}
												<p class="text-sm leading-relaxed {extracted?.value ? 'text-foreground font-medium' : 'text-muted-foreground italic'}">
													{extracted?.value || 'Not extracted'}
												</p>
											{/if}
										</div>
									{/each}
								</div>
							{/key}
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}
