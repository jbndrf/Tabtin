<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import * as Tabs from '$lib/components/ui/tabs';
	import * as Card from '$lib/components/ui/card';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import * as Sheet from '$lib/components/ui/sheet';
	import * as Drawer from '$lib/components/ui/drawer';
	import * as Popover from '$lib/components/ui/popover';
	import * as Command from '$lib/components/ui/command';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import * as Accordion from '$lib/components/ui/accordion';
	import { Switch } from '$lib/components/ui/switch';
	import { Separator } from '$lib/components/ui/separator';
	import { t } from '$lib/i18n';
	import * as m from '$lib/paraglide/messages';
	import { ChevronDown, Plus, Trash2, ChevronLeft, ChevronRight, Save, Check, ChevronsUpDown, HelpCircle, MessageSquare } from 'lucide-svelte';
	import { SchemaChat, type Message as SchemaChatMessage } from '$lib/components/schema-chat';
	import { toast } from '$lib/utils/toast';
	import { pb, currentUser } from '$lib/stores/auth';
	import { projectData, currentProject, isProjectLoading } from '$lib/stores/project-data';
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';
	import { setPageActions, clearPageActions } from '$lib/stores/page-actions';
	import { onDestroy, onMount } from 'svelte';
	import { PROMPT_PRESETS, getPresetById, buildModularPrompt, type CoordinateFormat } from '$lib/prompt-presets';
	import { DEFAULT_FEATURE_FLAGS, withFeatureFlagDefaults, type ExtractionFeatureFlags } from '$lib/types/extraction';
	import { getBboxOrder } from '$lib/utils/coordinates';

	let { data }: { data: PageData } = $props();

	// Form state
	let projectName = $state('');
	let description = $state('');
	let endpointPreset = $state<'openrouter' | 'google' | 'custom'>('custom');
	let endpoint = $state('');
	let apiKey = $state('');
	let modelName = $state('');

	// Managed endpoint settings
	let endpointMode = $state<'managed' | 'custom'>('custom');
	let managedEndpointId = $state<string>('');
	let managedEndpoints = $state<Array<{
		id: string;
		alias: string;
		model_name: string;
		provider_type: string;
		description?: string;
	}>>([]);
	let loadingEndpoints = $state(false);
	let availableModels = $state<Array<{ id: string; name?: string }>>([]);
	let fetchingModels = $state(false);
	let saving = $state(false);
	let deleteDialogOpen = $state(false);
	let loading = $state(true);
	let sheetOpen = $state(false);
	let drawerOpen = $state(false);
	let currentColumnIndex = $state(0);
	let activeTab = $state('input');
	let inputSubTab = $state('pdf');
	let analysisSubTab = $state('llm');
	let expectedOutputSubTab = $state('schema');
	let modelComboboxOpen = $state(false);
	let schemaChatOpen = $state(false);

	// Column state
	type Column = {
		id: string;
		name: string;
		type: 'text' | 'number' | 'date' | 'currency' | 'boolean';
		description: string;
		allowedValues: string;
		regex: string;
		expanded: boolean;
	};

	let columns = $state<Column[]>([
		{
			id: '1',
			name: 'Column 1',
			type: 'text',
			description: '',
			allowedValues: '',
			regex: '',
			expanded: true
		}
	]);

	// Prompt state - initial and review prompt templates
	let promptTemplate = $state('');
	let reviewPromptTemplate = $state('');
	let selectedPreset = $state<string>('qwen3vl');
	let coordinateFormat = $state<CoordinateFormat>('normalized_1000');

	// Rate limiting settings
	let requestsPerMinute = $state<number>(15);
	let enableParallelRequests = $state<boolean>(false);
	let maxConcurrency = $state<number>(3);

	// Instance limits (global caps from server)
	let instanceLimits = $state<{
		maxConcurrentProjects: number;
		maxParallelRequests: number;
		maxRequestsPerMinute: number;
	} | null>(null);

	// Sampling parameters (for deterministic/reproducible outputs)
	const SAMPLING_DEFAULTS = {
		temperature: 0.0,
		topK: 1,
		topP: 1.0,
		repetitionPenalty: 1.0,
		frequencyPenalty: 0.0,
		presencePenalty: 0.0
	};
	let enableDeterministicMode = $state<boolean>(false);
	let temperature = $state<number>(SAMPLING_DEFAULTS.temperature);
	let topK = $state<number>(SAMPLING_DEFAULTS.topK);
	let topP = $state<number>(SAMPLING_DEFAULTS.topP);
	let repetitionPenalty = $state<number>(SAMPLING_DEFAULTS.repetitionPenalty);
	let frequencyPenalty = $state<number>(SAMPLING_DEFAULTS.frequencyPenalty);
	let presencePenalty = $state<number>(SAMPLING_DEFAULTS.presencePenalty);

	// Extraction feature flags
	let featureFlags = $state<ExtractionFeatureFlags>({ ...DEFAULT_FEATURE_FLAGS });

	// PDF Processing settings (Advanced)
	const PDF_DEFAULTS = {
		dpi: 300,
		format: 'png' as 'png' | 'jpeg',
		quality: 100,
		maxWidth: 1024,
		maxHeight: 1024,
		includeOcrText: true
	};
	let pdfDpi = $state<number>(PDF_DEFAULTS.dpi);
	let pdfFormat = $state<'png' | 'jpeg'>(PDF_DEFAULTS.format);
	let pdfQuality = $state<number>(PDF_DEFAULTS.quality);
	let pdfMaxWidth = $state<number>(PDF_DEFAULTS.maxWidth);
	let pdfMaxHeight = $state<number>(PDF_DEFAULTS.maxHeight);
	let includeOcrText = $state<boolean>(PDF_DEFAULTS.includeOcrText);

	// API Request settings (Advanced)
	const API_DEFAULTS = {
		requestTimeout: 10 // minutes
	};
	let requestTimeout = $state<number>(API_DEFAULTS.requestTimeout);

	// Image scaling (for non-PDF images)
	let imageMaxDimension = $state<number | null>(null); // null = no scaling, otherwise max pixels for longest side

	function resetPdfDefaults() {
		pdfDpi = PDF_DEFAULTS.dpi;
		pdfFormat = PDF_DEFAULTS.format;
		pdfQuality = PDF_DEFAULTS.quality;
		pdfMaxWidth = PDF_DEFAULTS.maxWidth;
		pdfMaxHeight = PDF_DEFAULTS.maxHeight;
		includeOcrText = PDF_DEFAULTS.includeOcrText;
		toast.success('PDF settings reset to defaults');
	}

	// Schema chat history and document analyses
	let schemaChatHistory = $state<SchemaChatMessage[]>([]);
	let documentAnalyses = $state<Array<{ id: string; timestamp: number; summary: string; documentType?: string; identifiedFields?: string[]; imageCount: number }>>([]);


	// Load project data on mount
	onMount(async () => {
		// Fetch instance limits
		try {
			const res = await fetch('/api/instance-limits');
			if (res.ok) {
				instanceLimits = await res.json();
			}
		} catch (e) {
			console.error('Failed to load instance limits:', e);
		}

		// Load project from store (will use cache if available)
		await projectData.loadProject(data.projectId, $currentUser?.id || '');
		loadProject();
	});

	// Set page actions
	$effect(() => {
		setPageActions([
			{
				label: saving ? 'Saving...' : t('project.settings.save_button'),
				variant: 'default',
				disabled: saving,
				onclick: saveSettings,
				class: 'min-h-10'
			},
			{
				label: '',
				variant: 'destructive',
				size: 'icon',
				icon: Trash2,
				onclick: () => (deleteDialogOpen = true),
				class: 'min-h-10 w-10 shrink-0'
			}
		]);
	});

	// Clear page actions on destroy
	onDestroy(() => {
		clearPageActions();
	});

	// Control sheet visibility based on active tab
	$effect(() => {
		// Close sheet when leaving schema sub-tab
		if (activeTab !== 'expected-output' || expectedOutputSubTab !== 'schema') {
			sheetOpen = false;
			drawerOpen = false;
		}
	});

	// Load available managed endpoints from the server
	async function loadManagedEndpoints() {
		loadingEndpoints = true;
		try {
			const res = await fetch('/api/endpoints');
			if (res.ok) {
				const data = await res.json();
				managedEndpoints = data.endpoints || [];
			}
		} catch (err) {
			console.error('Failed to load managed endpoints:', err);
		} finally {
			loadingEndpoints = false;
		}
	}

	async function loadProject() {
		if (!$currentProject) return;

		try {
			loading = true;

			projectName = $currentProject.name || '';
			const settings = ($currentProject.settings || {}) as any;
			description = settings.description || '';
			endpointPreset = settings.endpointPreset || 'custom';
			endpoint = settings.endpoint || '';
			apiKey = settings.apiKey || '';
			modelName = settings.modelName || '';

			// Load managed endpoint settings
			endpointMode = settings.endpoint_mode || 'custom';
			managedEndpointId = settings.managed_endpoint_id || '';

			// Load available managed endpoints
			await loadManagedEndpoints();

			// Load prompt templates
			promptTemplate = settings.promptTemplate || '';
			reviewPromptTemplate = settings.reviewPromptTemplate || '';
			selectedPreset = settings.selectedPreset || 'qwen3vl';
			coordinateFormat = settings.coordinateFormat || 'pixels';

			// Load rate limiting settings
			requestsPerMinute = settings.requestsPerMinute || 15;
			enableParallelRequests = settings.enableParallelRequests || false;
			maxConcurrency = settings.maxConcurrency || 3;

			// Load sampling parameters
			enableDeterministicMode = settings.enableDeterministicMode || false;
			temperature = settings.temperature ?? SAMPLING_DEFAULTS.temperature;
			topK = settings.topK ?? SAMPLING_DEFAULTS.topK;
			topP = settings.topP ?? SAMPLING_DEFAULTS.topP;
			repetitionPenalty = settings.repetitionPenalty ?? SAMPLING_DEFAULTS.repetitionPenalty;
			frequencyPenalty = settings.frequencyPenalty ?? SAMPLING_DEFAULTS.frequencyPenalty;
			presencePenalty = settings.presencePenalty ?? SAMPLING_DEFAULTS.presencePenalty;

			// Load extraction feature flags
			featureFlags = withFeatureFlagDefaults(settings.featureFlags);

			// Load PDF processing settings
			pdfDpi = settings.pdfDpi ?? PDF_DEFAULTS.dpi;
			pdfFormat = settings.pdfFormat ?? PDF_DEFAULTS.format;
			pdfQuality = settings.pdfQuality ?? PDF_DEFAULTS.quality;
			pdfMaxWidth = settings.pdfMaxWidth ?? PDF_DEFAULTS.maxWidth;
			pdfMaxHeight = settings.pdfMaxHeight ?? PDF_DEFAULTS.maxHeight;
			includeOcrText = settings.includeOcrText ?? PDF_DEFAULTS.includeOcrText;

			// Load API request settings
			requestTimeout = settings.requestTimeout ?? API_DEFAULTS.requestTimeout;

			// Load image scaling
			imageMaxDimension = settings.imageMaxDimension ?? null;

			// Load schema chat history and document analyses
			schemaChatHistory = ($currentProject.schema_chat_history as SchemaChatMessage[]) || [];
			documentAnalyses = ($currentProject.document_analyses as typeof documentAnalyses) || [];

			if (settings.columns && settings.columns.length > 0) {
				columns = settings.columns.map((col: any) => ({
					...col,
					expanded: false
				}));
			}
		} catch (err) {
			console.error('Failed to load project:', err);
			toast.error('Failed to load project');
		} finally {
			loading = false;
		}
	}

	function applyPreset(presetId: string) {
		const preset = getPresetById(presetId);
		if (preset) {
			coordinateFormat = preset.coordinateFormat;
			selectedPreset = presetId;
			toast.success(`Applied ${preset.name} preset`);
		}
	}

	// Auto-apply preset when selectedPreset changes
	$effect(() => {
		if (selectedPreset && !loading) {
			const preset = getPresetById(selectedPreset);
			if (preset) {
				coordinateFormat = preset.coordinateFormat;
			}
		}
	});

	function addColumn() {
		const newId = (columns.length + 1).toString();
		columns.push({
			id: newId,
			name: `Column ${newId}`,
			type: 'text',
			description: '',
			allowedValues: '',
			regex: '',
			expanded: true
		});
	}

	function removeColumn(id: string) {
		columns = columns.filter((col) => col.id !== id);
	}

	function toggleColumn(id: string) {
		const column = columns.find((col) => col.id === id);
		if (column) {
			column.expanded = !column.expanded;
		}
	}

	function goToPreviousColumn() {
		if (currentColumnIndex > 0) {
			currentColumnIndex--;
		}
	}

	function goToNextColumn() {
		if (currentColumnIndex < columns.length - 1) {
			currentColumnIndex++;
		}
	}

	function openColumnEditor(index: number) {
		currentColumnIndex = index;
		// Check if we're on mobile or desktop
		const isMobile = window.innerWidth < 768; // md breakpoint
		if (isMobile) {
			drawerOpen = true;
		} else {
			sheetOpen = true;
		}
	}

	async function fetchModels() {
		if (!endpoint) {
			toast.error('Please enter an API endpoint first');
			return;
		}

		fetchingModels = true;
		try {
			// Use server-side proxy to avoid CORS issues
			const response = await fetch('/api/proxy-models', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					endpoint,
					apiKey
				})
			});

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}));
				throw new Error(errorData.error || `Failed to fetch models: ${response.statusText}`);
			}

			const data = await response.json();

			// Handle OpenAI-compatible response format
			if (data.data && Array.isArray(data.data)) {
				availableModels = data.data;

				if (availableModels.length > 0) {
					// Set the first model as default if no model is selected
					if (!modelName) {
						modelName = availableModels[0].id;
					}
					toast.success(`Found ${availableModels.length} models`);
				} else {
					toast.warning('No models found at this endpoint');
				}
			} else {
				toast.warning('Unexpected response format from endpoint');
			}
		} catch (err) {
			console.error('Failed to fetch models:', err);
			toast.error(
				err instanceof Error ? err.message : 'Failed to fetch models from the endpoint'
			);
		} finally {
			fetchingModels = false;
		}
	}

	async function saveSettings() {
		try {
			saving = true;

			// Cap values at instance limits (enforce even if UI was bypassed)
			const cappedRequestsPerMinute = instanceLimits
				? Math.min(requestsPerMinute, instanceLimits.maxRequestsPerMinute)
				: requestsPerMinute;
			const cappedMaxConcurrency = instanceLimits
				? Math.min(maxConcurrency, instanceLimits.maxParallelRequests)
				: maxConcurrency;

			const settings = {
				description,
				endpointPreset,
				endpoint,
				apiKey,
				modelName,
				// Managed endpoint settings
				endpoint_mode: endpointMode,
				managed_endpoint_id: endpointMode === 'managed' ? managedEndpointId : null,
				promptTemplate,
				reviewPromptTemplate,
				selectedPreset,
				coordinateFormat,
				requestsPerMinute: cappedRequestsPerMinute,
				enableParallelRequests,
				maxConcurrency: cappedMaxConcurrency,
				featureFlags,
				// PDF processing settings
				pdfDpi,
				pdfFormat,
				pdfQuality,
				pdfMaxWidth,
				pdfMaxHeight,
				includeOcrText,
				// API request settings
				requestTimeout,
				// Image scaling
				imageMaxDimension,
				// Sampling parameters
				enableDeterministicMode,
				temperature,
				topK,
				topP,
				repetitionPenalty,
				frequencyPenalty,
				presencePenalty,
				columns: columns.map((col, index) => ({
					id: String(index + 1),
					name: col.name,
					type: col.type,
					description: col.description,
					allowedValues: col.allowedValues,
					regex: col.regex
				}))
			};

			await pb.collection('projects').update(data.projectId, {
				name: projectName,
				settings
			});

			// Refresh the project data in the store
			await projectData.refreshProject($currentUser?.id || '');

			toast.success('Settings saved successfully');
		} catch (err) {
			console.error('Failed to save settings:', err);
			toast.error('Failed to save settings');
		} finally {
			saving = false;
		}
	}

	async function deleteProject() {
		try {
			await pb.collection('projects').delete(data.projectId);
			toast.success('Project deleted');
			goto('/dashboard');
		} catch (err) {
			console.error('Failed to delete project:', err);
			toast.error('Failed to delete project');
		}
	}

	async function saveChatHistory(messages: SchemaChatMessage[]) {
		try {
			schemaChatHistory = messages;
			await pb.collection('projects').update(data.projectId, {
				schema_chat_history: messages
			});
		} catch (err) {
			console.error('Failed to save chat history:', err);
			// Silently fail - chat history is not critical
		}
	}

	async function saveDocumentAnalyses(analyses: typeof documentAnalyses) {
		try {
			documentAnalyses = analyses;
			await pb.collection('projects').update(data.projectId, {
				document_analyses: analyses
			});
		} catch (err) {
			console.error('Failed to save document analyses:', err);
			// Silently fail - not critical
		}
	}

	function generateFullPrompt(): string {
		const bboxOrder = getBboxOrder(coordinateFormat);

		if (columns.length === 0) {
			return '(No fields defined yet. Add columns to see the full prompt.)';
		}

		// Use the modular prompt builder
		return buildModularPrompt({
			columns: columns.map((col, index) => ({
				id: String(index + 1),
				name: col.name,
				type: col.type,
				description: col.description,
				allowedValues: col.allowedValues,
				regex: col.regex
			})),
			featureFlags,
			bboxOrder
		});
	}
</script>

<div class="space-y-6 p-4">
	<Tabs.Root bind:value={activeTab} class="w-full">
		<Tabs.List class="grid w-full grid-cols-3">
			<Tabs.Trigger value="input">Input</Tabs.Trigger>
			<Tabs.Trigger value="analysis">Analysis</Tabs.Trigger>
			<Tabs.Trigger value="expected-output">Expected Output</Tabs.Trigger>
		</Tabs.List>

		<!-- ==================== INPUT TAB ==================== -->
		<Tabs.Content value="input" class="mt-4 space-y-4">
			<Tabs.Root bind:value={inputSubTab} class="w-full">
				<Tabs.List class="w-full max-w-xs">
					<Tabs.Trigger value="pdf" class="flex-1">PDF</Tabs.Trigger>
					<Tabs.Trigger value="images" class="flex-1">Images</Tabs.Trigger>
				</Tabs.List>

				<!-- PDF Sub-tab -->
				<Tabs.Content value="pdf" class="mt-4 space-y-4">
					<div class="space-y-4">
						<div class="flex items-start justify-between">
							<div>
								<h2 class="text-lg font-semibold">PDF Settings</h2>
								<p class="mt-1 text-sm text-muted-foreground">
									Configure how PDF documents are converted to images before processing.
								</p>
							</div>
							<Button variant="outline" size="sm" onclick={resetPdfDefaults}>
								Reset to Defaults
							</Button>
						</div>

						<!-- Include OCR Text -->
						<div class="flex items-center justify-between py-2">
							<div class="flex items-center gap-2">
								<Label for="includeOcrText" class="cursor-pointer">Include Text Layer</Label>
								<Tooltip.Root>
									<Tooltip.Trigger>
										{#snippet child({ props })}
											<button {...props} type="button" class="text-muted-foreground hover:text-foreground transition-colors">
												<HelpCircle class="h-4 w-4" />
											</button>
										{/snippet}
									</Tooltip.Trigger>
									<Tooltip.Content>
										<div class="max-w-xs">
											<p class="text-xs">Sends embedded PDF text alongside images to help the AI read small or complex text. Disable for pure visual analysis.</p>
										</div>
									</Tooltip.Content>
								</Tooltip.Root>
							</div>
							<Switch id="includeOcrText" bind:checked={includeOcrText} />
						</div>

						<!-- Per-Page Extraction -->
						<div class="flex items-center justify-between py-2">
							<div class="flex items-center gap-2">
								<Label for="perPageExtraction" class="cursor-pointer">Page-by-Page Processing</Label>
								<Tooltip.Root>
									<Tooltip.Trigger>
										{#snippet child({ props })}
											<button {...props} type="button" class="text-muted-foreground hover:text-foreground transition-colors">
												<HelpCircle class="h-4 w-4" />
											</button>
										{/snippet}
									</Tooltip.Trigger>
									<Tooltip.Content>
										<div class="max-w-xs">
											<p class="text-xs">Process each PDF page separately with context from previous pages. More thorough but slower. Only applies to multi-page PDFs.</p>
										</div>
									</Tooltip.Content>
								</Tooltip.Root>
							</div>
							<Switch id="perPageExtraction" bind:checked={featureFlags.perPageExtraction} />
						</div>

						<!-- Advanced Settings -->
						<Accordion.Root type="single" collapsible class="w-full">
							<Accordion.Item value="advanced">
								<Accordion.Trigger class="text-sm font-medium">Advanced Settings</Accordion.Trigger>
								<Accordion.Content>
									<div class="space-y-4 pt-4">
										<!-- DPI Setting -->
										<div class="space-y-2">
											<div class="flex items-center gap-2">
												<Label for="pdfDpi">Resolution (DPI)</Label>
												<Tooltip.Root>
													<Tooltip.Trigger>
														{#snippet child({ props })}
															<button {...props} type="button" class="text-muted-foreground hover:text-foreground transition-colors">
																<HelpCircle class="h-4 w-4" />
															</button>
														{/snippet}
													</Tooltip.Trigger>
													<Tooltip.Content>
														<div class="max-w-xs">
															<p class="text-xs">Higher DPI produces sharper images. 150 for fast, 300 balanced, 600 high quality.</p>
														</div>
													</Tooltip.Content>
												</Tooltip.Root>
											</div>
											<div class="flex gap-4 items-center">
												<Input
													type="number"
													id="pdfDpi"
													bind:value={pdfDpi}
													min="72"
													max="1200"
													step="50"
													class="h-10 w-24"
												/>
												<div class="flex gap-2">
													<Button variant="outline" size="sm" onclick={() => pdfDpi = 150}>150</Button>
													<Button variant="outline" size="sm" onclick={() => pdfDpi = 300}>300</Button>
													<Button variant="outline" size="sm" onclick={() => pdfDpi = 600}>600</Button>
												</div>
											</div>
										</div>

										<!-- Format Setting -->
										<div class="space-y-2">
											<Label for="pdfFormat">Image Format</Label>
											<select
												id="pdfFormat"
												bind:value={pdfFormat}
												class="flex h-10 w-full max-w-xs rounded-md border border-input bg-background px-3 py-2 text-sm"
											>
												<option value="png">PNG (Lossless)</option>
												<option value="jpeg">JPEG (Compressed)</option>
											</select>
										</div>

										<!-- Quality Setting (only visible for JPEG) -->
										{#if pdfFormat === 'jpeg'}
											<div class="space-y-2">
												<div class="flex items-center gap-2">
													<Label for="pdfQuality">Compression Quality</Label>
													<span class="text-sm text-muted-foreground">{pdfQuality}%</span>
												</div>
												<input
													type="range"
													id="pdfQuality"
													bind:value={pdfQuality}
													min="50"
													max="100"
													step="5"
													class="w-full max-w-xs"
												/>
											</div>
										{/if}

										<!-- Max Dimensions -->
										<div class="space-y-2">
											<Label>Size Limits</Label>
											<div class="grid grid-cols-2 gap-4 max-w-sm">
												<div class="space-y-1">
													<Label for="pdfMaxWidth" class="text-xs text-muted-foreground">Max Width (px)</Label>
													<Input
														type="number"
														id="pdfMaxWidth"
														bind:value={pdfMaxWidth}
														min="1000"
														max="15000"
														step="100"
														class="h-10"
													/>
												</div>
												<div class="space-y-1">
													<Label for="pdfMaxHeight" class="text-xs text-muted-foreground">Max Height (px)</Label>
													<Input
														type="number"
														id="pdfMaxHeight"
														bind:value={pdfMaxHeight}
														min="1000"
														max="15000"
														step="100"
														class="h-10"
													/>
												</div>
											</div>
										</div>
									</div>
								</Accordion.Content>
							</Accordion.Item>
						</Accordion.Root>
					</div>
				</Tabs.Content>

				<!-- Images Sub-tab -->
				<Tabs.Content value="images" class="mt-4 space-y-4">
					<div class="space-y-4">
						<div>
							<h2 class="text-lg font-semibold">Image Settings</h2>
							<p class="mt-1 text-sm text-muted-foreground">
								Configure how images are processed before sending to the AI.
							</p>
						</div>

						<!-- Max Image Size Setting -->
						<div class="space-y-3">
							<div class="flex items-center gap-2">
								<Label for="imageMaxDimension">Max Image Size</Label>
								<Tooltip.Root>
									<Tooltip.Trigger>
										{#snippet child({ props })}
											<button {...props} type="button" class="text-muted-foreground hover:text-foreground transition-colors">
												<HelpCircle class="h-4 w-4" />
											</button>
										{/snippet}
									</Tooltip.Trigger>
									<Tooltip.Content>
										<div class="max-w-xs space-y-1">
											<p class="text-xs font-medium">Longest Side Scaling</p>
											<p class="text-xs">Images larger than this are scaled down so the longest side fits within this limit. Aspect ratio is always preserved.</p>
											<p class="text-xs text-muted-foreground mt-1">Smaller = fewer tokens/lower cost. Claude recommends 1568px.</p>
										</div>
									</Tooltip.Content>
								</Tooltip.Root>
							</div>
							<div class="flex items-center gap-2">
								<Input
									type="number"
									id="imageMaxDimension"
									value={imageMaxDimension ?? ''}
									oninput={(e) => {
										const val = e.currentTarget.value;
										imageMaxDimension = val ? parseInt(val, 10) : null;
									}}
									placeholder="Original"
									min="256"
									max="8192"
									step="1"
									class="w-24 h-10"
								/>
								<span class="text-sm text-muted-foreground">px</span>
							</div>
							<div class="flex flex-wrap gap-2">
								<Button
									variant={imageMaxDimension === 512 ? 'default' : 'outline'}
									size="sm"
									onclick={() => imageMaxDimension = 512}
								>512</Button>
								<Button
									variant={imageMaxDimension === 1024 ? 'default' : 'outline'}
									size="sm"
									onclick={() => imageMaxDimension = 1024}
								>1024</Button>
								<Button
									variant={imageMaxDimension === 1568 ? 'default' : 'outline'}
									size="sm"
									onclick={() => imageMaxDimension = 1568}
								>1568</Button>
								<Button
									variant={imageMaxDimension === 2048 ? 'default' : 'outline'}
									size="sm"
									onclick={() => imageMaxDimension = 2048}
								>2048</Button>
								<Button
									variant={imageMaxDimension === null ? 'default' : 'outline'}
									size="sm"
									onclick={() => imageMaxDimension = null}
								>Original</Button>
							</div>
							<p class="text-xs text-muted-foreground">
								{#if imageMaxDimension}
									Images with longest side > {imageMaxDimension}px will be scaled down.
								{:else}
									Images sent at original size (no scaling).
								{/if}
							</p>
						</div>
					</div>
				</Tabs.Content>
			</Tabs.Root>
		</Tabs.Content>

		<!-- ==================== ANALYSIS TAB ==================== -->
		<Tabs.Content value="analysis" class="mt-4 space-y-4">
			<Tabs.Root bind:value={analysisSubTab} class="w-full">
				<Tabs.List class="w-full max-w-md">
					<Tabs.Trigger value="llm" class="flex-1">LLM</Tabs.Trigger>
					<Tabs.Trigger value="request" class="flex-1">Request</Tabs.Trigger>
					<Tabs.Trigger value="parameters" class="flex-1">Parameters</Tabs.Trigger>
					<Tabs.Trigger value="prompts" class="flex-1">Prompts</Tabs.Trigger>
				</Tabs.List>

				<!-- LLM Selection Sub-tab -->
				<Tabs.Content value="llm" class="mt-4 space-y-4">
					<div class="space-y-4">
						<div>
							<h2 class="text-lg font-semibold">LLM Selection</h2>
							<p class="mt-1 text-sm text-muted-foreground">
								Configure which Vision LLM to use for extraction.
							</p>
						</div>

						<!-- Endpoint Mode Selection -->
						<div class="space-y-2">
							<Label>Endpoint Mode</Label>
							<div class="flex gap-2">
								<Button
									variant={endpointMode === 'managed' ? 'default' : 'outline'}
									size="sm"
									onclick={() => endpointMode = 'managed'}
									disabled={managedEndpoints.length === 0}
								>
									Managed
								</Button>
								<Button
									variant={endpointMode === 'custom' ? 'default' : 'outline'}
									size="sm"
									onclick={() => endpointMode = 'custom'}
								>
									Custom
								</Button>
							</div>
							<p class="text-xs text-muted-foreground">
								{#if endpointMode === 'managed'}
									Use a pre-configured endpoint managed by your administrator.
								{:else}
									Configure your own API endpoint and credentials.
								{/if}
							</p>
						</div>

						<!-- Managed Endpoint Selection -->
						{#if endpointMode === 'managed'}
							<div class="space-y-2">
								<Label for="managedEndpoint">Select Endpoint</Label>
								{#if loadingEndpoints}
									<div class="flex items-center gap-2 text-sm text-muted-foreground">
										<span class="animate-spin">...</span> Loading endpoints...
									</div>
								{:else if managedEndpoints.length === 0}
									<div class="rounded-md bg-muted p-3 text-sm text-muted-foreground">
										No managed endpoints available. Contact your administrator or use a custom endpoint.
									</div>
								{:else}
									<select
										id="managedEndpoint"
										bind:value={managedEndpointId}
										class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
									>
										<option value="">Select an endpoint...</option>
										{#each managedEndpoints as ep}
											<option value={ep.id}>
												{ep.alias} ({ep.model_name}) - {ep.provider_type}
											</option>
										{/each}
									</select>
									{#if managedEndpointId}
										{@const selected = managedEndpoints.find(e => e.id === managedEndpointId)}
										{#if selected?.description}
											<p class="text-xs text-muted-foreground">{selected.description}</p>
										{/if}
									{/if}
								{/if}
							</div>
						{/if}

						<!-- Custom Endpoint Configuration -->
						{#if endpointMode === 'custom'}
							<div class="space-y-2">
								<Label for="endpointPreset">Endpoint Preset</Label>
								<select
									id="endpointPreset"
									bind:value={endpointPreset}
									onchange={() => {
										if (endpointPreset === 'openrouter') {
											endpoint = 'https://openrouter.ai/api/v1/chat/completions';
										} else if (endpointPreset === 'google') {
											endpoint = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
										} else {
											endpoint = '';
										}
										availableModels = [];
										modelName = '';
									}}
									class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
								>
									<option value="openrouter">OpenRouter</option>
									<option value="google">Google Gemini API</option>
									<option value="custom">Custom Endpoint</option>
								</select>
							</div>

							<div class="space-y-2">
								<Label for="endpoint">API Endpoint</Label>
								<Input
									type="url"
									id="endpoint"
									bind:value={endpoint}
									placeholder="https://api.openai.com/v1/chat/completions"
									class="h-10"
									disabled={endpointPreset === 'openrouter' || endpointPreset === 'google'}
								/>
							</div>

							<div class="space-y-2">
								<Label for="apiKey">API Key</Label>
								<Input
									type="password"
									id="apiKey"
									bind:value={apiKey}
									placeholder="sk-... or your API key"
									class="h-10"
								/>
							</div>

							<div class="space-y-2">
								<Label for="modelName">Model</Label>
								<div class="flex flex-col gap-2 sm:flex-row">
									<Button
										type="button"
										variant="outline"
										disabled={!endpoint || fetchingModels}
										onclick={fetchModels}
										class="whitespace-nowrap"
									>
										{fetchingModels ? 'Fetching...' : 'Fetch Models'}
									</Button>
									{#if availableModels.length > 0}
										<Popover.Root bind:open={modelComboboxOpen}>
											<Popover.Trigger asChild>
												{#snippet child({ props })}
													<Button
														{...props}
														variant="outline"
														role="combobox"
														aria-expanded={modelComboboxOpen}
														class="w-full justify-between h-10"
													>
														<span class="truncate">
															{modelName
																? availableModels.find((m) => m.id === modelName)?.name || modelName
																: 'Select model...'}
														</span>
														<ChevronsUpDown class="ml-2 h-4 w-4 shrink-0 opacity-50" />
													</Button>
												{/snippet}
											</Popover.Trigger>
											<Popover.Content class="w-full p-0" align="start">
												<Command.Root>
													<Command.Input placeholder="Search models..." />
													<Command.List>
														<Command.Empty>No model found.</Command.Empty>
														<Command.Group>
															{#each availableModels as model}
																<Command.Item
																	value={model.id}
																	onSelect={() => {
																		modelName = model.id;
																		modelComboboxOpen = false;
																	}}
																>
																	<Check
																		class="mr-2 h-4 w-4 {modelName === model.id ? 'opacity-100' : 'opacity-0'}"
																	/>
																	{model.name || model.id}
																</Command.Item>
															{/each}
														</Command.Group>
													</Command.List>
												</Command.Root>
											</Popover.Content>
										</Popover.Root>
									{:else}
										<Input
											id="modelName"
											bind:value={modelName}
											placeholder="e.g., gpt-4-vision-preview"
											class="h-10"
										/>
									{/if}
								</div>
							</div>
						{/if}
					</div>
				</Tabs.Content>

				<!-- Request Parameters Sub-tab -->
				<Tabs.Content value="request" class="mt-4 space-y-4">
					<div class="space-y-4">
						<div>
							<h2 class="text-lg font-semibold">Request Parameters</h2>
							<p class="mt-1 text-sm text-muted-foreground">
								Configure rate limiting and request behavior.
							</p>
						</div>

						<!-- Requests Per Minute -->
						<div class="space-y-2">
							<div class="flex items-center gap-2">
								<Label for="requestsPerMinute">Requests Per Minute</Label>
								{#if instanceLimits}
									<span class="text-xs text-muted-foreground">(max: {instanceLimits.maxRequestsPerMinute})</span>
								{/if}
								<Tooltip.Root>
									<Tooltip.Trigger>
										{#snippet child({ props })}
											<button {...props} type="button" class="text-muted-foreground hover:text-foreground transition-colors">
												<HelpCircle class="h-4 w-4" />
											</button>
										{/snippet}
									</Tooltip.Trigger>
									<Tooltip.Content>
										<div class="max-w-xs">
											<p class="text-xs">Maximum number of API requests allowed per minute.</p>
										</div>
									</Tooltip.Content>
								</Tooltip.Root>
							</div>
							<Input
								type="number"
								id="requestsPerMinute"
								bind:value={requestsPerMinute}
								min="1"
								max={instanceLimits?.maxRequestsPerMinute ?? 1000}
								class="h-10 w-32"
							/>
						</div>

						<!-- Parallel Requests -->
						<div class="flex items-center justify-between py-2">
							<div class="flex items-center gap-2">
								<Label for="enableParallelRequests" class="cursor-pointer">Enable Parallel Requests</Label>
								<Tooltip.Root>
									<Tooltip.Trigger>
										{#snippet child({ props })}
											<button {...props} type="button" class="text-muted-foreground hover:text-foreground transition-colors">
												<HelpCircle class="h-4 w-4" />
											</button>
										{/snippet}
									</Tooltip.Trigger>
									<Tooltip.Content>
										<div class="max-w-xs">
											<p class="text-xs">Process multiple batches simultaneously instead of one at a time.</p>
										</div>
									</Tooltip.Content>
								</Tooltip.Root>
							</div>
							<Switch id="enableParallelRequests" bind:checked={enableParallelRequests} />
						</div>

						{#if enableParallelRequests}
							<div class="ml-6 space-y-2">
								<div class="flex items-center gap-2">
									<Label for="maxConcurrency">Max Concurrent Requests</Label>
									{#if instanceLimits}
										<span class="text-xs text-muted-foreground">(max: {instanceLimits.maxParallelRequests})</span>
									{/if}
								</div>
								<Input
									type="number"
									id="maxConcurrency"
									bind:value={maxConcurrency}
									min="1"
									max={instanceLimits?.maxParallelRequests ?? 20}
									class="h-10 w-32"
								/>
							</div>
						{/if}

						<!-- Request Timeout -->
						<div class="space-y-2">
							<div class="flex items-center gap-2">
								<Label for="requestTimeout">Request Timeout</Label>
								<Tooltip.Root>
									<Tooltip.Trigger>
										{#snippet child({ props })}
											<button {...props} type="button" class="text-muted-foreground hover:text-foreground transition-colors">
												<HelpCircle class="h-4 w-4" />
											</button>
										{/snippet}
									</Tooltip.Trigger>
									<Tooltip.Content>
										<div class="max-w-xs">
											<p class="text-xs">Maximum wait time for LLM responses. Use 15-20 min for large PDFs.</p>
										</div>
									</Tooltip.Content>
								</Tooltip.Root>
							</div>
							<div class="flex gap-4 items-center">
								<Input
									type="number"
									id="requestTimeout"
									bind:value={requestTimeout}
									min="1"
									max="30"
									class="h-10 w-24"
								/>
								<div class="flex gap-2">
									<Button variant="outline" size="sm" onclick={() => requestTimeout = 5}>5</Button>
									<Button variant="outline" size="sm" onclick={() => requestTimeout = 10}>10</Button>
									<Button variant="outline" size="sm" onclick={() => requestTimeout = 15}>15</Button>
								</div>
								<span class="text-sm text-muted-foreground">minutes</span>
							</div>
						</div>
					</div>
				</Tabs.Content>

				<!-- Model Parameters Sub-tab -->
				<Tabs.Content value="parameters" class="mt-4 space-y-4">
					<div class="space-y-4">
						<div>
							<h2 class="text-lg font-semibold">Model Parameters</h2>
							<p class="mt-1 text-sm text-muted-foreground">
								Configure sampling parameters for the LLM output.
							</p>
						</div>

						<!-- Deterministic Mode -->
						<div class="flex items-center justify-between py-2">
							<div class="flex items-center gap-2">
								<Label for="enableDeterministicMode" class="cursor-pointer">Deterministic Mode</Label>
								<Tooltip.Root>
									<Tooltip.Trigger>
										{#snippet child({ props })}
											<button {...props} type="button" class="text-muted-foreground hover:text-foreground transition-colors">
												<HelpCircle class="h-4 w-4" />
											</button>
										{/snippet}
									</Tooltip.Trigger>
									<Tooltip.Content>
										<div class="max-w-xs">
											<p class="text-xs">Sends sampling parameters for reproducible outputs. Required for vLLM.</p>
										</div>
									</Tooltip.Content>
								</Tooltip.Root>
							</div>
							<Switch id="enableDeterministicMode" bind:checked={enableDeterministicMode} />
						</div>

						{#if enableDeterministicMode}
							<div class="grid grid-cols-2 gap-4 ml-6">
								<div class="space-y-1">
									<Label for="temperature" class="text-sm">Temperature</Label>
									<Input type="number" id="temperature" bind:value={temperature} min="0" max="2" step="0.1" class="h-10" />
								</div>
								<div class="space-y-1">
									<Label for="topK" class="text-sm">Top K</Label>
									<Input type="number" id="topK" bind:value={topK} min="1" max="100" step="1" class="h-10" />
								</div>
								<div class="space-y-1">
									<Label for="topP" class="text-sm">Top P</Label>
									<Input type="number" id="topP" bind:value={topP} min="0" max="1" step="0.1" class="h-10" />
								</div>
								<div class="space-y-1">
									<Label for="repetitionPenalty" class="text-sm">Repetition Penalty</Label>
									<Input type="number" id="repetitionPenalty" bind:value={repetitionPenalty} min="1" max="2" step="0.1" class="h-10" />
								</div>
								<div class="space-y-1">
									<Label for="frequencyPenalty" class="text-sm">Frequency Penalty</Label>
									<Input type="number" id="frequencyPenalty" bind:value={frequencyPenalty} min="0" max="2" step="0.1" class="h-10" />
								</div>
								<div class="space-y-1">
									<Label for="presencePenalty" class="text-sm">Presence Penalty</Label>
									<Input type="number" id="presencePenalty" bind:value={presencePenalty} min="0" max="2" step="0.1" class="h-10" />
								</div>
							</div>
						{/if}

						<!-- TOON Output Format Toggle -->
						<div class="flex items-center justify-between py-2">
							<div class="flex items-center gap-2">
								<Label for="toonOutput" class="cursor-pointer">Compact Format (TOON)</Label>
								<Tooltip.Root>
									<Tooltip.Trigger>
										{#snippet child({ props })}
											<button {...props} type="button" class="text-muted-foreground hover:text-foreground transition-colors">
												<HelpCircle class="h-4 w-4" />
											</button>
										{/snippet}
									</Tooltip.Trigger>
									<Tooltip.Content>
										<div class="max-w-xs">
											<p class="text-xs">Uses a space-efficient response format that reduces API costs by 40-50%. Disable if you experience parsing errors.</p>
										</div>
									</Tooltip.Content>
								</Tooltip.Root>
							</div>
							<Switch id="toonOutput" bind:checked={featureFlags.toonOutput} />
						</div>
					</div>
				</Tabs.Content>

				<!-- Prompts Sub-tab -->
				<Tabs.Content value="prompts" class="mt-4 space-y-4">
					<div class="space-y-4">
						<div>
							<h2 class="text-lg font-semibold">Prompts</h2>
							<p class="mt-1 text-sm text-muted-foreground">
								Configure custom prompt templates.
							</p>
						</div>

						<!-- Custom Prompt Template -->
						<div class="space-y-2">
							<Label for="promptTemplate">Extraction Prompt</Label>
							<Textarea
								id="promptTemplate"
								bind:value={promptTemplate}
								placeholder="Leave empty to use auto-generated prompt based on your schema..."
								rows={8}
								class="font-mono text-xs"
							/>
							<p class="text-xs text-muted-foreground">
								Custom instructions sent to the AI. Leave empty for auto-generated prompt.
							</p>
						</div>

						<!-- Review Prompt Template -->
						<div class="space-y-2">
							<Label for="reviewPromptTemplate">Re-extraction Prompt</Label>
							<Textarea
								id="reviewPromptTemplate"
								bind:value={reviewPromptTemplate}
								placeholder="Used when re-extracting specific fields..."
								rows={6}
								class="font-mono text-xs"
							/>
							<p class="text-xs text-muted-foreground">
								Used when re-extracting specific fields from cropped regions.
							</p>
						</div>

						<!-- Prompt Preview -->
						<Accordion.Root type="single" collapsible class="w-full">
							<Accordion.Item value="preview">
								<Accordion.Trigger class="text-sm font-medium">Generated Prompt Preview</Accordion.Trigger>
								<Accordion.Content>
									<div class="overflow-x-auto rounded-md bg-muted p-3 text-xs max-h-64 overflow-y-auto mt-2">
										<pre class="whitespace-pre-wrap">{generateFullPrompt()}</pre>
									</div>
									<p class="mt-2 text-xs text-muted-foreground">
										This is what the AI will see when processing images.
									</p>
								</Accordion.Content>
							</Accordion.Item>
						</Accordion.Root>
					</div>
				</Tabs.Content>
			</Tabs.Root>
		</Tabs.Content>

		<!-- ==================== EXPECTED OUTPUT TAB ==================== -->
		<Tabs.Content value="expected-output" class="mt-4 space-y-4">
			<Tabs.Root bind:value={expectedOutputSubTab} class="w-full">
				<Tabs.List class="w-full max-w-xs">
					<Tabs.Trigger value="schema" class="flex-1">Schema</Tabs.Trigger>
					<Tabs.Trigger value="features" class="flex-1">Features</Tabs.Trigger>
				</Tabs.List>

				<!-- Schema Sub-tab -->
				<Tabs.Content value="schema" class="mt-4 space-y-4">
					<div class="space-y-4">
						<div>
							<h2 class="text-lg font-semibold">Project Schema</h2>
							<p class="mt-1 text-sm text-muted-foreground">
								Define the table structure for extracted data.
							</p>
						</div>

						<!-- Project Name -->
						<div class="space-y-2">
							<Label for="name">{t('project.settings.basic.name_label')} *</Label>
							<Input
								id="name"
								bind:value={projectName}
								placeholder={t('project.settings.basic.name_placeholder')}
								required
								class="h-10"
							/>
						</div>

						<!-- Project Description -->
						<div class="space-y-2">
							<Label for="description">{t('project.settings.basic.description_label')}</Label>
							<Textarea
								id="description"
								bind:value={description}
								placeholder={t('project.settings.basic.description_placeholder')}
								rows={2}
							/>
						</div>

						<!-- Table Preview -->
						<div>
							<div class="mb-3 flex items-center justify-between">
								<h3 class="text-sm font-semibold">{t('project.settings.columns.preview_title')}</h3>
								<Button
									type="button"
									variant="outline"
									size="icon"
									onclick={addColumn}
									class="h-8 w-8"
								>
									<Plus class="h-4 w-4" />
								</Button>
							</div>

							{#if columns.length === 0}
								<div class="flex items-center justify-center rounded-lg border border-dashed p-6">
									<div class="text-center">
										<p class="text-sm text-muted-foreground">{t('project.settings.columns.preview_empty')}</p>
										<Button type="button" variant="outline" onclick={addColumn} class="mt-3">
											<Plus class="mr-2 h-4 w-4" />
											{t('project.settings.columns.add_button')}
										</Button>
									</div>
								</div>
							{:else}
								<div class="overflow-x-auto rounded-lg border">
									<table class="w-full">
										<thead class="bg-muted/50">
											<tr>
												{#each columns as column, i}
													<th
														class:border-primary={currentColumnIndex === i && (sheetOpen || drawerOpen)}
														class={`cursor-pointer border-r px-3 py-2 text-left text-sm font-semibold transition-colors hover:bg-muted ${currentColumnIndex === i && (sheetOpen || drawerOpen) ? 'bg-primary/10' : ''}`}
														onclick={() => openColumnEditor(i)}
													>
														{column.name || `Column ${i + 1}`}
														<div class="text-xs font-normal text-muted-foreground">
															{t(`project.settings.columns.types.${column.type}`)}
														</div>
													</th>
												{/each}
											</tr>
										</thead>
										<tbody>
											<tr>
												{#each columns as column}
													<td class="border-r border-t px-3 py-2 text-sm text-muted-foreground italic">
														Sample data
													</td>
												{/each}
											</tr>
										</tbody>
									</table>
								</div>
							{/if}
						</div>
					</div>

					<!-- Schema Chat FAB -->
					{#if !loading}
						<Tooltip.Root>
							<Tooltip.Trigger asChild>
								{#snippet child({ props })}
									<Button
										{...props}
										variant="default"
										size="icon"
										class="fixed bottom-20 right-4 md:bottom-6 md:right-6 h-14 w-14 rounded-full shadow-lg z-50"
										onclick={() => schemaChatOpen = true}
									>
										<MessageSquare class="h-6 w-6" />
									</Button>
								{/snippet}
							</Tooltip.Trigger>
							<Tooltip.Content side="left">
								<p>AI Schema Assistant</p>
							</Tooltip.Content>
						</Tooltip.Root>
					{/if}
				</Tabs.Content>

				<!-- Features Sub-tab -->
				<Tabs.Content value="features" class="mt-4 space-y-4">
					<div class="space-y-4">
						<div>
							<h2 class="text-lg font-semibold">Extraction Features</h2>
							<p class="mt-1 text-sm text-muted-foreground">
								Configure what additional data is extracted alongside values.
							</p>
						</div>

						<!-- Location Highlighting (Bounding Boxes) -->
						<div class="flex items-center justify-between py-2">
							<div class="flex items-center gap-2">
								<Label for="boundingBoxes" class="cursor-pointer">Location Highlighting</Label>
								<Tooltip.Root>
									<Tooltip.Trigger>
										{#snippet child({ props })}
											<button {...props} type="button" class="text-muted-foreground hover:text-foreground transition-colors">
												<HelpCircle class="h-4 w-4" />
											</button>
										{/snippet}
									</Tooltip.Trigger>
									<Tooltip.Content>
										<div class="max-w-xs">
											<p class="text-xs">Shows where each value was found in the document. Required for visual review and corrections.</p>
										</div>
									</Tooltip.Content>
								</Tooltip.Root>
							</div>
							<Switch id="boundingBoxes" bind:checked={featureFlags.boundingBoxes} />
						</div>

						<!-- Coordinate Format (shown when Location Highlighting enabled) -->
						{#if featureFlags.boundingBoxes}
							<div class="space-y-2 ml-6">
								<Label for="coordinateFormat">Coordinate Format</Label>
								<select
									id="coordinateFormat"
									bind:value={selectedPreset}
									class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
								>
									{#each Object.values(PROMPT_PRESETS) as preset}
										<option value={preset.id}>{preset.name} - {preset.coordinateDescription}</option>
									{/each}
								</select>
								<p class="text-xs text-muted-foreground">Match this to your vision model's expected format.</p>
							</div>
						{/if}

						<!-- Confidence Scores -->
						<div class="flex items-center justify-between py-2">
							<div class="flex items-center gap-2">
								<Label for="confidenceScores" class="cursor-pointer">Confidence Scores</Label>
								<Tooltip.Root>
									<Tooltip.Trigger>
										{#snippet child({ props })}
											<button {...props} type="button" class="text-muted-foreground hover:text-foreground transition-colors">
												<HelpCircle class="h-4 w-4" />
											</button>
										{/snippet}
									</Tooltip.Trigger>
									<Tooltip.Content>
										<div class="max-w-xs">
											<p class="text-xs">The AI rates how certain it is about each value (0-100%). Low confidence values are highlighted for review.</p>
										</div>
									</Tooltip.Content>
								</Tooltip.Root>
							</div>
							<Switch id="confidenceScores" bind:checked={featureFlags.confidenceScores} />
						</div>

						<!-- Multiple Items per Document -->
						<div class="flex items-center justify-between py-2">
							<div class="flex items-center gap-2">
								<Label for="multiRowExtraction" class="cursor-pointer">Multiple Items per Document</Label>
								<Tooltip.Root>
									<Tooltip.Trigger>
										{#snippet child({ props })}
											<button {...props} type="button" class="text-muted-foreground hover:text-foreground transition-colors">
												<HelpCircle class="h-4 w-4" />
											</button>
										{/snippet}
									</Tooltip.Trigger>
									<Tooltip.Content>
										<div class="max-w-xs">
											<p class="text-xs">Enable for documents with tables or lists (invoices, statements). Disable for single-item documents (labels, IDs).</p>
										</div>
									</Tooltip.Content>
								</Tooltip.Root>
							</div>
							<Switch id="multiRowExtraction" bind:checked={featureFlags.multiRowExtraction} />
						</div>
					</div>
				</Tabs.Content>
			</Tabs.Root>
		</Tabs.Content>
	</Tabs.Root>
</div>

<!-- Column Editor Drawer - Mobile (bottom with snap points) -->
<Drawer.Root
	bind:open={drawerOpen}
	shouldScaleBackground={false}
	snapPoints={[0.5, 1]}
	activeSnapPoint={0.5}
	fadeFromIndex={2}
	closeThreshold={0.3}
>
	<Drawer.Portal>
		<Drawer.Overlay class="fixed inset-0 bg-black/40" />
		<Drawer.Content class="md:hidden max-h-[96vh] fixed bottom-0 left-0 right-0 flex flex-col bg-background">
		{#if columns.length > 0 && columns[currentColumnIndex]}
			<Drawer.Header class="pb-2" onclick={(e) => e.stopPropagation()}>
				<Drawer.Handle />
				<div class="flex items-center justify-between gap-2 mt-2" data-vaul-no-drag onclick={(e) => e.stopPropagation()}>
					<Button
						variant="ghost"
						size="icon"
						onclick={goToPreviousColumn}
						disabled={currentColumnIndex === 0}
						class="h-8 w-8 shrink-0"
					>
						<ChevronLeft class="h-4 w-4" />
					</Button>
					<div class="text-center flex-1 min-w-0">
						<Drawer.Title class="text-base truncate">{t('project.settings.columns.edit_field')}</Drawer.Title>
						<Drawer.Description class="text-xs">
							{m['project.settings.columns.field_indicator']({
								current: currentColumnIndex + 1,
								total: columns.length
							})}
						</Drawer.Description>
					</div>
					<Button
						variant="ghost"
						size="icon"
						onclick={goToNextColumn}
						disabled={currentColumnIndex === columns.length - 1}
						class="h-8 w-8 shrink-0"
					>
						<ChevronRight class="h-4 w-4" />
					</Button>
				</div>
			</Drawer.Header>

			<div class="space-y-4 overflow-y-auto px-4 pb-4" data-vaul-no-drag onclick={(e) => e.stopPropagation()}>
				<div class="space-y-2">
					<Label>{t('project.settings.columns.name_label')}</Label>
					<Input
						bind:value={columns[currentColumnIndex].name}
						placeholder={t('project.settings.columns.name_placeholder')}
						class="h-12"
					/>
				</div>

				<div class="space-y-2">
					<Label>{t('project.settings.columns.type_label')}</Label>
					<select
						bind:value={columns[currentColumnIndex].type}
						class="flex h-12 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						<option value="text">{t('project.settings.columns.types.text')}</option>
						<option value="number">{t('project.settings.columns.types.number')}</option>
						<option value="date">{t('project.settings.columns.types.date')}</option>
						<option value="currency">{t('project.settings.columns.types.currency')}</option>
						<option value="boolean">{t('project.settings.columns.types.boolean')}</option>
					</select>
				</div>

				<div class="space-y-2">
					<Label>{t('project.settings.columns.description_label')}</Label>
					<Textarea
						bind:value={columns[currentColumnIndex].description}
						placeholder={t('project.settings.columns.description_placeholder')}
						rows={3}
					/>
					<p class="text-xs text-muted-foreground">
						{t('project.settings.columns.description_help')}
					</p>
				</div>

				<div class="space-y-2">
					<Label>{t('project.settings.columns.allowed_values_label')}</Label>
					<Input
						bind:value={columns[currentColumnIndex].allowedValues}
						placeholder={t('project.settings.columns.allowed_values_placeholder')}
						class="h-12"
					/>
				</div>

				<div class="space-y-2">
					<Label>{t('project.settings.columns.regex_label')}</Label>
					<Input
						bind:value={columns[currentColumnIndex].regex}
						placeholder={t('project.settings.columns.regex_placeholder')}
						class="h-12"
					/>
				</div>

				<Separator class="my-4" />

				<Button
					variant="destructive"
					class="w-full h-12"
					onclick={() => {
						removeColumn(columns[currentColumnIndex].id);
						if (currentColumnIndex >= columns.length) {
							currentColumnIndex = Math.max(0, columns.length - 1);
						}
						if (columns.length === 0) {
							drawerOpen = false;
						}
					}}
				>
					<Trash2 class="mr-2 h-5 w-5" />
					{t('project.settings.columns.delete_field')}
				</Button>
			</div>
		{/if}
		</Drawer.Content>
	</Drawer.Portal>
</Drawer.Root>

<!-- Column Editor Sheet - Desktop (right) -->
<Sheet.Root bind:open={sheetOpen}>
	<Sheet.Content
		side="right"
		showOverlay={false}
		class="hidden md:flex md:flex-col w-[400px] max-w-md"
	>
		{#if columns.length > 0 && columns[currentColumnIndex]}
			<Sheet.Header class="pb-4" onclick={(e) => e.stopPropagation()}>
				<div class="flex items-center justify-between gap-2">
					<Button
						variant="ghost"
						size="icon"
						onclick={goToPreviousColumn}
						disabled={currentColumnIndex === 0}
						class="h-8 w-8 shrink-0"
					>
						<ChevronLeft class="h-4 w-4" />
					</Button>
					<div class="text-center flex-1 min-w-0">
						<Sheet.Title class="text-base truncate">{t('project.settings.columns.edit_field')}</Sheet.Title>
						<Sheet.Description class="text-xs">
							{m['project.settings.columns.field_indicator']({
								current: currentColumnIndex + 1,
								total: columns.length
							})}
						</Sheet.Description>
					</div>
					<Button
						variant="ghost"
						size="icon"
						onclick={goToNextColumn}
						disabled={currentColumnIndex === columns.length - 1}
						class="h-8 w-8 shrink-0"
					>
						<ChevronRight class="h-4 w-4" />
					</Button>
				</div>
			</Sheet.Header>

			<div class="space-y-4 overflow-y-auto pr-1 flex-1" onclick={(e) => e.stopPropagation()}>
				<div class="space-y-2">
					<Label>{t('project.settings.columns.name_label')}</Label>
					<Input
						bind:value={columns[currentColumnIndex].name}
						placeholder={t('project.settings.columns.name_placeholder')}
						class="h-12"
					/>
				</div>

				<div class="space-y-2">
					<Label>{t('project.settings.columns.type_label')}</Label>
					<select
						bind:value={columns[currentColumnIndex].type}
						class="flex h-12 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						<option value="text">{t('project.settings.columns.types.text')}</option>
						<option value="number">{t('project.settings.columns.types.number')}</option>
						<option value="date">{t('project.settings.columns.types.date')}</option>
						<option value="currency">{t('project.settings.columns.types.currency')}</option>
						<option value="boolean">{t('project.settings.columns.types.boolean')}</option>
					</select>
				</div>

				<div class="space-y-2">
					<Label>{t('project.settings.columns.description_label')}</Label>
					<Textarea
						bind:value={columns[currentColumnIndex].description}
						placeholder={t('project.settings.columns.description_placeholder')}
						rows={3}
					/>
					<p class="text-xs text-muted-foreground">
						{t('project.settings.columns.description_help')}
					</p>
				</div>

				<div class="space-y-2">
					<Label>{t('project.settings.columns.allowed_values_label')}</Label>
					<Input
						bind:value={columns[currentColumnIndex].allowedValues}
						placeholder={t('project.settings.columns.allowed_values_placeholder')}
						class="h-12"
					/>
				</div>

				<div class="space-y-2">
					<Label>{t('project.settings.columns.regex_label')}</Label>
					<Input
						bind:value={columns[currentColumnIndex].regex}
						placeholder={t('project.settings.columns.regex_placeholder')}
						class="h-12"
					/>
				</div>

				<Separator class="my-4" />

				<Button
					variant="destructive"
					class="w-full h-12"
					onclick={() => {
						removeColumn(columns[currentColumnIndex].id);
						if (currentColumnIndex >= columns.length) {
							currentColumnIndex = Math.max(0, columns.length - 1);
						}
						if (columns.length === 0) {
							sheetOpen = false;
						}
					}}
				>
					<Trash2 class="mr-2 h-5 w-5" />
					{t('project.settings.columns.delete_field')}
				</Button>
			</div>
		{/if}
	</Sheet.Content>
</Sheet.Root>

<AlertDialog.Root bind:open={deleteDialogOpen}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Delete Project</AlertDialog.Title>
			<AlertDialog.Description>
				Are you sure you want to delete "{projectName}"? This action cannot be undone and will
				permanently delete all project data.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action
				onclick={() => {
					deleteDialogOpen = false;
					deleteProject();
				}}
				class="w-full bg-destructive hover:bg-destructive/90"
			>
				Delete Project
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

<!-- Schema Chat -->
{#if !loading}
	<SchemaChat
		bind:open={schemaChatOpen}
		projectId={data.projectId}
		{endpoint}
		{apiKey}
		{modelName}
		{columns}
		projectDescription={description}
		multiRowExtraction={featureFlags.multiRowExtraction}
		{featureFlags}
		chatHistory={schemaChatHistory}
		{documentAnalyses}
		pdfSettings={{ dpi: pdfDpi, format: pdfFormat, quality: pdfQuality, maxWidth: pdfMaxWidth, maxHeight: pdfMaxHeight }}
		onColumnsChange={(newColumns) => {
			columns = newColumns.map(col => ({ ...col, expanded: col.expanded ?? false }));
		}}
		onDescriptionChange={(newDescription) => {
			description = newDescription;
		}}
		onMultiRowChange={(enabled) => {
			featureFlags.multiRowExtraction = enabled;
		}}
		onFeatureFlagsChange={(flags) => {
			featureFlags = { ...featureFlags, ...flags };
		}}
		onChatHistoryChange={saveChatHistory}
		onDocumentAnalysesChange={saveDocumentAnalyses}
		onClose={() => schemaChatOpen = false}
	/>
{/if}
