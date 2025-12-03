/**
* This file was @generated using pocketbase-typegen
*/

import type PocketBase from 'pocketbase'
import type { RecordService } from 'pocketbase'

export enum Collections {
	Authorigins = "_authOrigins",
	Externalauths = "_externalAuths",
	Mfas = "_mfas",
	Otps = "_otps",
	Superusers = "_superusers",
	ExtractionRows = "extraction_rows",
	ImageBatches = "image_batches",
	Images = "images",
	ProcessingMetrics = "processing_metrics",
	Projects = "projects",
	QueueJobs = "queue_jobs",
	Users = "users",
}

// Alias types for improved usability
export type IsoDateString = string
export type RecordIdString = string
export type HTMLString = string

type ExpandType<T> = unknown extends T
	? T extends unknown
		? { expand?: unknown }
		: { expand: T }
	: { expand: T }

// System fields
export type BaseSystemFields<T = unknown> = {
	id: RecordIdString
	collectionId: string
	collectionName: Collections
} & ExpandType<T>

export type AuthSystemFields<T = unknown> = {
	email: string
	emailVisibility: boolean
	username: string
	verified: boolean
} & BaseSystemFields<T>

// Record types for each collection

export type AuthoriginsRecord = {
	collectionRef: string
	created?: IsoDateString
	fingerprint: string
	id: string
	recordRef: string
	updated?: IsoDateString
}

export type ExternalauthsRecord = {
	collectionRef: string
	created?: IsoDateString
	id: string
	provider: string
	providerId: string
	recordRef: string
	updated?: IsoDateString
}

export type MfasRecord = {
	collectionRef: string
	created?: IsoDateString
	id: string
	method: string
	recordRef: string
	updated?: IsoDateString
}

export type OtpsRecord = {
	collectionRef: string
	created?: IsoDateString
	id: string
	password: string
	recordRef: string
	sentTo?: string
	updated?: IsoDateString
}

export type SuperusersRecord = {
	created?: IsoDateString
	email: string
	emailVisibility?: boolean
	id: string
	password: string
	tokenKey: string
	updated?: IsoDateString
	verified?: boolean
}

export enum ExtractionRowsStatusOptions {
	"pending" = "pending",
	"review" = "review",
	"approved" = "approved",
	"deleted" = "deleted",
}
export type ExtractionRowsRecord<Trow_data = unknown> = {
	approved_at?: IsoDateString
	batch: RecordIdString[]
	created?: IsoDateString
	deleted_at?: IsoDateString
	id: string
	project: RecordIdString[]
	row_data: null | Trow_data
	row_index: number
	status: ExtractionRowsStatusOptions
	updated?: IsoDateString
}

export enum ImageBatchesStatusOptions {
	"pending" = "pending",
	"processing" = "processing",
	"review" = "review",
	"approved" = "approved",
	"failed" = "failed",
}
export type ImageBatchesRecord<Tprocessed_data = unknown> = {
	created?: IsoDateString
	id: string
	processed_data?: null | Tprocessed_data
	project: RecordIdString[]
	row_count?: number
	status: ImageBatchesStatusOptions
	updated?: IsoDateString
}

export type ImagesRecord<Tbbox_used = unknown> = {
	batch: RecordIdString[]
	bbox_used?: null | Tbbox_used
	column_id?: string
	extracted_text?: string
	id: string
	image: string
	is_cropped?: boolean
	order: number
	parent_image?: RecordIdString[]
}

export enum ProcessingMetricsJobTypeOptions {
	"process_batch" = "process_batch",
	"process_redo" = "process_redo",
}

export enum ProcessingMetricsStatusOptions {
	"success" = "success",
	"failed" = "failed",
}
export type ProcessingMetricsRecord = {
	batchId: string
	created?: IsoDateString
	durationMs: number
	endTime: IsoDateString
	errorMessage?: string
	extractionCount?: number
	id: string
	imageCount: number
	jobType: ProcessingMetricsJobTypeOptions
	modelUsed?: string
	projectId: string
	startTime: IsoDateString
	status: ProcessingMetricsStatusOptions
	tokensUsed?: number
	updated?: IsoDateString
}

export type ProjectsRecord<Tschema_chat_history = unknown, Tsettings = unknown> = {
	id: string
	name: string
	schema_chat_history?: null | Tschema_chat_history
	settings?: null | Tsettings
	user: RecordIdString[]
}

export enum QueueJobsTypeOptions {
	"process_batch" = "process_batch",
	"reprocess_batch" = "reprocess_batch",
	"process_redo" = "process_redo",
}

export enum QueueJobsStatusOptions {
	"queued" = "queued",
	"processing" = "processing",
	"completed" = "completed",
	"failed" = "failed",
	"retrying" = "retrying",
}
export type QueueJobsRecord<Tdata = unknown> = {
	attempts?: number
	completedAt?: IsoDateString
	data: null | Tdata
	id: string
	lastError?: string
	maxAttempts: number
	priority: number
	projectId: string
	startedAt?: IsoDateString
	status: QueueJobsStatusOptions
	type: QueueJobsTypeOptions
}

export type UsersRecord = {
	avatar?: string
	created?: IsoDateString
	email: string
	emailVisibility?: boolean
	id: string
	name?: string
	password: string
	tokenKey: string
	updated?: IsoDateString
	verified?: boolean
}

// Response types include system fields and match responses from the PocketBase API
export type AuthoriginsResponse<Texpand = unknown> = Required<AuthoriginsRecord> & BaseSystemFields<Texpand>
export type ExternalauthsResponse<Texpand = unknown> = Required<ExternalauthsRecord> & BaseSystemFields<Texpand>
export type MfasResponse<Texpand = unknown> = Required<MfasRecord> & BaseSystemFields<Texpand>
export type OtpsResponse<Texpand = unknown> = Required<OtpsRecord> & BaseSystemFields<Texpand>
export type SuperusersResponse<Texpand = unknown> = Required<SuperusersRecord> & AuthSystemFields<Texpand>
export type ExtractionRowsResponse<Trow_data = unknown, Texpand = unknown> = Required<ExtractionRowsRecord<Trow_data>> & BaseSystemFields<Texpand>
export type ImageBatchesResponse<Tprocessed_data = unknown, Texpand = unknown> = Required<ImageBatchesRecord<Tprocessed_data>> & BaseSystemFields<Texpand>
export type ImagesResponse<Tbbox_used = unknown, Texpand = unknown> = Required<ImagesRecord<Tbbox_used>> & BaseSystemFields<Texpand>
export type ProcessingMetricsResponse<Texpand = unknown> = Required<ProcessingMetricsRecord> & BaseSystemFields<Texpand>
export type ProjectsResponse<Tschema_chat_history = unknown, Tsettings = unknown, Texpand = unknown> = Required<ProjectsRecord<Tschema_chat_history, Tsettings>> & BaseSystemFields<Texpand>
export type QueueJobsResponse<Tdata = unknown, Texpand = unknown> = Required<QueueJobsRecord<Tdata>> & BaseSystemFields<Texpand>
export type UsersResponse<Texpand = unknown> = Required<UsersRecord> & AuthSystemFields<Texpand>

// Types containing all Records and Responses, useful for creating typing helper functions

export type CollectionRecords = {
	_authOrigins: AuthoriginsRecord
	_externalAuths: ExternalauthsRecord
	_mfas: MfasRecord
	_otps: OtpsRecord
	_superusers: SuperusersRecord
	extraction_rows: ExtractionRowsRecord
	image_batches: ImageBatchesRecord
	images: ImagesRecord
	processing_metrics: ProcessingMetricsRecord
	projects: ProjectsRecord
	queue_jobs: QueueJobsRecord
	users: UsersRecord
}

export type CollectionResponses = {
	_authOrigins: AuthoriginsResponse
	_externalAuths: ExternalauthsResponse
	_mfas: MfasResponse
	_otps: OtpsResponse
	_superusers: SuperusersResponse
	extraction_rows: ExtractionRowsResponse
	image_batches: ImageBatchesResponse
	images: ImagesResponse
	processing_metrics: ProcessingMetricsResponse
	projects: ProjectsResponse
	queue_jobs: QueueJobsResponse
	users: UsersResponse
}

// Type for usage with type asserted PocketBase instance
// https://github.com/pocketbase/js-sdk#specify-typescript-definitions

export type TypedPocketBase = PocketBase & {
	collection(idOrName: '_authOrigins'): RecordService<AuthoriginsResponse>
	collection(idOrName: '_externalAuths'): RecordService<ExternalauthsResponse>
	collection(idOrName: '_mfas'): RecordService<MfasResponse>
	collection(idOrName: '_otps'): RecordService<OtpsResponse>
	collection(idOrName: '_superusers'): RecordService<SuperusersResponse>
	collection(idOrName: 'extraction_rows'): RecordService<ExtractionRowsResponse>
	collection(idOrName: 'image_batches'): RecordService<ImageBatchesResponse>
	collection(idOrName: 'images'): RecordService<ImagesResponse>
	collection(idOrName: 'processing_metrics'): RecordService<ProcessingMetricsResponse>
	collection(idOrName: 'projects'): RecordService<ProjectsResponse>
	collection(idOrName: 'queue_jobs'): RecordService<QueueJobsResponse>
	collection(idOrName: 'users'): RecordService<UsersResponse>
}
