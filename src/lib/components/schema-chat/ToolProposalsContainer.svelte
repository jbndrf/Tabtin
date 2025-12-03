<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { CheckCheck, XCircle, ArrowRight } from 'lucide-svelte';
	import ToolProposalCard from './ToolProposalCard.svelte';
	import type { PendingToolCall, Column } from '$lib/server/schema-chat/types';

	interface Props {
		tools: PendingToolCall[];
		columns: Column[];
		onApprove: (toolId: string) => void;
		onDecline: (toolId: string) => void;
		onApproveAll: () => void;
		onDeclineAll: () => void;
		onContinue: () => void;
		disabled?: boolean;
	}

	let {
		tools,
		columns,
		onApprove,
		onDecline,
		onApproveAll,
		onDeclineAll,
		onContinue,
		disabled = false
	}: Props = $props();

	const hasPending = $derived(tools.some((t) => t.status === 'pending'));
	const allDecided = $derived(tools.every((t) => t.status !== 'pending'));
	const pendingCount = $derived(tools.filter((t) => t.status === 'pending').length);
</script>

<div class="space-y-4 p-4 bg-muted/30 rounded-lg border">
	{#if hasPending && tools.length > 1}
		<div class="flex items-center justify-between gap-2 pb-2 border-b">
			<span class="text-sm text-muted-foreground">
				{pendingCount} pending {pendingCount === 1 ? 'action' : 'actions'}
			</span>
			<div class="flex gap-2">
				<Button size="sm" variant="outline" onclick={onApproveAll} {disabled}>
					<CheckCheck class="w-4 h-4 mr-1" />
					Approve All
				</Button>
				<Button size="sm" variant="ghost" onclick={onDeclineAll} {disabled}>
					<XCircle class="w-4 h-4 mr-1" />
					Decline All
				</Button>
			</div>
		</div>
	{/if}

	<div class="space-y-3">
		{#each tools as tool (tool.id)}
			<ToolProposalCard
				toolCall={tool}
				{columns}
				onApprove={() => onApprove(tool.id)}
				onDecline={() => onDecline(tool.id)}
				{disabled}
			/>
		{/each}
	</div>

	{#if allDecided}
		<div class="flex justify-end pt-2 border-t">
			<Button onclick={onContinue} {disabled} size="sm">
				<ArrowRight class="w-4 h-4 mr-2" />
				Continue
			</Button>
		</div>
	{/if}
</div>
