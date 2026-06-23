function isAnthropicOverloadedError(message: string) {
  const normalized = message.toLowerCase();
  return normalized.includes("overloaded_error") || normalized.includes("overloaded");
}

export async function callAnthropic({
  system,
  prompt,
  maxTokens = 2000,
  useStructuredOutput = false
}: {
  system: string;
  prompt: string;
  maxTokens?: number;
  useStructuredOutput?: boolean;
}): Promise<string> {
  const requestBody: Record<string, unknown> = {
    model: "claude-sonnet-4-6",
    max_tokens: maxTokens,
    system: system,
    messages: [
      {
        role: "user",
        content: prompt
      }
    ],
    ...(useStructuredOutput ? { temperature: 0 } : {})
  };

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Anthropic API request failed. ${text}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text?.trim();

  if (!text) {
    throw new Error("Anthropic did not return a usable response.");
  }

  return text;
}

export async function callAnthropicWithRetry(
  params: Parameters<typeof callAnthropic>[0],
  retries = 4
): Promise<string> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await callAnthropic(params);
    } catch (err) {
      console.error("[anthropic] callAnthropicWithRetry error (attempt " + attempt + "):", err);
      const message = err instanceof Error ? err.message : "";
      const isOverloaded = isAnthropicOverloadedError(message);
      if (isOverloaded && attempt < retries) {
        await new Promise((res) => setTimeout(res, 5000 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
  throw new Error("Max retries exceeded");
}
