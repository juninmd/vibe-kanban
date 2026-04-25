import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";

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
      const google = createGoogleGenerativeAI({
        apiKey: process.env.GEMINI_API_KEY,
      });
      const { text } = await generateText({
        model: google("gemini-2.5-pro"),
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
