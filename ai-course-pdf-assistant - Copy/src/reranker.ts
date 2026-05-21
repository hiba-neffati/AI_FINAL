import axios from "axios";
import { ChunkWithEmbedding, HybridSearchResult } from "./types.js";

/**
 * Cross-Encoder Reranking Service
 * Uses zero-shot classification to rerank retrieved documents
 * Model: cross-encoder/ms-marco-MiniLM-L-12-v2 (lightweight, fast)
 */
class RerankerService {
  private apiUrl: string =
    "https://api-inference.huggingface.co/models/cross-encoder/ms-marco-MiniLM-L-12-v2";
  private hfToken: string;
  private enabled: boolean = false;

  constructor() {
    this.hfToken = process.env.HUGGINGFACE_API_TOKEN || "";
    this.enabled = !!this.hfToken;

    if (!this.enabled) {
      console.warn("[RERANKER] ⚠️ HUGGINGFACE_API_TOKEN not set. Reranking disabled.");
    } else {
      console.log("[RERANKER] ✅ Cross-encoder reranking enabled");
    }
  }

  /**
   * Rerank a list of documents given a query
   * Returns documents sorted by relevance score
   */
  async rerank(
    query: string,
    documents: Array<{ chunk: ChunkWithEmbedding; score?: number }>
  ): Promise<HybridSearchResult[]> {
    if (!this.enabled || documents.length === 0) {
      // Return with original scores if reranking disabled
      return documents.map((doc) => ({
        chunk: doc.chunk,
        semanticScore: doc.score || 0,
        bm25Score: 0,
        fusedScore: doc.score || 0,
        rerankerScore: undefined,
      }));
    }

    try {
      console.log(`[RERANKER] Reranking ${documents.length} documents for query: "${query}"`);

      // Prepare pairs: [query, document_text]
      const pairs = documents.map((doc) => [
        query,
        doc.chunk.text.substring(0, 512), // Limit text to 512 chars for efficiency
      ]);

      // Call Hugging Face cross-encoder API
      const response = await axios.post(
        this.apiUrl,
        { inputs: pairs },
        {
          headers: {
            Authorization: `Bearer ${this.hfToken}`,
            "Content-Type": "application/json",
          },
          timeout: 30000,
        }
      );

      // Extract scores from response
      const scores = response.data || [];

      if (!Array.isArray(scores) || scores.length !== documents.length) {
        console.warn(`[RERANKER] Unexpected response format, using original scores`);
        return documents.map((doc) => ({
          chunk: doc.chunk,
          semanticScore: doc.score || 0,
          bm25Score: 0,
          fusedScore: doc.score || 0,
        }));
      }

      // Normalize scores to 0-1 range and combine with original scores
      const rerankedResults: HybridSearchResult[] = documents
        .map((doc, index) => {
          const rerankerScore = this.normalizeScore(scores[index]);
          const originalScore = doc.score || 0;

          // Weight: 60% reranker score, 40% original score
          const fusedScore = rerankerScore * 0.6 + originalScore * 0.4;

          return {
            chunk: doc.chunk,
            semanticScore: originalScore,
            bm25Score: 0,
            fusedScore,
            rerankerScore,
          };
        })
        .sort((a, b) => b.fusedScore - a.fusedScore);

      console.log(
        `[RERANKER] Top reranked: "${rerankedResults[0].chunk.text.substring(0, 60)}..." (score: ${rerankedResults[0].rerankerScore?.toFixed(3)})`
      );

      return rerankedResults;
    } catch (error: any) {
      console.error("[RERANKER] Reranking failed:", error.message);
      // Fallback: return with original scores
      return documents.map((doc) => ({
        chunk: doc.chunk,
        semanticScore: doc.score || 0,
        bm25Score: 0,
        fusedScore: doc.score || 0,
      }));
    }
  }

  /**
   * Normalize scores to 0-1 range
   * Cross-encoder scores are typically in range [-1, 1] or can be unbounded
   */
  private normalizeScore(score: number): number {
    // If score is already in 0-1 range, keep it
    if (score >= 0 && score <= 1) {
      return score;
    }

    // If score is in [-1, 1] range, convert to [0, 1]
    if (score >= -1 && score <= 1) {
      return (score + 1) / 2;
    }

    // For unbounded scores, apply sigmoid
    return 1 / (1 + Math.exp(-score));
  }

  /**
   * Check if reranking is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Get service configuration
   */
  getConfig() {
    return {
      model: "cross-encoder/ms-marco-MiniLM-L-12-v2",
      enabled: this.enabled,
      provider: "huggingface",
    };
  }
}

export const rerankerService = new RerankerService();
