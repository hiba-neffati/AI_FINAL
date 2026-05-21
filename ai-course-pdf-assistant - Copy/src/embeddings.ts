import axios from "axios";

/**
 * Embedding Service using Hugging Face Inference API
 * Model: all-MiniLM-L6-v2 (384-dimensional, fast)
 */
class EmbeddingService {
  private apiUrl: string = "https://api-inference.huggingface.co/pipeline/feature-extraction";
  private modelName: string = "sentence-transformers/all-MiniLM-L6-v2";
  private hfToken: string;
  private dimension: number = 384;

  constructor() {
    this.hfToken = process.env.HUGGINGFACE_API_TOKEN || "";
    if (!this.hfToken) {
      console.warn("⚠️ HUGGINGFACE_API_TOKEN not set. Embeddings will fail.");
    }
  }

  /**
   * Generate embedding for a single text
   */
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      if (!this.hfToken) {
        throw new Error("HUGGINGFACE_API_TOKEN not configured");
      }

      if (!text || text.trim().length === 0) {
        throw new Error("Text cannot be empty");
      }

      const response = await axios.post(
        this.apiUrl,
        { inputs: text },
        {
          headers: {
            Authorization: `Bearer ${this.hfToken}`,
            "Content-Type": "application/json",
          },
          timeout: 30000,
        }
      );

      if (Array.isArray(response.data) && response.data.length > 0) {
        return response.data as number[];
      }

      throw new Error("Unexpected embedding response format");
    } catch (error: any) {
      console.error("[EMBEDDING] Generation failed:", error.message);
      throw error;
    }
  }

  /**
   * Generate embeddings for multiple texts (batch)
   * Processes with rate limiting to respect API limits
   */
  async generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
    try {
      const embeddings: number[][] = [];
      const batchSize = 32;

      console.log(`[EMBEDDING] Generating embeddings for ${texts.length} texts (batch size: ${batchSize})`);

      for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        const validBatch = batch.filter(t => t && t.trim().length > 0);

        if (validBatch.length === 0) {
          console.warn(`[EMBEDDING] Batch ${i / batchSize + 1} has no valid texts, skipping`);
          embeddings.push(...batch.map(() => Array(this.dimension).fill(0)));
          continue;
        }

        try {
          const response = await axios.post(
            this.apiUrl,
            { inputs: validBatch },
            {
              headers: {
                Authorization: `Bearer ${this.hfToken}`,
                "Content-Type": "application/json",
              },
              timeout: 30000,
            }
          );

          if (Array.isArray(response.data)) {
            embeddings.push(...response.data);
          } else {
            console.warn(`[EMBEDDING] Unexpected response format for batch ${i / batchSize + 1}`);
            embeddings.push(...batch.map(() => Array(this.dimension).fill(0)));
          }
        } catch (batchError: any) {
          console.error(`[EMBEDDING] Batch ${i / batchSize + 1} failed:`, batchError.message);
          embeddings.push(...batch.map(() => Array(this.dimension).fill(0)));
        }

        // Rate limiting between batches
        if (i + batchSize < texts.length) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }

      console.log(`[EMBEDDING] Generated ${embeddings.length} embeddings successfully`);
      return embeddings;
    } catch (error: any) {
      console.error("[EMBEDDING] Batch generation failed:", error.message);
      throw error;
    }
  }

  /**
   * Get embedding configuration
   */
  getConfig() {
    return {
      model: this.modelName,
      dimension: this.dimension,
      provider: "huggingface",
    };
  }
}

export const embeddingService = new EmbeddingService();
