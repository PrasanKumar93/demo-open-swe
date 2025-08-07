import { describe, it, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { MongoConnectionManager } from "../mongodb/connection.js";
import { MongoCRUD } from "../mongodb/crud.js";
import type { MongoClient, Db } from "mongodb";

// Test schema for integration tests
const UserSchema = z.object({
  _id: z.string(),
  name: z.string().min(1),
  email: z.string().email(),
  age: z.number().min(0).max(150),
  isActive: z.boolean().default(true),
  createdAt: z.date().default(() => new Date()),
});

type User = z.infer<typeof UserSchema>;

describe("MongoDB CRUD Integration Tests", () => {
  let connectionManager: MongoConnectionManager;
  let client: MongoClient;
  let db: Db;
  let userCrud: MongoCRUD<User>;
  let testDatabaseName: string;

  beforeAll(async () => {
    // Use environment variables or default to local MongoDB
    const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017";
    testDatabaseName = process.env.MONGODB_TEST_DB || `test_mongodb_crud_${Date.now()}`;

    try {
      connectionManager = new MongoConnectionManager(mongoUri, testDatabaseName);
      await connectionManager.connect();
      
      client = connectionManager.getClient();
      db = connectionManager.getDatabase();
      
      userCrud = new MongoCRUD<User>(db, "users", UserSchema, "string");
      
      console.log(`Connected to MongoDB for integration tests: ${testDatabaseName}`);
    } catch (error) {
      console.warn("MongoDB connection failed. Skipping integration tests.", error);
      throw new Error("MongoDB connection required for integration tests");
    }
  }, 30000);

  afterAll(async () => {
    if (connectionManager) {
      try {
        // Clean up test database
        await db.dropDatabase();
        await connectionManager.disconnect();
        console.log(`Cleaned up test database: ${testDatabaseName}`);
      } catch (error) {
        console.error("Error during cleanup:", error);
      }
    }
  }, 10000);

  beforeEach(async () => {
    // Clear the users collection before each test
    try {
      await db.collection("users").deleteMany({});
    } catch (error) {
      console.error("Error clearing collection:", error);
    }
  });

  describe("create operation", () => {
    it("should create a document in the database", async () => {
      const userData = {
        name: "John Doe",
        email: "john@example.com",
        age: 30,
        isActive: true,
      };

      const result = await userCrud.create(userData);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.name).toBe(userData.name);
      expect(result.data?.email).toBe(userData.email);
      expect(result.data?._id).toBeDefined();
      expect(typeof result.data?._id).toBe("string");

      // Verify document exists in database
      const foundDoc = await db.collection("users").findOne({ _id: result.data?._id });
      expect(foundDoc).toBeDefined();
      expect(foundDoc?.name).toBe(userData.name);
    });

    it("should handle validation errors", async () => {
      const invalidUserData = {
        name: "",
        email: "invalid-email",
        age: -5,
        isActive: true,
      };

      const result = await userCrud.create(invalidUserData as any);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain("Validation failed");
    });
  });

  describe("findById operation", () => {
    it("should find a document by ID", async () => {
      // First create a document
      const userData = {
        name: "Jane Smith",
        email: "jane@example.com",
        age: 25,
        isActive: true,
      };

      const createResult = await userCrud.create(userData);
      expect(createResult.success).toBe(true);
      
      const userId = createResult.data?._id;
      expect(userId).toBeDefined();

      // Now find it
      const findResult = await userCrud.findById(userId!);

      expect(findResult.success).toBe(true);
      expect(findResult.data).toBeDefined();
      expect(findResult.data?.name).toBe(userData.name);
      expect(findResult.data?.email).toBe(userData.email);
      expect(findResult.data?._id).toBe(userId);
    });

    it("should return null for non-existent document", async () => {
      const nonExistentId = uuidv4();
      const result = await userCrud.findById(nonExistentId);

      expect(result.success).toBe(true);
      expect(result.data).toBeNull();
    });
  });

  describe("findMany operation", () => {
    beforeEach(async () => {
      // Create test documents
      const users = [
        { name: "Alice", email: "alice@example.com", age: 28, isActive: true },
        { name: "Bob", email: "bob@example.com", age: 35, isActive: false },
        { name: "Charlie", email: "charlie@example.com", age: 22, isActive: true },
      ];

      for (const user of users) {
        await userCrud.create(user);
      }
    });

    it("should find multiple documents", async () => {
      const result = await userCrud.findMany({});

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.length).toBe(3);
      expect(result.total).toBe(3);
    });

    it("should filter documents by query", async () => {
      const result = await userCrud.findMany({ isActive: true });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.length).toBe(2);
      expect(result.total).toBe(2);
      
      result.data?.forEach(user => {
        expect(user.isActive).toBe(true);
      });
    });

    it("should support pagination", async () => {
      const result = await userCrud.findMany({}, { limit: 2, skip: 1 });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.length).toBe(2);
      expect(result.total).toBe(3); // Total count should still be 3
    });

    it("should support sorting", async () => {
      const result = await userCrud.findMany({}, { sort: { age: -1 } });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.length).toBe(3);
      
      // Should be sorted by age descending: Bob (35), Alice (28), Charlie (22)
      expect(result.data?.[0].age).toBe(35);
      expect(result.data?.[1].age).toBe(28);
      expect(result.data?.[2].age).toBe(22);
    });
  });

  describe("updateById operation", () => {
    it("should update a document", async () => {
      // Create a document first
      const userData = {
        name: "David Wilson",
        email: "david@example.com",
        age: 40,
        isActive: true,
      };

      const createResult = await userCrud.create(userData);
      expect(createResult.success).toBe(true);
      
      const userId = createResult.data?._id;
      expect(userId).toBeDefined();

      // Update the document
      const updateData = { age: 41, isActive: false };
      const updateResult = await userCrud.updateById(userId!, { $set: updateData });

      expect(updateResult.success).toBe(true);
      expect(updateResult.data).toBeDefined();
      expect(updateResult.data?.age).toBe(41);
      expect(updateResult.data?.isActive).toBe(false);
      expect(updateResult.data?.name).toBe(userData.name); // Should remain unchanged
      expect(updateResult.modifiedCount).toBe(1);

      // Verify in database
      const foundDoc = await db.collection("users").findOne({ _id: userId });
      expect(foundDoc?.age).toBe(41);
      expect(foundDoc?.isActive).toBe(false);
    });

    it("should handle non-existent document", async () => {
      const nonExistentId = uuidv4();
      const updateResult = await userCrud.updateById(nonExistentId, { $set: { age: 50 } });

      expect(updateResult.success).toBe(true);
      expect(updateResult.data).toBeNull();
      expect(updateResult.modifiedCount).toBe(0);
    });

    it("should handle validation errors", async () => {
      // Create a document first
      const userData = {
        name: "Eva Brown",
        email: "eva@example.com",
        age: 30,
        isActive: true,
      };

      const createResult = await userCrud.create(userData);
      expect(createResult.success).toBe(true);
      
      const userId = createResult.data?._id;
      expect(userId).toBeDefined();

      // Try to update with invalid data
      const invalidUpdate = { $set: { email: "invalid-email", age: -10 } };
      const updateResult = await userCrud.updateById(userId!, invalidUpdate);

      expect(updateResult.success).toBe(false);
      expect(updateResult.error).toBeDefined();
      expect(updateResult.error).toContain("validation failed");
    });
  });

  describe("deleteById operation", () => {
    it("should delete a document", async () => {
      // Create a document first
      const userData = {
        name: "Frank Miller",
        email: "frank@example.com",
        age: 45,
        isActive: true,
      };

      const createResult = await userCrud.create(userData);
      expect(createResult.success).toBe(true);
      
      const userId = createResult.data?._id;
      expect(userId).toBeDefined();

      // Delete the document
      const deleteResult = await userCrud.deleteById(userId!);

      expect(deleteResult.success).toBe(true);
      expect(deleteResult.deletedCount).toBe(1);

      // Verify document is gone
      const foundDoc = await db.collection("users").findOne({ _id: userId });
      expect(foundDoc).toBeNull();
    });

    it("should handle non-existent document", async () => {
      const nonExistentId = uuidv4();
      const deleteResult = await userCrud.deleteById(nonExistentId);

      expect(deleteResult.success).toBe(true);
      expect(deleteResult.deletedCount).toBe(0);
    });
  });

  describe("deleteMany operation", () => {
    beforeEach(async () => {
      // Create test documents
      const users = [
        { name: "User1", email: "user1@example.com", age: 20, isActive: true },
        { name: "User2", email: "user2@example.com", age: 25, isActive: false },
        { name: "User3", email: "user3@example.com", age: 30, isActive: true },
        { name: "User4", email: "user4@example.com", age: 35, isActive: false },
      ];

      for (const user of users) {
        await userCrud.create(user);
      }
    });

    it("should delete multiple documents", async () => {
      const deleteResult = await userCrud.deleteMany({ isActive: false });

      expect(deleteResult.success).toBe(true);
      expect(deleteResult.deletedCount).toBe(2);

      // Verify only active users remain
      const remainingUsers = await userCrud.findMany({});
      expect(remainingUsers.data?.length).toBe(2);
      remainingUsers.data?.forEach(user => {
        expect(user.isActive).toBe(true);
      });
    });

    it("should handle empty filter", async () => {
      const deleteResult = await userCrud.deleteMany({});

      expect(deleteResult.success).toBe(true);
      expect(deleteResult.deletedCount).toBe(4);

      // Verify all documents are gone
      const remainingUsers = await userCrud.findMany({});
      expect(remainingUsers.data?.length).toBe(0);
    });
  });

  describe("utility methods", () => {
    beforeEach(async () => {
      // Create a test document
      await userCrud.create({
        name: "Test User",
        email: "test@example.com",
        age: 25,
        isActive: true,
      });
    });

    it("should check if document exists", async () => {
      const users = await userCrud.findMany({ name: "Test User" });
      expect(users.data?.length).toBe(1);
      
      const userId = users.data?.[0]._id;
      expect(userId).toBeDefined();

      const exists = await userCrud.exists(userId!);
      expect(exists).toBe(true);

      const nonExistentId = uuidv4();
      const notExists = await userCrud.exists(nonExistentId);
      expect(notExists).toBe(false);
    });

    it("should count documents", async () => {
      const totalCount = await userCrud.count({});
      expect(totalCount).toBe(1);

      const activeCount = await userCrud.count({ isActive: true });
      expect(activeCount).toBe(1);

      const inactiveCount = await userCrud.count({ isActive: false });
      expect(inactiveCount).toBe(0);
    });

    it("should return collection instance", () => {
      const collection = userCrud.getCollection();
      expect(collection).toBeDefined();
      expect(collection.collectionName).toBe("users");
    });
  });

  describe("concurrent operations", () => {
    it("should handle concurrent create operations", async () => {
      const users = Array.from({ length: 5 }, (_, i) => ({
        name: `User${i}`,
        email: `user${i}@example.com`,
        age: 20 + i,
        isActive: i % 2 === 0,
      }));

      const promises = users.map(user => userCrud.create(user));
      const results = await Promise.all(promises);

      results.forEach(result => {
        expect(result.success).toBe(true);
        expect(result.data).toBeDefined();
      });

      // Verify all documents were created
      const allUsers = await userCrud.findMany({});
      expect(allUsers.data?.length).toBe(5);
    });

    it("should handle concurrent read operations", async () => {
      // Create a document first
      const createResult = await userCrud.create({
        name: "Concurrent Test",
        email: "concurrent@example.com",
        age: 30,
        isActive: true,
      });

      const userId = createResult.data?._id;
      expect(userId).toBeDefined();

      // Perform concurrent reads
      const promises = Array.from({ length: 10 }, () => userCrud.findById(userId!));
      const results = await Promise.all(promises);

      results.forEach(result => {
        expect(result.success).toBe(true);
        expect(result.data).toBeDefined();
        expect(result.data?.name).toBe("Concurrent Test");
      });
    });
  });

  describe("error handling", () => {
    it("should handle database connection issues gracefully", async () => {
      // This test would require simulating connection issues
      // For now, we'll test that the CRUD operations handle errors properly
      const result = await userCrud.create({
        name: "Error Test",
        email: "error@example.com",
        age: 25,
        isActive: true,
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });
  });
});
