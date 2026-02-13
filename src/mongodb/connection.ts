import { MongoClient, MongoClientOptions, Db } from "mongodb";

export interface MongoConnectionConfig {
  uri: string;
  dbName: string;
  options?: MongoClientOptions;
}

export class MongoConnectionManager {
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private config: MongoConnectionConfig;
  private isConnected = false;
  private isConnecting = false;

  constructor(config?: Partial<MongoConnectionConfig>) {
    this.config = {
      uri: config?.uri || process.env.MONGODB_URI || "mongodb://localhost:27017",
      dbName: config?.dbName || process.env.MONGODB_DB_NAME || "test",
      options: {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        ...config?.options,
      },
    };
  }

  async connect(): Promise<Db> {
    if (this.isConnected && this.db) {
      return this.db;
    }

    if (this.isConnecting) {
      // Wait for existing connection attempt
      while (this.isConnecting) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (this.db) {
        return this.db;
      }
    }

    this.isConnecting = true;

    try {
      this.client = new MongoClient(this.config.uri, this.config.options);
      await this.client.connect();
      this.db = this.client.db(this.config.dbName);
      this.isConnected = true;
      this.isConnecting = false;

      // Set up graceful shutdown handlers
      this.setupShutdownHandlers();

      return this.db;
    } catch (error) {
      this.isConnecting = false;
      throw new Error(`Failed to connect to MongoDB: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.db = null;
      this.isConnected = false;
    }
  }

  getDb(): Db {
    if (!this.db || !this.isConnected) {
      throw new Error("MongoDB connection not established. Call connect() first.");
    }
    return this.db;
  }

  getClient(): MongoClient {
    if (!this.client || !this.isConnected) {
      throw new Error("MongoDB connection not established. Call connect() first.");
    }
    return this.client;
  }

  isConnectionActive(): boolean {
    return this.isConnected && this.client !== null && this.db !== null;
  }

  async ping(): Promise<boolean> {
    try {
      if (!this.isConnected || !this.db) {
        return false;
      }
      await this.db.admin().ping();
      return true;
    } catch {
      return false;
    }
  }

  private setupShutdownHandlers(): void {
    const shutdown = async () => {
      try {
        await this.disconnect();
        process.exit(0);
      } catch (error) {
        console.error("Error during MongoDB shutdown:", error);
        process.exit(1);
      }
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
    process.on("SIGQUIT", shutdown);
  }
}

// Singleton instance for global use
let globalConnectionManager: MongoConnectionManager | null = null;

export function getConnectionManager(config?: Partial<MongoConnectionConfig>): MongoConnectionManager {
  if (!globalConnectionManager) {
    globalConnectionManager = new MongoConnectionManager(config);
  }
  return globalConnectionManager;
}

export function resetConnectionManager(): void {
  globalConnectionManager = null;
}
