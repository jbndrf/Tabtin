<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';
	import { Separator } from '$lib/components/ui/separator';
	import { t } from '$lib/i18n';
	import { z } from 'zod/v4';
	import { pb, currentUser } from '$lib/stores/auth';
	import type { ProjectsResponse } from '$lib/pocketbase-types';
	import { onMount } from 'svelte';
	import { projectsStore } from '$lib/stores/projects.svelte';
	import { DEFAULT_FEATURE_FLAGS } from '$lib/types/extraction';

	// Default settings for new projects
	const DEFAULT_PROJECT_SETTINGS = {
		// PDF settings
		pdfDpi: 300,
		pdfFormat: 'png',
		pdfQuality: 100,
		pdfMaxWidth: 1024,
		pdfMaxHeight: 1024,
		includeOcrText: true,
		// Image settings
		imageMaxDimension: 1024,
		// Model parameters
		enableDeterministicMode: true,
		temperature: 0.0,
		topK: 1,
		topP: 1.0,
		repetitionPenalty: 1.0,
		frequencyPenalty: 0.0,
		presencePenalty: 0.0,
		// Feature flags (uses defaults from extraction.ts)
		featureFlags: { ...DEFAULT_FEATURE_FLAGS },
		// Rate limiting
		requestsPerMinute: 15,
		enableParallelRequests: false,
		maxConcurrency: 3,
		requestTimeout: 10,
		// Prompt settings
		selectedPreset: 'qwen3vl',
		coordinateFormat: 'normalized_1000'
	};

	let {
		open = $bindable(false),
		onSuccess
	}: {
		open?: boolean;
		onSuccess?: () => void;
	} = $props();

	let name = $state('');
	let error = $state('');
	let isLoading = $state(false);
	let projects = $state<ProjectsResponse[]>([]);
	let selectedTemplateId = $state<string>('');
	let copySettings = $state(true);

	const projectSchema = z.object({
		name: z.string().min(2, t('project.validation.name_min_length'))
	});

	onMount(() => {
		loadProjects();
	});

	async function loadProjects() {
		if (!$currentUser?.id) return;

		try {
			// Use getList with high perPage instead of getFullList to avoid skipTotal parameter issue
			// Note: Sort by -id instead of -created since created field may not exist in older schemas
			const result = await pb.collection('projects').getList<ProjectsResponse>(1, 500, {
				sort: '-id',
				filter: `user = '${$currentUser.id}'`,
				requestKey: 'create_dialog_projects'
			});
			projects = result.items;
		} catch (error) {
			console.error('Failed to load projects:', error);
		}
	}

	async function handleSubmit(e: Event) {
		e.preventDefault();
		error = '';

		const result = projectSchema.safeParse({ name });
		if (!result.success) {
			error = result.error.flatten().fieldErrors.name?.[0] || '';
			return;
		}

		isLoading = true;

		try {
			let settingsToUse = { ...DEFAULT_PROJECT_SETTINGS };

			if (selectedTemplateId && copySettings) {
				const templateProject = projects.find(p => p.id === selectedTemplateId);
				if (templateProject?.settings) {
					settingsToUse = templateProject.settings as typeof settingsToUse;
				}
			}

			const newProject = await pb.collection('projects').create<ProjectsResponse>({
				name,
				user: $currentUser?.id,
				settings: settingsToUse
			});

			// Add the new project to the store
			projectsStore.addProject(newProject);

			name = '';
			selectedTemplateId = '';
			copySettings = true;
			onSuccess?.();
		} catch (err: any) {
			error = 'Failed to create project';
			console.error('Create project error:', err);
		} finally {
			isLoading = false;
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-[425px]">
		<Dialog.Header>
			<Dialog.Title>{t('project.create.title')}</Dialog.Title>
			<Dialog.Description>
				{t('project.create.description')}
			</Dialog.Description>
		</Dialog.Header>

		<form onsubmit={handleSubmit} class="space-y-4">
			<div class="grid gap-4 py-4">
				<div class="space-y-2">
					<Label for="name">{t('project.create.name_label')}</Label>
					<Input
						id="name"
						type="text"
						placeholder={t('project.create.name_placeholder')}
						bind:value={name}
						autocomplete="off"
						disabled={isLoading}
						class="h-12"
					/>
					{#if error}
						<p class="text-sm font-medium text-destructive">{error}</p>
					{/if}
				</div>

				{#if projects.length > 0}
					<Separator />

					<div class="space-y-3">
						<div class="space-y-2">
							<Label for="template">{t('project.create.template_label')}</Label>
							<select
								id="template"
								bind:value={selectedTemplateId}
								disabled={isLoading}
								class="flex h-12 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							>
								<option value="">{t('project.create.template_none')}</option>
								{#each projects as project}
									<option value={project.id}>{project.name}</option>
								{/each}
							</select>
							<p class="text-xs text-muted-foreground">
								{t('project.create.template_help')}
							</p>
						</div>

						{#if selectedTemplateId}
							<div class="flex items-center justify-between rounded-lg border p-3">
								<div class="space-y-0.5">
									<Label for="copy-settings" class="text-sm font-medium">
										{t('project.create.copy_settings_label')}
									</Label>
									<p class="text-xs text-muted-foreground">
										{t('project.create.copy_settings_help')}
									</p>
								</div>
								<Switch id="copy-settings" bind:checked={copySettings} disabled={isLoading} />
							</div>
						{/if}
					</div>
				{/if}
			</div>

			<Dialog.Footer>
				<Button type="button" variant="outline" onclick={() => (open = false)} disabled={isLoading}>
					{t('project.create.cancel_button')}
				</Button>
				<Button type="submit" disabled={isLoading}>
					{isLoading ? 'Creating...' : t('project.create.submit_button')}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
