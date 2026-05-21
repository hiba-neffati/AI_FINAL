import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import path from "path";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import multer from "multer";
import { createServer as createViteServer } from "vite";
import { createRequire } from "module";
import { Groq } from "groq-sdk";
import fs from "fs";
import { exec } from "child_process";

const require = createRequire(import.meta.url);
const PDFParser = require("pdf2json");

import { db } from "./src/db.js";
import {
  User,
  Course,
  Chunk,
  Quiz,
  QuizAttempt,
  Message,
  GroundingReference,
  ChunkWithEmbedding,
} from "./src/types.js";
import { vectorDb } from "./src/vectorDb.js";
import { embeddingService } from "./src/embeddings.js";
import { semanticSearch } from "./src/semanticSearch.js";
import { smartChunkingService } from "./src/smartChunking.js";
import { responseValidationService } from "./src/responseValidation.js";
import { bm25Search } from "./src/bm25Search.js";
import { queryExpansionService } from "./src/queryExpansion.js";
import { rerankerService } from "./src/reranker.js";

console.log("Environment check:");
console.log("- GROQ_API_KEY exists:", !!process.env.GROQ_API_KEY);
console.log(
  "- GROQ_API_KEY starts with:",
  process.env.GROQ_API_KEY?.substring(0, 10) + "...",
);
console.log("- JWT_SECRET exists:", !!process.env.JWT_SECRET);
console.log("- PINECONE_API_KEY exists:", !!process.env.PINECONE_API_KEY);
console.log(
  "- HUGGINGFACE_API_TOKEN exists:",
  !!process.env.HUGGINGFACE_API_TOKEN,
);

const JWT_SECRET =
  process.env.JWT_SECRET || "course-pdf-agent-secret-key-998811";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));

  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
  });

  const authenticateToken = (
    req: Request & { user?: any },
    res: Response,
    next: NextFunction,
  ) => {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({ error: "Access token is missing" });
    }

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
      if (err) {
        return res.status(403).json({ error: "Invalid or expired token" });
      }
      req.user = decoded;
      next();
    });
  };

  app.post("/api/auth/register", async (req: Request, res: Response) => {
    try {
      const { name, email, password } = req.body;
      if (!name || !email || !password) {
        return res
          .status(400)
          .json({ error: "Name, email, and password are required" });
      }

      const dbData = db.read();
      const exists = dbData.users.find(
        (u) => u.email.toLowerCase() === email.toLowerCase(),
      );
      if (exists) {
        return res.status(400).json({ error: "Email is already registered" });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const newUser = {
        id: "usr_" + Math.random().toString(36).substring(2, 11),
        email: email.toLowerCase(),
        name,
        createdAt: new Date().toISOString(),
      };

      dbData.users.push({ ...newUser, passwordHash });
      await db.write(dbData);

      const token = jwt.sign(
        { id: newUser.id, email: newUser.email, name: newUser.name },
        JWT_SECRET,
        {
          expiresIn: "24h",
        },
      );

      res.status(201).json({ token, user: newUser });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res
          .status(400)
          .json({ error: "Email and password are required" });
      }

      const dbData = db.read();
      const userRecord = dbData.users.find(
        (u) => u.email.toLowerCase() === email.toLowerCase(),
      );
      if (!userRecord) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      const isValidPassword = await bcrypt.compare(
        password,
        userRecord.passwordHash,
      );
      if (!isValidPassword) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      const user = {
        id: userRecord.id,
        email: userRecord.email,
        name: userRecord.name,
        createdAt: userRecord.createdAt,
      };

      const token = jwt.sign(
        { id: user.id, email: user.email, name: user.name },
        JWT_SECRET,
        {
          expiresIn: "24h",
        },
      );

      res.json({ token, user });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post(
    "/api/transcribe",
    authenticateToken,
    upload.single("audio"),
    async (req: Request, res: Response) => {
      try {
        if (!req.file) {
          return res.status(400).json({ error: "No audio file uploaded" });
        }

        // write buffer to temp file
        const tempFilename = `temp_audio_${Date.now()}_${Math.random().toString(36).substring(7)}.webm`;
        const tempPath = path.join(process.cwd(), tempFilename);
        
        fs.writeFileSync(tempPath, req.file.buffer);
        console.log(`[TRANSCRIBE] Saved temp audio: ${tempPath} (${req.file.size} bytes)`);

        // Call the python script wrapped in a promise
        try {
          const { stdout, stderr } = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
            exec(`python transcribe.py "${tempPath}"`, { timeout: 120000 }, (error, stdout, stderr) => {
              if (error) {
                reject({ error, stdout, stderr });
              } else {
                resolve({ stdout, stderr });
              }
            });
          });

          // Clean up temp file
          if (fs.existsSync(tempPath)) {
            fs.unlinkSync(tempPath);
          }

          if (stderr) {
            console.warn("[TRANSCRIBE] Python stderr:", stderr);
          }
          console.log("[TRANSCRIBE] Python stdout:", stdout);

          if (!stdout || !stdout.trim()) {
            return res.status(500).json({ error: "Transcription returned empty output" });
          }

          // Find the last non-empty line (the JSON output)
          const lines = stdout.split("\n").filter(l => l.trim() !== "");
          const jsonString = lines[lines.length - 1];

          try {
            const result = JSON.parse(jsonString);
            if (result.error) {
              return res.status(500).json({ error: result.error });
            }
            return res.json({ text: result.text });
          } catch (parseErr) {
            console.error("[TRANSCRIBE] Failed to parse JSON from stdout:", jsonString);
            return res.status(500).json({ error: "Failed to parse transcription output" });
          }
        } catch (execError: any) {
          // Clean up temp file on error too
          if (fs.existsSync(tempPath)) {
            fs.unlinkSync(tempPath);
          }

          console.error("[TRANSCRIBE] exec error:", execError.error?.message || execError);
          if (execError.stderr) console.error("[TRANSCRIBE] stderr:", execError.stderr);
          if (execError.stdout) console.log("[TRANSCRIBE] stdout:", execError.stdout);

          return res.status(500).json({ 
            error: "Failed to transcribe audio. Ensure Python and faster-whisper are installed and 'python' is on PATH." 
          });
        }
      } catch (err: any) {
        console.error("[TRANSCRIBE] Unexpected error:", err);
        return res.status(500).json({ error: err.message });
      }
    }
  );

  app.get(
    "/api/dashboard/stats",
    authenticateToken,
    async (req: Request & { user?: any }, res: Response) => {
      try {
        const userId = req.user.id;
        const dbData = db.read();

        const userCourses = dbData.courses.filter((c) => c.userId === userId);
        const courseIds = userCourses.map((c) => c.id);

        const totalCourses = userCourses.length;
        const userChunks = dbData.chunks.filter((ch) =>
          courseIds.includes(ch.courseId),
        );
        const totalChunks = userChunks.length;

        const userQuizzes = dbData.quizzes.filter((q) =>
          courseIds.includes(q.courseId),
        );
        const totalQuizzes = userQuizzes.length;

        const userAttempts = dbData.attempts.filter((att) =>
          courseIds.includes(att.courseId),
        );
        const totalAttempts = userAttempts.length;

        let avgQuizScore = 0;
        if (totalAttempts > 0) {
          const sum = userAttempts.reduce(
            (acc, att) => acc + (att.score / att.total) * 100,
            0,
          );
          avgQuizScore = Math.round(sum / totalAttempts);
        }

        res.json({
          totalCourses,
          totalChunks,
          totalQuizzes,
          totalAttempts,
          avgQuizScore,
          recentAttempts: userAttempts.slice(-5).reverse(),
        });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    },
  );

  app.get(
    "/api/courses",
    authenticateToken,
    async (req: Request & { user?: any }, res: Response) => {
      try {
        const userId = req.user.id;
        const dbData = db.read();
        const userCourses = dbData.courses.filter((c) => c.userId === userId);
        res.json(userCourses);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    },
  );

  app.post(
    "/api/courses/upload",
    authenticateToken,
    upload.single("file"),
    async (req: Request & { user?: any }, res: Response) => {
      try {
        const userId = req.user.id;
        if (!req.file) {
          return res.status(400).json({ error: "No file was uploaded" });
        }

        const originalName = req.file.originalname;
        const fileSize = req.file.size;

        console.log(`Uploaded file: ${originalName} (${fileSize} bytes)`);

        const courseId = "crs_" + Math.random().toString(36).substring(2, 11);
        const newCourse: Course = {
          id: courseId,
          userId,
          title: originalName.replace(/\.pdf$/i, ""),
          fileName: originalName,
          fileSize,
          pageCount: 0,
          createdAt: new Date().toISOString(),
          isProcessing: true,
          statusMessage: "Processing PDF...",
        };

        const dbData = db.read();
        dbData.courses.push(newCourse);
        await db.write(dbData);

        res.status(202).json(newCourse);

        setTimeout(async () => {
          try {
            console.log(`\n=== STARTING PDF PROCESSING ===`);

            const fileBuffer = req.file!.buffer;

            // Create a promise to handle PDF parsing
            const extractTextFromPDF = (buffer: Buffer): Promise<string> => {
              return new Promise((resolve, reject) => {
                const pdfParser = new PDFParser();

                pdfParser.on("pdfParser_dataError", (err: any) => {
                  reject(err);
                });

                pdfParser.on("pdfParser_dataReady", (pdfData: any) => {
                  let fullText = "";
                  if (pdfData && pdfData.Pages) {
                    for (const page of pdfData.Pages) {
                      if (page.Texts) {
                        for (const text of page.Texts) {
                          if (text.R) {
                            for (const line of text.R) {
                              if (line.T) {
                                try {
                                  fullText += decodeURIComponent(line.T) + " ";
                                } catch (err) {
                                  // If decoding fails, use the raw text
                                  fullText += line.T + " ";
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                  resolve(fullText);
                });

                pdfParser.parseBuffer(buffer);
              });
            };

            const extractedText = await extractTextFromPDF(fileBuffer);

            console.log(`Text extracted: ${extractedText.length} characters`);
            console.log(`First 200 chars: ${extractedText.substring(0, 200)}`);

            if (extractedText.length < 50) {
              console.log(
                `WARNING: Very little text found! PDF might be scanned images.`,
              );
            }

            // ===== SMART CHUNKING (NEW) =====
            console.log(
              `[PDF_PROCESSING] Applying smart chunking with semantic boundaries...`,
            );
            const smartChunks = smartChunkingService.smartChunk(extractedText);

            const enrichedChunks: ChunkWithEmbedding[] = [];

            for (let i = 0; i < smartChunks.length; i++) {
              enrichedChunks.push({
                id: `chk_${courseId}_${i}`,
                courseId,
                text: smartChunks[i].text,
                pageNumber: 1,
                index: i,
                embeddingModel: embeddingService.getConfig().model,
                embeddingTimestamp: new Date().toISOString(),
                // Metadata for filtering (NEW)
                chapter: `Chapter 1`, // TODO: extract real chapters from PDF
                topic: "General", // TODO: classify topics
                difficulty: "intermediate", // TODO: infer difficulty
                section: `Section ${i}`,
              });
            }

            console.log(
              `[PDF_PROCESSING] Created ${enrichedChunks.length} smart chunks`,
            );

            // Generate embeddings in batch
            console.log(
              `[PDF_PROCESSING] Generating embeddings for ${enrichedChunks.length} chunks...`,
            );
            let embeddings: number[][] = [];

            if (embeddingService && enrichedChunks.length > 0) {
              try {
                embeddings = await embeddingService.generateEmbeddingsBatch(
                  enrichedChunks.map((c) => c.text),
                );

                // Attach embeddings to chunks
                for (let i = 0; i < enrichedChunks.length; i++) {
                  enrichedChunks[i].embedding = embeddings[i];
                }

                console.log(
                  `[PDF_PROCESSING] ✅ Generated ${embeddings.length} embeddings`,
                );

                // Upsert to Pinecone
                if (vectorDb.isAvailable()) {
                  console.log(
                    `[PDF_PROCESSING] Upserting embeddings to Pinecone...`,
                  );
                  const vectorPayload = enrichedChunks.map((chunk) => ({
                    id: chunk.id,
                    values: chunk.embedding!,
                    metadata: {
                      courseId: chunk.courseId,
                      chunkId: chunk.id,
                      text: chunk.text,
                      pageNumber: chunk.pageNumber,
                    },
                  }));

                  await vectorDb.upsertEmbeddings(courseId, vectorPayload);
                  console.log(
                    `[PDF_PROCESSING] ✅ Embeddings upserted to Pinecone`,
                  );
                }
              } catch (embeddingError: any) {
                console.warn(
                  `[PDF_PROCESSING] ⚠️ Embedding generation failed: ${embeddingError.message}`,
                );
                console.warn(
                  `[PDF_PROCESSING] Proceeding without embeddings. Will fall back to basic RAG.`,
                );
              }
            }

            const reloadedDb = db.read();
            reloadedDb.chunks = [...reloadedDb.chunks, ...enrichedChunks];

            const finalizedC = reloadedDb.courses.find(
              (c) => c.id === courseId,
            );
            if (finalizedC) {
              finalizedC.isProcessing = false;
              finalizedC.pageCount = 1;
              finalizedC.statusMessage = `Ready! ${enrichedChunks.length} smart chunks extracted ${embeddings.length > 0 ? "and embedded" : "(no embeddings)"}.`;
            }

            await db.write(reloadedDb);
            console.log(
              `✅ Course ready! ${chunksList.length} chunks saved.\n`,
            );
          } catch (processError: any) {
            console.error(`❌ Error:`, processError.message);
            const crashDb = db.read();
            const courseCrashed = crashDb.courses.find(
              (c) => c.id === courseId,
            );
            if (courseCrashed) {
              courseCrashed.isProcessing = false;
              courseCrashed.statusMessage = `Failed: ${processError.message}`;
            }
            await db.write(crashDb);
          }
        }, 100);
      } catch (error: any) {
        console.error("Upload error:", error);
        res.status(500).json({ error: error.message });
      }
    },
  );

  app.delete(
    "/api/courses/:id",
    authenticateToken,
    async (req: Request, res: Response) => {
      try {
        const courseId = req.params.id;
        const dbData = db.read();

        dbData.courses = dbData.courses.filter((c) => c.id !== courseId);
        dbData.chunks = dbData.chunks.filter((ch) => ch.courseId !== courseId);
        dbData.quizzes = dbData.quizzes.filter((q) => q.courseId !== courseId);
        dbData.attempts = dbData.attempts.filter(
          (att) => att.courseId !== courseId,
        );

        await db.write(dbData);

        // Delete embeddings from Pinecone
        if (vectorDb.isAvailable()) {
          try {
            await vectorDb.deleteCoursEmbeddings(courseId);
          } catch (error) {
            console.warn("Failed to delete Pinecone embeddings:", error);
          }
        }

        res.json({ message: "Course deleted successfully" });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    },
  );

  app.post(
    "/api/courses/:id/chat",
    authenticateToken,
    async (req: Request, res: Response) => {
      try {
        const courseId = req.params.id;
        const { message } = req.body;

        if (!message) {
          return res.status(400).json({ error: "Message is required" });
        }

        const dbData = db.read();
        const course = dbData.courses.find((c) => c.id === courseId);
        if (!course) {
          return res.status(404).json({ error: "Course not found" });
        }

        if (course.isProcessing) {
          return res.json({
            text: "Your course PDF is still processing. Please wait a moment and try again.",
            references: [],
          });
        }

        const courseChunks = dbData.chunks.filter(
          (c) => c.courseId === courseId,
        ) as ChunkWithEmbedding[];

        console.log(
          `\n========== ADVANCED RAG CHAT (v2 - Hybrid+Expansion+Reranking+Validation) ==========`,
        );
        console.log(`Course: ${course.title}`);
        console.log(`Query: "${message}"`);
        console.log(`Chunks in DB: ${courseChunks.length}`);

        // ===== ADVANCED RAG PIPELINE WITH HYBRID SEARCH, EXPANSION, RERANKING & VALIDATION =====
        let hybridResults: any[] = [];
        let contextWindow = { context: "", usedChunks: 0, totalTokens: 0 };
        let searchMetadata: any = {
          strategy: "hybrid-bm25-semantic-expansion-reranking-validation",
          queriesExecuted: 0,
          chunksRetrieved: 0,
          totalRelevantChunks: 0,
          similarityThreshold: 0.5,
          contextTokens: 0,
          validationConfidence: 0,
          reranked: false,
          expanded: false,
        };

        // Try HYBRID search with BM25, semantic search, query expansion and reranking
        if (courseChunks.length > 0) {
          try {
            console.log(
              `[CHAT] Using ADVANCED RAG (BM25 + Semantic + Query Expansion + Reranking + Validation)`,
            );

            // 1. QUERY EXPANSION: Generate expanded queries for better coverage
            const expandedQueryResult = queryExpansionService.expandQuery(
              message,
              5,
            );
            searchMetadata.expanded = true;
            const queriesToSearch = [
              message,
              ...expandedQueryResult.expanded.slice(0, 3),
            ];
            console.log(
              `[CHAT] Query expansion: ${queriesToSearch.length} queries to search`,
            );

            // 2. HYBRID SEARCH: Execute BM25 and semantic search on all queries
            let allResults: Array<{
              chunk: ChunkWithEmbedding;
              bm25Score: number;
              semanticScore: number;
            }> = [];

            // Index chunks for BM25 (if not already indexed)
            bm25Search.indexDocuments(courseChunks);

            for (const query of queriesToSearch) {
              // BM25 keyword search
              const bm25Results = bm25Search.search(query, courseChunks, 8);

              // Semantic search
              let semanticResults: any[] = [];
              try {
                semanticResults = await semanticSearch.search(
                  query,
                  courseChunks,
                  8,
                );
              } catch (semErr) {
                console.warn(
                  `[CHAT] Semantic search skipped: ${(semErr as any).message}`,
                );
              }

              // Combine results by chunk ID
              const resultMap = new Map<
                string,
                {
                  chunk: ChunkWithEmbedding;
                  bm25Score: number;
                  semanticScore: number;
                }
              >();

              for (const result of bm25Results) {
                resultMap.set(result.chunk.id, {
                  chunk: result.chunk,
                  bm25Score: result.score,
                  semanticScore: 0,
                });
              }

              for (const result of semanticResults) {
                const existing = resultMap.get(result.chunk.id);
                if (existing) {
                  existing.semanticScore = result.score;
                } else {
                  resultMap.set(result.chunk.id, {
                    chunk: result.chunk,
                    bm25Score: 0,
                    semanticScore: result.score,
                  });
                }
              }

              allResults.push(...resultMap.values());
            }

            searchMetadata.queriesExecuted = queriesToSearch.length;
            searchMetadata.totalRelevantChunks = allResults.length;

            // 3. DEDUPLICATION and SCORE FUSION: Combine results from multiple queries
            const deduplicatedMap = new Map<
              string,
              {
                chunk: ChunkWithEmbedding;
                bm25Score: number;
                semanticScore: number;
                fusedScore: number;
              }
            >();

            for (const result of allResults) {
              const existing = deduplicatedMap.get(result.chunk.id);
              const fusedScore =
                result.bm25Score * 0.4 + result.semanticScore * 0.6; // 40% BM25, 60% semantic

              if (existing) {
                existing.bm25Score = Math.max(
                  existing.bm25Score,
                  result.bm25Score,
                );
                existing.semanticScore = Math.max(
                  existing.semanticScore,
                  result.semanticScore,
                );
                existing.fusedScore = Math.max(existing.fusedScore, fusedScore);
              } else {
                deduplicatedMap.set(result.chunk.id, {
                  ...result,
                  fusedScore,
                });
              }
            }

            // Sort by fused score
            const sortedResults = Array.from(deduplicatedMap.values())
              .sort((a, b) => b.fusedScore - a.fusedScore)
              .slice(0, 10);

            // 4. RERANKING: Use cross-encoder for better relevance ranking
            console.log(`[CHAT] Applying cross-encoder reranking...`);
            const rerankedResults = await rerankerService.rerank(
              message,
              sortedResults.map((r) => ({
                chunk: r.chunk,
                score: r.fusedScore,
              })),
            );

            if (rerankedResults.length > 0) {
              searchMetadata.reranked = true;
              hybridResults = rerankedResults;
              console.log(`[CHAT] Reranked ${rerankedResults.length} results`);
            } else {
              hybridResults = sortedResults.map((r) => ({
                chunk: r.chunk,
                semanticScore: r.semanticScore,
                bm25Score: r.bm25Score,
                fusedScore: r.fusedScore,
              }));
            }

            searchMetadata.chunksRetrieved = hybridResults.length;

            // Build context window
            let contextText = "\n=== RETRIEVED RELEVANT COURSE CONTENT ===\n";
            let totalTokens = 0;

            for (let i = 0; i < hybridResults.length; i++) {
              const result = hybridResults[i];
              const snippet = result.chunk.text.substring(0, 500);
              const tokens = Math.ceil(snippet.length / 4); // Rough estimation

              if (totalTokens + tokens > 2000) break; // Stay within context window

              contextText += `\n[Chunk ${i + 1}, Page ${result.chunk.pageNumber}, Score: ${(result.fusedScore || result.semanticScore || 0).toFixed(2)}]:\n${snippet}\n`;
              totalTokens += tokens;
            }

            contextText += "\n=== END OF RETRIEVED CONTENT ===\n";

            contextWindow = {
              context: contextText,
              usedChunks: hybridResults.length,
              totalTokens,
            };

            searchMetadata.contextTokens = totalTokens;
          } catch (searchError: any) {
            console.warn(
              `[CHAT] Advanced RAG failed, falling back to basic search: ${searchError.message}`,
            );
            // Fall through to basic RAG
          }
        }

        // Fallback to basic RAG if advanced search didn't work
        if (hybridResults.length === 0 && courseChunks.length > 0) {
          console.log(`[CHAT] Falling back to BASIC RAG (all chunks)`);

          let basicContext = "\n=== COURSE PDF CONTENT ===\n";
          for (let i = 0; i < Math.min(courseChunks.length, 20); i++) {
            basicContext += `\n[Chunk ${i + 1}, Page ${courseChunks[i].pageNumber}]:\n${courseChunks[i].text.substring(0, 300)}\n`;
          }
          if (courseChunks.length > 20) {
            basicContext += `\n... and ${courseChunks.length - 20} more chunks\n`;
          }
          basicContext += "\n=== END OF COURSE CONTENT ===\n";

          contextWindow = {
            context: basicContext,
            usedChunks: Math.min(courseChunks.length, 20),
            totalTokens: Math.ceil(basicContext.length / 4),
          };

          searchMetadata.chunksRetrieved = Math.min(courseChunks.length, 20);
          searchMetadata.totalRelevantChunks = courseChunks.length;
          searchMetadata.contextTokens = contextWindow.totalTokens;
          searchMetadata.strategy = "basic-fallback";
        }

        // Build system prompt with context
        const systemPrompt = `You are an expert educational AI assistant specialized in course material analysis.

Course Title: "${course.title}"

RETRIEVED RELEVANT CONTENT FROM PDF (using hybrid search with BM25, semantic search, query expansion, and cross-encoder reranking):
${contextWindow.context || "No specific content found in PDF."}

INSTRUCTIONS:
- Answer ONLY based on the retrieved PDF content above
- CRITICAL: You MUST cite the page number in brackets [Page X] immediately after each claim or fact from the PDF
- Format citations as: [Page 23] or [Chunk 5, Page 23] at the end of sentences containing sourced information
- If multiple pages support the same claim, cite the primary source: [Pages 12, 15]
- Do NOT answer if information is not in the retrieved content - explicitly state: "This information is not covered in the course material"
- Be educational, clear, and concise
- Maintain academic rigor
- Quote relevant passages when helpful, always with citations

CITATION EXAMPLES:
✓ "An activity represents the execution of a mechanism and sequential steps [Page 23]."
✓ "UML activity diagrams show behavioral dynamics [Pages 20-21]."
✓ "This concept is not covered in the provided course material."

User Question: ${message}`;

        let aiResponse = "";

        if (process.env.GROQ_API_KEY) {
          const completion = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: message },
            ],
            temperature: 0.5,
            max_tokens: 1500,
          });

          aiResponse =
            completion.choices[0]?.message?.content || "No response generated.";
        } else {
          aiResponse = "GROQ_API_KEY not configured";
        }

        // ===== POST-PROCESSING: Auto-inject page citations =====
        const injectPageCitations = (
          response: string,
          context: string,
        ): string => {
          // Extract all page numbers from context [Chunk X, Page Y]
          const pageMatches = context.match(/Page (\d+)/g) || [];
          console.log(
            `[CITATION] Found ${pageMatches.length} page references in context:`,
            pageMatches,
          );

          const pages = new Set<number>();

          for (const match of pageMatches) {
            const pageNum = match.match(/(\d+)/);
            if (pageNum) {
              pages.add(parseInt(pageNum[1]));
            }
          }

          console.log(`[CITATION] Extracted pages:`, Array.from(pages));

          if (pages.size === 0) {
            console.log(
              `[CITATION] ⚠️ No pages found, returning response without citations`,
            );
            return response;
          }

          const pageArray = Array.from(pages).sort((a, b) => a - b);
          const primaryPage = pageArray[0];

          console.log(`[CITATION] Using primary page: ${primaryPage}`);

          // Remove trailing metadata like "(J'utilise l'information du PDF...)"
          let processed = response
            .replace(/\(\s*J['']utilise.*?\)$/gi, "")
            .trim();

          console.log(
            `[CITATION] After cleanup:`,
            processed.substring(0, 100) + "...",
          );

          // Split into sentences (keep sentence terminators)
          const sentences = processed.match(/[^.!?]+[.!?]+/g) || [processed];

          console.log(`[CITATION] Split into ${sentences.length} sentences`);

          const citedSentences = sentences.map((sentence, idx) => {
            const trimmed = sentence.trim();

            // Skip very short sentences
            if (trimmed.length < 15) return trimmed;

            // Check if already has a citation
            if (trimmed.match(/\[Page\s+\d+/)) {
              console.log(`[CITATION] Sentence ${idx} already cited, skipping`);
              return trimmed;
            }

            // Check if it's metadata or disclaimer
            if (trimmed.match(/^(Ce|Ces|Cette|Pour|Ceci|Note:|Important:)/i)) {
              console.log(`[CITATION] Sentence ${idx} is metadata, skipping`);
              return trimmed;
            }

            // Find where to insert the citation (before the period/punctuation)
            const lastPunct = trimmed.match(/[.!?]+$/);
            if (lastPunct) {
              const textPart = trimmed.slice(0, -lastPunct[0].length);
              const punctPart = lastPunct[0];
              const result = `${textPart} [Page ${primaryPage}]${punctPart}`;
              console.log(
                `[CITATION] Sentence ${idx} cited: ${result.substring(0, 80)}...`,
              );
              return result;
            }

            return `${trimmed} [Page ${primaryPage}]`;
          });

          const finalResult = citedSentences.join(" ");
          console.log(`[CITATION] ✅ Final cited response ready`);
          return finalResult;
        };

        const citedResponse = injectPageCitations(
          aiResponse,
          contextWindow.context,
        );

        // 5. RESPONSE VALIDATION: Verify response against source documents
        console.log(`[CHAT] Validating response against source documents...`);
        const sourcedChunks =
          hybridResults.length > 0
            ? hybridResults.map((r) => r.chunk)
            : courseChunks.slice(0, 10);

        const validationResult = responseValidationService.validateResponse(
          citedResponse,
          sourcedChunks,
        );
        searchMetadata.validationConfidence = validationResult.confidence;

        // Format response with validation disclaimer if needed
        const formattedResponse =
          responseValidationService.formatValidationForDisplay(
            citedResponse,
            validationResult,
          );

        console.log(
          `[VALIDATION] Confidence: ${(validationResult.confidence * 100).toFixed(1)}%, Valid: ${validationResult.isValid}`,
        );

        // Format references from search results
        const references = hybridResults
          .slice(0, contextWindow.usedChunks)
          .map((r, i) => ({
            text: r.chunk.text.substring(0, 100) + "...",
            pageNumber: r.chunk.pageNumber,
            score: r.fusedScore || r.semanticScore || 0,
            chunkId: r.chunk.id,
          }));

        console.log(
          `✅ Response generated with validation (${contextWindow.usedChunks} refs, ${contextWindow.totalTokens} tokens, confidence: ${(validationResult.confidence * 100).toFixed(1)}%)\n`,
        );

        res.json({
          id: "msg_" + Math.random().toString(36).substring(2, 11),
          role: "assistant",
          text: formattedResponse,
          timestamp: new Date().toISOString(),
          references,
          searchMetadata,
          validation: {
            isValid: validationResult.isValid,
            confidence: validationResult.confidence,
            validatedClaims: validationResult.validatedClaims.length,
            flaggedClaims: validationResult.flaggedClaims.length,
          },
        });
      } catch (error: any) {
        console.error("Chat error:", error);
        res.status(500).json({ error: error.message });
      }
    },
  );

  app.post(
    "/api/courses/:id/summary",
    authenticateToken,
    async (req: Request, res: Response) => {
      try {
        const courseId = req.params.id;
        const dbData = db.read();
        const course = dbData.courses.find((c) => c.id === courseId);
        if (!course) {
          return res.status(404).json({ error: "Course not found" });
        }

        const courseChunks = dbData.chunks.filter(
          (ch) => ch.courseId === courseId,
        );
        if (courseChunks.length === 0) {
          return res
            .status(400)
            .json({
              error:
                "Course chunks not found. Please wait for processing to finish.",
            });
        }

        const sampleText = courseChunks
          .slice(0, 15)
          .map((c) => `[Page ${c.pageNumber}]: ${c.text}`)
          .join("\n\n");

        let generatedSummary = {
          overview:
            "A concise overview summarizing the uploaded educational textbook material. Configure your GROQ_API_KEY to trigger the true Summary Agent output.",
          chapters: [
            {
              title: "Chapter 1: Dynamic Introduction",
              summary:
                "An introduction compiled from initial concepts extracted from course materials.",
              takeaways: [
                "Key takeaway reference 1",
                "Core concepts are introduced in sequential forms.",
              ],
            },
          ],
          keyConcepts: [
            {
              term: "Course Outline",
              definition:
                "The core architecture or instructional handbook covering learning objectives.",
            },
          ],
        };

        if (process.env.GROQ_API_KEY) {
          const summaryPrompt = `You are the Summary Agent.
Generate a highly detailed, comprehensive study guide index for the uploaded textbook course titled: "${course.title}".
You will be provided with key textbook excerpts below.

Create a beautiful structural study companion JSON that conforms to this precise JSON schema:
{
  "overview": "A thorough general overview of the course material",
  "chapters": [
    {
      "title": "Title of Chapter or Part",
      "summary": "Detailed, highly academic 3-4 sentence paragraph summarizing this logical part of the lecture notes",
      "takeaways": ["Takeaway 1 detail", "Takeaway 2 detail"]
    }
  ],
  "keyConcepts": [
    {
      "term": "Key Term/Vocabulary",
      "definition": "Clean definition matching college textbook definitions"
    }
  ]
}

Excerpts:
${sampleText}

Return ONLY valid JSON, no other text.`;

          try {
            const completion = await groq.chat.completions.create({
              model: "llama-3.3-70b-versatile",
              messages: [
                {
                  role: "system",
                  content:
                    "You are a JSON generator. Return only valid JSON matching the requested schema, no additional text.",
                },
                {
                  role: "user",
                  content: summaryPrompt,
                },
              ],
              temperature: 0.3,
            });

            const responseText = completion.choices[0]?.message?.content || "";
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              generatedSummary = JSON.parse(jsonMatch[0]);
            }
          } catch (sum_err: any) {
            console.error("Groq summary generation failed:", sum_err);
            return res
              .status(500)
              .json({
                error: `Summary generation crashed: ${sum_err.message || sum_err}`,
              });
          }
        }

        const reloadDb = db.read();
        const updatedCourse = reloadDb.courses.find((c) => c.id === courseId);
        if (updatedCourse) {
          updatedCourse.summary = generatedSummary;
          await db.write(reloadDb);
        }

        res.json(generatedSummary);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    },
  );

  app.post(
    "/api/courses/:id/quiz",
    authenticateToken,
    async (req: Request, res: Response) => {
      try {
        const courseId = req.params.id;
        const dbData = db.read();
        const course = dbData.courses.find((c) => c.id === courseId);

        if (!course) {
          return res.status(404).json({ error: "Course not found" });
        }

        const courseChunks = dbData.chunks.filter(
          (ch) => ch.courseId === courseId,
        );

        if (courseChunks.length === 0) {
          return res
            .status(400)
            .json({
              error:
                "No course content found. Please wait for PDF processing to complete.",
            });
        }

        // Combine all chunks to get full text
        const fullText = courseChunks
          .map((c) => c.text)
          .join(" ")
          .substring(0, 3000);

        console.log(`Generating quiz for course: ${course.title}`);
        console.log(`Using text sample: ${fullText.substring(0, 200)}...`);

        let quizQuestions = [];

        if (process.env.GROQ_API_KEY) {
          const quizPrompt = `Create a 3-question multiple choice quiz based on this text:

TEXT:
${fullText}

Return ONLY valid JSON in this exact format:
{
  "questions": [
    {
      "question": "What is the main topic?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswerIndex": 0,
      "explanation": "Explanation of why this is correct"
    }
  ]
}

Make sure the questions are based on the text above.`;

          const completion = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            messages: [
              {
                role: "system",
                content:
                  "You are a quiz generator. Return ONLY valid JSON. No other text.",
              },
              {
                role: "user",
                content: quizPrompt,
              },
            ],
            temperature: 0.3,
          });

          const responseText = completion.choices[0]?.message?.content || "";
          console.log("Quiz response:", responseText);

          // Extract JSON from response
          const jsonMatch = responseText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            quizQuestions = parsed.questions || [];
          }
        }

        // If no questions generated or Groq failed, create simple fallback quiz
        if (quizQuestions.length === 0) {
          const fallbackQuestions = [
            {
              question: `What is the main topic of "${course.title}"?`,
              options: [
                "Based on the course materials",
                "General knowledge",
                "Not specified",
                "All of the above",
              ],
              correctAnswerIndex: 0,
              explanation:
                "The course materials contain information about this topic.",
            },
            {
              question: "What does the course PDF contain?",
              options: [
                "Only images",
                "Text content that was extracted",
                "Empty pages",
                "Video links",
              ],
              correctAnswerIndex: 1,
              explanation:
                "The PDF was successfully processed and text was extracted.",
            },
            {
              question: "How many chunks were extracted from your PDF?",
              options: [
                `${courseChunks.length} chunks`,
                "No chunks",
                "100 chunks",
                "Unknown",
              ],
              correctAnswerIndex: 0,
              explanation: `Your PDF was split into ${courseChunks.length} text chunks for processing.`,
            },
          ];

          // Add IDs to fallback questions
          quizQuestions = fallbackQuestions.map((q, idx) => ({
            ...q,
            id: `q_${idx}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          }));
        }

        const questionsWithIds = quizQuestions.map((q, idx) => ({
          ...q,
          id: `q_${idx}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        }));

        const newQuiz: Quiz = {
          id: "qz_" + Math.random().toString(36).substring(2, 11),
          courseId,
          title: `Quiz: ${course.title}`,
          questions: questionsWithIds,
          createdAt: new Date().toISOString(),
        };

        const reloadDb = db.read();
        const courseToUpdate = reloadDb.courses.find((c) => c.id === courseId);
        if (courseToUpdate) {
          courseToUpdate.quiz = newQuiz;
        }
        await db.write(reloadDb);

        console.log(`✅ Quiz created with ${quizQuestions.length} questions`);
        res.status(201).json(newQuiz);
      } catch (error: any) {
        console.error("Quiz generation error:", error);
        res.status(500).json({ error: error.message });
      }
    },
  );

  app.post(
    "/api/quizzes/:id/submit",
    authenticateToken,
    async (req: Request, res: Response) => {
      try {
        const quizId = req.params.id;
        const { answers, courseId } = req.body;

        const dbData = db.read();

        // First try to find quiz in the quizzes array (old way)
        let quiz = dbData.quizzes.find((q) => q.id === quizId);

        // If not found, try to find it inside a course object (new way)
        if (!quiz) {
          const courseWithQuiz = dbData.courses.find(
            (c) => c.quiz && c.quiz.id === quizId,
          );
          if (courseWithQuiz) {
            quiz = courseWithQuiz.quiz;
          }
        }

        if (!quiz) {
          return res.status(404).json({ error: "Quiz not found" });
        }

        let score = 0;
        quiz.questions.forEach((q) => {
          const studentSelect = answers[q.id];
          if (
            studentSelect !== undefined &&
            studentSelect === q.correctAnswerIndex
          ) {
            score++;
          }
        });

        const attempt: QuizAttempt = {
          id: "att_" + Math.random().toString(36).substring(2, 11),
          quizId,
          courseId: courseId || quiz.courseId,
          score,
          total: quiz.questions.length,
          answers,
          createdAt: new Date().toISOString(),
        };

        dbData.attempts.push(attempt);
        await db.write(dbData);

        res.status(201).json(attempt);
      } catch (error: any) {
        console.error("Submit error:", error);
        res.status(500).json({ error: error.message });
      }
    },
  );

  if (process.env.NODE_ENV !== "production") {
    app.get(
      "/api/test/:courseId",
      authenticateToken,
      async (req: Request & { user?: any }, res: Response) => {
        try {
          const courseId = req.params.courseId;
          const dbData = db.read();
          const course = dbData.courses.find((c) => c.id === courseId);
          const chunks = dbData.chunks.filter((c) => c.courseId === courseId);

          res.json({
            courseName: course?.title,
            isProcessing: course?.isProcessing,
            status: course?.statusMessage,
            numberOfChunks: chunks.length,
            hasContent: chunks.length > 0,
            sampleText:
              chunks.length > 0
                ? chunks[0].text.substring(0, 300)
                : "No text found",
          });
        } catch (error: any) {
          res.status(500).json({ error: error.message });
        }
      },
    );

    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Initialize Vector Database
  try {
    if (vectorDb.isAvailable()) {
      console.log("[SERVER] Initializing Pinecone Vector Database...");
      await vectorDb.initialize();
    } else {
      console.warn(
        "[SERVER] ⚠️ Vector DB not available. Embeddings will be disabled.",
      );
    }
  } catch (error) {
    console.warn(
      "[SERVER] Vector DB initialization failed. System will continue without vector search.",
      error,
    );
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(
      `AI Course PDF Assistant server is booted on port http://localhost:${PORT}`,
    );
  });
}

startServer().catch((e) => {
  console.error("Critical server bootstrap error:", e);
});
