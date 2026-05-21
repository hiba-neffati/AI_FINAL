import { embeddingService } from "./embeddings.js";
import { vectorDb } from "./vectorDb.js";
import { bm25Search } from "./bm25Search.js";
import { queryExpansionService } from "./queryExpansion.js";
import { rerankerService } from "./reranker.js";
import { SearchResult, RAGConfig, HybridSearchResult } from "./types.js";
import { ChunkWithEmbedding } from "./types.js";

/**
 * Advanced Semantic Search Service with Hybrid Search, Query Expansion, and Reranking
 * Combines semantic + BM25 search, expands queries, and reranks results
 */
class SemanticSearchService {
  private defaultConfig: RAGConfig = {
    topK: 5,
    similarityThreshold: 0.5,
    contextWindowTokens: 2000,
  };

  private semanticWeight: number = 0.6;
  private bm25Weight: number = 0.4;

  /**
   * Hybrid search: combines semantic and BM25 results
   */
  async hybridSearch(
    query: string,
    chunks: ChunkWithEmbedding[],
    topK: number = 10
  ): Promise<HybridSearchResult[]> {
    try {
      console.log(`[HYBRID_SEARCH] Starting hybrid search for: "${query}"`);

      // Initialize BM25 index
      bm25Search.indexDocuments(chunks);

      // 1. Semantic search
      console.log(`[HYBRID_SEARCH] Phase 1: Semantic search...`);
      let semanticResults: Array<{ chunk: ChunkWithEmbedding; score: number }> = [];
      try {
        const queryEmbedding = await embeddingService.generateEmbedding(query);
        const results = await vectorDb.querySimilar("temp", queryEmbedding, topK * 2, 0);
        semanticResults = results.map((r) => ({ chunk: r.chunk, score: r.score }));
        console.log(`[HYBRID_SEARCH] Semantic: ${semanticResults.length} results`);
      } catch (error: any) {
        console.warn(`[HYBRID_SEARCH] Semantic search failed: ${error.message}`);
      }

      // 2. BM25 search
      console.log(`[HYBRID_SEARCH] Phase 2: BM25 keyword search...`);
      const bm25Results = bm25Search.search(query, chunks, topK * 2);
      console.log(`[HYBRID_SEARCH] BM25: ${bm25Results.length} results`);

      // 3. Fusion: combine and normalize scores
      const fusedResults = this.fuseResults(semanticResults, bm25Results, topK);

      // 4. Rerank
      console.log(`[HYBRID_SEARCH] Phase 3: Reranking...`);
      const reranked = await rerankerService.rerank(query, fusedResults);

      console.log(`[HYBRID_SEARCH] Final: ${reranked.length} reranked results`);
      return reranked.slice(0, topK);
    } catch (error: any) {
      console.error("[HYBRID_SEARCH] Error:", error.message);
      throw error;
    }
  }

  /**
   * Fuse semantic and BM25 results with weighted scoring
   */
  private fuseResults(
    semanticResults: Array<{ chunk: ChunkWithEmbedding; score: number }>,
    bm25Results: Array<{ chunk: ChunkWithEmbedding; score: number }>,
    topK: number
  ): Array<{ chunk: ChunkWithEmbedding; score: number }> {
    const chunkScoreMap = new Map<string, { chunk: ChunkWithEmbedding; semanticScore: number; bm25Score: number }>();

    // Normalize semantic scores (0-1) and add to map
    const maxSemanticScore = Math.max(...semanticResults.map((r) => r.score), 1);
    for (const result of semanticResults) {
      const normalized = result.score / maxSemanticScore;
      chunkScoreMap.set(result.chunk.id, {
        chunk: result.chunk,
        semanticScore: normalized,
        bm25Score: 0,
      });
    }

    // Normalize BM25 scores (0-1) and add/merge to map
    const maxBM25Score = Math.max(...bm25Results.map((r) => r.score), 1);
    for (const result of bm25Results) {
      const normalized = result.score / maxBM25Score;
      if (chunkScoreMap.has(result.chunk.id)) {
        const existing = chunkScoreMap.get(result.chunk.id)!;
        existing.bm25Score = normalized;
      } else {
        chunkScoreMap.set(result.chunk.id, {
          chunk: result.chunk,
          semanticScore: 0,
          bm25Score: normalized,
        });
      }
    }

    // Calculate fused scores
    const fusedResults = Array.from(chunkScoreMap.values())
      .map((item) => ({
        chunk: item.chunk,
        score: item.semanticScore * this.semanticWeight + item.bm25Score * this.bm25Weight,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    console.log(`[HYBRID_SEARCH] Fused ${fusedResults.length} unique results`);
    return fusedResults;
  }

  /**
   * Query expansion: generate related queries and combine results
   */
  async expandAndSearch(
    query: string,
    chunks: ChunkWithEmbedding[],
    topK: number = 10
  ): Promise<HybridSearchResult[]> {
    try {
      console.log(`[QUERY_EXPANSION] Expanding query: "${query}"`);
      const expandedQuery = queryExpansionService.expandQuery(query, 5);

      // Search with expanded queries
      const allResults = new Map<string, HybridSearchResult>();

      // Original query
      const originalResults = await this.hybridSearch(query, chunks, topK);
      for (const result of originalResults) {
        allResults.set(result.chunk.id, result);
      }

      // Expanded queries
      for (const expandedQ of expandedQuery.expanded) {
        try {
          const results = await this.hybridSearch(expandedQ, chunks, topK);
          for (const result of results) {
            if (allResults.has(result.chunk.id)) {
              // Boost score for results found in multiple queries
              allResults.get(result.chunk.id)!.fusedScore *= 1.2;
            } else {
              allResults.set(result.chunk.id, result);
            }
          }
        } catch (error: any) {
          console.warn(`[QUERY_EXPANSION] Failed to search expanded query "${expandedQ}": ${error.message}`);
        }
      }

      // Return top K from all results
      const combined = Array.from(allResults.values())
        .sort((a, b) => b.fusedScore - a.fusedScore)
        .slice(0, topK);

      console.log(`[QUERY_EXPANSION] Combined results: ${combined.length} chunks from all queries`);
      return combined;
    } catch (error: any) {
      console.error("[QUERY_EXPANSION] Error:", error.message);
      // Fallback to simple hybrid search
      return this.hybridSearch(query, chunks, topK);
    }
  }

  /**
   * Original search function for backwards compatibility
   */
  async search(courseId: string, query: string, config?: Partial<RAGConfig>): Promise<SearchResult[]> {
    try {
      const finalConfig = { ...this.defaultConfig, ...config };

      console.log(`[SEMANTIC_SEARCH] Query: "${query}"`);
      console.log(`[SEMANTIC_SEARCH] Config:`, finalConfig);

      // Step 1: Generate query embedding
      console.log(`[SEMANTIC_SEARCH] Generating embedding for query...`);
      const queryEmbedding = await embeddingService.generateEmbedding(query);

      // Step 2: Search Pinecone
      console.log(`[SEMANTIC_SEARCH] Searching vector DB (top-${finalConfig.topK})...`);
      const results = await vectorDb.querySimilar(
        courseId,
        queryEmbedding,
        finalConfig.topK,
        finalConfig.similarityThreshold
      );

      console.log(`[SEMANTIC_SEARCH] Found ${results.length} relevant chunks`);
      results.forEach((r, i) => {
        console.log(
          `  ${i + 1}. Score: ${(r.score * 100).toFixed(1)}% | Page ${r.chunk.pageNumber} | "${r.chunk.text.substring(0, 60)}..."`
        );
      });

      return results;
    } catch (error: any) {
      console.error("[SEMANTIC_SEARCH] Search failed:", error.message);
      throw error;
    }
  }

  /**
   * Calculate estimated token count
   * Rough approximation: 1 token ≈ 4 characters
   */
  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Build context window respecting token limits
   * Includes formatting, metadata, and ensures we don't exceed token budget
   */
  buildContextWindow(
    results: SearchResult[] | HybridSearchResult[],
    maxTokens: number
  ): { context: string; usedChunks: number; totalTokens: number } {
    let context = "";
    let tokenCount = 0;
    let chunksUsed = 0;

    // Add header
    const header = "\n=== RETRIEVED RELEVANT CONTENT FROM PDF ===\n";
    tokenCount += this.estimateTokens(header);
    context += header;

    // Add chunks until we hit token limit
    for (const result of results) {
      const score = "score" in result ? result.score : result.fusedScore;
      const chunk = result.chunk;

      const chunkHeader = `\n[Chunk ${chunksUsed + 1} | Relevance: ${(score * 100).toFixed(1)}% | Page ${chunk.pageNumber}]\n`;
      const chunkContent = chunk.text;
      const chunkFooter = "\n";

      const chunkTokens = this.estimateTokens(chunkHeader + chunkContent + chunkFooter);

      // Check if adding this chunk would exceed limit
      if (tokenCount + chunkTokens > maxTokens) {
        console.log(
          `[SEMANTIC_SEARCH] Token limit reached. Added ${chunksUsed} chunks (${tokenCount} tokens / ${maxTokens} max)`
        );
        break;
      }

      context += chunkHeader + chunkContent + chunkFooter;
      tokenCount += chunkTokens;
      chunksUsed++;
    }

    // Add footer
    const footer = "\n=== END OF RETRIEVED CONTENT ===\n";
    tokenCount += this.estimateTokens(footer);
    context += footer;

    console.log(
      `[SEMANTIC_SEARCH] Context window: ${chunksUsed}/${results.length} chunks, ${tokenCount} tokens used`
    );

    return {
      context,
      usedChunks: chunksUsed,
      totalTokens: tokenCount,
    };
  }
}

export const semanticSearch = new SemanticSearchService();
