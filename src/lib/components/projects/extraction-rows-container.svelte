<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import ExtractionRowCard from './extraction-row-card.svelte';
	import { Plus } from 'lucide-svelte';
	import type { ExtractionRow, ColumnDefinition } from '$lib/types/extraction';

	interface Props {
		rows: ExtractionRow[];
		columns: ColumnDefinition[];
		onRowEdit?: (rowIndex: number, columnId: string, value: string | null) => void;
		onRowDelete?: (rowIndex: number) => void;
		onRowAdd?: () => void;
		onRedoMark?: (rowIndex: number, columnId: string) => void;
		onRedoCancel?: (rowIndex: number, columnId: string) => void;
		redoRequests?: Map<number, Set<string>>; // Map of rowIndex -> Set of columnIds
	}

	let {
		rows,
		columns,
		onRowEdit,
		onRowDelete,
		onRowAdd,
		onRedoMark,
		onRedoCancel,
		redoRequests = new Map()
	}: Props = $props();

	let deletedRowIndices = $state<Set<number>>(new Set());

	function handleRowDelete(rowIndex: number) {
		deletedRowIndices.add(rowIndex);
		deletedRowIndices = new Set(deletedRowIndices);
		onRowDelete?.(rowIndex);
	}

	function handleRowEdit(rowIndex: number, columnId: string, value: string | null) {
		onRowEdit?.(rowIndex, columnId, value);
	}

	function handleRedoMark(rowIndex: number, columnId: string) {
		onRedoMark?.(rowIndex, columnId);
	}

	function handleRedoCancel(rowIndex: number, columnId: string) {
		onRedoCancel?.(rowIndex, columnId);
	}

	function getRedoColumnsForRow(rowIndex: number): Set<string> {
		return redoRequests.get(rowIndex) || new Set();
	}

	let visibleRows = $derived(
		rows.filter((row) => !deletedRowIndices.has(row.rowIndex))
	);
</script>

<div class="space-y-3">
	<div class="max-h-[400px] overflow-y-auto space-y-3 pr-2">
		{#each visibleRows as row (row.id || row.rowIndex)}
			<ExtractionRowCard
				rowIndex={row.rowIndex}
				rowData={row.data}
				{columns}
				totalRows={rows.length}
				onEdit={(columnId, value) => handleRowEdit(row.rowIndex, columnId, value)}
				onDelete={() => handleRowDelete(row.rowIndex)}
				onRedo={(columnId) => handleRedoMark(row.rowIndex, columnId)}
				onRedoCancel={(columnId) => handleRedoCancel(row.rowIndex, columnId)}
				redoColumns={getRedoColumnsForRow(row.rowIndex)}
			/>
		{/each}
	</div>

	{#if onRowAdd}
		<Button variant="outline" class="w-full" onclick={onRowAdd}>
			<Plus class="h-4 w-4 mr-2" />
			Add Missing Row
		</Button>
	{/if}

	{#if visibleRows.length === 0}
		<div class="text-center py-8 text-muted-foreground">
			<p>No rows to display</p>
			{#if onRowAdd}
				<Button variant="outline" class="mt-4" onclick={onRowAdd}>
					<Plus class="h-4 w-4 mr-2" />
					Add Row
				</Button>
			{/if}
		</div>
	{/if}
</div>
