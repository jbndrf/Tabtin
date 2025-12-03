<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Trash2, RotateCcw, Edit, Check, X } from 'lucide-svelte';
	import type { ExtractionResult, ColumnDefinition } from '$lib/types/extraction';

	interface Props {
		rowIndex: number;
		rowData: ExtractionResult[];
		columns: ColumnDefinition[];
		totalRows: number;
		isSingleRowMode?: boolean;
		onEdit?: (columnId: string, value: string | null) => void;
		onDelete?: () => void;
		onRedo?: (columnId: string) => void;
		onRedoCancel?: (columnId: string) => void;
		redoColumns?: Set<string>;
		editingFields?: Set<string>;
	}

	let {
		rowIndex,
		rowData,
		columns,
		totalRows,
		isSingleRowMode = false,
		onEdit,
		onDelete,
		onRedo,
		onRedoCancel,
		redoColumns = new Set(),
		editingFields = new Set()
	}: Props = $props();

	let localEditValues = $state<Record<string, string | null>>({});

	function getValueForColumn(columnId: string): string | null {
		const extraction = rowData.find((e) => e.column_id === columnId);
		return extraction?.value || null;
	}

	function getExtractionForColumn(columnId: string): ExtractionResult | null {
		return rowData.find((e) => e.column_id === columnId) || null;
	}

	function startEdit(columnId: string) {
		const currentValue = getValueForColumn(columnId);
		localEditValues[columnId] = currentValue;
	}

	function saveEdit(columnId: string) {
		if (onEdit) {
			onEdit(columnId, localEditValues[columnId] || null);
		}
		delete localEditValues[columnId];
	}

	function cancelEdit(columnId: string) {
		delete localEditValues[columnId];
	}

	function isEditing(columnId: string): boolean {
		return columnId in localEditValues;
	}
</script>

<div class="border rounded-lg p-4 space-y-3 bg-card">
	{#if !isSingleRowMode}
		<div class="flex items-center justify-between mb-2">
			<div class="text-sm font-medium">
				Row {rowIndex + 1} of {totalRows}
			</div>
			<div class="flex gap-2">
				{#if onDelete}
					<Button variant="ghost" size="sm" onclick={onDelete}>
						<Trash2 class="h-4 w-4 text-destructive" />
					</Button>
				{/if}
			</div>
		</div>
	{/if}

	<div class="space-y-2">
		{#each columns as column}
			{@const value = getValueForColumn(column.id)}
			{@const extraction = getExtractionForColumn(column.id)}
			{@const isRedoMarked = redoColumns.has(column.id)}
			{@const editing = isEditing(column.id)}

			<div class="flex items-start gap-2">
				<div class="flex-1 space-y-1">
					<Label class="text-xs text-muted-foreground">{column.name}</Label>

					{#if editing}
						<div class="flex gap-2">
							<Input
								bind:value={localEditValues[column.id]}
								class="h-8 text-sm"
								placeholder={column.description || `Enter ${column.name}`}
							/>
							<Button size="sm" variant="ghost" onclick={() => saveEdit(column.id)}>
								<Check class="h-4 w-4 text-green-600" />
							</Button>
							<Button size="sm" variant="ghost" onclick={() => cancelEdit(column.id)}>
								<X class="h-4 w-4 text-red-600" />
							</Button>
						</div>
					{:else}
						<div
							class="text-sm px-2 py-1 rounded border bg-background cursor-pointer hover:bg-accent transition-colors"
							class:border-orange-500={isRedoMarked}
							class:bg-orange-50={isRedoMarked}
							onclick={() => startEdit(column.id)}
						>
							{value || '—'}
						</div>
					{/if}

					{#if extraction}
						<div class="text-xs text-muted-foreground flex items-center gap-2">
							<span>Confidence: {(extraction.confidence * 100).toFixed(0)}%</span>
							{#if extraction.redone}
								<span class="text-orange-600">(Re-extracted)</span>
							{/if}
						</div>
					{/if}
				</div>

				<div class="flex gap-1 pt-6">
					{#if !editing}
						<Button
							size="sm"
							variant="ghost"
							onclick={() => startEdit(column.id)}
							title="Edit value"
						>
							<Edit class="h-3 w-3" />
						</Button>
					{/if}

					{#if isRedoMarked}
						<Button
							size="sm"
							variant="ghost"
							onclick={() => onRedoCancel?.(column.id)}
							title="Cancel redo"
						>
							<X class="h-3 w-3 text-orange-600" />
						</Button>
					{:else}
						<Button
							size="sm"
							variant="ghost"
							onclick={() => onRedo?.(column.id)}
							title="Mark for re-extraction"
						>
							<RotateCcw class="h-3 w-3" />
						</Button>
					{/if}
				</div>
			</div>
		{/each}
	</div>
</div>
