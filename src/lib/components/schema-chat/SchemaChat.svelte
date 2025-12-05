<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import * as Sheet from '$lib/components/ui/sheet';
	import * as Drawer from '$lib/components/ui/drawer';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { Spinner } from '$lib/components/ui/spinner';
	import { Send, Trash2, AlertTriangle, Paperclip } from 'lucide-svelte';
	import { toast } from '$lib/utils/toast';
	import { convertPdfToImages, isPdfFile } from '$lib/utils/pdf-api';
	import ChatMessageComponent from './ChatMessage.svelte';
	import QuestionsContainer from './QuestionsContainer.svelte';
	import ToolProposalsContainer from './ToolProposalsContainer.svelte';
	import ImageRequestCard from './ImageRequestCard.svelte';
	import { onMount, tick } from 'svelte';
	import type {
		ChatState,
		Column,
		ChatMessage,
		PendingToolCall,
		Question,
		QuestionAnswer,
		ImageRequest,
		ToolResult,
		ChatModeResponse,
		ExecuteModeResponse,
		DocumentAnalysis,
		ToolCall
	} from '$lib/server/schema-chat/types';

	// UI-friendly message for display (simplified from ChatMessage)
	export interface DisplayMessage {
		role: 'user' | 'assistant' | 'tool';
		content: string;
		toolResults?: ToolResult[];
		// Hidden from UI but preserved for API
		tool_calls?: ToolCall[];
		tool_call_id?: string;
		name?: string;
	}

	interface Props {
		open: boolean;
		projectId: string;
		endpoint: string;
		apiKey: string;
		modelName: string;
		columns: Column[];
		projectDescription?: string;
		multiRowExtraction?: boolean;
		hasExistingData?: boolean;
		chatHistory?: DisplayMessage[];
		documentAnalyses?: DocumentAnalysis[];
		onColumnsChange: (columns: Column[]) => void;
		onDescriptionChange?: (description: string) => void;
		onMultiRowChange?: (enabled: boolean) => void;
		onChatHistoryChange?: (messages: DisplayMessage[]) => void;
		onDocumentAnalysesChange?: (analyses: DocumentAnalysis[]) => void;
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
		multiRowExtraction = false,
		hasExistingData = false,
		chatHistory = [],
		documentAnalyses = [],
		onColumnsChange,
		onDescriptionChange,
		onMultiRowChange,
		onChatHistoryChange,
		onDocumentAnalysesChange,
		onClose
	}: Props = $props();

	// State machine
	let chatState = $state<ChatState>('idle');
	let messages = $state<DisplayMessage[]>([]);
	let inputValue = $state('');
	let messagesContainer: HTMLDivElement | null = $state(null);

	// Pending interactions
	let pendingTools = $state<PendingToolCall[]>([]);
	let pendingAssistantMessage = $state<DisplayMessage | null>(null); // Store assistant message while waiting for approval
	let currentQuestions = $state<Question[]>([]);
	let currentImageRequest = $state<ImageRequest | null>(null);

	// Document memory
	let storedDocumentAnalyses = $state<DocumentAnalysis[]>([]);

	// UI state
	let showDataWarning = $state(false);
	let dataWarningAcknowledged = $state(false);
	let showClearConfirm = $state(false);
	let isMobile = $state(false);
	let fileInput: HTMLInputElement | null = $state(null);
	let isProcessingFiles = $state(false);
	let hasInitialized = $state(false);

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

	// Load chat history and document analyses when chat opens, or initialize new conversation
	$effect(() => {
		if (open && isConfigured && !hasInitialized) {
			hasInitialized = true;

			if (chatHistory && chatHistory.length > 0) {
				// Load existing chat history
				messages = [...chatHistory];
				if (documentAnalyses && documentAnalyses.length > 0) {
					storedDocumentAnalyses = [...documentAnalyses];
				}
				chatState = 'idle';
			} else {
				// New conversation - load document analyses and initialize
				if (documentAnalyses && documentAnalyses.length > 0) {
					storedDocumentAnalyses = [...documentAnalyses];
				}
				// Start with project state
				initializeConversation();
			}
		}
	});

	// Reset initialization flag when chat closes
	$effect(() => {
		if (!open) {
			hasInitialized = false;
		}
	});

	async function initializeConversation() {
		chatState = 'loading';

		// Build initial context message about current project state
		const initialContext = buildProjectStateMessage();

		// Add as a system-context user message
		messages = [{ role: 'user', content: initialContext }];

		await callLLM();
	}

	function buildProjectStateMessage(): string {
		const parts: string[] = ['[PROJECT STATE]'];

		// Project description
		if (projectDescription) {
			parts.push(`Description: ${projectDescription}`);
		} else {
			parts.push('Description: Not set');
		}

		// Multi-row mode
		parts.push(`Multi-row extraction: ${multiRowExtraction ? 'Enabled' : 'Disabled'}`);

		// Current columns
		if (columns.length === 0) {
			parts.push('Columns: None defined yet');
		} else {
			parts.push(`Columns (${columns.length}):`);
			columns.forEach((col, i) => {
				let colDesc = `  ${i + 1}. ${col.name} (${col.type}): ${col.description}`;
				if (col.allowedValues) {
					colDesc += ` [Allowed: ${col.allowedValues}]`;
				}
				parts.push(colDesc);
			});
		}

		// Document analyses summary
		if (storedDocumentAnalyses.length > 0) {
			parts.push(`\nPreviously analyzed documents: ${storedDocumentAnalyses.length}`);
		}

		parts.push('\nPlease greet me and ask how you can help with my schema design.');

		return parts.join('\n');
	}

	// Save chat history when messages change
	$effect(() => {
		if (messages.length > 0 && onChatHistoryChange) {
			onChatHistoryChange(messages);
		}
	});

	// Save document analyses when they change
	$effect(() => {
		if (storedDocumentAnalyses.length > 0 && onDocumentAnalysesChange) {
			onDocumentAnalysesChange(storedDocumentAnalyses);
		}
	});

	// Check for existing data warning
	$effect(() => {
		if (open && hasExistingData && !dataWarningAcknowledged) {
			showDataWarning = true;
		}
	});

	// Convert display messages to API format (preserving tool_calls and tool responses)
	function messagesToApiFormat(): ChatMessage[] {
		return messages.map((m) => {
			if (m.role === 'tool') {
				return {
					role: 'tool' as const,
					content: m.content,
					tool_call_id: m.tool_call_id,
					name: m.name
				};
			} else if (m.role === 'assistant' && m.tool_calls) {
				return {
					role: 'assistant' as const,
					content: m.content,
					tool_calls: m.tool_calls
				};
			} else {
				return {
					role: m.role as 'user' | 'assistant',
					content: m.content
				};
			}
		});
	}

	async function sendMessage(content?: string) {
		const messageContent = content || inputValue.trim();
		if (!messageContent || !isConfigured) return;

		inputValue = '';
		chatState = 'loading';

		// Add user message
		messages = [...messages, { role: 'user', content: messageContent }];

		await callLLM();
	}

	// Core agent loop - calls LLM and handles response
	async function callLLM() {
		try {
			const response = await fetch('/api/schema-chat', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					mode: 'chat',
					messages: messagesToApiFormat(),
					settings: { endpoint, apiKey, modelName },
					currentColumns: columns,
					projectDescription,
					multiRowExtraction,
					documentAnalyses: storedDocumentAnalyses,
					projectId
				})
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || 'Failed to get response');
			}

			const data = (await response.json()) as ChatModeResponse;
			await handleChatResponse(data);
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

	async function handleChatResponse(data: ChatModeResponse) {
		// Add assistant message with tool_calls preserved
		const assistantMessage: DisplayMessage = {
			role: 'assistant',
			content: typeof data.message.content === 'string' ? data.message.content : '',
			toolResults: data.autoExecuteResults,
			tool_calls: data.message.tool_calls
		};

		// Store document analysis if present
		if (data.documentAnalysis) {
			storedDocumentAnalyses = [...storedDocumentAnalyses, data.documentAnalysis];
		}

		// Handle different response types
		if (data.pendingTools && data.pendingTools.length > 0) {
			// Store the assistant message but don't add to visible history yet
			// We'll add it along with tool responses after user approval
			pendingAssistantMessage = assistantMessage;
			pendingTools = data.pendingTools;
			chatState = 'awaiting_approval';
		} else {
			// No approval needed - add message to history
			messages = [...messages, assistantMessage];

			// Add tool response messages if any (for auto-executed tools)
			if (data.toolMessages && data.toolMessages.length > 0) {
				const toolDisplayMessages: DisplayMessage[] = data.toolMessages.map((tm) => ({
					role: 'tool' as const,
					content: typeof tm.content === 'string' ? tm.content : JSON.stringify(tm.content),
					tool_call_id: tm.tool_call_id,
					name: tm.name
				}));
				messages = [...messages, ...toolDisplayMessages];
			}

			// Check if we should continue the agent loop
			if (data.shouldContinue) {
				chatState = 'auto_continuing';
				// Continue the agent loop - call LLM again with tool results
				await callLLM();
				return;
			}

			// Handle UI interactions
			if (data.questions && data.questions.length > 0) {
				currentQuestions = data.questions;
				chatState = 'awaiting_answers';
			} else if (data.imageRequest) {
				currentImageRequest = data.imageRequest;
				chatState = 'awaiting_image';
			} else {
				chatState = 'idle';
			}
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
		chatState = 'loading';

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

		// Add user message to UI (simplified - we don't store images in history)
		messages = [...messages, { role: 'user', content: userMessage }];

		try {
			// Build messages with multimodal content for this request only
			const apiMessages = messagesToApiFormat();
			// Replace the last message with multimodal version
			apiMessages[apiMessages.length - 1] = {
				role: 'user',
				content: [
					{ type: 'text', text: userMessage },
					...imageContents
				]
			};

			// Send to API with images as multimodal content
			const response = await fetch('/api/schema-chat', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					mode: 'chat',
					messages: apiMessages,
					settings: { endpoint, apiKey, modelName },
					currentColumns: columns,
					projectDescription,
					multiRowExtraction,
					documentAnalyses: storedDocumentAnalyses,
					projectId
				})
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || 'Failed to get response');
			}

			const data = (await response.json()) as ChatModeResponse;
			await handleChatResponse(data);
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
				if (isPdfFile(file)) {
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

			// Build messages with multimodal content for this request only
			const apiMessages = messagesToApiFormat();
			// Replace the last message with multimodal version
			apiMessages[apiMessages.length - 1] = {
				role: 'user',
				content: [
					{ type: 'text', text: userMessage },
					...imageContents
				]
			};

			const response = await fetch('/api/schema-chat', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					mode: 'chat',
					messages: apiMessages,
					settings: { endpoint, apiKey, modelName },
					currentColumns: columns,
					projectDescription,
					multiRowExtraction,
					documentAnalyses: storedDocumentAnalyses,
					projectId
				})
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || 'Failed to get response');
			}

			const data = (await response.json()) as ChatModeResponse;
			await handleChatResponse(data);
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

			// Update columns if changed
			if (data.updatedColumns) {
				onColumnsChange(data.updatedColumns);
				toast.success('Schema updated');
			}

			// Update description if changed
			if (data.updatedDescription !== undefined && onDescriptionChange) {
				onDescriptionChange(data.updatedDescription);
			}

			// Update multi-row extraction if changed
			if (data.updatedMultiRowExtraction !== undefined && onMultiRowChange) {
				onMultiRowChange(data.updatedMultiRowExtraction);
			}

			// Add the pending assistant message to history (with tool_calls)
			if (pendingAssistantMessage) {
				// Update with tool results for display
				pendingAssistantMessage.toolResults = data.results;
				messages = [...messages, pendingAssistantMessage];
				pendingAssistantMessage = null;
			}

			// Add tool response messages to history for proper API format
			if (data.toolMessages && data.toolMessages.length > 0) {
				const toolDisplayMessages: DisplayMessage[] = data.toolMessages.map((tm) => ({
					role: 'tool' as const,
					content: typeof tm.content === 'string' ? tm.content : JSON.stringify(tm.content),
					tool_call_id: tm.tool_call_id,
					name: tm.name
				}));
				messages = [...messages, ...toolDisplayMessages];
			}

			// Clear pending tools
			pendingTools = [];

			// Continue the agent loop - call LLM with tool results
			chatState = 'auto_continuing';
			await callLLM();
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
		pendingAssistantMessage = null;
		currentQuestions = [];
		currentImageRequest = null;
		storedDocumentAnalyses = [];
		chatState = 'idle';
		showClearConfirm = false;
		hasInitialized = false; // Reset to trigger new initialization
		if (onChatHistoryChange) {
			onChatHistoryChange([]);
		}
		if (onDocumentAnalysesChange) {
			onDocumentAnalysesChange([]);
		}
		// Re-initialize the conversation with fresh project state
		initializeConversation();
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
	<!-- Mobile: Drawer with snap points for pull up/down -->
	<Drawer.Root
		bind:open
		onOpenChange={(o) => !o && handleClose()}
		snapPoints={[0.4, 0.85]}
		activeSnapPoint={0.85}
	>
		<Drawer.Content class="max-h-[85vh] flex flex-col">
			<Drawer.Handle class="mx-auto mt-4 h-2 w-[100px] shrink-0 rounded-full bg-muted" />
			<Drawer.Header class="pt-2">
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
