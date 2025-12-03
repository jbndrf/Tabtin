<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import * as Table from '$lib/components/ui/table';
	import { t } from '$lib/i18n';
	import { ArrowLeft, Download } from 'lucide-svelte';
	import type { PageData } from './$types';
	import { pb, currentUser } from '$lib/stores/auth';
	import { projectData, currentProject, isProjectLoading } from '$lib/stores/project-data';
	import type { ImageBatchesResponse, ImagesResponse, ExtractionRowsResponse } from '$lib/pocketbase-types';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { toast } from '$lib/utils/toast';
	import type { ExtractionResult } from '$lib/types/extraction';

	interface BatchWithData extends ImageBatchesResponse {
		images?: ImagesResponse[];
		processed_data: { extractions: ExtractionResult[] } | null;
	}

	interface ColumnDefinition {
		id: string;
		name: string;
		type: string;
		description?: string;
	}

	interface ApprovedRow {
		id: string;
		batchId: string;
		batchIdShort: string;
		rowIndex: number;
		created: string;
		data: ExtractionResult[];
	}

	let { data }: { data: PageData } = $props();

	let approvedRows = $state<ApprovedRow[]>([]);
	let columns = $state<ColumnDefinition[]>([]);
	let loadingProgress = $state({ current: 0, total: 0 });

	onMount(async () => {
		try {
			// Load project data from store (will use cache if available)
			await projectData.loadProject(data.projectId, $currentUser?.id || '');

			if ($currentProject?.settings?.columns) {
				columns = $currentProject.settings.columns;
			}

			await loadApprovedRows();
		} catch (error) {
			console.error('Failed to load project:', error);
			toast.error(t('images.results.toast.failed_to_load'));
			goto('/dashboard');
		}
	});

	async function loadApprovedRows() {
		try {
			// NEW: Load all approved extraction_rows for the project
			const rows = await pb.collection('extraction_rows').getFullList<ExtractionRowsResponse>({
				filter: `project = '${data.projectId}' && status = 'approved'`,
				sort: '-id',
				expand: 'batch'
			});

			loadingProgress.total = rows.length;
			approvedRows = rows.map((row, index) => {
				loadingProgress.current = index + 1;
				return {
					id: row.id,
					batchId: Array.isArray(row.batch) ? row.batch[0] : row.batch,
					batchIdShort: (Array.isArray(row.batch) ? row.batch[0] : row.batch).slice(0, 8),
					rowIndex: row.row_index,
					created: row.created || '',
					data: (row.row_data as any) || []
				};
			});

			console.log(`Loaded ${approvedRows.length} approved extraction rows`);
		} catch (error) {
			console.error('Failed to load approved rows:', error);
			toast.error(t('images.results.toast.failed_to_load'));
		}
	}

	function getValueForColumn(row: ApprovedRow, columnId: string): string {
		const extraction = row.data.find(e => e.column_id === columnId);
		return extraction?.value ?? '';
	}

	function exportToCSV() {
		if (approvedRows.length === 0 || columns.length === 0) return;

		const headers = ['Batch ID', 'Row #', 'Created', ...columns.map(col => col.name)];
		const csvRows = approvedRows.map(row => {
			const csvRow = [
				row.batchIdShort,
				String(row.rowIndex + 1), // 1-based for humans
				new Date(row.created).toLocaleDateString(),
				...columns.map(col => getValueForColumn(row, col.id))
			];
			return csvRow.map(val => `"${val}"`).join(',');
		});

		const csvContent = [headers.map(h => `"${h}"`).join(','), ...csvRows].join('\n');

		const blob = new Blob([csvContent], { type: 'text/csv' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${$currentProject?.name || 'project'}-results-${new Date().toISOString().split('T')[0]}.csv`;
		a.click();
		URL.revokeObjectURL(url);
		toast.success(t('images.results.toast.exported'));
	}
</script>

{#if $isProjectLoading}
	<div class="flex flex-col items-center justify-center gap-2 p-8">
		<p>{t('images.results.loading')}</p>
		{#if loadingProgress.total > 0}
			<p class="text-sm text-muted-foreground">
				Loading batch {loadingProgress.current} of {loadingProgress.total}
			</p>
		{/if}
	</div>
{:else if $currentProject}
	<div class="flex flex-col gap-4 p-4">
		<div class="flex items-center gap-2">
			<Button variant="ghost" size="icon" href="/projects/{data.projectId}">
				<ArrowLeft class="h-4 w-4" />
			</Button>
			<div class="flex-1">
				<h2 class="text-2xl font-bold tracking-tight">{t('images.results.title')}</h2>
			</div>
			{#if approvedRows.length > 0}
				<Button onclick={exportToCSV} variant="outline" size="sm">
					<Download class="h-4 w-4 sm:mr-2" />
					<span class="hidden sm:inline">{t('images.results.export_all')}</span>
				</Button>
			{/if}
		</div>

		{#if approvedRows.length === 0}
			<div class="flex items-center justify-center p-12 text-muted-foreground">
				<p>{t('images.results.empty_state')}</p>
			</div>
		{:else}
			<div class="overflow-x-auto">
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>Batch</Table.Head>
							<Table.Head>Row #</Table.Head>
							<Table.Head>Created</Table.Head>
							{#each columns as column}
								<Table.Head>{column.name}</Table.Head>
							{/each}
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each approvedRows as row}
							<Table.Row>
								<Table.Cell class="font-mono text-xs">{row.batchIdShort}</Table.Cell>
								<Table.Cell class="text-xs">{row.rowIndex + 1}</Table.Cell>
								<Table.Cell class="text-xs">{new Date(row.created).toLocaleDateString()}</Table.Cell>
								{#each columns as column}
									<Table.Cell>{getValueForColumn(row, column.id) || 'N/A'}</Table.Cell>
								{/each}
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</div>
		{/if}
	</div>
{/if}
