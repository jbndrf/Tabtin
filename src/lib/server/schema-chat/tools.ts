// Tool definitions for schema chat LLM function calling

export interface ToolDefinition {
	type: 'function';
	function: {
		name: string;
		description: string;
		parameters: {
			type: 'object';
			properties: Record<string, unknown>;
			required: string[];
		};
	};
}

// Tool categorization for different handling
export const APPROVAL_REQUIRED_TOOLS = [
	'add_column',
	'edit_column',
	'remove_column',
	'update_project_description',
	'set_multi_row_mode'
] as const;

export const SPECIAL_UI_TOOLS = ['ask_questions', 'request_example_image'] as const;

export const AUTO_EXECUTE_TOOLS = ['get_current_schema', 'get_project_settings', 'analyze_document'] as const;

export type ApprovalRequiredTool = (typeof APPROVAL_REQUIRED_TOOLS)[number];
export type SpecialUITool = (typeof SPECIAL_UI_TOOLS)[number];
export type AutoExecuteTool = (typeof AUTO_EXECUTE_TOOLS)[number];
export type ToolName = ApprovalRequiredTool | SpecialUITool | AutoExecuteTool;

export const SCHEMA_CHAT_TOOLS: ToolDefinition[] = [
	{
		type: 'function',
		function: {
			name: 'request_example_image',
			description:
				'Request the user to provide an example image or batch from their documents. Use this AFTER gathering initial context about document type and requirements, but BEFORE proposing columns. Seeing actual documents helps you write precise extraction instructions.',
			parameters: {
				type: 'object',
				properties: {
					message: {
						type: 'string',
						description:
							'A message explaining why you need to see an example and what you will look for'
					},
					lookingFor: {
						type: 'array',
						description: 'List of things you want to identify in the document',
						items: {
							type: 'string'
						}
					}
				},
				required: ['message', 'lookingFor']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'ask_questions',
			description:
				'Ask the user one or more structured questions with clickable options. Use this to gather information before making schema changes. The user will see buttons for each option and can also provide custom text via "Other". Up to 4 questions can be asked at once.',
			parameters: {
				type: 'object',
				properties: {
					questions: {
						type: 'array',
						description: 'Array of questions to ask (max 4)',
						items: {
							type: 'object',
							properties: {
								header: {
									type: 'string',
									description: 'Short header/label for the question (max 12 chars)'
								},
								questionText: {
									type: 'string',
									description: 'The full question to ask the user'
								},
								options: {
									type: 'array',
									description: 'Available options for the user to choose from (2-6 options)',
									items: {
										type: 'object',
										properties: {
											label: {
												type: 'string',
												description: 'The display text for this option'
											},
											description: {
												type: 'string',
												description: 'Optional explanation of what this option means'
											}
										},
										required: ['label']
									}
								},
								multiSelect: {
									type: 'boolean',
									description:
										'If true, user can select multiple options. Default false (single select).'
								},
								allowOther: {
									type: 'boolean',
									description:
										'If true, include an "Other" option for custom text input. Default true.'
								}
							},
							required: ['header', 'questionText', 'options']
						}
					}
				},
				required: ['questions']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'add_column',
			description: 'Add a new column to the extraction schema.',
			parameters: {
				type: 'object',
				properties: {
					name: {
						type: 'string',
						description:
							'Column name in snake_case (e.g., invoice_number, customer_name, total_amount)'
					},
					type: {
						type: 'string',
						enum: ['text', 'number', 'date', 'currency', 'boolean'],
						description:
							'Column data type: text (strings), number (integers/decimals), date (dates), currency (money amounts), boolean (yes/no)'
					},
					description: {
						type: 'string',
						description: 'Clear description of what this column captures from the document'
					},
					allowedValues: {
						type: 'string',
						description: 'Optional comma-separated list of allowed values (for enum-like fields)'
					},
					regex: {
						type: 'string',
						description: 'Optional regex pattern for validation'
					}
				},
				required: ['name', 'type', 'description']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'edit_column',
			description: 'Edit an existing column in the schema.',
			parameters: {
				type: 'object',
				properties: {
					column_id: {
						type: 'string',
						description: 'The ID of the column to edit (from current schema)'
					},
					updates: {
						type: 'object',
						description: 'Fields to update',
						properties: {
							name: { type: 'string' },
							type: {
								type: 'string',
								enum: ['text', 'number', 'date', 'currency', 'boolean']
							},
							description: { type: 'string' },
							allowedValues: { type: 'string' },
							regex: { type: 'string' }
						}
					}
				},
				required: ['column_id', 'updates']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'remove_column',
			description: 'Remove a column from the schema.',
			parameters: {
				type: 'object',
				properties: {
					column_id: {
						type: 'string',
						description: 'The ID of the column to remove (from current schema)'
					}
				},
				required: ['column_id']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'update_project_description',
			description:
				'Update the project description to summarize what data will be extracted from documents.',
			parameters: {
				type: 'object',
				properties: {
					description: {
						type: 'string',
						description: 'The new project description text'
					}
				},
				required: ['description']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'get_current_schema',
			description:
				'Get the current column schema to review what columns already exist. This executes immediately without approval.',
			parameters: {
				type: 'object',
				properties: {},
				required: []
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'get_project_settings',
			description:
				'Get current project settings including multi-row extraction mode. This executes immediately without approval.',
			parameters: {
				type: 'object',
				properties: {},
				required: []
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'set_multi_row_mode',
			description:
				'Enable or disable multi-row extraction mode. Use this when the user wants to extract multiple rows/items from each image (like line items from an invoice, transactions from a bank statement). Single-row mode (default) is for documents with one item per image.',
			parameters: {
				type: 'object',
				properties: {
					enabled: {
						type: 'boolean',
						description: 'true to enable multi-row extraction, false for single-row mode'
					},
					reason: {
						type: 'string',
						description: 'Brief explanation of why this mode is appropriate for the user\'s use case'
					}
				},
				required: ['enabled', 'reason']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'analyze_document',
			description:
				'Store a summary of the document(s) the user has shared for future reference. Call this AFTER the user provides example images to create a persistent memory of what you observed. This helps maintain context about the document structure throughout the conversation.',
			parameters: {
				type: 'object',
				properties: {
					summary: {
						type: 'string',
						description: 'Detailed description of the document(s): layout, sections, data fields observed, formatting patterns'
					},
					documentType: {
						type: 'string',
						description: 'Type of document (e.g., "invoice", "receipt", "bank statement", "form")'
					},
					identifiedFields: {
						type: 'array',
						description: 'List of data fields/values you identified in the document',
						items: { type: 'string' }
					}
				},
				required: ['summary', 'documentType', 'identifiedFields']
			}
		}
	}
];

export interface ToolCall {
	id: string;
	type: 'function';
	function: {
		name: ToolName;
		arguments: string;
	};
}

export interface RequestExampleImageArgs {
	message: string;
	lookingFor: string[];
}

export interface AskQuestionsArgs {
	questions: Array<{
		header: string;
		questionText: string;
		options: Array<{
			label: string;
			description?: string;
		}>;
		multiSelect?: boolean;
		allowOther?: boolean;
	}>;
}

export interface AddColumnArgs {
	name: string;
	type: 'text' | 'number' | 'date' | 'currency' | 'boolean';
	description: string;
	allowedValues?: string;
	regex?: string;
}

export interface EditColumnArgs {
	column_id: string;
	updates: Partial<{
		name: string;
		type: 'text' | 'number' | 'date' | 'currency' | 'boolean';
		description: string;
		allowedValues: string;
		regex: string;
	}>;
}

export interface RemoveColumnArgs {
	column_id: string;
}

export interface UpdateProjectDescriptionArgs {
	description: string;
}

export interface SetMultiRowModeArgs {
	enabled: boolean;
	reason: string;
}

export interface AnalyzeDocumentArgs {
	summary: string;
	documentType: string;
	identifiedFields: string[];
}

// Helper to check tool category
export function isApprovalRequired(toolName: string): boolean {
	return (APPROVAL_REQUIRED_TOOLS as readonly string[]).includes(toolName);
}

export function isSpecialUITool(toolName: string): boolean {
	return (SPECIAL_UI_TOOLS as readonly string[]).includes(toolName);
}

export function isAutoExecuteTool(toolName: string): boolean {
	return (AUTO_EXECUTE_TOOLS as readonly string[]).includes(toolName);
}
