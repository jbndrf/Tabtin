// Shared type definitions for schema chat

import type { ExtractionFeatureFlags } from '$lib/types/extraction';

// Tool status for tracking pending/executed tools
export type ToolStatus = 'pending' | 'approved' | 'declined' | 'executed';

// Chat state machine states
export type ChatState =
	| 'idle' // Ready for user input
	| 'loading' // Waiting for LLM response
	| 'awaiting_approval' // Pending tool proposals
	| 'awaiting_answers' // Pending questions
	| 'awaiting_image' // Waiting for user to upload an image
	| 'executing' // Executing approved tools
	| 'auto_continuing'; // Sending results back to AI

// Tool call structure from LLM response
export interface ToolCall {
	id: string;
	type: 'function';
	function: {
		name: string;
		arguments: string;
	};
}

// Enhanced tool call with status tracking
export interface PendingToolCall {
	id: string;
	type: 'function';
	function: {
		name: string;
		arguments: string;
	};
	status: ToolStatus;
	result?: {
		success: boolean;
		message: string;
		data?: unknown;
	};
}

// Document analysis stored for image memory
export interface DocumentAnalysis {
	id: string;
	timestamp: number;
	summary: string;
	documentType?: string;
	identifiedFields?: string[];
	imageCount: number;
}

// Question option for ask_questions tool
export interface QuestionOption {
	id: string;
	label: string;
	description?: string;
}

// Single question structure
export interface Question {
	id: string;
	header: string;
	questionText: string;
	options: QuestionOption[];
	multiSelect: boolean;
	allowOther: boolean;
}

// User's answer to a question
export interface QuestionAnswer {
	questionId: string;
	selectedOptionIds: string[];
	otherText?: string;
}

// Image request from request_example_image tool
export interface ImageRequest {
	id: string;
	message: string;
	lookingFor: string[];
}

// Column type
export interface Column {
	id: string;
	name: string;
	type: 'text' | 'number' | 'date' | 'currency' | 'boolean';
	description: string;
	allowedValues: string;
	regex: string;
	expanded?: boolean;
}

// Chat message structure - supports OpenAI format with proper tool history
export interface ChatMessage {
	role: 'user' | 'assistant' | 'system' | 'tool';
	// Content can be string or multimodal array (for images)
	content: string | Array<{ type: string; text?: string; image_url?: { url: string; detail?: string } }> | null;
	// Tool calls made by assistant
	tool_calls?: ToolCall[];
	// For tool response messages
	tool_call_id?: string;
	name?: string; // Tool name for tool responses
}

// Tool execution result
export interface ToolResult {
	toolCallId: string;
	toolName: string;
	success: boolean;
	message?: string;
	error?: string;
	data?: unknown;
}

// API request for chat mode
export interface ChatModeRequest {
	mode: 'chat';
	messages: ChatMessage[];
	settings: {
		endpoint: string;
		apiKey: string;
		modelName: string;
	};
	currentColumns: Column[];
	projectDescription?: string;
	projectId: string;
	multiRowExtraction?: boolean;
	featureFlags?: Partial<ExtractionFeatureFlags>;
	// Stored document analyses for image memory
	documentAnalyses?: DocumentAnalysis[];
}

// API request for execute mode
export interface ExecuteModeRequest {
	mode: 'execute';
	toolDecisions: Array<{
		id: string;
		function: {
			name: string;
			arguments: string;
		};
		approved: boolean;
	}>;
	currentColumns: Column[];
	projectDescription?: string;
	projectId: string;
	featureFlags?: Partial<ExtractionFeatureFlags>;
}

// Combined API request type
export type SchemaChatRequest = ChatModeRequest | ExecuteModeRequest;

// Chat mode response
export interface ChatModeResponse {
	// The assistant message to add to history (preserves tool_calls)
	message: ChatMessage;
	// Tool response messages to add to history (for auto-executed tools)
	toolMessages?: ChatMessage[];
	// Pending tools requiring user approval
	pendingTools?: PendingToolCall[];
	// Questions for user
	questions?: Question[];
	// Image request
	imageRequest?: ImageRequest;
	// Results from auto-executed tools
	autoExecuteResults?: ToolResult[];
	// New document analysis if images were analyzed
	documentAnalysis?: DocumentAnalysis;
	// Whether there are more tool calls to process (agent loop should continue)
	shouldContinue?: boolean;
}

// Execute mode response
export interface ExecuteModeResponse {
	results: ToolResult[];
	updatedColumns?: Column[];
	updatedDescription?: string;
	updatedMultiRowExtraction?: boolean;
	updatedFeatureFlags?: Partial<ExtractionFeatureFlags>;
	// Tool response messages to add to history
	toolMessages?: ChatMessage[];
}
