import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { ObjectId } from "mongodb";
import { z } from "zod";
// @ts-ignore
import { MongoCRUD } from "../mongodb/crud.js";
// @ts-ignore
import { MongoConnectionManager } from "../mongodb/connection.js";

// Test schema
const TestSchema = z.object({
  _id: z.union([z.instanceof(ObjectId), z.string()]),
  name: z.string(),
  email: z.string().email(),
  age: z.number().min(0),
  isActive: z.boolean().optional(),
});

type TestDocument = z.infer<typeof TestSchema>;

describe("MongoCRUD Unit Tests", () => {
  let crud: MongoCRUD<TestDocument>;
  let mockCollection: any;
  let mockCursor: any;
  let mockDb: any;
  let mockConnectionManager: any;

  beforeEach(() => {
    // Create fresh mocks for each test
    mockCursor = {
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      toArray: jest.fn(),
    };

    mockCollection = {
      insertOne: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn().mockReturnValue(mockCursor),
      updateOne: jest.fn(),
      deleteOne: jest.fn(),
      deleteMany: jest.fn(),
      countDocuments: jest.fn(),
    };

    mockDb = {
      collection: jest.fn().mockReturnValue(mockCollection),
    };

    mockConnectionManager = {
      getDb: jest.fn().mockReturnValue(mockDb),
      getClient: jest.fn(),
      isConnectionActive: jest.fn().mockReturnValue(true),
    } as unknown as MongoConnectionManager;

    // Create CRUD instance
    crud = new MongoCRUD(mockConnectionManager, TestSchema, {
      collectionName: "test-collection",
      useObjectId: true,
    });
  });

  describe("create operation", () => {
    it("should create a document successfully", async () => {
      const testData = {
        name: "John Doe",
        email: "john@example.com",
        age: 30,
        isActive: true,
      };

      const insertedId = new ObjectId();
      mockCollection.insertOne.mockResolvedValue({
        acknowledged: true,
        insertedId,
      });

      const result = await crud.create(testData);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.id).toBe(insertedId);
      expect(mockCollection.insertOne).toHaveBeenCalledTimes(1);
    });

    it("should handle validation errors", async () => {
      const invalidData = {
        name: "John Doe",
        email: "invalid-email",
        age: -5,
      };

      const result = await crud.create(invalidData);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Validation failed");
      expect(mockCollection.insertOne).not.toHaveBeenCalled();
    });

    it("should handle database errors", async () => {
      const testData = {
        name: "John Doe",
        email: "john@example.com",
        age: 30,
      };

      mockCollection.insertOne.mockRejectedValue(new Error("Database error"));

      const result = await crud.create(testData);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Database error");
    });
  });

  describe("findById operation", () => {
    it("should find a document by ObjectId", async () => {
      const testId = new ObjectId();
      const testDocument = {
        _id: testId,
        name: "John Doe",
        email: "john@example.com",
        age: 30,
      };

      mockCollection.findOne.mockResolvedValue(testDocument);

      const result = await crud.findById(testId);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(testDocument);
      expect(mockCollection.findOne).toHaveBeenCalledWith({ _id: testId });
    });

    it("should handle document not found", async () => {
      const testId = new ObjectId();
      mockCollection.findOne.mockResolvedValue(null);

      const result = await crud.findById(testId);

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });

    it("should handle invalid ObjectId", async () => {
      const invalidId = "invalid-object-id";

      const result = await crud.findById(invalidId);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid ObjectId");
    });
  });

  describe("findMany operation", () => {
    it("should find multiple documents", async () => {
      const testDocuments = [
        { _id: new ObjectId(), name: "John", email: "john@example.com", age: 30 },
        { _id: new ObjectId(), name: "Jane", email: "jane@example.com", age: 25 },
      ];

      mockCursor.toArray.mockResolvedValue(testDocuments);
      mockCollection.countDocuments.mockResolvedValue(2);

      const result = await crud.findMany();

      expect(result.success).toBe(true);
      expect(result.data).toEqual(testDocuments);
      expect(result.total).toBe(2);
    });

    it("should handle empty results", async () => {
      mockCursor.toArray.mockResolvedValue([]);
      mockCollection.countDocuments.mockResolvedValue(0);

      const result = await crud.findMany();

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
    });

    it("should handle database errors", async () => {
      mockCursor.toArray.mockRejectedValue(new Error("Query failed"));

      const result = await crud.findMany();

      expect(result.success).toBe(false);
      expect(result.data).toEqual([]);
      expect(result.error).toContain("Query failed");
    });
  });

  describe("updateById operation", () => {
    it("should update a document successfully", async () => {
      const testId = new ObjectId();
      const updateData = { $set: { name: "Updated Name" } };
      const updatedDocument = {
        _id: testId,
        name: "Updated Name",
        email: "john@example.com",
        age: 30,
      };

      mockCollection.updateOne.mockResolvedValue({
        acknowledged: true,
        modifiedCount: 1,
      });
      mockCollection.findOne.mockResolvedValue(updatedDocument);

      // @ts-ignore
      const result = await crud.updateById(testId, updateData);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(updatedDocument);
      expect(result.modifiedCount).toBe(1);
    });

    it("should handle validation errors", async () => {
      const testId = new ObjectId();
      const invalidUpdate = { $set: { email: "invalid-email" } };

      // @ts-ignore
      const result = await crud.updateById(testId, invalidUpdate);

      expect(result.success).toBe(false);
      expect(result.error).toContain("validation failed");
    });
  });

  describe("deleteById operation", () => {
    it("should delete a document successfully", async () => {
      const testId = new ObjectId();

      mockCollection.deleteOne.mockResolvedValue({
        acknowledged: true,
        deletedCount: 1,
      });

      // @ts-ignore
      const result = await crud.deleteById(testId);

      expect(result.success).toBe(true);
      expect(result.deletedCount).toBe(1);
    });

    it("should handle document not found", async () => {
      const testId = new ObjectId();

      mockCollection.deleteOne.mockResolvedValue({
        acknowledged: true,
        deletedCount: 0,
      });

      const result = await crud.deleteById(testId) as unknown as CrudDeleteResult;

      expect(result.success).toBe(true);
      expect(result.deletedCount).toBe(0);
    });
  });

  describe("utility methods", () => {
    it("should check if document exists", async () => {
      const testId = new ObjectId();
      mockCollection.countDocuments.mockResolvedValue(1);

      const result = await crud.exists(testId);

      expect(result).toBe(true);
      expect(mockCollection.countDocuments).toHaveBeenCalledWith({ _id: testId });
    });

    it("should count documents", async () => {
      mockCollection.countDocuments.mockResolvedValue(5);

      const result = await crud.count();

      expect(result).toBe(5);
    });

    it("should return collection instance", () => {
      const collection = crud.getCollection();
      expect(collection).toBe(mockCollection);
    });
  });

  describe("error handling", () => {
    it("should handle concurrent operations", async () => {
      const testData = {
        name: "Test User",
        email: "test@example.com",
        age: 25,
      };

      mockCollection.insertOne.mockResolvedValue({
        acknowledged: true,
        insertedId: new ObjectId(),
      });

      const promises = Array.from({ length: 3 }, () => crud.create(testData));
      const results = await Promise.all(promises);

      results.forEach((result) => {
        expect(result.success).toBe(true);
      });
      expect(mockCollection.insertOne).toHaveBeenCalledTimes(3);
    });

    it("should handle UUID identifiers", async () => {
      const crudWithUUID = new MongoCRUD(mockConnectionManager, TestSchema, {
        collectionName: "test-collection",
        useObjectId: false,
      });

      const testData = {
        name: "UUID User",
        email: "uuid@example.com",
        age: 30,
      };

      const uuidId = "550e8400-e29b-41d4-a716-446655440000";
      mockCollection.insertOne.mockResolvedValue({
        acknowledged: true,
        insertedId: uuidId,
      });

      const result = await crudWithUUID.create(testData);

      expect(result.success).toBe(true);
      expect(typeof result.data?._id).toBe("string");
      expect(result.id).toBe(uuidId);
    });
  });
});














