/**
 * Groq: OpenAI-compatible chat completions.
 *
 * Fast inference on open models, used for short structured page work. The
 * free tier limits tokens per minute per model (8,000 on gpt-oss-120b when
 * verified), which the retry loop respects by waiting as long as Groq asks.
 */

import type { ProviderConfig } from "../config";
import { OpenAiCompatibleProvider } from "./openai-compatible";

export class GroqProvider extends OpenAiCompatibleProvider {
  constructor(config: ProviderConfig) {
    super(config, "groq");
  }
}
