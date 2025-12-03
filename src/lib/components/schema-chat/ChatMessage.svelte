<script lang="ts">
	import { cn } from '$lib/utils';
	import { Bot, User, Wrench, Check, X } from 'lucide-svelte';
	import type { ToolResult } from '$lib/server/schema-chat/types';

	interface Props {
		role: 'user' | 'assistant' | 'tool';
		content: string;
		toolResults?: ToolResult[];
	}

	let { role, content, toolResults = [] }: Props = $props();
</script>

<div
	class={cn(
		'flex gap-3 p-3 rounded-lg',
		role === 'user' ? 'bg-primary/10 ml-8' : 'bg-muted mr-8'
	)}
>
	{#if role === 'assistant'}
		<div class="flex-shrink-0 w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
			<Bot class="w-4 h-4 text-primary" />
		</div>
	{:else if role === 'user'}
		<div class="flex-shrink-0 w-8 h-8 rounded-full bg-primary flex items-center justify-center ml-auto order-2">
			<User class="w-4 h-4 text-primary-foreground" />
		</div>
	{/if}

	<div class={cn('flex-1 min-w-0', role === 'user' && 'text-right')}>
		{#if content}
			<div class="text-sm whitespace-pre-wrap break-words">{content}</div>
		{/if}

		{#if toolResults && toolResults.length > 0}
			<div class="mt-2 space-y-2">
				{#each toolResults as result}
					<div
						class={cn(
							'flex items-start gap-2 p-2 rounded text-xs',
							result.success ? 'bg-green-500/10 text-green-700 dark:text-green-300' : 'bg-red-500/10 text-red-700 dark:text-red-300'
						)}
					>
						<div class="flex-shrink-0 mt-0.5">
							{#if result.success}
								<Check class="w-3 h-3" />
							{:else}
								<X class="w-3 h-3" />
							{/if}
						</div>
						<div class="flex-1 min-w-0">
							<div class="flex items-center gap-1 mb-1">
								<Wrench class="w-3 h-3" />
								<span class="font-medium">{result.toolName}</span>
							</div>
							<div class="break-words">{result.message || result.error}</div>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>
