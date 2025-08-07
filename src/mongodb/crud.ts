// @ts-ignore
import { Collection, Db, ObjectId, Filter, UpdateFilter, FindOptions, InsertOneResult, UpdateResult as MongoUpdateResult, DeleteResult as MongoDeleteResult } from "mongodb";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { MongoConnectionManager } from "./connection.js";

export type IdType = ObjectId | string;

export interface CrudOptions {
  useObjectId?: boolean;
  collectionName: string;
}

// @ts-ignore
export interface FindManyOptions<T> extends Omit<FindOptions<T>, 'limit' | 'skip'> {
  limit?: number;
  skip?: number;
}

export interface CreateResult<T> {
  success: boolean;
  data?: T;
  id?: IdType;
  error?: string;
}

export interface UpdateResult<T> {
  success: boolean;
  data?: T;
  modifiedCount: number;
  error?: string;
}

export interface DeleteResult {
  success: boolean;
  deletedCount: number;
  error?: string;
}

export interface FindResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface FindManyResult<T> {
  success: boolean;
  data: T[];
  total: number;
  error?: string;
}

export class MongoCRUD<T extends Record<string, any>> {
  private collection: Collection<T>;
  private schema: z.ZodSchema<T>;
  private options: CrudOptions;
  private connectionManager: MongoConnectionManager;

  constructor(
    connectionManager: MongoConnectionManager,
    schema: z.ZodSchema<T>,
    options: CrudOptions
  ) {
    this.connectionManager = connectionManager;
    this.schema = schema;
    this.options = options;
    
    // Initialize collection - will be set when connection is established
    const db = this.connectionManager.getDb();
    this.collection = db.collection<T>(options.collectionName);
  }

  private generateId(): IdType {
    return this.options.useObjectId ? new ObjectId() : uuidv4();
  }

  private validateId(id: IdType): ObjectId | string {
    if (this.options.useObjectId) {
      if (typeof id === 'string') {
        if (!ObjectId.isValid(id)) {
          throw new Error(`Invalid ObjectId: ${id}`);
        }
        return new ObjectId(id);
      }
      return id as ObjectId;
    }
    return id as string;
  }

  private validateData(data: unknown): T {
    try {
      return this.schema.parse(data);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errorMessages = error.errors.map(err => `${err.path.join('.')}: ${err.message}`).join(', ');
        throw new Error(`Validation failed: ${errorMessages}`);
      }
      throw error;
    }
  }

  private handleError(error: unknown, operation: string): string {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`MongoDB ${operation} error:`, errorMessage);
    return errorMessage;
  }

  async create(data: Omit<T, '_id'>): Promise<CreateResult<T>> {
    try {
      // Validate the input data
      const validatedData = this.validateData(data);
      
      // Generate ID if not provided
      const documentToInsert = {
        ...validatedData,
        _id: this.generateId(),
      } as T;

      const result: InsertOneResult<T> = await this.collection.insertOne(documentToInsert);
      
      if (result.acknowledged) {
        return {
          success: true,
          data: documentToInsert,
          id: result.insertedId as IdType,
        };
      } else {
        return {
          success: false,
          error: "Insert operation was not acknowledged",
        };
      }
    } catch (error) {
      return {
        success: false,
        error: this.handleError(error, "create"),
      };
    }
  }

  async findById(id: IdType): Promise<FindResult<T>> {
    try {
      const validatedId = this.validateId(id);
      const document = await this.collection.findOne({ _id: validatedId } as Filter<T>);
      
      if (document) {
        return {
          success: true,
          data: document,
        };
      } else {
        return {
          success: false,
          error: `Document with id ${id} not found`,
        };
      }
    } catch (error) {
      return {
        success: false,
        error: this.handleError(error, "findById"),
      };
    }
  }

  async findMany(filter: Filter<T> = {}, options: FindManyOptions<T> = {}): Promise<FindManyResult<T>> {
    try {
      const { limit = 100, skip = 0, ...findOptions } = options;
      
      const cursor = this.collection.find(filter, findOptions);
      
      if (skip > 0) {
        cursor.skip(skip);
      }
      
      if (limit > 0) {
        cursor.limit(limit);
      }
      
      const documents = await cursor.toArray();
      const total = await this.collection.countDocuments(filter);
      
      return {
        success: true,
        data: documents,
        total,
      };
    } catch (error) {
      return {
        success: false,
        data: [],
        total: 0,
        error: this.handleError(error, "findMany"),
      };
    }
  }

  async updateById(id: IdType, update: UpdateFilter<T>): Promise<UpdateResult<T>> {
    try {
      const validatedId = this.validateId(id);
      
      // If update contains $set, validate the data
      if (update.$set) {
        try {
          this.schema.partial().parse(update.$set);
        } catch (error) {
          if (error instanceof z.ZodError) {
            const errorMessages = error.errors.map(err => `${err.path.join('.')}: ${err.message}`).join(', ');
            throw new Error(`Update validation failed: ${errorMessages}`);
          }
          throw error;
        }
      }
      
      const result: MongoUpdateResult = await this.collection.updateOne(
        { _id: validatedId } as Filter<T>,
        update
      );
      
      if (result.acknowledged) {
        // Fetch the updated document
        const updatedDocument = await this.collection.findOne({ _id: validatedId } as Filter<T>);
        
        return {
          success: true,
          data: updatedDocument || undefined,
          modifiedCount: result.modifiedCount,
        };
      } else {
        return {
          success: false,
          modifiedCount: 0,
          error: "Update operation was not acknowledged",
        };
      }
    } catch (error) {
      return {
        success: false,
        modifiedCount: 0,
        error: this.handleError(error, "updateById"),
      };
    }
  }

  async deleteById(id: IdType): Promise<DeleteResult> {
    try {
      const validatedId = this.validateId(id);
      const result: MongoDeleteResult = await this.collection.deleteOne({ _id: validatedId } as Filter<T>);
      
      if (result.acknowledged) {
        return {
          success: true,
          deletedCount: result.deletedCount,
        };
      } else {
        return {
          success: false,
          deletedCount: 0,
          error: "Delete operation was not acknowledged",
        };
      }
    } catch (error) {
      return {
        success: false,
        deletedCount: 0,
        error: this.handleError(error, "deleteById"),
      };
    }
  }

  async deleteMany(filter: Filter<T>): Promise<DeleteResult> {
    try {
      const result: MongoDeleteResult = await this.collection.deleteMany(filter);
      
      if (result.acknowledged) {
        return {
          success: true,
          deletedCount: result.deletedCount,
        };
      } else {
        return {
          success: false,
          deletedCount: 0,
          error: "Delete operation was not acknowledged",
        };
      }
    } catch (error) {
      return {
        success: false,
        deletedCount: 0,
        error: this.handleError(error, "deleteMany"),
      };
    }
  }

  async exists(id: IdType): Promise<boolean> {
    try {
      const validatedId = this.validateId(id);
      const count = await this.collection.countDocuments({ _id: validatedId } as Filter<T>);
      return count > 0;
    } catch (error) {
      console.error("Error checking document existence:", error);
      return false;
    }
  }

  async count(filter: Filter<T> = {}): Promise<number> {
    try {
      return await this.collection.countDocuments(filter);
    } catch (error) {
      console.error("Error counting documents:", error);
      return 0;
    }
  }

  getCollection(): Collection<T> {
    return this.collection;
  }
}






