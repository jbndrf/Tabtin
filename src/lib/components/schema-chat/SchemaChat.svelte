<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import * as Sheet from '$lib/components/ui/sheet';
	import * as Drawer from '$lib/components/ui/drawer';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { Spinner } from '$lib/components/ui/spinner';
	import { Send, Trash2, AlertTriangle, Paperclip } from 'lucide-svelte';
	import { toast } from '$lib/utils/toast';
	import ChatMessageComponent from './ChatMessage.svelte';
	import QuestionsContainer from './QuestionsContainer.svelte';
	import ToolProposalsContainer from './ToolProposalsContainer.svelte';
	import ImageRequestCard from './ImageRequestCard.svelte';
	import { onMount, tick } from 'svelte';
	import type {
		ChatState,
		Column,
		PendingToolCall,
		Question,
		QuestionAnswer,
		ImageRequest,
		ToolResult,
		ChatModeResponse,
		ExecuteModeResponse
	} from '$lib/server/schema-chat/types';

	export interface Message {
		role: 'user' | 'assistant';
		content: string;
		toolResults?: ToolResult[];
	}

	interface Props {
		open: boolean;
		projectId: string;
		endpoint: string;
		apiKey: string;
		modelName: string;
		columns: Column[];
		projectDescription?: string;
		hasExistingData?: boolean;
		chatHistory?: Message[];
		onColumnsChange: (columns: Column[]) => void;
		onDescriptionChange?: (description: string) => void;
		onChatHistoryChange?: (messages: Message[]) => void;
		onClose: () => void;
	}

	let {
		open = $bindable(),
		projectId,
		endpoint,
		apiKey,
		modelName,
		columns,
		projectDescription = '',
		hasExistingData = false,
		chatHistory = [],
		onColumnsChange,
		onDescriptionChange,
		onChatHistoryChange,
		onClose
	}: Props = $props();

	// State machine
	let chatState = $state<ChatState>('idle');
	let messages = $state<Message[]>([]);
	let inputValue = $state('');
	let messagesContainer: HTMLDivElement | null = $state(null);

	// Pending interactions
	let pendingTools = $state<PendingToolCall[]>([]);
	let currentQuestions = $state<Question[]>([]);
	let currentImageRequest = $state<ImageRequest | null>(null);

	// UI state
	let showDataWarning = $state(false);
	let dataWarningAcknowledged = $state(false);
	let showClearConfirm = $state(false);
	let isMobile = $state(false);
	let fileInput: HTMLInputElement | null = $state(null);
	let isProcessingFiles = $state(false);

	// Check if LLM is configured
	let isConfigured = $derived.by(() => {
		return Boolean(endpoint && modelName);
	});

	// Derived state helpers
	const isLoading = $derived(chatState === 'loading' || chatState === 'executing' || chatState === 'auto_continuing');
	const hasQuestions = $derived(currentQuestions.length > 0);
	const hasPendingTools = $derived(pendingTools.length > 0);
	const hasImageRequest = $derived(currentImageRequest !== null);
	const canSendMessage = $derived(chatState === 'idle' && isConfigured && inputValue.trim());

	onMount(() => {
		const checkMobile = () => {
			isMobile = window.innerWidth < 768;
		};
		checkMobile();
		window.addEventListener('resize', checkMobile);
		return () => window.removeEventListener('resize', checkMobile);
	});

	// Auto-scroll to bottom when messages change
	$effect(() => {
		if (messages.length > 0 && messagesContainer) {
			tick().then(() => {
				if (messagesContainer) {
					messagesContainer.scrollTop = messagesContainer.scrollHeight;
				}
			});
		}
	});

	// Load chat history when chat opens
	$effect(() => {
		if (open && messages.length === 0 && isConfigured) {
			if (chatHistory && chatHistory.length > 0) {
				// Load existing chat history
				messages = [...chatHistory];
			}
			// No else - we show a UI placeholder instead of a fake message
			chatState = 'idle';
		}
	});

	// Save chat history when messages change
	$effect(() => {
		if (messages.length > 0 && onChatHistoryChange) {
			onChatHistoryChange(messages);
		}
	});

	// Check for existing data warning
	$effect(() => {
		if (open && hasExistingData && !dataWarningAcknowledged) {
			showDataWarning = true;
		}
	});

	async function sendMessage(content?: string) {
		const messageContent = content || inputValue.trim();
		if (!messageContent || !isConfigured) return;

		inputValue = '';
		chatState = 'loading';

		// Add user message
		messages = [...messages, { role: 'user', content: messageContent }];

		try {
			const response = await fetch('/api/schema-chat', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					mode: 'chat',
					messages: messages.map((m) => ({ role: m.role, content: m.content })),
					settings: { endpoint, apiKey, modelName },
					currentColumns: columns,
					projectDescription,
					projectId
				})
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || 'Failed to get response');
			}

			const data = (await response.json()) as ChatModeResponse;
			handleChatResponse(data);
		} catch (err) {
			console.error('Chat error:', err);
			toast.error(err instanceof Error ? err.message : 'Failed to send message');
			messages = [
				...messages,
				{
					role: 'assistant',
					content: 'Sorry, I encountered an error. Please try again.'
				}
			];
			chatState = 'idle';
		}
	}

	function handleChatResponse(data: ChatModeResponse) {
		// Add assistant message
		const assistantMessage: Message = {
			role: 'assistant',
			content: data.message.content || '',
			toolResults: data.autoExecuteResults
		};
		messages = [...messages, assistantMessage];

		// Handle different response types (priority order: questions > image request > pending tools)
		if (data.questions && data.questions.length > 0) {
			currentQuestions = data.questions;
			chatState = 'awaiting_answers';
		} else if (data.imageRequest) {
			currentImageRequest = data.imageRequest;
			chatState = 'awaiting_image';
		} else if (data.pendingTools && data.pendingTools.length > 0) {
			pendingTools = data.pendingTools;
			chatState = 'awaiting_approval';
		} else {
			chatState = 'idle';
		}
	}

	async function handleQuestionsSubmit(answers: QuestionAnswer[], formattedText: string) {
		currentQuestions = [];
		chatState = 'auto_continuing';

		// Send the formatted answers as a user message
		await sendMessage(formattedText);
	}

	async function handleImageSubmit(files: File[]) {
		if (files.length === 0) return;

		currentImageRequest = null;
		chatState = 'auto_continuing';

		// Convert files to base64 for sending to LLM
		const imageContents: Array<{ type: 'image_url'; image_url: { url: string } }> = [];

		for (const file of files) {
			const base64 = await fileToBase64(file);
			imageContents.push({
				type: 'image_url',
				image_url: { url: base64 }
			});
		}

		// Send message with images
		const userMessage = `Here ${files.length === 1 ? 'is an example' : `are ${files.length} example`} document${files.length > 1 ? 's' : ''} for you to analyze.`;

		// Add user message to UI
		messages = [...messages, { role: 'user', content: userMessage }];

		try {
			// Send to API with images as multimodal content
			const response = await fetch('/api/schema-chat', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					mode: 'chat',
					messages: [
						...messages.slice(0, -1).map((m) => ({ role: m.role, content: m.content })),
						{
							role: 'user',
							content: [
								{ type: 'text', text: userMessage },
								...imageContents
							]
						}
					],
					settings: { endpoint, apiKey, modelName },
					currentColumns: columns,
					projectDescription,
					projectId
				})
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || 'Failed to get response');
			}

			const data = (await response.json()) as ChatModeResponse;
			handleChatResponse(data);
		} catch (err) {
			console.error('Image submit error:', err);
			toast.error(err instanceof Error ? err.message : 'Failed to analyze images');
			messages = [
				...messages,
				{
					role: 'assistant',
					content: 'Sorry, I encountered an error analyzing the images. Please try again.'
				}
			];
			chatState = 'idle';
		}
	}

	function handleImageSkip() {
		currentImageRequest = null;
		chatState = 'auto_continuing';

		// Tell the AI the user skipped providing images
		sendMessage("I'll skip providing example images for now. Please proceed with proposing columns based on our discussion.");
	}

	async function convertPdfToImages(file: File): Promise<File[]> {
		const formData = new FormData();
		formData.append('pdf', file);

		const response = await fetch('/api/pdf/convert', {
			method: 'POST',
			body: formData
		});

		if (!response.ok) {
			const error = await response.json();
			throw new Error(error.error || 'PDF conversion failed');
		}

		const data = await response.json();

		// Convert base64 images back to Files
		const imageFiles: File[] = [];
		for (const page of data.pages) {
			const binary = atob(page.imageData);
			const bytes = new Uint8Array(binary.length);
			for (let i = 0; i < binary.length; i++) {
				bytes[i] = binary.charCodeAt(i);
			}
			const blob = new Blob([bytes], { type: page.mimeType });
			const imageFile = new File([blob], page.fileName, { type: page.mimeType });
			imageFiles.push(imageFile);
		}

		return imageFiles;
	}

	async function handleFileUpload(e: Event) {
		const input = e.target as HTMLInputElement;
		if (!input.files || input.files.length === 0) return;

		const files = Array.from(input.files);
		input.value = ''; // Reset input

		isProcessingFiles = true;
		chatState = 'loading';

		try {
			const imageFiles: File[] = [];

			for (const file of files) {
				if (file.type === 'application/pdf') {
					// Convert PDF to images
					toast.info(`Converting ${file.name} to images...`);
					const converted = await convertPdfToImages(file);
					imageFiles.push(...converted);
				} else if (file.type.startsWith('image/')) {
					imageFiles.push(file);
				}
			}

			if (imageFiles.length === 0) {
				toast.error('No valid images or PDFs found');
				chatState = 'idle';
				isProcessingFiles = false;
				return;
			}

			// Clear any pending image request since user is proactively uploading
			currentImageRequest = null;

			// Convert files to base64 for sending to LLM
			const imageContents: Array<{ type: 'image_url'; image_url: { url: string } }> = [];
			for (const file of imageFiles) {
				const base64 = await fileToBase64(file);
				imageContents.push({
					type: 'image_url',
					image_url: { url: base64 }
				});
			}

			// Send message with images
			const userMessage = `Here ${imageFiles.length === 1 ? 'is an example document' : `are ${imageFiles.length} example pages`} for you to analyze.`;
			messages = [...messages, { role: 'user', content: userMessage }];

			const response = await fetch('/api/schema-chat', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					mode: 'chat',
					messages: [
						...messages.slice(0, -1).map((m) => ({ role: m.role, content: m.content })),
						{
							role: 'user',
							content: [
								{ type: 'text', text: userMessage },
								...imageContents
							]
						}
					],
					settings: { endpoint, apiKey, modelName },
					currentColumns: columns,
					projectDescription,
					projectId
				})
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || 'Failed to get response');
			}

			const data = (await response.json()) as ChatModeResponse;
			handleChatResponse(data);
		} catch (err) {
			console.error('File upload error:', err);
			toast.error(err instanceof Error ? err.message : 'Failed to process files');
			messages = [...messages, {
				role: 'assistant',
				content: 'Sorry, I encountered an error processing the files. Please try again.'
			}];
			chatState = 'idle';
		} finally {
			isProcessingFiles = false;
		}
	}

	function openFilePicker() {
		fileInput?.click();
	}

	async function fileToBase64(file: File): Promise<string> {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(reader.result as string);
			reader.onerror = reject;
			reader.readAsDataURL(file);
		});
	}

	function handleToolApprove(toolId: string) {
		pendingTools = pendingTools.map((t) =>
			t.id === toolId ? { ...t, status: 'approved' as const } : t
		);
	}

	function handleToolDecline(toolId: string) {
		pendingTools = pendingTools.map((t) =>
			t.id === toolId ? { ...t, status: 'declined' as const } : t
		);
	}

	function handleApproveAll() {
		pendingTools = pendingTools.map((t) =>
			t.status === 'pending' ? { ...t, status: 'approved' as const } : t
		);
	}

	function handleDeclineAll() {
		pendingTools = pendingTools.map((t) =>
			t.status === 'pending' ? { ...t, status: 'declined' as const } : t
		);
	}

	async function handleToolsContinue() {
		chatState = 'executing';

		try {
			const response = await fetch('/api/schema-chat', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					mode: 'execute',
					toolDecisions: pendingTools.map((t) => ({
						id: t.id,
						function: t.function,
						approved: t.status === 'approved'
					})),
					currentColumns: columns,
					projectDescription,
					projectId
				})
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || 'Failed to execute tools');
			}

			const data = (await response.json()) as ExecuteModeResponse;

			// Update tool results
			pendingTools = pendingTools.map((t) => {
				const result = data.results.find((r) => r.toolCallId === t.id);
				if (result) {
					return {
						...t,
						status: 'executed' as const,
						result: {
							success: result.success,
							message: result.message || result.error || ''
						}
					};
				}
				return t;
			});

			// Update columns if changed
			if (data.updatedColumns) {
				onColumnsChange(data.updatedColumns);
				toast.success('Schema updated');
			}

			// Update description if changed
			if (data.updatedDescription !== undefined && onDescriptionChange) {
				onDescriptionChange(data.updatedDescription);
			}

			// Format results for auto-continue
			const resultsText = data.results
				.map((r) => `${r.toolName}: ${r.success ? r.message : `DECLINED - ${r.message}`}`)
				.join('\n');

			// Clear pending tools and auto-continue
			const toolsToReport = [...pendingTools];
			pendingTools = [];
			chatState = 'auto_continuing';

			// Send results back to AI
			await sendMessage(`Tool execution results:\n${resultsText}`);
		} catch (err) {
			console.error('Tool execution error:', err);
			toast.error(err instanceof Error ? err.message : 'Failed to execute tools');
			chatState = 'awaiting_approval';
		}
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			if (canSendMessage) {
				sendMessage();
			}
		}
	}

	function handleClose() {
		open = false;
		onClose();
	}

	function acknowledgeWarning() {
		dataWarningAcknowledged = true;
		showDataWarning = false;
	}

	function cancelFromWarning() {
		showDataWarning = false;
		open = false;
		onClose();
	}

	function clearChat() {
		messages = [];
		pendingTools = [];
		currentQuestions = [];
		currentImageRequest = null;
		chatState = 'idle';
		showClearConfirm = false;
		if (onChatHistoryChange) {
			onChatHistoryChange([]);
		}
	}
</script>

<!-- Data Warning Dialog -->
<AlertDialog.Root bind:open={showDataWarning}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title class="flex items-center gap-2">
				<AlertTriangle class="w-5 h-5 text-yellow-500" />
				Existing Data Warning
			</AlertDialog.Title>
			<AlertDialog.Description>
				This project has existing extraction data. Modifying the column schema may cause
				data inconsistencies. Proceed with caution.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel onclick={cancelFromWarning}>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action onclick={acknowledgeWarning}>I Understand, Continue</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

<!-- Clear Chat Confirmation Dialog -->
<AlertDialog.Root bind:open={showClearConfirm}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Clear Chat History?</AlertDialog.Title>
			<AlertDialog.Description>
				This will delete all messages and start a fresh conversation. Your existing columns will not be affected.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action onclick={clearChat}>Clear Chat</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

{#snippet chatContent()}
	{#if !isConfigured}
		<div class="flex-1 flex items-center justify-center p-6">
			<div class="text-center text-muted-foreground">
				<p class="mb-2">LLM not configured</p>
				<p class="text-sm">Please configure your Vision API settings first.</p>
			</div>
		</div>
	{:else}
		<!-- Messages -->
		<div bind:this={messagesContainer} class="flex-1 overflow-y-auto p-4 space-y-4">
			<!-- Welcome placeholder (not a real message, disappears when chat starts) -->
			{#if messages.length === 0}
				<div class="text-center py-8 text-muted-foreground">
					<p class="text-sm">Describe what you want to extract and I'll help design your schema.</p>
				</div>
			{/if}

			{#each messages as message}
				<ChatMessageComponent
					role={message.role}
					content={message.content}
					toolResults={message.toolResults}
				/>
			{/each}

			<!-- Questions UI -->
			{#if hasQuestions}
				<QuestionsContainer
					questions={currentQuestions}
					onSubmit={handleQuestionsSubmit}
					disabled={isLoading}
				/>
			{/if}

			<!-- Image Request UI -->
			{#if hasImageRequest && currentImageRequest}
				<ImageRequestCard
					imageRequest={currentImageRequest}
					onSubmit={handleImageSubmit}
					onSkip={handleImageSkip}
					disabled={isLoading}
				/>
			{/if}

			<!-- Tool Proposals UI -->
			{#if hasPendingTools}
				<ToolProposalsContainer
					tools={pendingTools}
					{columns}
					onApprove={handleToolApprove}
					onDecline={handleToolDecline}
					onApproveAll={handleApproveAll}
					onDeclineAll={handleDeclineAll}
					onContinue={handleToolsContinue}
					disabled={isLoading}
				/>
			{/if}

			{#if isLoading}
				<div class="flex items-center gap-2 text-muted-foreground p-3">
					<Spinner class="w-4 h-4" />
					<span class="text-sm">
						{#if chatState === 'executing'}
							Executing...
						{:else if chatState === 'auto_continuing'}
							Processing...
						{:else}
							Thinking...
						{/if}
					</span>
				</div>
			{/if}
		</div>

		<!-- Input -->
		<div class="border-t p-4">
			<!-- Hidden file input for proactive uploads -->
			<input
				bind:this={fileInput}
				type="file"
				accept="image/*,.pdf"
				multiple
				class="hidden"
				onchange={handleFileUpload}
			/>
			<div class="flex gap-2">
				<Button
					variant="ghost"
					size="icon"
					onclick={openFilePicker}
					disabled={isLoading || isProcessingFiles || hasQuestions || hasPendingTools}
					title="Upload image or PDF"
					class="shrink-0"
				>
					<Paperclip class="w-4 h-4" />
				</Button>
				<Input
					bind:value={inputValue}
					placeholder={hasQuestions || hasPendingTools || hasImageRequest ? 'Waiting for your response above...' : 'Describe your data needs...'}
					onkeydown={handleKeyDown}
					disabled={isLoading || hasQuestions || hasPendingTools || hasImageRequest}
					class="flex-1"
				/>
				<Button
					onclick={() => sendMessage()}
					disabled={!canSendMessage || hasQuestions || hasPendingTools || hasImageRequest}
					size="icon"
				>
					<Send class="w-4 h-4" />
				</Button>
			</div>
			<p class="text-xs text-muted-foreground mt-1 ml-10">
				Attach images or PDFs anytime
			</p>
		</div>
	{/if}
{/snippet}

<!-- Desktop: Sheet -->
{#if !isMobile}
	<Sheet.Root bind:open onOpenChange={(o) => !o && handleClose()}>
		<Sheet.Content side="right" class="w-[400px] sm:w-[540px] flex flex-col p-0">
			<Sheet.Header class="px-6 py-4 border-b">
				<div class="flex items-start justify-between">
					<div>
						<Sheet.Title>Schema Assistant</Sheet.Title>
						<Sheet.Description>
							Describe your data extraction needs and I'll help design your columns.
						</Sheet.Description>
					</div>
					{#if messages.length > 0}
						<Button
							variant="ghost"
							size="icon"
							onclick={() => (showClearConfirm = true)}
							title="Clear chat history"
							class="shrink-0"
						>
							<Trash2 class="w-4 h-4" />
						</Button>
					{/if}
				</div>
			</Sheet.Header>
			{@render chatContent()}
		</Sheet.Content>
	</Sheet.Root>
{:else}
	<!-- Mobile: Drawer -->
	<Drawer.Root bind:open onOpenChange={(o) => !o && handleClose()}>
		<Drawer.Content class="max-h-[85vh] flex flex-col">
			<Drawer.Header>
				<div class="flex items-start justify-between">
					<div>
						<Drawer.Title>Schema Assistant</Drawer.Title>
						<Drawer.Description>
							Describe your data extraction needs.
						</Drawer.Description>
					</div>
					{#if messages.length > 0}
						<Button
							variant="ghost"
							size="icon"
							onclick={() => (showClearConfirm = true)}
							title="Clear chat history"
							class="shrink-0"
						>
							<Trash2 class="w-4 h-4" />
						</Button>
					{/if}
				</div>
			</Drawer.Header>
			<div class="flex-1 flex flex-col overflow-hidden">
				{@render chatContent()}
			</div>
		</Drawer.Content>
	</Drawer.Root>
{/if}
