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
	let availableModels = $state<Array<{ id: string; name?: string }>>([]);
	let fetchingModels = $state(false);
	let saving = $state(false);
	let deleteDialogOpen = $state(false);
	let loading = $state(true);
	let sheetOpen = $state(false);
	let drawerOpen = $state(false);
	let currentColumnIndex = $state(0);
	let activeTab = $state('basic');
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

	// Extraction feature flags
	let featureFlags = $state<ExtractionFeatureFlags>({ ...DEFAULT_FEATURE_FLAGS });

	// PDF Processing settings (Advanced)
	const PDF_DEFAULTS = {
		dpi: 600,
		format: 'png' as 'png' | 'jpeg',
		quality: 100,
		maxWidth: 7100,
		maxHeight: 7100
	};
	let pdfDpi = $state<number>(PDF_DEFAULTS.dpi);
	let pdfFormat = $state<'png' | 'jpeg'>(PDF_DEFAULTS.format);
	let pdfQuality = $state<number>(PDF_DEFAULTS.quality);
	let pdfMaxWidth = $state<number>(PDF_DEFAULTS.maxWidth);
	let pdfMaxHeight = $state<number>(PDF_DEFAULTS.maxHeight);

	// API Request settings (Advanced)
	const API_DEFAULTS = {
		requestTimeout: 10 // minutes
	};
	let requestTimeout = $state<number>(API_DEFAULTS.requestTimeout);

	function resetPdfDefaults() {
		pdfDpi = PDF_DEFAULTS.dpi;
		pdfFormat = PDF_DEFAULTS.format;
		pdfQuality = PDF_DEFAULTS.quality;
		pdfMaxWidth = PDF_DEFAULTS.maxWidth;
		pdfMaxHeight = PDF_DEFAULTS.maxHeight;
		toast.success('PDF settings reset to defaults');
	}

	// Schema chat history and document analyses
	let schemaChatHistory = $state<SchemaChatMessage[]>([]);
	let documentAnalyses = $state<Array<{ id: string; timestamp: number; summary: string; documentType?: string; identifiedFields?: string[]; imageCount: number }>>([]);


	// Load project data on mount
	onMount(async () => {
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
		// Close sheet when leaving columns tab
		if (activeTab !== 'columns') {
			sheetOpen = false;
			drawerOpen = false;
		}
	});

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

			// Load prompt templates
			promptTemplate = settings.promptTemplate || '';
			reviewPromptTemplate = settings.reviewPromptTemplate || '';
			selectedPreset = settings.selectedPreset || 'qwen3vl';
			coordinateFormat = settings.coordinateFormat || 'pixels';

			// Load rate limiting settings
			requestsPerMinute = settings.requestsPerMinute || 15;
			enableParallelRequests = settings.enableParallelRequests || false;

			// Load extraction feature flags
			featureFlags = withFeatureFlagDefaults(settings.featureFlags);

			// Load PDF processing settings
			pdfDpi = settings.pdfDpi ?? PDF_DEFAULTS.dpi;
			pdfFormat = settings.pdfFormat ?? PDF_DEFAULTS.format;
			pdfQuality = settings.pdfQuality ?? PDF_DEFAULTS.quality;
			pdfMaxWidth = settings.pdfMaxWidth ?? PDF_DEFAULTS.maxWidth;
			pdfMaxHeight = settings.pdfMaxHeight ?? PDF_DEFAULTS.maxHeight;

			// Load API request settings
			requestTimeout = settings.requestTimeout ?? API_DEFAULTS.requestTimeout;

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

			const settings = {
				description,
				endpointPreset,
				endpoint,
				apiKey,
				modelName,
				promptTemplate,
				reviewPromptTemplate,
				selectedPreset,
				coordinateFormat,
				requestsPerMinute,
				enableParallelRequests,
				featureFlags,
				// PDF processing settings
				pdfDpi,
				pdfFormat,
				pdfQuality,
				pdfMaxWidth,
				pdfMaxHeight,
				// API request settings
				requestTimeout,
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
		<Tabs.List class="grid w-full grid-cols-5">
			<Tabs.Trigger value="basic">{t('project.settings.tabs.basic')}</Tabs.Trigger>
			<Tabs.Trigger value="columns">{t('project.settings.tabs.columns')}</Tabs.Trigger>
			<Tabs.Trigger value="prompts">{t('project.settings.tabs.prompts')}</Tabs.Trigger>
			<Tabs.Trigger value="processing">Processing</Tabs.Trigger>
			<Tabs.Trigger value="advanced">Advanced</Tabs.Trigger>
		</Tabs.List>

		<!-- Basic Tab -->
		<Tabs.Content value="basic" class="mt-4 space-y-4">
			<div class="space-y-4">
				<h2 class="text-xl font-semibold">{t('project.settings.basic.title')}</h2>

				<div class="space-y-2">
					<Label for="name">{t('project.settings.basic.name_label')} *</Label>
					<Input
						id="name"
						bind:value={projectName}
						placeholder={t('project.settings.basic.name_placeholder')}
						required
						class="h-12"
					/>
				</div>

				<div class="space-y-2">
					<Label for="description">{t('project.settings.basic.description_label')}</Label>
					<Textarea
						id="description"
						bind:value={description}
						placeholder={t('project.settings.basic.description_placeholder')}
						rows={3}
					/>
				</div>

			</div>

			<Separator />

			<div class="space-y-4">
				<h2 class="text-xl font-semibold">{t('project.settings.vision.title')}</h2>

				<div class="space-y-2">
					<Label for="endpointPreset">{t('project.settings.vision.endpoint_preset_label')}</Label>
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
							// Clear models when switching presets
							availableModels = [];
							modelName = '';
						}}
						class="flex h-12 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						<option value="openrouter">{t('project.settings.vision.endpoint_preset_openrouter')}</option>
						<option value="google">Google Gemini API</option>
						<option value="custom">{t('project.settings.vision.endpoint_preset_custom')}</option>
					</select>
					<p class="text-xs text-muted-foreground">
						{t('project.settings.vision.endpoint_preset_help')}
					</p>
				</div>

				<div class="space-y-2">
					<Label for="endpoint">{t('project.settings.vision.endpoint_label')}</Label>
					<Input
						type="url"
						id="endpoint"
						bind:value={endpoint}
						placeholder="https://api.openai.com/v1/chat/completions"
						class="h-12"
						disabled={endpointPreset === 'openrouter' || endpointPreset === 'google'}
					/>
					{#if endpointPreset === 'openrouter'}
						<p class="text-xs text-muted-foreground">
							{t('project.settings.vision.endpoint_openrouter_info')}
						</p>
					{:else if endpointPreset === 'google'}
						<p class="text-xs text-muted-foreground">
							Using Google's OpenAI-compatible Gemini API. Get your API key from Google AI Studio.
						</p>
					{/if}
				</div>

				<div class="space-y-2">
					<Label for="apiKey">{t('project.settings.vision.api_key_label')}</Label>
					<Input
						type="password"
						id="apiKey"
						bind:value={apiKey}
						placeholder="sk-... or your API key"
						class="h-12"
					/>
					<p class="text-xs text-muted-foreground">
						{t('project.settings.vision.api_key_help')}
					</p>
				</div>

				<div class="space-y-2">
					<Label for="modelName">{t('project.settings.vision.model_name_label')}</Label>
					<div class="flex flex-col gap-2 sm:flex-row">
						<Button
							type="button"
							variant="outline"
							disabled={!endpoint || fetchingModels}
							onclick={fetchModels}
							class="w-full whitespace-nowrap sm:w-auto"
						>
							{fetchingModels ? 'Fetching...' : t('project.settings.vision.fetch_models_button')}
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
											class="w-full justify-between h-12"
										>
											<span class="truncate">
												{modelName
													? availableModels.find((m) => m.id === modelName)?.name || modelName
													: t('project.settings.vision.model_select_placeholder')}
											</span>
											<ChevronsUpDown class="ml-2 h-4 w-4 shrink-0 opacity-50" />
										</Button>
									{/snippet}
								</Popover.Trigger>
								<Popover.Content class="w-full p-0" align="start">
									<Command.Root>
										<Command.Input placeholder={t('project.settings.vision.model_search_placeholder')} />
										<Command.List>
											<Command.Empty>{t('project.settings.vision.model_not_found')}</Command.Empty>
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
								placeholder={t('project.settings.vision.model_name_placeholder')}
								class="h-12"
							/>
						{/if}
					</div>
					<p class="text-xs text-muted-foreground">
						{t('project.settings.vision.model_name_help')}
					</p>
				</div>
			</div>
		</Tabs.Content>

		<!-- Columns Tab -->
		<Tabs.Content value="columns" class="mt-4 space-y-4">
			<div class="space-y-4">
				<!-- Table Preview -->
				<div>
					<div class="mb-3 flex items-center justify-between">
						<h2 class="text-xl font-semibold">{t('project.settings.columns.preview_title')}</h2>
						<Button
							type="button"
							variant="outline"
							size="icon"
							onclick={addColumn}
							class="h-9 w-9"
						>
							<Plus class="h-5 w-5" />
						</Button>
					</div>

					{#if columns.length === 0}
						<div class="flex items-center justify-center rounded-lg border border-dashed p-8">
							<div class="text-center">
								<p class="text-sm text-muted-foreground">{t('project.settings.columns.preview_empty')}</p>
								<Button type="button" variant="outline" onclick={addColumn} class="mt-4">
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
												class={`cursor-pointer border-r px-4 py-3 text-left text-sm font-semibold transition-colors hover:bg-muted ${currentColumnIndex === i && (sheetOpen || drawerOpen) ? 'bg-primary/10' : ''}`}
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
											<td class="border-r border-t px-4 py-3 text-sm text-muted-foreground italic">
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

		<!-- Prompts Tab -->
		<Tabs.Content value="prompts" class="mt-4 space-y-4">
			<div class="space-y-4">
				<div>
					<h2 class="text-xl font-semibold">{t('project.settings.prompts.title')}</h2>
					<p class="mt-1 text-sm text-muted-foreground">
						{t('project.settings.prompts.description')}
					</p>
				</div>

				<div class="space-y-2">
					<Label for="preset">{t('project.settings.prompts.preset_label')}</Label>
					<select
						id="preset"
						bind:value={selectedPreset}
						class="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
					>
						<option value="qwen3vl">Qwen3 VL</option>
						<option value="gemini2">Gemini 2.0</option>
					</select>
					<p class="text-xs text-muted-foreground">
						{t('project.settings.prompts.preset_auto_apply')}
					</p>
				</div>

				<Separator />

				<div class="space-y-2">
					<Label for="coordinateFormat">{t('project.settings.prompts.coordinate_format_label')}</Label>
					<select
						id="coordinateFormat"
						bind:value={coordinateFormat}
						disabled
						class="flex h-9 w-full rounded-md border border-input bg-muted px-3 py-1 text-sm shadow-sm transition-colors cursor-not-allowed opacity-60"
					>
						<option value="normalized_1000">Normalized 0-1000 [x1, y1, x2, y2] - Qwen3</option>
						<option value="normalized_1000_yxyx">Normalized 0-1000 [y_min, x_min, y_max, x_max] - Gemini</option>
					</select>
					<p class="text-xs text-muted-foreground">
						{t('project.settings.prompts.coordinate_format_synced')}
					</p>
				</div>

				<div class="space-y-2">
					<Label for="promptTemplate">{t('project.settings.prompts.template_label')}</Label>
					<Textarea
						id="promptTemplate"
						bind:value={promptTemplate}
						placeholder="Enter your custom prompt template..."
						rows={16}
						class="font-mono text-xs"
					/>
					<p class="text-xs text-muted-foreground">
						{t('project.settings.prompts.template_help')}
					</p>
				</div>

				<Separator />

				<div class="space-y-2">
					<Label for="reviewPromptTemplate">Review Prompt Template (for redo)</Label>
					<Textarea
						id="reviewPromptTemplate"
						bind:value={reviewPromptTemplate}
						placeholder="Enter your custom review prompt template for redo operations..."
						rows={16}
						class="font-mono text-xs"
					/>
					<p class="text-xs text-muted-foreground">
						This prompt is used when re-extracting specific fields. It will receive context about previously extracted data and cropped images.
					</p>
				</div>

				<Separator />

				<div>
					<h3 class="mb-2 text-lg font-semibold">
						{t('project.settings.prompts.preview_title')}
					</h3>
					<div class="overflow-x-auto rounded-md bg-muted p-3 text-xs">
						<pre class="whitespace-pre-wrap">{generateFullPrompt()}</pre>
					</div>
					<p class="mt-2 text-xs text-muted-foreground">
						This is what the AI will see when processing images
					</p>
				</div>
			</div>
		</Tabs.Content>

		<!-- Processing Tab -->
		<Tabs.Content value="processing" class="mt-4 space-y-4">
			<div class="space-y-4">
				<div>
					<h2 class="text-xl font-semibold">Processing & Rate Limiting</h2>
					<p class="mt-1 text-sm text-muted-foreground">
						Configure how batches are processed and rate limited to avoid hitting API limits.
					</p>
				</div>

				<Separator />

				<div class="space-y-2">
					<div class="flex items-center gap-2">
						<Label for="requestsPerMinute">Requests Per Minute</Label>
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
									<p class="font-medium">Rate Limiting</p>
									<p class="text-xs">Maximum number of API requests allowed per minute. The system will automatically calculate delays to stay within this limit.</p>
									{#if requestsPerMinute > 0}
										<p class="text-xs font-medium mt-2">Current: {requestsPerMinute} requests/min = {(60 / requestsPerMinute).toFixed(2)}s between requests</p>
									{/if}
								</div>
							</Tooltip.Content>
						</Tooltip.Root>
					</div>
					<Input
						type="number"
						id="requestsPerMinute"
						bind:value={requestsPerMinute}
						min="1"
						max="1000"
						placeholder="15"
						class="h-12"
					/>
				</div>

				<div class="space-y-2">
					<div class="flex items-center gap-2">
						<div class="flex items-center space-x-2">
							<input
								type="checkbox"
								id="enableParallelRequests"
								bind:checked={enableParallelRequests}
								class="h-4 w-4 rounded border-input"
							/>
							<Label for="enableParallelRequests" class="cursor-pointer">Enable Parallel Requests</Label>
						</div>
						<Tooltip.Root>
							<Tooltip.Trigger>
								{#snippet child({ props })}
									<button {...props} type="button" class="text-muted-foreground hover:text-foreground transition-colors">
										<HelpCircle class="h-4 w-4" />
									</button>
								{/snippet}
							</Tooltip.Trigger>
							<Tooltip.Content>
								<div class="max-w-xs space-y-2">
									<div>
										<p class="font-medium text-xs">Linear Mode (Default)</p>
										<p class="text-xs">Batches are processed one at a time. Each request waits for the previous one to complete. The rate limiter tracks all requests from the last 60 seconds.</p>
									</div>
									<div>
										<p class="font-medium text-xs">Parallel Mode</p>
										<p class="text-xs">Multiple batches can be processed simultaneously. The rate limiter uses a sliding window to ensure the requests per minute limit is never exceeded.</p>
									</div>
									<p class="text-xs italic">The pipeline never breaks - it simply waits when limits are reached.</p>
								</div>
							</Tooltip.Content>
						</Tooltip.Root>
					</div>
				</div>

				<Separator />

				<div>
					<h3 class="text-lg font-medium mb-2">Extraction Features</h3>
					<p class="text-sm text-muted-foreground mb-4">Toggle which features are enabled for document extraction.</p>
				</div>

				<!-- Bounding Boxes Toggle -->
				<div class="space-y-2">
					<div class="flex items-center gap-2">
						<div class="flex items-center space-x-2">
							<input
								type="checkbox"
								id="boundingBoxes"
								bind:checked={featureFlags.boundingBoxes}
								class="h-4 w-4 rounded border-input"
							/>
							<Label for="boundingBoxes" class="cursor-pointer">Bounding Boxes</Label>
						</div>
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
									<p class="text-xs">Extract coordinate regions for each field. Required for visual highlighting in review mode and for redo cropping.</p>
								</div>
							</Tooltip.Content>
						</Tooltip.Root>
					</div>
				</div>

				<!-- Coordinate Format (only shown when bounding boxes enabled) -->
				{#if featureFlags.boundingBoxes}
					<div class="space-y-2 ml-6">
						<Label for="coordinateFormat">Coordinate Format</Label>
						<select
							id="coordinateFormat"
							bind:value={selectedPreset}
							class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
						>
							{#each Object.values(PROMPT_PRESETS) as preset}
								<option value={preset.id}>{preset.name} - {preset.coordinateDescription}</option>
							{/each}
						</select>
					</div>
				{/if}

				<!-- Confidence Scores Toggle -->
				<div class="space-y-2">
					<div class="flex items-center gap-2">
						<div class="flex items-center space-x-2">
							<input
								type="checkbox"
								id="confidenceScores"
								bind:checked={featureFlags.confidenceScores}
								class="h-4 w-4 rounded border-input"
							/>
							<Label for="confidenceScores" class="cursor-pointer">Confidence Scores</Label>
						</div>
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
									<p class="text-xs">Request extraction certainty values (0.0-1.0). Useful for quality review and filtering uncertain extractions.</p>
								</div>
							</Tooltip.Content>
						</Tooltip.Root>
					</div>
				</div>

				<!-- Multi-Row Extraction Toggle -->
				<div class="space-y-2">
					<div class="flex items-center gap-2">
						<div class="flex items-center space-x-2">
							<input
								type="checkbox"
								id="multiRowExtraction"
								bind:checked={featureFlags.multiRowExtraction}
								class="h-4 w-4 rounded border-input"
							/>
							<Label for="multiRowExtraction" class="cursor-pointer">Multi-Row Extraction</Label>
						</div>
						<Tooltip.Root>
							<Tooltip.Trigger>
								{#snippet child({ props })}
									<button {...props} type="button" class="text-muted-foreground hover:text-foreground transition-colors">
										<HelpCircle class="h-4 w-4" />
									</button>
								{/snippet}
							</Tooltip.Trigger>
							<Tooltip.Content>
								<div class="max-w-xs space-y-2">
									<div>
										<p class="font-medium text-xs">Single Row (Default)</p>
										<p class="text-xs">Each image contains one item to extract. Use this for product labels, business cards, single documents, etc.</p>
									</div>
									<div>
										<p class="font-medium text-xs">Multi-Row Mode</p>
										<p class="text-xs">Each image may contain multiple items/transactions/entries. Use this for bank statements, receipts with line items, invoices with multiple products, etc.</p>
									</div>
									<p class="text-xs italic">Note: Multilingual content on a single item is NOT treated as multiple rows.</p>
								</div>
							</Tooltip.Content>
						</Tooltip.Root>
					</div>
				</div>

				<!-- TOON Output Format Toggle -->
				<div class="space-y-2">
					<div class="flex items-center gap-2">
						<div class="flex items-center space-x-2">
							<input
								type="checkbox"
								id="toonOutput"
								bind:checked={featureFlags.toonOutput}
								class="h-4 w-4 rounded border-input"
							/>
							<Label for="toonOutput" class="cursor-pointer">TOON Output Format</Label>
						</div>
						<Tooltip.Root>
							<Tooltip.Trigger>
								{#snippet child({ props })}
									<button {...props} type="button" class="text-muted-foreground hover:text-foreground transition-colors">
										<HelpCircle class="h-4 w-4" />
									</button>
								{/snippet}
							</Tooltip.Trigger>
							<Tooltip.Content>
								<div class="max-w-xs space-y-2">
									<div>
										<p class="font-medium text-xs">JSON (Default)</p>
										<p class="text-xs">Standard JSON output format. Compatible with all models.</p>
									</div>
									<div>
										<p class="font-medium text-xs">TOON Format</p>
										<p class="text-xs">Token-Oriented Object Notation. Reduces output tokens by 40-50%, resulting in faster extraction times with same accuracy.</p>
									</div>
									<p class="text-xs italic">TOON is ideal for high-volume extraction where speed matters.</p>
								</div>
							</Tooltip.Content>
						</Tooltip.Root>
					</div>
				</div>
			</div>
		</Tabs.Content>

		<!-- Advanced Tab -->
		<Tabs.Content value="advanced" class="mt-4 space-y-4">
			<div class="space-y-4">
				<div class="flex items-start justify-between">
					<div>
						<h2 class="text-xl font-semibold">PDF Conversion Settings</h2>
						<p class="mt-1 text-sm text-muted-foreground">
							Configure how PDF documents are converted to images before processing.
						</p>
					</div>
					<Button variant="outline" size="sm" onclick={resetPdfDefaults}>
						Reset to Defaults
					</Button>
				</div>

				<Separator />

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
								<div class="max-w-xs space-y-1">
									<p class="font-medium">DPI (Dots Per Inch)</p>
									<p class="text-xs">Higher DPI produces sharper images but increases file size and processing time.</p>
									<p class="text-xs mt-2">Recommended values:</p>
									<ul class="text-xs list-disc pl-4">
										<li>150 DPI: Fast, good for clear documents</li>
										<li>300 DPI: Balanced quality and speed</li>
										<li>600 DPI: High quality (default)</li>
									</ul>
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
							class="h-12 w-32"
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
					<div class="flex items-center gap-2">
						<Label for="pdfFormat">Output Format</Label>
						<Tooltip.Root>
							<Tooltip.Trigger>
								{#snippet child({ props })}
									<button {...props} type="button" class="text-muted-foreground hover:text-foreground transition-colors">
										<HelpCircle class="h-4 w-4" />
									</button>
								{/snippet}
							</Tooltip.Trigger>
							<Tooltip.Content>
								<div class="max-w-xs space-y-2">
									<div>
										<p class="font-medium text-xs">PNG (Default)</p>
										<p class="text-xs">Lossless compression. Best for documents with text and sharp edges. Larger file size.</p>
									</div>
									<div>
										<p class="font-medium text-xs">JPEG</p>
										<p class="text-xs">Lossy compression. Smaller file size. May introduce artifacts around text.</p>
									</div>
								</div>
							</Tooltip.Content>
						</Tooltip.Root>
					</div>
					<select
						id="pdfFormat"
						bind:value={pdfFormat}
						class="flex h-12 w-full max-w-xs rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						<option value="png">PNG (Lossless)</option>
						<option value="jpeg">JPEG (Compressed)</option>
					</select>
				</div>

				<!-- Quality Setting (only visible for JPEG) -->
				{#if pdfFormat === 'jpeg'}
					<div class="space-y-2">
						<div class="flex items-center gap-2">
							<Label for="pdfQuality">JPEG Quality</Label>
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
						<p class="text-xs text-muted-foreground">
							Higher quality means larger file size. 85-95% is usually a good balance.
						</p>
					</div>
				{/if}

				<Separator />

				<!-- Max Dimensions -->
				<div class="space-y-4">
					<div>
						<h3 class="text-lg font-medium">Maximum Dimensions</h3>
						<p class="text-sm text-muted-foreground">
							Limit the maximum output size. Images exceeding these dimensions will be scaled down proportionally.
						</p>
					</div>

					<div class="grid grid-cols-2 gap-4 max-w-md">
						<div class="space-y-2">
							<Label for="pdfMaxWidth">Max Width (px)</Label>
							<Input
								type="number"
								id="pdfMaxWidth"
								bind:value={pdfMaxWidth}
								min="1000"
								max="15000"
								step="100"
								class="h-12"
							/>
						</div>
						<div class="space-y-2">
							<Label for="pdfMaxHeight">Max Height (px)</Label>
							<Input
								type="number"
								id="pdfMaxHeight"
								bind:value={pdfMaxHeight}
								min="1000"
								max="15000"
								step="100"
								class="h-12"
							/>
						</div>
					</div>
					<p class="text-xs text-muted-foreground">
						Default: 7100px (A4 at 600 DPI). Lower values reduce memory usage and API costs.
					</p>
				</div>

				<Separator />

				<!-- Info Card -->
				<Card.Root class="bg-muted/50">
					<Card.Content class="pt-6">
						<div class="space-y-2 text-sm">
							<p class="font-medium">Current estimated settings:</p>
							<ul class="text-muted-foreground space-y-1">
								<li>Scale factor: {(pdfDpi / 72).toFixed(2)}x</li>
								<li>Format: {pdfFormat.toUpperCase()}{pdfFormat === 'jpeg' ? ` at ${pdfQuality}% quality` : ''}</li>
								<li>Max output: {pdfMaxWidth} x {pdfMaxHeight} pixels</li>
							</ul>
							<p class="text-xs text-muted-foreground mt-3">
								These settings apply when PDFs are uploaded and converted to images for vision model processing.
							</p>
						</div>
					</Card.Content>
				</Card.Root>

				<Separator class="my-6" />

				<!-- API Request Settings -->
				<div class="space-y-4">
					<div class="flex items-start justify-between">
						<div>
							<h2 class="text-xl font-semibold">API Request Settings</h2>
							<p class="mt-1 text-sm text-muted-foreground">
								Configure timeouts for LLM API requests. Larger documents may need longer timeouts.
							</p>
						</div>
						<Button variant="outline" size="sm" onclick={() => requestTimeout = API_DEFAULTS.requestTimeout}>
							Reset to Default
						</Button>
					</div>

					<div class="space-y-2">
						<div class="flex items-center gap-2">
							<Label for="requestTimeout">Request Timeout (minutes)</Label>
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
										<p class="font-medium">API Request Timeout</p>
										<p class="text-xs">Maximum time to wait for LLM API responses. Increase this for large multi-page documents or slow models.</p>
										<p class="text-xs mt-2">Recommended values:</p>
										<ul class="text-xs list-disc pl-4">
											<li>5 min: Fast models, small documents</li>
											<li>10 min: Default, most use cases</li>
											<li>15-20 min: Large PDFs, slow models</li>
										</ul>
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
								step="1"
								class="h-12 w-32"
							/>
							<div class="flex gap-2">
								<Button variant="outline" size="sm" onclick={() => requestTimeout = 5}>5</Button>
								<Button variant="outline" size="sm" onclick={() => requestTimeout = 10}>10</Button>
								<Button variant="outline" size="sm" onclick={() => requestTimeout = 15}>15</Button>
								<Button variant="outline" size="sm" onclick={() => requestTimeout = 20}>20</Button>
							</div>
							<span class="text-sm text-muted-foreground">minutes</span>
						</div>
						<p class="text-xs text-muted-foreground">
							Current: {requestTimeout} minutes = {requestTimeout * 60} seconds
						</p>
					</div>
				</div>
			</div>
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
		onChatHistoryChange={saveChatHistory}
		onDocumentAnalysesChange={saveDocumentAnalyses}
		onClose={() => schemaChatOpen = false}
	/>
{/if}
