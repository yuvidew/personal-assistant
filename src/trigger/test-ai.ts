import { task } from "@trigger.dev/sdk";
import { generateText } from "ai";
import { model } from "../ai.js";

// TEMPORARY: test task backing GET /test/ai. Remove together with the route.
export const testAiText = task({
  id: "test-ai-text",
  run: async (payload: { prompt: string }) => {
    const result = await generateText({ model, prompt: payload.prompt });
    return { text: result.text };
  },
});
