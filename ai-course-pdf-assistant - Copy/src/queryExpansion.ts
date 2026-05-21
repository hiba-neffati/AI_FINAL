import { ExpandedQuery } from "./types.js";

/**
 * Query Expansion Service
 * Generates related queries and decomposed queries to improve retrieval coverage
 */
class QueryExpansionService {
  private synonymMap: { [key: string]: string[] } = {
    algorithm: ["method", "procedure", "process", "technique"],
    training: ["learning", "optimization", "fitting", "adjusting"],
    model: ["network", "architecture", "framework", "system"],
    parameter: ["weight", "coefficient", "variable", "value"],
    accuracy: ["performance", "precision", "error rate", "score"],
    gradient: ["derivative", "slope", "rate of change"],
    loss: ["error", "cost", "objective"],
    epoch: ["iteration", "pass", "round"],
    layer: ["level", "stage", "component"],
    activation: ["function", "operation", "transformation"],
    regression: ["fitting", "prediction", "estimation"],
    classification: ["categorization", "clustering", "labeling"],
    neural: ["artificial", "deep", "network"],
    backpropagation: ["backward pass", "gradient descent", "weight update"],
    optimization: ["minimization", "tuning", "adjustment"],
  };

  /**
   * Generate synonyms for key terms
   */
  private expandSynonyms(query: string): string[] {
    const words = query.toLowerCase().split(/\s+/);
    const expandedQueries: string[] = [query];

    for (const word of words) {
      const synonyms = this.synonymMap[word] || [];
      for (const synonym of synonyms) {
        const expanded = query.replace(new RegExp(`\\b${word}\\b`, "gi"), synonym);
        expandedQueries.push(expanded);
      }
    }

    return [...new Set(expandedQueries)]; // Remove duplicates
  }

  /**
   * Decompose complex queries into simpler sub-queries
   */
  private decomposeQuery(query: string): string[] {
    const decomposed: string[] = [];

    // Extract main terms (likely nouns/concepts)
    const terms = query
      .split(/\s+and\s+|,\s+|;\s+/i)
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    if (terms.length > 1) {
      decomposed.push(...terms);
    }

    // Generate "What is X?" and "How does X work?" queries
    const mainConcept = this.extractMainConcept(query);
    if (mainConcept) {
      decomposed.push(`What is ${mainConcept}?`);
      decomposed.push(`How does ${mainConcept} work?`);
      decomposed.push(`Explain ${mainConcept}`);
      decomposed.push(`Types of ${mainConcept}`);
      decomposed.push(`${mainConcept} example`);
    }

    return decomposed;
  }

  /**
   * Extract main concept from query
   */
  private extractMainConcept(query: string): string {
    // Remove question marks and common question words
    let cleaned = query.replace(/\?$/g, "").trim();
    cleaned = cleaned.replace(/^(what|how|why|when|where|which|who)\s+is\s+/i, "");
    cleaned = cleaned.replace(/^(explain|describe|tell|show)\s+/i, "");

    // Get the first noun phrase
    const words = cleaned.split(/\s+/);
    if (words.length > 0) {
      return words.slice(0, Math.min(3, words.length)).join(" ");
    }

    return cleaned;
  }

  /**
   * Generate specific query variations
   */
  private generateSpecificQueries(query: string): string[] {
    const specific: string[] = [];

    // Add chapter/section references
    specific.push(`chapter ${query}`);
    specific.push(`section ${query}`);

    // Add context keywords
    specific.push(`${query} example`);
    specific.push(`${query} implementation`);
    specific.push(`${query} definition`);
    specific.push(`${query} formula`);
    specific.push(`${query} algorithm`);

    return specific;
  }

  /**
   * Main expansion function
   */
  expandQuery(query: string, maxExpansions: number = 10): ExpandedQuery {
    const allExpanded: Array<{ query: string; type: string }> = [];

    // Synonym expansion
    const synonyms = this.expandSynonyms(query);
    synonyms.forEach((q) => {
      if (q !== query) allExpanded.push({ query: q, type: "synonym" });
    });

    // Decomposition
    const decomposed = this.decomposeQuery(query);
    decomposed.forEach((q) => {
      if (q !== query) allExpanded.push({ query: q, type: "decomposition" });
    });

    // Specific variations
    const specific = this.generateSpecificQueries(query);
    specific.forEach((q) => {
      if (q !== query) allExpanded.push({ query: q, type: "specific" });
    });

    // Deduplicate and limit
    const uniqueQueries = [...new Set(allExpanded.map((x) => x.query))];
    const deduplicated = uniqueQueries.map((q) => {
      const type = allExpanded.find((x) => x.query === q)?.type || "other";
      return { query: q, type };
    });

    const result = deduplicated.slice(0, maxExpansions);

    console.log(`[QUERY_EXPANSION] Original: "${query}"`);
    console.log(
      `[QUERY_EXPANSION] Expanded to ${result.length} queries:`,
      result.map((r) => `${r.query} (${r.type})`).join(" | ")
    );

    return {
      original: query,
      expanded: result.map((r) => r.query),
      types: result.map((r) => r.type),
    };
  }

  /**
   * Get synonym map (for debugging/stats)
   */
  getSynonymMap() {
    return this.synonymMap;
  }
}

export const queryExpansionService = new QueryExpansionService();
