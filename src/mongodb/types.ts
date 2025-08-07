import { ObjectId, Filter, UpdateFilter, FindOptions, Sort } from "mongodb";
import { z } from "zod";

// Base ID types
export type IdType = ObjectId | string;
export type MongoId = ObjectId | string;

// Document base interface
export interface BaseDocument {
  _id: IdType;
  createdAt?: Date;
  updatedAt?: Date;
}

// Configuration interfaces
export interface MongoConnectionConfig {
  uri: string;
  dbName: string;
  options?: {
    maxPoolSize?: number;
    serverSelectionTimeoutMS?: number;
    socketTimeoutMS?: number;
    [key: string]: any;
  };
}

export interface CrudOptions {
  useObjectId?: boolean;
  collectionName: string;
  timestamps?: boolean;
}

// Query and operation interfaces
export interface QueryOptions<T = any> {
  limit?: number;
  skip?: number;
  sort?: Sort;
  projection?: Record<string, 0 | 1>;
  filter?: Filter<T>;
}

export interface FindManyOptions<T> extends Omit<FindOptions<T>, 'limit' | 'skip'> {
  limit?: number;
  skip?: number;
}

export interface PaginationOptions {
  page?: number;
  limit?: number;
  skip?: number;
}

export interface SortOptions {
  field: string;
  direction: 'asc' | 'desc' | 1 | -1;
}

// Update operation types
export interface UpdateOptions {
  upsert?: boolean;
  returnDocument?: 'before' | 'after';
}

export interface BulkUpdateOperation<T> {
  filter: Filter<T>;
  update: UpdateFilter<T>;
  options?: UpdateOptions;
}

export interface BulkDeleteOperation<T> {
  filter: Filter<T>;
}

// Result interfaces
export interface OperationResult {
  success: boolean;
  error?: string;
  timestamp?: Date;
}

export interface CreateResult<T> extends OperationResult {
  data?: T;
  id?: IdType;
  insertedId?: IdType;
}

export interface FindResult<T> extends OperationResult {
  data?: T;
}

export interface FindManyResult<T> extends OperationResult {
  data: T[];
  total: number;
  page?: number;
  limit?: number;
  hasNext?: boolean;
  hasPrevious?: boolean;
}

export interface UpdateResult<T> extends OperationResult {
  data?: T;
  modifiedCount: number;
  matchedCount?: number;
  upsertedId?: IdType;
}

export interface DeleteResult extends OperationResult {
  deletedCount: number;
}

export interface BulkOperationResult extends OperationResult {
  insertedCount?: number;
  modifiedCount?: number;
  deletedCount?: number;
  upsertedCount?: number;
  matchedCount?: number;
  insertedIds?: IdType[];
  upsertedIds?: IdType[];
}

// Error types
export interface MongoError extends Error {
  code?: number;
  codeName?: string;
  keyPattern?: Record<string, any>;
  keyValue?: Record<string, any>;
}

export interface ValidationError extends Error {
  field?: string;
  value?: any;
  constraint?: string;
  details?: z.ZodError;
}

export interface CrudError extends Error {
  operation: string;
  collection: string;
  originalError?: Error;
  context?: Record<string, any>;
}

// Schema validation types
export interface SchemaValidationOptions {
  strict?: boolean;
  allowUnknown?: boolean;
  stripUnknown?: boolean;
}

export interface ValidatedDocument<T> {
  isValid: boolean;
  data?: T;
  errors?: ValidationError[];
}

// Aggregation types
export interface AggregationPipeline {
  $match?: Filter<any>;
  $group?: Record<string, any>;
  $sort?: Sort;
  $limit?: number;
  $skip?: number;
  $project?: Record<string, 0 | 1>;
  $lookup?: {
    from: string;
    localField: string;
    foreignField: string;
    as: string;
  };
  [key: string]: any;
}

export interface AggregationOptions {
  allowDiskUse?: boolean;
  maxTimeMS?: number;
  hint?: string | Record<string, any>;
}

export interface AggregationResult<T> extends OperationResult {
  data: T[];
  pipeline?: AggregationPipeline[];
}

// Index types
export interface IndexDefinition {
  key: Record<string, 1 | -1 | 'text' | '2d' | '2dsphere'>;
  options?: {
    name?: string;
    unique?: boolean;
    sparse?: boolean;
    background?: boolean;
    expireAfterSeconds?: number;
    partialFilterExpression?: Filter<any>;
    [key: string]: any;
  };
}

export interface IndexResult extends OperationResult {
  indexName?: string;
  numIndexesBefore?: number;
  numIndexesAfter?: number;
}

// Transaction types
export interface TransactionOptions {
  readConcern?: {
    level: 'local' | 'available' | 'majority' | 'linearizable' | 'snapshot';
  };
  writeConcern?: {
    w?: number | 'majority';
    j?: boolean;
    wtimeout?: number;
  };
  maxCommitTimeMS?: number;
}

export interface TransactionResult<T = any> extends OperationResult {
  data?: T;
  operations?: string[];
  duration?: number;
}

// Utility types
export type WithId<T> = T & { _id: IdType };
export type WithoutId<T> = Omit<T, '_id'>;
export type OptionalId<T> = Omit<T, '_id'> & { _id?: IdType };

export type CreateInput<T> = WithoutId<T>;
export type UpdateInput<T> = Partial<WithoutId<T>>;

// Zod schema helpers
export const ObjectIdSchema = z.custom<ObjectId>((val) => {
  return ObjectId.isValid(val);
}, "Invalid ObjectId");

export const UUIDSchema = z.string().uuid("Invalid UUID format");

export const IdSchema = z.union([ObjectIdSchema, UUIDSchema, z.string()]);

export const BaseDocumentSchema = z.object({
  _id: IdSchema,
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

// Type guards
export function isObjectId(id: any): id is ObjectId {
  return id instanceof ObjectId || ObjectId.isValid(id);
}

export function isUUID(id: any): id is string {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return typeof id === 'string' && uuidRegex.test(id);
}

export function isValidId(id: any): id is IdType {
  return isObjectId(id) || isUUID(id) || typeof id === 'string';
}

// Helper functions for type conversion
export function toObjectId(id: string | ObjectId): ObjectId {
  if (id instanceof ObjectId) {
    return id;
  }
  if (typeof id === 'string' && ObjectId.isValid(id)) {
    return new ObjectId(id);
  }
  throw new Error(`Invalid ObjectId: ${id}`);
}

export function toStringId(id: ObjectId | string): string {
  if (id instanceof ObjectId) {
    return id.toString();
  }
  return id;
}

// Collection configuration
export interface CollectionConfig<T> {
  name: string;
  schema: z.ZodSchema<T>;
  options: CrudOptions;
  indexes?: IndexDefinition[];
}

// Database configuration
export interface DatabaseConfig {
  collections: Record<string, CollectionConfig<any>>;
  connectionConfig: MongoConnectionConfig;
  globalOptions?: {
    timestamps?: boolean;
    softDelete?: boolean;
    validation?: SchemaValidationOptions;
  };
}

// Event types for hooks/middleware
export interface CrudEvent<T = any> {
  operation: 'create' | 'update' | 'delete' | 'find';
  collection: string;
  data?: T;
  filter?: Filter<T>;
  result?: any;
  timestamp: Date;
  duration?: number;
}

export type CrudEventHandler<T = any> = (event: CrudEvent<T>) => void | Promise<void>;

export interface CrudHooks<T = any> {
  beforeCreate?: CrudEventHandler<T>;
  afterCreate?: CrudEventHandler<T>;
  beforeUpdate?: CrudEventHandler<T>;
  afterUpdate?: CrudEventHandler<T>;
  beforeDelete?: CrudEventHandler<T>;
  afterDelete?: CrudEventHandler<T>;
  beforeFind?: CrudEventHandler<T>;
  afterFind?: CrudEventHandler<T>;
}
