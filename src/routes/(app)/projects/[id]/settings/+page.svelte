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
	import { ChevronDown, Plus, Trash2, ChevronLeft, ChevronRight, Save, Check, ChevronsUpDown, HelpCircle } from 'lucide-svelte';
	import { toast } from '$lib/utils/toast';
	import { pb, currentUser } from '$lib/stores/auth';
	import { projectData, currentProject, isProjectLoading } from '$lib/stores/project-data';
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';
	import { setPageActions, clearPageActions } from '$lib/stores/page-actions';
	import { onDestroy, onMount } from 'svelte';
	import { PROMPT_PRESETS, getPresetById, DEFAULT_PROMPT_TEMPLATE, type CoordinateFormat } from '$lib/prompt-presets';

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

	// Extraction mode setting
	let extractionMode = $state<'single_row' | 'multi_row'>('single_row');

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
			promptTemplate = settings.promptTemplate || DEFAULT_PROMPT_TEMPLATE;
			reviewPromptTemplate = settings.reviewPromptTemplate || DEFAULT_PROMPT_TEMPLATE;
			selectedPreset = settings.selectedPreset || 'qwen3vl';
			coordinateFormat = settings.coordinateFormat || 'pixels';

			// Load rate limiting settings
			requestsPerMinute = settings.requestsPerMinute || 15;
			enableParallelRequests = settings.enableParallelRequests || false;

			// Load extraction mode from project root (not settings)
			extractionMode = $currentProject.extraction_mode || 'single_row';

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
			promptTemplate = preset.template;
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
				promptTemplate = preset.template;
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
				extraction_mode: extractionMode,
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

	function generateFullPrompt(): string {
		let template = promptTemplate || DEFAULT_PROMPT_TEMPLATE;

		if (columns.length === 0) {
			return template.replace('{{FIELDS}}', '(No fields defined yet. Add columns to see the full prompt.)').replace('{{FIELD_EXAMPLES}}', '');
		}

		// Generate fields section
		let fieldsSection = '';
		columns.forEach((col, index) => {
			fieldsSection += `Field ${index + 1}:\n`;
			fieldsSection += `  ID: "${col.id}"\n`;
			fieldsSection += `  Name: "${col.name}"\n`;
			fieldsSection += `  Type: ${col.type}\n`;
			if (col.description) {
				fieldsSection += `  Description: ${col.description}\n`;
			}
			if (col.allowedValues) {
				fieldsSection += `  Allowed values: ${col.allowedValues}\n`;
			}
			if (col.regex) {
				fieldsSection += `  Validation pattern: ${col.regex}\n`;
			}
			fieldsSection += '\n';
		});

		// Generate field examples section
		let fieldExamples = '';
		columns.forEach((col, index) => {
			const isLast = index === columns.length - 1;
			fieldExamples += '    {\n';
			fieldExamples += `      "column_id": "${col.id}",\n`;
			fieldExamples += `      "column_name": "${col.name}",\n`;
			fieldExamples += '      "value": "extracted value here",\n';
			fieldExamples += '      "image_index": 0,\n';
			fieldExamples += '      "bbox_2d": [x1, y1, x2, y2],\n';
			fieldExamples += '      "confidence": 0.95\n';
			fieldExamples += `    }${isLast ? '' : ','}\n`;
		});

		// Replace placeholders
		return template
			.replace('{{FIELDS}}', fieldsSection.trim())
			.replace('{{FIELD_EXAMPLES}}', fieldExamples);
	}
</script>

<div class="space-y-6 p-4">
	<Tabs.Root bind:value={activeTab} class="w-full">
		<Tabs.List class="grid w-full grid-cols-4">
			<Tabs.Trigger value="basic">{t('project.settings.tabs.basic')}</Tabs.Trigger>
			<Tabs.Trigger value="columns">{t('project.settings.tabs.columns')}</Tabs.Trigger>
			<Tabs.Trigger value="prompts">{t('project.settings.tabs.prompts')}</Tabs.Trigger>
			<Tabs.Trigger value="processing">Processing</Tabs.Trigger>
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

				<div class="space-y-2">
					<div class="flex items-center justify-between">
						<Label for="extractionMode">Extraction Mode</Label>
						<Tooltip.Provider>
							<Tooltip.Root>
								<Tooltip.Trigger asChild>
									{#snippet child({ props })}
										<button type="button" {...props} class="text-muted-foreground hover:text-foreground">
											<HelpCircle class="h-4 w-4" />
										</button>
									{/snippet}
								</Tooltip.Trigger>
								<Tooltip.Content side="left" class="max-w-xs">
									<p class="text-sm">
										<strong>Single Row:</strong> Extract one record per document (invoices, receipts).<br/>
										<strong>Multi-Row:</strong> Extract multiple records from one document (bank statements with multiple transactions).
									</p>
								</Tooltip.Content>
							</Tooltip.Root>
						</Tooltip.Provider>
					</div>
					<select
						id="extractionMode"
						bind:value={extractionMode}
						class="flex h-12 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						<option value="single_row">Single Row (Default)</option>
						<option value="multi_row">Multi-Row (Bank Statements)</option>
					</select>
					<p class="text-xs text-muted-foreground">
						{#if extractionMode === 'single_row'}
							Extract one record per document. Best for invoices, receipts, and forms.
						{:else}
							Extract multiple records from each document. Best for bank statements and transaction lists.
						{/if}
					</p>
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
						<optgroup label="Single-Row Extraction">
							<option value="qwen3vl">Qwen3 VL</option>
							<option value="gemini2">Gemini 2.0</option>
						</optgroup>
						<optgroup label="Multi-Row Extraction (Bank Statements)">
							<option value="qwen3vl_multirow">Qwen3 VL (Multi-Row)</option>
							<option value="gemini2_multirow">Gemini 2.0 (Multi-Row)</option>
						</optgroup>
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
