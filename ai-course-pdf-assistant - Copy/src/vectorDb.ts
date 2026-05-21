import { Pinecone } from "@pinecone-database/pinecone";
import { SearchResult, ChunkWithEmbedding } from "./types.js";

/**
 * Pinecone Vector Database Service
 * Manages vector storage and semantic search
 */
class VectorDatabaseService {
  private pinecone: Pinecone | null = null;
  private indexName: string;
  private dimension: number = 384; // all-MiniLM-L6-v2 dimension
  private isInitialized: boolean = false;

  constructor() {
    this.indexName = process.env.PINECONE_INDEX_NAME || "ai-course-assistant";

    if (process.env.PINECONE_API_KEY) {
      this.pinecone = new Pinecone({
        apiKey: process.env.PINECONE_API_KEY,
      });
      console.log("[VECTOR_DB] Pinecone client initialized");
    } else {
      console.warn("[VECTOR_DB] ⚠️ PINECONE_API_KEY not set. Vector DB features disabled.");
    }
  }

  /**
   * Initialize vector database index
   */
  async initialize(): Promise<void> {
    if (this.isInitialized || !this.pinecone) {
      return;
    }

    try {
      console.log("[VECTOR_DB] Initializing index...");

      // Check if index exists
      const indexList = await this.pinecone.listIndexes();
      const indexExists = indexList.indexes?.some((idx) => idx.name === this.indexName);

      if (!indexExists) {
        console.log(`[VECTOR_DB] Creating index: ${this.indexName}`);
        await this.pinecone.createIndex({
          name: this.indexName,
          dimension: this.dimension,
          metric: "cosine",
          spec: {
            serverless: {
              cloud: "aws",
              region: process.env.PINECONE_ENVIRONMENT || "us-west-2",
            },
          },
        });

        // Wait for index to be ready
        console.log("[VECTOR_DB] Waiting for index to be ready (60s)...");
        await new Promise((resolve) => setTimeout(resolve, 60000));
      } else {
        console.log(`[VECTOR_DB] Index ${this.indexName} already exists`);
      }

      this.isInitialized = true;
      console.log("[VECTOR_DB] ✅ Initialization complete");
    } catch (error: any) {
      console.error("[VECTOR_DB] Initialization failed:", error.message);
      throw error;
    }
  }

  /**
   * Upsert embeddings to Pinecone
   */
  async upsertEmbeddings(
    courseId: string,
    embeddings: Array<{
      id: string;
      values: number[];
      metadata: {
        courseId: string;
        chunkId: string;
        text: string;
        pageNumber: number;
      };
    }>
  ): Promise<void> {
    try {
      if (!this.pinecone) {
        console.warn("[VECTOR_DB] Pinecone not configured, skipping upsert");
        return;
      }

      const index = this.pinecone.index(this.indexName);

      // Split into batches (Pinecone limits batch size)
      const batchSize = 100;
      for (let i = 0; i < embeddings.length; i += batchSize) {
        const batch = embeddings.slice(i, i + batchSize);
        await index.upsert(batch, { namespace: courseId });

        if (i + batchSize < embeddings.length) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }

      console.log(`[VECTOR_DB] Upserted ${embeddings.length} embeddings for course ${courseId}`);
    } catch (error: any) {
      console.error("[VECTOR_DB] Upsert failed:", error.message);
      throw error;
    }
  }

  /**
   * Query similar vectors using semantic search
   */
  async querySimilar(
    courseId: string,
    queryVector: number[],
    topK: number = 5,
    threshold: number = 0.5
  ): Promise<SearchResult[]> {
    try {
      if (!this.pinecone) {
        console.warn("[VECTOR_DB] Pinecone not configured, returning empty results");
        return [];
      }

      const index = this.pinecone.index(this.indexName);

      const results = await index.query({
        vector: queryVector,
        topK,
        namespace: courseId,
        includeMetadata: true,
      });

      return (results.matches || [])
        .filter((match) => (match.score || 0) >= threshold)
        .map((match) => ({
          chunk: {
            id: match.metadata?.chunkId as string,
            courseId: match.metadata?.courseId as string,
            text: match.metadata?.text as string,
            pageNumber: (match.metadata?.pageNumber as number) || 1,
            index: 0,
            embeddingId: match.id,
            embedding: match.values,
          },
          score: match.score || 0,
        }));
    } catch (error: any) {
      console.error("[VECTOR_DB] Query failed:", error.message);
      throw error;
    }
  }

  /**
   * Delete embeddings for a course
   */
  async deleteCoursEmbeddings(courseId: string): Promise<void> {
    try {
      if (!this.pinecone) {
        console.warn("[VECTOR_DB] Pinecone not configured, skipping delete");
        return;
      }

      const index = this.pinecone.index(this.indexName);
      await index.deleteMany([], { namespace: courseId });

      console.log(`[VECTOR_DB] Deleted embeddings for course ${courseId}`);
    } catch (error: any) {
      console.error("[VECTOR_DB] Delete failed:", error.message);
      throw error;
    }
  }

  /**
   * Check if vector DB is available
   */
  isAvailable(): boolean {
    return this.pinecone !== null;
  }
}

export const vectorDb = new VectorDatabaseService();
