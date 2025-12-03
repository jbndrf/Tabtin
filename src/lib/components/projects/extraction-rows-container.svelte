<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import ExtractionRowCard from './extraction-row-card.svelte';
	import { Plus } from 'lucide-svelte';
	import type { ExtractionRow, ColumnDefinition } from '$lib/types/extraction';

	interface Props {
		rows: ExtractionRow[];
		columns: ColumnDefinition[];
		isSingleRowMode?: boolean;
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
		isSingleRowMode = false,
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
	{#if isSingleRowMode && visibleRows.length === 1}
		<!-- Single row mode: show without row header -->
		<ExtractionRowCard
			rowIndex={visibleRows[0].rowIndex}
			rowData={visibleRows[0].data}
			{columns}
			totalRows={1}
			isSingleRowMode={true}
			onEdit={(columnId, value) => handleRowEdit(visibleRows[0].rowIndex, columnId, value)}
			onRedo={(columnId) => handleRedoMark(visibleRows[0].rowIndex, columnId)}
			onRedoCancel={(columnId) => handleRedoCancel(visibleRows[0].rowIndex, columnId)}
			redoColumns={getRedoColumnsForRow(visibleRows[0].rowIndex)}
		/>
	{:else}
		<!-- Multi-row mode: show all rows with controls -->
		<div class="max-h-[400px] overflow-y-auto space-y-3 pr-2">
			{#each visibleRows as row (row.id || row.rowIndex)}
				<ExtractionRowCard
					rowIndex={row.rowIndex}
					rowData={row.data}
					{columns}
					totalRows={rows.length}
					isSingleRowMode={false}
					onEdit={(columnId, value) => handleRowEdit(row.rowIndex, columnId, value)}
					onDelete={() => handleRowDelete(row.rowIndex)}
					onRedo={(columnId) => handleRedoMark(row.rowIndex, columnId)}
					onRedoCancel={(columnId) => handleRedoCancel(row.rowIndex, columnId)}
					redoColumns={getRedoColumnsForRow(row.rowIndex)}
				/>
			{/each}
		</div>

		{#if !isSingleRowMode && onRowAdd}
			<Button variant="outline" class="w-full" onclick={onRowAdd}>
				<Plus class="h-4 w-4 mr-2" />
				Add Missing Row
			</Button>
		{/if}
	{/if}

	{#if visibleRows.length === 0}
		<div class="text-center py-8 text-muted-foreground">
			<p>No rows to display</p>
			{#if onRowAdd && !isSingleRowMode}
				<Button variant="outline" class="mt-4" onclick={onRowAdd}>
					<Plus class="h-4 w-4 mr-2" />
					Add Row
				</Button>
			{/if}
		</div>
	{/if}
</div>
