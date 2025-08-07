import { describe, it, expect, beforeEach, afterEach, jest } from "@jest/globals";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { MongoCRUD } from "../mongodb/crud.js";
import { MongoConnectionManager } from "../mongodb/connection.js";

// Mock MongoDB
jest.mock("mongodb", () => ({
  ObjectId: jest.requireActual("mongodb").ObjectId,
  MongoClient: jest.fn(),
}));

// Test schema
const TestSchema = z.object({
  _id: z.union([z.instanceof(ObjectId), z.string()]),
  name: z.string(),
  email: z.string().email(),
  age: z.number().min(0),
  isActive: z.boolean().optional(),
  createdAt: z.date().optional(),
});

type TestDocument = z.infer<typeof TestSchema>;

describe("MongoCRUD", () => {
  let crud: MongoCRUD<TestDocument>;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Setup default mock behaviors
    mockCollection.find.mockReturnValue(mockCursor);
    mockCursor.toArray.mockResolvedValue([]);
    mockCollection.countDocuments.mockResolvedValue(0);

    // Create CRUD instance
    crud = new MongoCRUD(mockConnectionManager, TestSchema, {
      collectionName: "test-collection",
      useObjectId: true,
    });
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe("create", () => {
    it("should create a document successfully with ObjectId", async () => {
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
      expect(result.data?._id).toBeDefined();
      expect(result.data?.name).toBe(testData.name);
      expect(result.data?.email).toBe(testData.email);
      expect(result.data?.age).toBe(testData.age);
      expect(result.id).toBe(insertedId);
      expect(mockCollection.insertOne).toHaveBeenCalledTimes(1);
    });

    it("should create a document successfully with UUID", async () => {
      const crudWithUUID = new MongoCRUD(mockConnectionManager, TestSchema, {
        collectionName: "test-collection",
        useObjectId: false,
      });

      const testData = {
        name: "Jane Doe",
        email: "jane@example.com",
        age: 25,
      };

      const insertedId = "550e8400-e29b-41d4-a716-446655440000";
      mockCollection.insertOne.mockResolvedValue({
        acknowledged: true,
        insertedId,
      });

      const result = await crudWithUUID.create(testData);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(typeof result.data?._id).toBe("string");
      expect(result.id).toBe(insertedId);
    });

    it("should handle validation errors", async () => {
      const invalidData = {
        name: "John Doe",
        email: "invalid-email", // Invalid email format
        age: -5, // Invalid age (negative)
      };

      const result = await crud.create(invalidData);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Validation failed");
      expect(mockCollection.insertOne).not.toHaveBeenCalled();
    });

    it("should handle database insertion errors", async () => {
      const testData = {
        name: "John Doe",
        email: "john@example.com",
        age: 30,
      };

      mockCollection.insertOne.mockRejectedValue(new Error("Database connection failed"));

      const result = await crud.create(testData);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Database connection failed");
    });

    it("should handle unacknowledged insert", async () => {
      const testData = {
        name: "John Doe",
        email: "john@example.com",
        age: 30,
      };

      mockCollection.insertOne.mockResolvedValue({
        acknowledged: false,
        insertedId: new ObjectId(),
      });

      const result = await crud.create(testData);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Insert operation was not acknowledged");
    });
  });

  describe("findById", () => {
    it("should find a document by ObjectId", async () => {
      const testId = new ObjectId();
      const testDocument = {
        _id: testId,
        name: "John Doe",
        email: "john@example.com",
        age: 30,
        isActive: true,
      };

      mockCollection.findOne.mockResolvedValue(testDocument);

      const result = await crud.findById(testId);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(testDocument);
      expect(mockCollection.findOne).toHaveBeenCalledWith({ _id: testId });
    });

    it("should find a document by string ObjectId", async () => {
      const testId = new ObjectId();
      const testIdString = testId.toString();
      const testDocument = {
        _id: testId,
        name: "John Doe",
        email: "john@example.com",
        age: 30,
      };

      mockCollection.findOne.mockResolvedValue(testDocument);

      const result = await crud.findById(testIdString);

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
      expect(result.data).toBeUndefined();
    });

    it("should handle invalid ObjectId", async () => {
      const invalidId = "invalid-object-id";

      const result = await crud.findById(invalidId);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid ObjectId");
    });

    it("should handle database errors", async () => {
      const testId = new ObjectId();
      mockCollection.findOne.mockRejectedValue(new Error("Database error"));

      const result = await crud.findById(testId);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Database error");
    });
  });

  describe("findMany", () => {
    it("should find multiple documents with default options", async () => {
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
      expect(mockCollection.find).toHaveBeenCalledWith({}, {});
      expect(mockCursor.limit).toHaveBeenCalledWith(100);
    });

    it("should find documents with custom filter and options", async () => {
      const filter = { age: { $gte: 25 } };
      const options = { limit: 10, skip: 5, sort: { name: 1 as const } };
      const testDocuments = [
        { _id: new ObjectId(), name: "John", email: "john@example.com", age: 30 },
      ];

      mockCursor.toArray.mockResolvedValue(testDocuments);
      mockCollection.countDocuments.mockResolvedValue(1);

      const result = await crud.findMany(filter, options);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(testDocuments);
      expect(result.total).toBe(1);
      expect(mockCollection.find).toHaveBeenCalledWith(filter, { sort: { name: 1 } });
      expect(mockCursor.skip).toHaveBeenCalledWith(5);
      expect(mockCursor.limit).toHaveBeenCalledWith(10);
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
      expect(result.total).toBe(0);
      expect(result.error).toContain("Query failed");
    });
  });

  describe("updateById", () => {
    it("should update a document successfully", async () => {
      const testId = new ObjectId();
      const updateData = { $set: { name: "Updated Name", age: 35 } };
      const updatedDocument = {
        _id: testId,
        name: "Updated Name",
        email: "john@example.com",
        age: 35,
      };

      mockCollection.updateOne.mockResolvedValue({
        acknowledged: true,
        modifiedCount: 1,
        matchedCount: 1,
      });
      mockCollection.findOne.mockResolvedValue(updatedDocument);

      const result = await crud.updateById(testId, updateData);

      expect((result as CrudUpdateResult<TestDocument>).success).toBe(true);
      expect((result as CrudUpdateResult<TestDocument>).data).toEqual(updatedDocument);
      expect((result as CrudUpdateResult<TestDocument>).modifiedCount).toBe(1);
      expect(mockCollection.updateOne).toHaveBeenCalledWith({ _id: testId }, updateData);
    });

    it("should handle validation errors in update data", async () => {
      const testId = new ObjectId();
      const invalidUpdateData = { $set: { email: "invalid-email", age: -5 } };

      const result = await crud.updateById(testId, invalidUpdateData);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Update validation failed");
      expect(mockCollection.updateOne).not.toHaveBeenCalled();
    });

    it("should handle document not found for update", async () => {
      const testId = new ObjectId();
      const updateData = { $set: { name: "Updated Name" } };

      mockCollection.updateOne.mockResolvedValue({
        acknowledged: true,
        modifiedCount: 0,
        matchedCount: 0,
      });
      mockCollection.findOne.mockResolvedValue(null);

      const result = await crud.updateById(testId, updateData);

      expect(result.success).toBe(true);
      expect(result.modifiedCount).toBe(0);
      expect(result.data).toBeUndefined();
    });

    it("should handle unacknowledged update", async () => {
      const testId = new ObjectId();
      const updateData = { $set: { name: "Updated Name" } };

      mockCollection.updateOne.mockResolvedValue({
        acknowledged: false,
        modifiedCount: 0,
        matchedCount: 0,
      });

      const result = await crud.updateById(testId, updateData);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Update operation was not acknowledged");
    });

    it("should handle database errors", async () => {
      const testId = new ObjectId();
      const updateData = { $set: { name: "Updated Name" } };

      mockCollection.updateOne.mockRejectedValue(new Error("Update failed"));

      const result = await crud.updateById(testId, updateData);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Update failed");
    });
  });

  describe("deleteById", () => {
    it("should delete a document successfully", async () => {
      const testId = new ObjectId();

      mockCollection.deleteOne.mockResolvedValue({
        acknowledged: true,
        deletedCount: 1,
      });

      const result = await crud.deleteById(testId);

      expect(result.success).toBe(true);
      expect(result.deletedCount).toBe(1);
      expect(mockCollection.deleteOne).toHaveBeenCalledWith({ _id: testId });
    });

    it("should handle document not found for deletion", async () => {
      const testId = new ObjectId();

      mockCollection.deleteOne.mockResolvedValue({
        acknowledged: true,
        deletedCount: 0,
      });

      const result = await crud.deleteById(testId);

      expect(result.success).toBe(true);
      expect(result.deletedCount).toBe(0);
    });

    it("should handle unacknowledged delete", async () => {
      const testId = new ObjectId();

      mockCollection.deleteOne.mockResolvedValue({
        acknowledged: false,
        deletedCount: 0,
      });

      const result = await crud.deleteById(testId);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Delete operation was not acknowledged");
    });

    it("should handle database errors", async () => {
      const testId = new ObjectId();

      mockCollection.deleteOne.mockRejectedValue(new Error("Delete failed"));

      const result = await crud.deleteById(testId);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Delete failed");
    });
  });

  describe("deleteMany", () => {
    it("should delete multiple documents successfully", async () => {
      const filter = { isActive: false };

      mockCollection.deleteMany.mockResolvedValue({
        acknowledged: true,
        deletedCount: 3,
      });

      const result = await crud.deleteMany(filter);

      expect(result.success).toBe(true);
      expect(result.deletedCount).toBe(3);
      expect(mockCollection.deleteMany).toHaveBeenCalledWith(filter);
    });

    it("should handle no documents found for deletion", async () => {
      const filter = { isActive: false };

      mockCollection.deleteMany.mockResolvedValue({
        acknowledged: true,
        deletedCount: 0,
      });

      const result = await crud.deleteMany(filter);

      expect(result.success).toBe(true);
      expect(result.deletedCount).toBe(0);
    });

    it("should handle database errors", async () => {
      const filter = { isActive: false };

      mockCollection.deleteMany.mockRejectedValue(new Error("Bulk delete failed"));

      const result = await crud.deleteMany(filter);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Bulk delete failed");
    });
  });

  describe("exists", () => {
    it("should return true when document exists", async () => {
      const testId = new ObjectId();
      mockCollection.countDocuments.mockResolvedValue(1);

      const result = await crud.exists(testId);

      expect(result).toBe(true);
      expect(mockCollection.countDocuments).toHaveBeenCalledWith({ _id: testId });
    });

    it("should return false when document does not exist", async () => {
      const testId = new ObjectId();
      mockCollection.countDocuments.mockResolvedValue(0);

      const result = await crud.exists(testId);

      expect(result).toBe(false);
    });

    it("should return false on database errors", async () => {
      const testId = new ObjectId();
      mockCollection.countDocuments.mockRejectedValue(new Error("Database error"));

      const result = await crud.exists(testId);

      expect(result).toBe(false);
    });
  });

  describe("count", () => {
    it("should count documents with filter", async () => {
      const filter = { isActive: true };
      mockCollection.countDocuments.mockResolvedValue(5);

      const result = await crud.count(filter);

      expect(result).toBe(5);
      expect(mockCollection.countDocuments).toHaveBeenCalledWith(filter);
    });

    it("should count all documents without filter", async () => {
      mockCollection.countDocuments.mockResolvedValue(10);

      const result = await crud.count();

      expect(result).toBe(10);
      expect(mockCollection.countDocuments).toHaveBeenCalledWith({});
    });

    it("should return 0 on database errors", async () => {
      mockCollection.countDocuments.mockRejectedValue(new Error("Count failed"));

      const result = await crud.count();

      expect(result).toBe(0);
    });
  });

  describe("getCollection", () => {
    it("should return the MongoDB collection", () => {
      const collection = crud.getCollection();

      expect(collection).toBe(mockCollection);
    });
  });

  describe("Edge cases and error handling", () => {
    it("should handle malformed ObjectId strings", async () => {
      const malformedId = "not-a-valid-objectid";

      const result = await crud.findById(malformedId);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid ObjectId");
    });

    it("should handle empty update operations", async () => {
      const testId = new ObjectId();
      const emptyUpdate = {};

      mockCollection.updateOne.mockResolvedValue({
        acknowledged: true,
        modifiedCount: 0,
        matchedCount: 1,
      });

      const result = await crud.updateById(testId, emptyUpdate);

      expect(result.success).toBe(true);
      expect(result.modifiedCount).toBe(0);
    });

    it("should handle very large result sets", async () => {
      const largeResultSet = Array.from({ length: 1000 }, (_, i) => ({
        _id: new ObjectId(),
        name: `User ${i}`,
        email: `user${i}@example.com`,
        age: 20 + (i % 50),
      }));

      mockCursor.toArray.mockResolvedValue(largeResultSet);
      mockCollection.countDocuments.mockResolvedValue(1000);

      const result = await crud.findMany({}, { limit: 1000 });

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1000);
      expect(result.total).toBe(1000);
    });

    it("should handle concurrent operations", async () => {
      const testData = {
        name: "Concurrent User",
        email: "concurrent@example.com",
        age: 30,
      };

      mockCollection.insertOne.mockResolvedValue({
        acknowledged: true,
        insertedId: new ObjectId(),
      });

      // Simulate concurrent create operations
      const promises = Array.from({ length: 5 }, () => crud.create(testData));
      const results = await Promise.all(promises);

      results.forEach((result) => {
        expect(result.success).toBe(true);
      });
      expect(mockCollection.insertOne).toHaveBeenCalledTimes(5);
    });
  });
});







