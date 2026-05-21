import fs from "fs";
import path from "path";
import { User, Course, Chunk, Quiz, QuizAttempt } from "./types.js";

// Database storage structure
interface DBStructure {
  users: (User & { passwordHash: string })[];
  courses: Course[];
  chunks: (Chunk & { embedding?: number[] })[];
  quizzes: Quiz[];
  attempts: QuizAttempt[];
}

const DB_DIR = path.join(process.cwd(), ".data");
const DB_FILE = path.join(DB_DIR, "db.json");

// Default initial database schema
const defaultDB: DBStructure = {
  users: [],
  courses: [],
  chunks: [],
  quizzes: [],
  attempts: [],
};

// Queue system to prevent simultaneous write corruptions
class DB {
  private memoryCache: DBStructure | null = null;
  private isWriting = false;
  private writeQueue: (() => void)[] = [];

  constructor() {
    this.init();
  }

  private init() {
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }
    if (!fs.existsSync(DB_FILE)) {
      fs.writeFileSync(DB_FILE, JSON.stringify(defaultDB, null, 2), "utf-8");
    }
  }

  public read(): DBStructure {
    if (this.memoryCache) {
      return this.memoryCache;
    }
    try {
      this.init();
      const content = fs.readFileSync(DB_FILE, "utf-8");
      this.memoryCache = JSON.parse(content);
      return this.memoryCache!;
    } catch (e) {
      console.error("Failed to read database, resetting to default:", e);
      return defaultDB;
    }
  }

  public write(data: DBStructure): Promise<void> {
    this.memoryCache = data;
    return new Promise((resolve) => {
      const executeWrite = () => {
        this.isWriting = true;
        try {
          this.init();
          fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf-8");
        } catch (e) {
          console.error("Database write error:", e);
        } finally {
          this.isWriting = false;
          resolve();
          if (this.writeQueue.length > 0) {
            const next = this.writeQueue.shift();
            if (next) next();
          }
        }
      };

      if (this.isWriting) {
        this.writeQueue.push(executeWrite);
      } else {
        executeWrite();
      }
    });
  }

  // Vector Cosine Similarity
  public cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length) return 0;
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  // Similarity query
  public similaritySearch(
    courseId: string,
    queryEmbedding: number[],
    limit = 5
  ): { chunk: Chunk; score: number }[] {
    const dbData = this.read();
    
    // Filter chunks by courseId that have embeddings
    const chunksWithEmbeddings = dbData.chunks.filter(
      (c) => c.courseId === courseId && c.embedding && c.embedding.length > 0
    );

    if (chunksWithEmbeddings.length === 0) {
      return [];
    }

    const scored = chunksWithEmbeddings.map((chunk) => {
      const score = this.cosineSimilarity(queryEmbedding, chunk.embedding!);
      
      // Separate embedding from returned chunk representation to minimize payload
      const { embedding, ...cleanChunk } = chunk;
      return {
        chunk: cleanChunk,
        score,
      };
    });

    // Sort by descending score
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }
}

export const db = new DB();
