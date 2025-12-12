import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	SCHEMA_CHAT_TOOLS,
	isApprovalRequired,
	isSpecialUITool,
	isAutoExecuteTool,
	type AddColumnArgs,
	type EditColumnArgs,
	type RemoveColumnArgs,
	type UpdateProjectDescriptionArgs,
	type AskQuestionsArgs,
	type RequestExampleImageArgs,
	type SetMultiRowModeArgs,
	type AnalyzeDocumentArgs,
	type SetFeatureFlagsArgs
} from '$lib/server/schema-chat/tools';
import type { ExtractionFeatureFlags } from '$lib/types/extraction';
import { buildSystemPromptWithSchema } from '$lib/server/schema-chat/system-prompt';
import type {
	Column,
	ChatMessage,
	PendingToolCall,
	Question,
	ImageRequest,
	ToolResult,
	ChatModeRequest,
	ExecuteModeRequest,
	SchemaChatRequest,
	DocumentAnalysis,
	ToolCall
} from '$lib/server/schema-chat/types';

function generateColumnId(): string {
	return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

function generateQuestionId(toolCallId: string, index: number): string {
	return `q_${toolCallId}_${index}`;
}

function generateOptionId(questionIndex: number, optionIndex: number): string {
	return `opt_${questionIndex}_${optionIndex}`;
}

// Tool execution result type
interface ToolExecutionResult {
	success: boolean;
	message: string;
	updatedColumns?: Column[];
	updatedDescription?: string;
	updatedMultiRowExtraction?: boolean;
	updatedFeatureFlags?: Partial<ExtractionFeatureFlags>;
	documentAnalysis?: DocumentAnalysis;
}

// Execute a single tool and return the result
function executeToolCall(
	toolName: string,
	argsString: string,
	columns: Column[],
	projectDescription?: string,
	multiRowExtraction?: boolean,
	featureFlags?: Partial<ExtractionFeatureFlags>
): ToolExecutionResult {
	try {
		const args = JSON.parse(argsString);

		switch (toolName) {
			case 'add_column': {
				const { name: colName, type, description, allowedValues, regex } = args as AddColumnArgs;

				// Check for duplicate names
				if (columns.some((c) => c.name.toLowerCase() === colName.toLowerCase())) {
					return {
						success: false,
						message: `Column "${colName}" already exists`
					};
				}

				const newColumn: Column = {
					id: generateColumnId(),
					name: colName,
					type,
					description,
					allowedValues: allowedValues || '',
					regex: regex || '',
					expanded: false
				};

				return {
					success: true,
					message: `Column "${colName}" (${type}) added successfully`,
					updatedColumns: [...columns, newColumn]
				};
			}

			case 'edit_column': {
				const { column_id, updates } = args as EditColumnArgs;
				const columnIndex = columns.findIndex((c) => c.id === column_id);

				if (columnIndex === -1) {
					return {
						success: false,
						message: `Column with ID "${column_id}" not found`
					};
				}

				const updatedColumns = [...columns];
				updatedColumns[columnIndex] = {
					...updatedColumns[columnIndex],
					...updates
				};

				return {
					success: true,
					message: `Column "${columns[columnIndex].name}" updated successfully`,
					updatedColumns
				};
			}

			case 'remove_column': {
				const { column_id } = args as RemoveColumnArgs;
				const column = columns.find((c) => c.id === column_id);

				if (!column) {
					return {
						success: false,
						message: `Column with ID "${column_id}" not found`
					};
				}

				return {
					success: true,
					message: `Column "${column.name}" removed successfully`,
					updatedColumns: columns.filter((c) => c.id !== column_id)
				};
			}

			case 'update_project_description': {
				const { description } = args as UpdateProjectDescriptionArgs;

				return {
					success: true,
					message: `Project description updated`,
					updatedDescription: description
				};
			}

			case 'get_current_schema': {
				if (columns.length === 0) {
					return {
						success: true,
						message: 'No columns defined yet.'
					};
				}

				const schemaDescription = columns
					.map(
						(col, i) =>
							`${i + 1}. [ID: ${col.id}] ${col.name} (${col.type}): ${col.description}${col.allowedValues ? ` [Allowed: ${col.allowedValues}]` : ''}`
					)
					.join('\n');

				return {
					success: true,
					message: `Current schema:\n${schemaDescription}`
				};
			}

			case 'get_project_settings': {
				return {
					success: true,
					message: `Current settings:\n- Multi-row extraction: ${multiRowExtraction ? 'ENABLED' : 'DISABLED'}\n- Project description: ${projectDescription || '(not set)'}`
				};
			}

			case 'set_multi_row_mode': {
				const { enabled, reason } = args as SetMultiRowModeArgs;

				return {
					success: true,
					message: `Multi-row extraction ${enabled ? 'ENABLED' : 'DISABLED'}. ${reason}`,
					updatedMultiRowExtraction: enabled
				};
			}

			case 'analyze_document': {
				const { summary, documentType, identifiedFields } = args as AnalyzeDocumentArgs;

				const analysis: DocumentAnalysis = {
					id: generateColumnId(),
					timestamp: Date.now(),
					summary,
					documentType,
					identifiedFields,
					imageCount: 1 // Will be updated by caller if needed
				};

				return {
					success: true,
					message: `Document analysis stored: ${documentType}. Identified ${identifiedFields.length} potential fields.`,
					documentAnalysis: analysis
				};
			}

			case 'get_feature_flags': {
				const flags = featureFlags || {};
				const flagStatus = [
					`- Bounding boxes: ${flags.boundingBoxes !== false ? 'ON' : 'OFF'}`,
					`- Confidence scores: ${flags.confidenceScores !== false ? 'ON' : 'OFF'}`,
					`- Multi-row extraction: ${flags.multiRowExtraction ? 'ON' : 'OFF'}`,
					`- TOON output: ${flags.toonOutput ? 'ON' : 'OFF'}`
				].join('\n');

				return {
					success: true,
					message: `Current extraction features:\n${flagStatus}`
				};
			}

			case 'set_feature_flags': {
				const { boundingBoxes, confidenceScores, toonOutput, reason } = args as SetFeatureFlagsArgs;

				const updates: Partial<ExtractionFeatureFlags> = {};
				const changes: string[] = [];

				if (boundingBoxes !== undefined) {
					updates.boundingBoxes = boundingBoxes;
					changes.push(`Bounding boxes: ${boundingBoxes ? 'ON' : 'OFF'}`);
				}
				if (confidenceScores !== undefined) {
					updates.confidenceScores = confidenceScores;
					changes.push(`Confidence scores: ${confidenceScores ? 'ON' : 'OFF'}`);
				}
				if (toonOutput !== undefined) {
					updates.toonOutput = toonOutput;
					changes.push(`TOON output: ${toonOutput ? 'ON' : 'OFF'}`);
				}

				if (changes.length === 0) {
					return {
						success: false,
						message: 'No feature flags specified to change'
					};
				}

				return {
					success: true,
					message: `Feature flags updated: ${changes.join(', ')}. ${reason}`,
					updatedFeatureFlags: updates
				};
			}

			default:
				return {
					success: false,
					message: `Unknown tool: ${toolName}`
				};
		}
	} catch (err) {
		return {
			success: false,
			message: `Failed to parse tool arguments: ${err instanceof Error ? err.message : 'Unknown error'}`
		};
	}
}

// Parse ask_questions tool call into Question objects
function parseQuestionsFromToolCall(
	toolCallId: string,
	argsString: string
): Question[] {
	try {
		const args = JSON.parse(argsString) as AskQuestionsArgs;
		return args.questions.map((q, qIndex) => ({
			id: generateQuestionId(toolCallId, qIndex),
			header: q.header,
			questionText: q.questionText,
			options: q.options.map((opt, optIndex) => ({
				id: generateOptionId(qIndex, optIndex),
				label: opt.label,
				description: opt.description
			})),
			multiSelect: q.multiSelect ?? false,
			allowOther: q.allowOther !== false // default true
		}));
	} catch {
		return [];
	}
}

// Parse request_example_image tool call into ImageRequest
function parseImageRequestFromToolCall(
	toolCallId: string,
	argsString: string
): ImageRequest | null {
	try {
		const args = JSON.parse(argsString) as RequestExampleImageArgs;
		return {
			id: toolCallId,
			message: args.message,
			lookingFor: args.lookingFor || []
		};
	} catch {
		return null;
	}
}

// Handle chat mode - call LLM and categorize tool calls
async function handleChatMode(body: ChatModeRequest) {
	const { messages, settings, currentColumns, projectDescription, multiRowExtraction, documentAnalyses, featureFlags } = body;

	if (!settings.endpoint || !settings.modelName) {
		return json({ error: 'LLM settings (endpoint and modelName) are required' }, { status: 400 });
	}

	// Build system prompt with current schema, settings, and document memory
	const systemPrompt = buildSystemPromptWithSchema(
		currentColumns.map((c) => ({
			id: c.id,
			name: c.name,
			type: c.type,
			description: c.description,
			allowedValues: c.allowedValues
		})),
		projectDescription,
		multiRowExtraction,
		documentAnalyses,
		featureFlags
	);

	// Prepare messages for LLM - preserve full message structure including tool_calls
	const llmMessages: Array<{
		role: string;
		content: string | Array<{ type: string; text?: string; image_url?: { url: string; detail?: string } }> | null;
		tool_calls?: ToolCall[];
		tool_call_id?: string;
		name?: string;
	}> = [{ role: 'system', content: systemPrompt }];

	for (const msg of messages) {
		if (msg.role === 'tool') {
			// Tool response message
			llmMessages.push({
				role: 'tool',
				content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
				tool_call_id: msg.tool_call_id,
				name: msg.name
			});
		} else if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
			// Assistant message with tool calls - preserve structure
			llmMessages.push({
				role: 'assistant',
				content: msg.content,
				tool_calls: msg.tool_calls
			});
		} else {
			// Regular user or assistant message
			llmMessages.push({
				role: msg.role,
				content: msg.content
			});
		}
	}

	// Call LLM with tools
	const response = await fetch(settings.endpoint, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			...(settings.apiKey && { Authorization: `Bearer ${settings.apiKey}` })
		},
		body: JSON.stringify({
			model: settings.modelName,
			messages: llmMessages,
			tools: SCHEMA_CHAT_TOOLS,
			tool_choice: 'auto'
		})
	});

	if (!response.ok) {
		const errorText = await response.text();
		console.error('LLM API error:', errorText);
		return json(
			{ error: `LLM API error: ${response.statusText}`, details: errorText },
			{ status: response.status }
		);
	}

	const llmResponse = await response.json();
	const assistantMessage = llmResponse.choices?.[0]?.message;

	if (!assistantMessage) {
		return json({ error: 'No response from LLM' }, { status: 500 });
	}

	// Categorize tool calls
	const pendingTools: PendingToolCall[] = [];
	let questions: Question[] | undefined;
	let imageRequest: ImageRequest | undefined;
	const autoExecuteResults: ToolResult[] = [];
	const toolMessages: ChatMessage[] = [];
	let documentAnalysis: DocumentAnalysis | undefined;

	if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
		for (const toolCall of assistantMessage.tool_calls) {
			const toolName = toolCall.function.name;

			if (isSpecialUITool(toolName)) {
				// Handle special UI tools
				if (toolName === 'ask_questions') {
					questions = parseQuestionsFromToolCall(toolCall.id, toolCall.function.arguments);
				} else if (toolName === 'request_example_image') {
					const parsed = parseImageRequestFromToolCall(toolCall.id, toolCall.function.arguments);
					if (parsed) {
						imageRequest = parsed;
					}
				}
			} else if (isAutoExecuteTool(toolName)) {
				// Auto-execute read-only tools immediately
				const result = executeToolCall(
					toolName,
					toolCall.function.arguments,
					currentColumns,
					projectDescription,
					multiRowExtraction,
					featureFlags
				);

				autoExecuteResults.push({
					toolCallId: toolCall.id,
					toolName,
					success: result.success,
					message: result.message
				});

				// Create proper tool response message for conversation history
				toolMessages.push({
					role: 'tool',
					content: JSON.stringify({ success: result.success, message: result.message }),
					tool_call_id: toolCall.id,
					name: toolName
				});

				// Capture document analysis if present
				if (result.documentAnalysis) {
					documentAnalysis = result.documentAnalysis;
				}
			} else if (isApprovalRequired(toolName)) {
				// Queue for user approval
				pendingTools.push({
					id: toolCall.id,
					type: 'function',
					function: {
						name: toolName,
						arguments: toolCall.function.arguments
					},
					status: 'pending'
				});
			}
		}
	}

	// Determine if the agent loop should continue (has auto-executed tools, no pending approval needed)
	const shouldContinue = autoExecuteResults.length > 0 &&
		pendingTools.length === 0 &&
		!questions &&
		!imageRequest;

	return json({
		message: {
			role: 'assistant' as const,
			content: assistantMessage.content || '',
			tool_calls: assistantMessage.tool_calls
		},
		toolMessages: toolMessages.length > 0 ? toolMessages : undefined,
		pendingTools: pendingTools.length > 0 ? pendingTools : undefined,
		questions: questions && questions.length > 0 ? questions : undefined,
		imageRequest,
		autoExecuteResults: autoExecuteResults.length > 0 ? autoExecuteResults : undefined,
		documentAnalysis,
		shouldContinue
	});
}

// Handle execute mode - execute approved tools
async function handleExecuteMode(body: ExecuteModeRequest) {
	const { toolDecisions, currentColumns, projectDescription, featureFlags } = body;

	let updatedColumns = [...currentColumns];
	let updatedDescription = projectDescription;
	let updatedMultiRowExtraction: boolean | undefined;
	let updatedFeatureFlags: Partial<ExtractionFeatureFlags> | undefined;
	const results: ToolResult[] = [];
	const toolMessages: ChatMessage[] = [];

	for (const decision of toolDecisions) {
		const toolName = decision.function.name;

		if (!decision.approved) {
			results.push({
				toolCallId: decision.id,
				toolName,
				success: false,
				message: 'User declined this action'
			});

			// Create tool response message for declined action
			toolMessages.push({
				role: 'tool',
				content: JSON.stringify({ success: false, message: 'User declined this action' }),
				tool_call_id: decision.id,
				name: toolName
			});
			continue;
		}

		const result = executeToolCall(
			toolName,
			decision.function.arguments,
			updatedColumns,
			updatedDescription,
			updatedMultiRowExtraction,
			{ ...featureFlags, ...updatedFeatureFlags }
		);

		results.push({
			toolCallId: decision.id,
			toolName,
			success: result.success,
			message: result.message
		});

		// Create proper tool response message for conversation history
		toolMessages.push({
			role: 'tool',
			content: JSON.stringify({ success: result.success, message: result.message }),
			tool_call_id: decision.id,
			name: toolName
		});

		if (result.updatedColumns) {
			updatedColumns = result.updatedColumns;
		}
		if (result.updatedDescription !== undefined) {
			updatedDescription = result.updatedDescription;
		}
		if (result.updatedMultiRowExtraction !== undefined) {
			updatedMultiRowExtraction = result.updatedMultiRowExtraction;
		}
		if (result.updatedFeatureFlags) {
			updatedFeatureFlags = { ...updatedFeatureFlags, ...result.updatedFeatureFlags };
		}
	}

	return json({
		results,
		updatedColumns: updatedColumns !== currentColumns ? updatedColumns : undefined,
		updatedDescription: updatedDescription !== projectDescription ? updatedDescription : undefined,
		updatedMultiRowExtraction,
		updatedFeatureFlags,
		toolMessages
	});
}

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = (await request.json()) as SchemaChatRequest;

		if (body.mode === 'execute') {
			return handleExecuteMode(body);
		} else {
			// Default to chat mode
			return handleChatMode(body as ChatModeRequest);
		}
	} catch (err) {
		console.error('Schema chat error:', err);
		return json(
			{ error: err instanceof Error ? err.message : 'Failed to process chat request' },
			{ status: 500 }
		);
	}
};
