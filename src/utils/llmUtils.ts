import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { createGeminiProvider } from "ai-sdk-provider-gemini-cli";

export async function callLLM(prompt: string, systemPrompt?: string): Promise<string | undefined> {
  try {
    if (process.env.OPENAI_API_KEY) {
      const { text } = await generateText({
        model: openai("gpt-4o"),
        system: systemPrompt || "You generate JSON arrays.",
        prompt,
      });
      return text;
    } else if (process.env.GEMINI_API_KEY) {
      const gemini = createGeminiProvider({
        authType: 'api-key',
        apiKey: process.env.GEMINI_API_KEY,
      });
      const { text } = await generateText({
        model: gemini("gemini-2.5-pro"),
        system: systemPrompt,
        prompt,
      });
      return text;
    }
  } catch (err: unknown) {
    if (err instanceof Error) {
      console.error(`LLM call failed: ${err.message}`);
    }
    return undefined;
  }
  return undefined;
}
