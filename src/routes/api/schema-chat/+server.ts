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
	type RequestExampleImageArgs
} from '$lib/server/schema-chat/tools';
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
	SchemaChatRequest
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

// Execute a single tool and return the result
function executeToolCall(
	toolName: string,
	argsString: string,
	columns: Column[],
	projectDescription?: string
): { success: boolean; message: string; updatedColumns?: Column[]; updatedDescription?: string } {
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
	const { messages, settings, currentColumns, projectDescription } = body;

	if (!settings.endpoint || !settings.modelName) {
		return json({ error: 'LLM settings (endpoint and modelName) are required' }, { status: 400 });
	}

	// Build system prompt with current schema
	const systemPrompt = buildSystemPromptWithSchema(
		currentColumns.map((c) => ({
			id: c.id,
			name: c.name,
			type: c.type,
			description: c.description,
			allowedValues: c.allowedValues
		})),
		projectDescription
	);

	// Prepare messages for LLM
	const llmMessages = [{ role: 'system', content: systemPrompt }, ...messages];

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
			tool_choice: 'auto',
			temperature: 0.7,
			max_tokens: 2000
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
					projectDescription
				);
				autoExecuteResults.push({
					toolCallId: toolCall.id,
					toolName,
					success: result.success,
					message: result.message
				});
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

	return json({
		message: {
			role: 'assistant',
			content: assistantMessage.content || '',
			tool_calls: assistantMessage.tool_calls
		},
		pendingTools: pendingTools.length > 0 ? pendingTools : undefined,
		questions: questions && questions.length > 0 ? questions : undefined,
		imageRequest,
		autoExecuteResults: autoExecuteResults.length > 0 ? autoExecuteResults : undefined
	});
}

// Handle execute mode - execute approved tools
async function handleExecuteMode(body: ExecuteModeRequest) {
	const { toolDecisions, currentColumns, projectDescription } = body;

	let updatedColumns = [...currentColumns];
	let updatedDescription = projectDescription;
	const results: ToolResult[] = [];

	for (const decision of toolDecisions) {
		if (!decision.approved) {
			results.push({
				toolCallId: decision.id,
				toolName: decision.function.name,
				success: false,
				message: 'User declined this action'
			});
			continue;
		}

		const result = executeToolCall(
			decision.function.name,
			decision.function.arguments,
			updatedColumns,
			updatedDescription
		);

		results.push({
			toolCallId: decision.id,
			toolName: decision.function.name,
			success: result.success,
			message: result.message
		});

		if (result.updatedColumns) {
			updatedColumns = result.updatedColumns;
		}
		if (result.updatedDescription !== undefined) {
			updatedDescription = result.updatedDescription;
		}
	}

	return json({
		results,
		updatedColumns: updatedColumns !== currentColumns ? updatedColumns : undefined,
		updatedDescription: updatedDescription !== projectDescription ? updatedDescription : undefined
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
