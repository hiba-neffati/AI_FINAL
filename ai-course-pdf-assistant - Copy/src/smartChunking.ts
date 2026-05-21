import { SmartChunk } from "./types.js";

/**
 * Smart Chunking Service
 * Implements semantic chunking with overlap, variable sizes, and boundary detection
 */
class SmartChunkingService {
  private minChunkSize: number = 250; // Minimum chunk size
  private maxChunkSize: number = 1500; // Maximum chunk size
  private overlapSize: number = 100; // Overlap between chunks in chars
  private targetChunkSize: number = 800; // Target size for optimal chunks

  /**
   * Detect semantic boundaries (sections, paragraphs, sentences)
   */
  private detectSemanticBoundaries(text: string): number[] {
    const boundaries: number[] = [];
    const paragraphRegex = /\n\n+/g; // Double newlines (paragraph breaks)
    const sectionRegex = /^#{1,6}\s+.+$/gm; // Markdown headers
    const sentenceRegex = /[.!?]\s+/g; // Sentence endings

    let match;

    // Find paragraph breaks
    while ((match = paragraphRegex.exec(text)) !== null) {
      boundaries.push(match.index);
    }

    // Find section headers
    while ((match = sectionRegex.exec(text)) !== null) {
      boundaries.push(match.index);
    }

    // Find sentence endings (but not all of them, just key ones)
    let sentenceCount = 0;
    paragraphRegex.lastIndex = 0;
    while ((match = sentenceRegex.exec(text)) !== null && sentenceCount < 20) {
      boundaries.push(match.index);
      sentenceCount++;
    }

    return [...new Set(boundaries)].sort((a, b) => a - b);
  }

  /**
   * Find best chunk boundary near target position
   */
  private findBestBoundary(
    text: string,
    targetPos: number,
    backwards: boolean = false
  ): { pos: number; isSemantic: boolean } {
    const searchRange = 200; // Look within 200 chars
    const boundaries = this.detectSemanticBoundaries(text);

    if (backwards) {
      // Find boundary before target
      const candidateBoundaries = boundaries.filter(
        (b) => b < targetPos && b > targetPos - searchRange
      );
      if (candidateBoundaries.length > 0) {
        return { pos: candidateBoundaries[candidateBoundaries.length - 1], isSemantic: true };
      }

      // Fallback: sentence boundary
      const sentenceMatch = text.lastIndexOf(".", targetPos - 1);
      if (sentenceMatch > targetPos - searchRange) {
        return { pos: sentenceMatch + 1, isSemantic: false };
      }

      return { pos: targetPos - searchRange, isSemantic: false };
    } else {
      // Find boundary after target
      const candidateBoundaries = boundaries.filter(
        (b) => b > targetPos && b < targetPos + searchRange
      );
      if (candidateBoundaries.length > 0) {
        return { pos: candidateBoundaries[0], isSemantic: true };
      }

      // Fallback: sentence boundary
      const sentenceMatch = text.indexOf(".", targetPos);
      if (sentenceMatch > 0 && sentenceMatch < targetPos + searchRange) {
        return { pos: sentenceMatch + 1, isSemantic: false };
      }

      return { pos: Math.min(targetPos + searchRange, text.length), isSemantic: false };
    }
  }

  /**
   * Extract chapter and section from text context
   */
  private extractMetadata(text: string): { chapter?: string; section?: string } {
    const chapterMatch = text.match(/^#+\s+(.+?)$/m);
    const chapter = chapterMatch ? chapterMatch[1].trim() : undefined;

    const sectionMatch = text.match(/^##\s+(.+?)$/m);
    const section = sectionMatch ? sectionMatch[1].trim() : undefined;

    return { chapter, section };
  }

  /**
   * Main smart chunking function
   * Returns chunks with semantic boundaries, overlap, and variable sizes
   */
  smartChunk(text: string): SmartChunk[] {
    if (!text || text.trim().length === 0) {
      return [];
    }

    const chunks: SmartChunk[] = [];
    let currentPos = 0;
    let chunkIndex = 0;

    while (currentPos < text.length) {
      // Determine chunk size (variable based on content density)
      const remainingText = text.substring(currentPos);
      const density = (remainingText.match(/\s/g) || []).length / remainingText.length;
      let targetSize = this.targetChunkSize;

      // Adjust target size based on text density
      if (density < 0.15) {
        // Dense text (code, formulas)
        targetSize = Math.max(this.minChunkSize, this.targetChunkSize * 0.8);
      } else if (density > 0.25) {
        // Sparse text (conversational)
        targetSize = Math.min(this.maxChunkSize, this.targetChunkSize * 1.2);
      }

      const endPos = Math.min(currentPos + targetSize, text.length);

      // Find best semantic boundary
      if (endPos < text.length) {
        const boundary = this.findBestBoundary(text, endPos, false);
        const chunkText = text
          .substring(currentPos, boundary.pos)
          .trim();

        if (chunkText.length >= this.minChunkSize) {
          const { chapter, section } = this.extractMetadata(
            text.substring(Math.max(0, currentPos - 500), Math.min(text.length, currentPos + 500))
          );

          chunks.push({
            id: `chunk_${chunkIndex}`,
            text: chunkText,
            startChar: currentPos,
            endChar: boundary.pos,
            size: chunkText.length,
            semanticBoundary: boundary.isSemantic,
            overlapWithPrevious: chunkIndex > 0 ? this.overlapSize : 0,
          });

          // Move to next chunk start (with overlap)
          currentPos = Math.max(currentPos + chunkText.length - this.overlapSize, boundary.pos);
          chunkIndex++;
        } else {
          currentPos = endPos;
        }
      } else {
        // Last chunk
        const chunkText = text.substring(currentPos).trim();
        if (chunkText.length > 0) {
          chunks.push({
            id: `chunk_${chunkIndex}`,
            text: chunkText,
            startChar: currentPos,
            endChar: text.length,
            size: chunkText.length,
            semanticBoundary: true,
            overlapWithPrevious: chunkIndex > 0 ? this.overlapSize : 0,
          });
        }
        break;
      }
    }

    console.log(
      `[SMART_CHUNKING] Created ${chunks.length} chunks (avg size: ${Math.round(
        text.length / chunks.length
      )} chars, with ${this.overlapSize}char overlap)`
    );

    return chunks;
  }

  /**
   * Get configuration
   */
  getConfig() {
    return {
      minChunkSize: this.minChunkSize,
      maxChunkSize: this.maxChunkSize,
      targetChunkSize: this.targetChunkSize,
      overlapSize: this.overlapSize,
    };
  }
}

export const smartChunkingService = new SmartChunkingService();
