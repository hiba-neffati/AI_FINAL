import { ChunkWithEmbedding } from "./types.js";

/**
 * BM25 Search Service
 * Implements BM25F algorithm for keyword-based retrieval
 * BM25 = Best Matching 25, a probabilistic relevance framework
 */
class BM25SearchService {
  private k1: number = 1.5; // Controls term frequency saturation point
  private b: number = 0.75; // Controls how much effect document length has on relevance
  private corpusStats = {
    avgDocLength: 0,
    totalDocs: 0,
    docFrequency: new Map<string, number>(),
    inverseDocFrequency: new Map<string, number>(),
  };

  /**
   * Tokenize and normalize text
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .split(/\s+|[.,!?;:()[\]{}]/g)
      .filter((token) => token.length > 2) // Filter out very short tokens
      .map((token) => this.stem(token));
  }

  /**
   * Simple stemming (suffix removal)
   */
  private stem(word: string): string {
    // Basic stemming rules
    if (word.endsWith("ing")) return word.slice(0, -3);
    if (word.endsWith("ed")) return word.slice(0, -2);
    if (word.endsWith("tion")) return word.slice(0, -4);
    if (word.endsWith("ly")) return word.slice(0, -2);
    if (word.endsWith("ies")) return word.slice(0, -3) + "y";
    if (word.endsWith("es")) return word.slice(0, -2);
    if (word.endsWith("s")) return word.slice(0, -1);
    return word;
  }

  /**
   * Index a collection of documents (chunks)
   */
  indexDocuments(chunks: ChunkWithEmbedding[]): void {
    this.corpusStats.totalDocs = chunks.length;
    this.corpusStats.docFrequency.clear();
    this.corpusStats.inverseDocFrequency.clear();

    let totalLength = 0;

    // First pass: collect document frequencies
    const docTokens = new Map<number, Set<string>>();

    for (let i = 0; i < chunks.length; i++) {
      const tokens = this.tokenize(chunks[i].text);
      docTokens.set(i, new Set(tokens));
      totalLength += tokens.length;

      // Update document frequencies
      for (const token of docTokens.get(i)!) {
        this.corpusStats.docFrequency.set(
          token,
          (this.corpusStats.docFrequency.get(token) || 0) + 1
        );
      }
    }

    // Calculate average document length
    this.corpusStats.avgDocLength = totalLength / chunks.length;

    // Calculate IDF (inverse document frequency)
    for (const [token, docFreq] of this.corpusStats.docFrequency.entries()) {
      const idf = Math.log((chunks.length - docFreq + 0.5) / (docFreq + 0.5) + 1);
      this.corpusStats.inverseDocFrequency.set(token, idf);
    }

    console.log(`[BM25] Indexed ${chunks.length} documents`);
    console.log(`[BM25] Average doc length: ${Math.round(this.corpusStats.avgDocLength)} tokens`);
  }

  /**
   * Calculate BM25 score for a query against a document
   */
  private calculateBM25Score(queryTokens: string[], docTokens: string[], docLength: number): number {
    let score = 0;

    for (const token of queryTokens) {
      const idf = this.corpusStats.inverseDocFrequency.get(token) || 0;
      const termFreq = docTokens.filter((t) => t === token).length;

      if (termFreq > 0) {
        const numerator = termFreq * (this.k1 + 1);
        const denominator =
          termFreq +
          this.k1 * (1 - this.b + this.b * (docLength / this.corpusStats.avgDocLength));

        score += idf * (numerator / denominator);
      }
    }

    return score;
  }

  /**
   * Search for query in indexed documents
   */
  search(
    query: string,
    chunks: ChunkWithEmbedding[],
    topK: number = 10,
    metadata?: { chapter?: string; topic?: string; difficulty?: string }
  ): Array<{ chunk: ChunkWithEmbedding; score: number }> {
    if (!query || query.trim().length === 0) {
      return [];
    }

    const queryTokens = this.tokenize(query);
    const results: Array<{ chunk: ChunkWithEmbedding; score: number; index: number }> = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];

      // Apply metadata filtering if provided
      if (metadata) {
        if (metadata.chapter && chunk.chapter !== metadata.chapter) continue;
        if (metadata.topic && chunk.topic !== metadata.topic) continue;
        if (metadata.difficulty && chunk.difficulty !== metadata.difficulty) continue;
      }

      const docTokens = this.tokenize(chunk.text);
      const score = this.calculateBM25Score(queryTokens, docTokens, docTokens.length);

      if (score > 0) {
        results.push({ chunk, score, index: i });
      }
    }

    // Sort by score (descending) and return top K
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map(({ chunk, score }) => ({ chunk, score }));
  }

  /**
   * Get corpus statistics
   */
  getStats() {
    return {
      indexedDocs: this.corpusStats.totalDocs,
      vocabularySize: this.corpusStats.docFrequency.size,
      avgDocLength: Math.round(this.corpusStats.avgDocLength),
      k1: this.k1,
      b: this.b,
    };
  }
}

export const bm25Search = new BM25SearchService();
