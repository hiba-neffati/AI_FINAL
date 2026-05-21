import { ChunkWithEmbedding, ValidationResult } from "./types.js";

/**
 * Response Validation Service
 * Validates LLM responses against source documents to prevent hallucinations
 */
class ResponseValidationService {
  /**
   * Extract claims from LLM response
   * Simple approach: split by sentences and filter for meaningful ones
   */
  private extractClaims(text: string): string[] {
    return text
      .split(/[.!?]\s+/)
      .map((sentence) => sentence.trim())
      .filter(
        (sentence) => sentence.length > 10 && !sentence.startsWith("Please"),
      );
  }

  /**
   * Check if a claim is supported by source chunks
   */
  private isClaimSupportedByChunk(claim: string, chunkText: string): boolean {
    const claimTokens = this.tokenize(claim);
    const chunkTokens = this.tokenize(chunkText);

    // Check for exact phrase match
    if (chunkText.toLowerCase().includes(claim.toLowerCase())) {
      return true;
    }

    // Check for significant token overlap (at least 60%)
    const matchingTokens = claimTokens.filter((token) =>
      chunkTokens.some((t) => t.includes(token) || token.includes(t)),
    );

    const overlapRatio = matchingTokens.length / claimTokens.length;
    return overlapRatio >= 0.6;
  }

  /**
   * Tokenize text for comparison
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .split(/\s+/)
      .filter((token) => token.length > 2);
  }

  /**
   * Calculate confidence score based on source support
   */
  private calculateConfidence(
    validatedClaims: string[],
    flaggedClaims: string[],
  ): number {
    const total = validatedClaims.length + flaggedClaims.length;
    if (total === 0) return 0.5; // Unknown
    return validatedClaims.length / total;
  }

  /**
   * Main validation function
   */
  validateResponse(
    response: string,
    sourceChunks: ChunkWithEmbedding[],
  ): ValidationResult {
    if (sourceChunks.length === 0) {
      return {
        isValid: false,
        confidence: 0,
        sourceChunkIds: [],
        validatedClaims: [],
        flaggedClaims: [response],
      };
    }

    const claims = this.extractClaims(response);
    const validatedClaims: string[] = [];
    const flaggedClaims: string[] = [];
    const supportingChunks = new Set<string>();

    // Validate each claim against source chunks
    for (const claim of claims) {
      let isSupported = false;

      for (const chunk of sourceChunks) {
        if (this.isClaimSupportedByChunk(claim, chunk.text)) {
          isSupported = true;
          supportingChunks.add(chunk.id);
          break;
        }
      }

      if (isSupported) {
        validatedClaims.push(claim);
      } else {
        flaggedClaims.push(claim);
      }
    }

    const confidence = this.calculateConfidence(validatedClaims, flaggedClaims);
    const isValid = confidence >= 0.7; // Consider valid if 70%+ claims are supported

    console.log(`[VALIDATION] Response validation:`);
    console.log(
      `  - Total claims: ${claims.length}, Supported: ${validatedClaims.length}, Flagged: ${flaggedClaims.length}`,
    );
    console.log(
      `  - Confidence: ${(confidence * 100).toFixed(1)}%, Valid: ${isValid}`,
    );

    return {
      isValid,
      confidence,
      sourceChunkIds: Array.from(supportingChunks),
      validatedClaims,
      flaggedClaims,
    };
  }

  /**
   * Format validation result for display
   */
  formatValidationForDisplay(
    response: string,
    validation: ValidationResult,
  ): string {
    if (validation.confidence >= 0.9) {
      return response; // High confidence, no disclaimer needed
    }

    if (validation.confidence >= 0.7) {
      return `${response}\n\n✓ [Mostly verified against source material]`;
    }

    if (validation.confidence >= 0.5) {
      return `${response}\n\n⚠️ [Partially verified - some claims not found in source material]`;
    }

    return response;
  }

  /**
   * Strict validation - very high threshold
   */
  validateResponseStrict(
    response: string,
    sourceChunks: ChunkWithEmbedding[],
  ): { isValid: boolean; reason: string } {
    const validation = this.validateResponse(response, sourceChunks);

    if (validation.confidence >= 0.8) {
      return { isValid: true, reason: "High confidence in source support" };
    }

    if (validation.confidence >= 0.5) {
      return {
        isValid: true,
        reason: "Partially supported by source material",
      };
    }

    return {
      isValid: false,
      reason: `Low source support (${(validation.confidence * 100).toFixed(0)}% confidence)`,
    };
  }
}

export const responseValidationService = new ResponseValidationService();
