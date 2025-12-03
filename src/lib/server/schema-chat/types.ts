// Shared type definitions for schema chat

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

// Chat message structure
export interface ChatMessage {
	role: 'user' | 'assistant' | 'system' | 'tool';
	content: string;
	tool_calls?: Array<{
		id: string;
		type: 'function';
		function: {
			name: string;
			arguments: string;
		};
	}>;
	tool_call_id?: string;
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
}

// Combined API request type
export type SchemaChatRequest = ChatModeRequest | ExecuteModeRequest;

// Chat mode response
export interface ChatModeResponse {
	message: {
		role: 'assistant';
		content: string;
		tool_calls?: Array<{
			id: string;
			type: 'function';
			function: {
				name: string;
				arguments: string;
			};
		}>;
	};
	pendingTools?: PendingToolCall[];
	questions?: Question[];
	imageRequest?: ImageRequest;
	autoExecuteResults?: ToolResult[];
}

// Execute mode response
export interface ExecuteModeResponse {
	results: ToolResult[];
	updatedColumns?: Column[];
	updatedDescription?: string;
}
