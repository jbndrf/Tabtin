<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import * as Table from '$lib/components/ui/table';
	import { t } from '$lib/i18n';
	import { ArrowLeft, Download, Loader2 } from 'lucide-svelte';
	import type { PageData } from './$types';
	import { pb, currentUser } from '$lib/stores/auth';
	import { projectData, currentProject, isProjectLoading } from '$lib/stores/project-data';
	import type { ExtractionRowsResponse } from '$lib/pocketbase-types';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { toast } from '$lib/utils/toast';
	import type { ExtractionResult } from '$lib/types/extraction';

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

	const PER_PAGE = 50; // Load 50 rows at a time

	let { data }: { data: PageData } = $props();

	let approvedRows = $state<ApprovedRow[]>([]);
	let columns = $state<ColumnDefinition[]>([]);
	let currentPage = $state(1);
	let hasMore = $state(true);
	let isLoadingMore = $state(false);
	let isExporting = $state(false);
	let totalCount = $state<number | null>(null);

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

	async function loadApprovedRows(page = 1) {
		try {
			isLoadingMore = true;

			// Use paginated getList instead of getFullList for better performance
			// skipTotal: true makes queries faster when we don't need the exact count
			const result = await pb.collection('extraction_rows').getList<ExtractionRowsResponse>(
				page,
				PER_PAGE,
				{
					filter: `project = '${data.projectId}' && status = 'approved'`,
					sort: '-created',
					skipTotal: page > 1 // Skip COUNT query for subsequent pages
				}
			);

			const newRows = result.items.map((row) => ({
				id: row.id,
				batchId: Array.isArray(row.batch) ? row.batch[0] : row.batch,
				batchIdShort: (Array.isArray(row.batch) ? row.batch[0] : row.batch).slice(0, 8),
				rowIndex: row.row_index,
				created: row.created || '',
				data: (row.row_data as any) || []
			}));

			if (page === 1) {
				approvedRows = newRows;
				totalCount = result.totalItems;
			} else {
				approvedRows = [...approvedRows, ...newRows];
			}

			// Check if there are more rows to load
			hasMore = result.items.length === PER_PAGE;
			currentPage = page;

			console.log(`Loaded page ${page}: ${result.items.length} rows (total displayed: ${approvedRows.length})`);
		} catch (error) {
			console.error('Failed to load approved rows:', error);
			toast.error(t('images.results.toast.failed_to_load'));
		} finally {
			isLoadingMore = false;
		}
	}

	async function loadMore() {
		if (!hasMore || isLoadingMore) return;
		await loadApprovedRows(currentPage + 1);
	}

	function getValueForColumn(row: ApprovedRow, columnId: string): string {
		const extraction = row.data.find(e => e.column_id === columnId);
		return extraction?.value ?? '';
	}

	// Export to CSV - fetches all data server-side for large datasets
	async function exportToCSV() {
		if (columns.length === 0) return;

		try {
			isExporting = true;

			// For small datasets (already loaded), use client-side export
			if (!hasMore && approvedRows.length > 0) {
				exportRowsToCSV(approvedRows);
				return;
			}

			// For larger datasets, fetch all rows in batches
			const allRows: ApprovedRow[] = [];
			let page = 1;
			const batchSize = 500; // Larger batch size for export

			while (true) {
				const result = await pb.collection('extraction_rows').getList<ExtractionRowsResponse>(
					page,
					batchSize,
					{
						filter: `project = '${data.projectId}' && status = 'approved'`,
						sort: '-created',
						skipTotal: true
					}
				);

				const rows = result.items.map((row) => ({
					id: row.id,
					batchId: Array.isArray(row.batch) ? row.batch[0] : row.batch,
					batchIdShort: (Array.isArray(row.batch) ? row.batch[0] : row.batch).slice(0, 8),
					rowIndex: row.row_index,
					created: row.created || '',
					data: (row.row_data as any) || []
				}));

				allRows.push(...rows);

				if (result.items.length < batchSize) break;
				page++;
			}

			exportRowsToCSV(allRows);
		} catch (error) {
			console.error('Failed to export:', error);
			toast.error('Failed to export data');
		} finally {
			isExporting = false;
		}
	}

	function exportRowsToCSV(rows: ApprovedRow[]) {
		const headers = ['Batch ID', 'Row #', 'Created', ...columns.map(col => col.name)];
		const csvRows = rows.map(row => {
			const csvRow = [
				row.batchIdShort,
				String(row.rowIndex + 1), // 1-based for humans
				new Date(row.created).toLocaleDateString(),
				...columns.map(col => getValueForColumn(row, col.id))
			];
			return csvRow.map(val => `"${String(val).replace(/"/g, '""')}"`).join(',');
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
		<Loader2 class="h-8 w-8 animate-spin text-muted-foreground" />
		<p>{t('images.results.loading')}</p>
	</div>
{:else if $currentProject}
	<div class="flex flex-col gap-4 p-4">
		<div class="flex items-center gap-2">
			<Button variant="ghost" size="icon" href="/projects/{data.projectId}">
				<ArrowLeft class="h-4 w-4" />
			</Button>
			<div class="flex-1">
				<h2 class="text-2xl font-bold tracking-tight">{t('images.results.title')}</h2>
				{#if totalCount !== null}
					<p class="text-sm text-muted-foreground">
						{totalCount} approved row{totalCount === 1 ? '' : 's'}
					</p>
				{/if}
			</div>
			{#if approvedRows.length > 0 || hasMore}
				<Button onclick={exportToCSV} variant="outline" size="sm" disabled={isExporting}>
					{#if isExporting}
						<Loader2 class="h-4 w-4 animate-spin sm:mr-2" />
					{:else}
						<Download class="h-4 w-4 sm:mr-2" />
					{/if}
					<span class="hidden sm:inline">
						{isExporting ? 'Exporting...' : t('images.results.export_all')}
					</span>
				</Button>
			{/if}
		</div>

		{#if approvedRows.length === 0 && !isLoadingMore}
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
						{#each approvedRows as row (row.id)}
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

			<!-- Load More Button -->
			{#if hasMore}
				<div class="flex justify-center py-4">
					<Button
						variant="outline"
						onclick={loadMore}
						disabled={isLoadingMore}
					>
						{#if isLoadingMore}
							<Loader2 class="mr-2 h-4 w-4 animate-spin" />
							Loading...
						{:else}
							Load More
						{/if}
					</Button>
				</div>
			{/if}
		{/if}
	</div>
{/if}
