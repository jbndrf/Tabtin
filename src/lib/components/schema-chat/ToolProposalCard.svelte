<script lang="ts">
	import { cn } from '$lib/utils';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import {
		Check,
		X,
		Plus,
		Pencil,
		Trash2,
		FileText,
		Type,
		Hash,
		Calendar,
		DollarSign,
		ToggleLeft,
		ChevronDown,
		ChevronUp
	} from 'lucide-svelte';
	import type { PendingToolCall, Column } from '$lib/server/schema-chat/types';

	interface Props {
		toolCall: PendingToolCall;
		columns: Column[];
		onApprove: () => void;
		onDecline: () => void;
		disabled?: boolean;
	}

	let { toolCall, columns, onApprove, onDecline, disabled = false }: Props = $props();

	// Expand/collapse state for long content
	let isExpanded = $state(false);

	// Helper to get column name from ID
	function getColumnName(columnId: string): string {
		const column = columns.find((c) => c.id === columnId);
		return column?.name || columnId;
	}

	// Parse tool arguments
	const args = $derived(() => {
		try {
			return JSON.parse(toolCall.function.arguments);
		} catch {
			return {};
		}
	});

	// Tool-specific icons
	const toolIcons = {
		add_column: Plus,
		edit_column: Pencil,
		remove_column: Trash2,
		update_project_description: FileText,
		set_multi_row_mode: ToggleLeft
	};

	// Column type icons
	const typeIcons = {
		text: Type,
		number: Hash,
		date: Calendar,
		currency: DollarSign,
		boolean: ToggleLeft
	};

	const typeColors = {
		text: 'bg-blue-500/10 text-blue-700 dark:text-blue-300',
		number: 'bg-purple-500/10 text-purple-700 dark:text-purple-300',
		date: 'bg-orange-500/10 text-orange-700 dark:text-orange-300',
		currency: 'bg-green-500/10 text-green-700 dark:text-green-300',
		boolean: 'bg-pink-500/10 text-pink-700 dark:text-pink-300'
	};

	const statusColors = {
		pending: 'border-primary/50 bg-primary/5',
		approved: 'border-green-500/50 bg-green-500/5',
		declined: 'border-red-500/50 bg-red-500/5',
		executed: 'border-muted bg-muted/50'
	};

	const ToolIcon = $derived(toolIcons[toolCall.function.name as keyof typeof toolIcons] || Plus);
	const parsedArgs = $derived(args());

	// Get display info based on tool type
	function getToolDisplayInfo() {
		const toolName = toolCall.function.name;

		switch (toolName) {
			case 'add_column':
				return {
					title: `Add column: ${parsedArgs.name}`,
					description: parsedArgs.description,
					details: [
						{ label: 'Type', value: parsedArgs.type, badge: true },
						parsedArgs.allowedValues && { label: 'Allowed', value: parsedArgs.allowedValues },
						parsedArgs.regex && { label: 'Pattern', value: parsedArgs.regex }
					].filter(Boolean)
				};

			case 'edit_column':
				const updates = Object.entries(parsedArgs.updates || {})
					.map(([key, value]) => `${key}: ${value}`)
					.join(', ');
				return {
					title: `Edit column: ${getColumnName(parsedArgs.column_id)}`,
					description: `Update: ${updates}`,
					details: []
				};

			case 'remove_column':
				return {
					title: `Remove column: ${getColumnName(parsedArgs.column_id)}`,
					description: `Delete column from schema`,
					details: []
				};

			case 'update_project_description':
				return {
					title: 'Update project description',
					description: parsedArgs.description,
					details: []
				};

			case 'set_multi_row_mode':
				return {
					title: `${parsedArgs.enabled ? 'Enable' : 'Disable'} multi-row extraction`,
					description: parsedArgs.reason,
					details: []
				};

			default:
				return {
					title: toolName,
					description: JSON.stringify(parsedArgs),
					details: []
				};
		}
	}

	const displayInfo = $derived(getToolDisplayInfo());
	const TypeIcon = $derived(
		parsedArgs.type ? typeIcons[parsedArgs.type as keyof typeof typeIcons] : null
	);

	// Check if description is long enough to warrant expand/collapse
	// Approximate: 3 lines at ~60 chars per line = 180 chars
	const isLongDescription = $derived(
		displayInfo.description && displayInfo.description.length > 150
	);
</script>

<Card.Root class={cn('transition-all', statusColors[toolCall.status])}>
	<Card.Header class="pb-2">
		<div class="flex items-center justify-between gap-2">
			<div class="flex items-center gap-2">
				<div class="flex-shrink-0 w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
					<ToolIcon class="w-4 h-4 text-primary" />
				</div>
				<Card.Title class="text-sm font-medium">{displayInfo.title}</Card.Title>
			</div>

			{#if toolCall.status !== 'pending'}
				<Badge
					variant="outline"
					class={cn(
						toolCall.status === 'approved' && 'text-green-600 border-green-600',
						toolCall.status === 'declined' && 'text-red-600 border-red-600',
						toolCall.status === 'executed' && 'text-muted-foreground'
					)}
				>
					{toolCall.status}
				</Badge>
			{/if}
		</div>
	</Card.Header>

	<Card.Content class="pb-3 space-y-2">
		{#if displayInfo.description}
			<div class="relative">
				<p
					class={cn(
						'text-sm text-muted-foreground',
						!isExpanded && isLongDescription && 'line-clamp-3'
					)}
				>
					{displayInfo.description}
				</p>
				{#if isLongDescription}
					<button
						type="button"
						class="mt-1 flex items-center gap-1 text-xs text-primary hover:underline"
						onclick={() => (isExpanded = !isExpanded)}
					>
						{#if isExpanded}
							<ChevronUp class="w-3 h-3" />
							Show less
						{:else}
							<ChevronDown class="w-3 h-3" />
							Show more
						{/if}
					</button>
				{/if}
			</div>
		{/if}

		{#if displayInfo.details.length > 0}
			<div class="flex flex-wrap gap-2">
				{#each displayInfo.details as detail}
					{#if detail.badge && TypeIcon}
						<Badge variant="outline" class={typeColors[parsedArgs.type as keyof typeof typeColors]}>
							{@const Icon = TypeIcon}
							<Icon class="w-3 h-3 mr-1" />
							{detail.value}
						</Badge>
					{:else}
						<span class="text-xs text-muted-foreground">
							<span class="font-medium">{detail.label}:</span>
							{detail.value}
						</span>
					{/if}
				{/each}
			</div>
		{/if}

		{#if toolCall.result}
			<div
				class={cn(
					'text-xs p-2 rounded',
					toolCall.result.success
						? 'bg-green-500/10 text-green-700 dark:text-green-300'
						: 'bg-red-500/10 text-red-700 dark:text-red-300'
				)}
			>
				{toolCall.result.message}
			</div>
		{/if}
	</Card.Content>

	{#if toolCall.status === 'pending'}
		<Card.Footer class="pt-0 gap-2">
			<Button size="sm" variant="default" onclick={onApprove} {disabled} class="flex-1">
				<Check class="w-4 h-4 mr-1" />
				Approve
			</Button>
			<Button size="sm" variant="outline" onclick={onDecline} {disabled} class="flex-1">
				<X class="w-4 h-4 mr-1" />
				Decline
			</Button>
		</Card.Footer>
	{/if}
</Card.Root>
