<script lang="ts">
	import { cn } from '$lib/utils';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Badge } from '$lib/components/ui/badge';
	import { Check } from 'lucide-svelte';
	import type { Question, QuestionAnswer } from '$lib/server/schema-chat/types';

	interface Props {
		question: Question;
		answer: QuestionAnswer;
		onSelectOption: (optionId: string) => void;
		onOtherTextChange: (text: string) => void;
		disabled?: boolean;
	}

	let { question, answer, onSelectOption, onOtherTextChange, disabled = false }: Props = $props();

	const isSelected = (optionId: string) => answer.selectedOptionIds.includes(optionId);
	const isOtherSelected = $derived(answer.selectedOptionIds.includes('other'));
</script>

<div class="space-y-3">
	<div class="space-y-1">
		<div class="flex items-center gap-2">
			<Badge variant="outline" class="text-xs">{question.header}</Badge>
			{#if question.multiSelect}
				<span class="text-xs text-muted-foreground">(select multiple)</span>
			{/if}
		</div>
		<p class="text-sm font-medium">{question.questionText}</p>
	</div>

	<div class="flex flex-wrap gap-2">
		{#each question.options as option}
			<Button
				variant={isSelected(option.id) ? 'default' : 'outline'}
				size="sm"
				onclick={() => onSelectOption(option.id)}
				{disabled}
				class={cn('transition-all', isSelected(option.id) && 'ring-2 ring-primary ring-offset-1')}
			>
				{#if isSelected(option.id)}
					<Check class="w-3 h-3 mr-1" />
				{/if}
				{option.label}
			</Button>
		{/each}

		{#if question.allowOther}
			<Button
				variant={isOtherSelected ? 'default' : 'outline'}
				size="sm"
				onclick={() => onSelectOption('other')}
				{disabled}
				class={cn('transition-all', isOtherSelected && 'ring-2 ring-primary ring-offset-1')}
			>
				{#if isOtherSelected}
					<Check class="w-3 h-3 mr-1" />
				{/if}
				Other
			</Button>
		{/if}
	</div>

	{#if question.allowOther && isOtherSelected}
		<Input
			placeholder="Enter your answer..."
			value={answer.otherText || ''}
			oninput={(e) => onOtherTextChange(e.currentTarget.value)}
			{disabled}
			class="mt-2"
		/>
	{/if}

	{#if question.options.some((o) => o.description && isSelected(o.id))}
		<div class="text-xs text-muted-foreground mt-1">
			{#each question.options.filter((o) => o.description && isSelected(o.id)) as selectedOpt}
				<p>{selectedOpt.description}</p>
			{/each}
		</div>
	{/if}
</div>
