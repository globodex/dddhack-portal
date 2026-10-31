/** Published list prices, not billing data or account-access assertions. */
export const modelPricing = {
  source: "https://developers.openai.com/api/docs/pricing",
  checkedAt: "2026-10-31",
  currency: "USD",
  unit: "1M tokens",
  scope: "Standard text, short context. Batch/Flex/Fast, long context, cache writes, tools and regional charges differ. Account access is not verified.",
};
export const aiModelChoices = [
  { id: "gpt-6-astra", name: "GPT-6 Astra", input: 10, output: 50, cachedInput: 1 },
  { id: "gpt-6.1-sol", name: "GPT-6.1 Sol", input: 2, output: 10, cachedInput: 0.1 },
  { id: "gpt-6.1-terra", name: "GPT-6.1 Terra", input: 1, output: 5, cachedInput: 0.05 },
  { id: "gpt-6-luna", name: "GPT-6 Luna", input: 0.1, output: 0.5, cachedInput: 0.01 },
] as const;
