<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Send } from 'lucide-svelte';
	import QuestionCard from './QuestionCard.svelte';
	import type { Question, QuestionAnswer } from '$lib/server/schema-chat/types';

	interface Props {
		questions: Question[];
		onSubmit: (answers: QuestionAnswer[], formattedText: string) => void;
		disabled?: boolean;
	}

	let { questions, onSubmit, disabled = false }: Props = $props();

	// Initialize answers for all questions
	let answers = $state<QuestionAnswer[]>(
		questions.map((q) => ({
			questionId: q.id,
			selectedOptionIds: [],
			otherText: undefined
		}))
	);

	// Check if all questions have at least one answer
	const allAnswered = $derived(
		answers.every((a) => {
			if (a.selectedOptionIds.length === 0) return false;
			// If "other" is selected, must have text
			if (a.selectedOptionIds.includes('other') && !a.otherText?.trim()) return false;
			return true;
		})
	);

	function handleSelectOption(questionIndex: number, optionId: string) {
		const question = questions[questionIndex];
		const answer = answers[questionIndex];

		if (question.multiSelect) {
			// Toggle selection for multi-select
			if (answer.selectedOptionIds.includes(optionId)) {
				answers[questionIndex] = {
					...answer,
					selectedOptionIds: answer.selectedOptionIds.filter((id) => id !== optionId)
				};
			} else {
				answers[questionIndex] = {
					...answer,
					selectedOptionIds: [...answer.selectedOptionIds, optionId]
				};
			}
		} else {
			// Single select - replace selection
			answers[questionIndex] = {
				...answer,
				selectedOptionIds: [optionId]
			};
		}
	}

	function handleOtherTextChange(questionIndex: number, text: string) {
		answers[questionIndex] = {
			...answers[questionIndex],
			otherText: text
		};
	}

	function formatAnswersAsText(): string {
		return questions
			.map((q, i) => {
				const answer = answers[i];
				const selectedLabels = answer.selectedOptionIds
					.map((id) => {
						if (id === 'other') {
							return answer.otherText || 'Other';
						}
						const option = q.options.find((o) => o.id === id);
						return option?.label || id;
					})
					.filter(Boolean);

				return `${q.header}: ${selectedLabels.join(', ')}`;
			})
			.join('\n');
	}

	function handleSubmit() {
		const formattedText = formatAnswersAsText();
		onSubmit(answers, formattedText);
	}
</script>

<div class="space-y-6 p-4 bg-muted/50 rounded-lg border">
	{#each questions as question, index}
		<QuestionCard
			{question}
			answer={answers[index]}
			onSelectOption={(optionId) => handleSelectOption(index, optionId)}
			onOtherTextChange={(text) => handleOtherTextChange(index, text)}
			{disabled}
		/>

		{#if index < questions.length - 1}
			<hr class="border-border" />
		{/if}
	{/each}

	<div class="flex justify-end pt-2">
		<Button onclick={handleSubmit} disabled={disabled || !allAnswered} size="sm">
			<Send class="w-4 h-4 mr-2" />
			Submit Answers
		</Button>
	</div>
</div>
