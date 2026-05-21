export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

export interface Course {
  id: string;
  userId: string;
  title: string;
  fileName: string;
  fileSize: number;
  pageCount: number;
  createdAt: string;
  isProcessing?: boolean;
  statusMessage?: string;
  summary?: CourseSummary;
}

export interface CourseSummary {
  chapters: {
    title: string;
    summary: string;
    takeaways: string[];
  }[];
  keyConcepts: {
    term: string;
    definition: string;
  }[];
  overview: string;
}

export interface Chunk {
  id: string;
  courseId: string;
  text: string;
  pageNumber: number;
  index: number;
  // Metadata for filtering and smart chunking
  chapter?: string;
  topic?: string;
  difficulty?: "beginner" | "intermediate" | "advanced";
  section?: string;
  semanticCluster?: number; // Cluster ID for semantic grouping
}

export interface GroundingReference {
  text: string;
  pageNumber: number;
  score: number;
  chunkId?: string;
}

export interface ChunkWithEmbedding extends Chunk {
  embedding?: number[];
  embeddingId?: string;
  embeddingModel?: string;
  embeddingTimestamp?: string;
}

export interface SearchResult {
  chunk: ChunkWithEmbedding;
  score: number;
}

export interface RAGConfig {
  topK?: number;
  similarityThreshold?: number;
  contextWindowTokens?: number;
}

export interface SearchMetadata {
  queriesExecuted: number;
  chunksRetrieved: number;
  totalRelevantChunks: number;
  similarityThreshold: number;
  contextTokens: number;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: string;
  agentName?: "RetrievalAgent" | "SummaryAgent" | "QuizAgent" | "RAG";
  references?: GroundingReference[];
  searchMetadata?: SearchMetadata;
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctAnswerIndex: number;
  explanation: string;
}

export interface Quiz {
  id: string;
  courseId: string;
  title: string;
  questions: QuizQuestion[];
  createdAt: string;
}

export interface QuizAttempt {
  id: string;
  quizId: string;
  courseId: string;
  score: number;
  total: number;
  answers: { [questionId: string]: number }; // questionId -> selectedOptionIndex
  createdAt: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

// Advanced RAG features
export interface HybridSearchResult {
  chunk: ChunkWithEmbedding;
  semanticScore: number;
  bm25Score: number;
  fusedScore: number; // Weighted combination
  rerankerScore?: number; // Cross-encoder rerank score
}

export interface ExpandedQuery {
  original: string;
  expanded: string[];
  types: string[]; // ["synonym", "decomposition", "specific", etc]
}

export interface ValidationResult {
  isValid: boolean;
  confidence: number; // 0-1 confidence score
  sourceChunkIds: string[];
  validatedClaims: string[];
  flaggedClaims: string[];
}

export interface SmartChunk {
  id: string;
  text: string;
  startChar: number;
  endChar: number;
  size: number;
  semanticBoundary: boolean;
  overlapWithPrevious?: number; // chars of overlap
}

// Chat Session Management
export interface ChatSession {
  id: string;
  courseId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  preview?: string; // First message preview
}

export interface ChatHistory {
  sessionId: string;
  courseId: string;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
}
