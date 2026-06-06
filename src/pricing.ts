import pricingData from '../pricing.json' with { type: 'json' };

export interface ModelPricing {
  input: number;       // $ per 1M tokens
  output: number;      // $ per 1M tokens
  cache_read: number;  // $ per 1M tokens (cache hit discount)
  cache_write: number; // $ per 1M tokens (same as input, for cache writes)
}

export interface CostBreakdown {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
  cost: number;
  inputCost: number;
  outputCost: number;
  cacheReadCost: number;
  cacheWriteCost: number;
  pricing: ModelPricing;
}

const pricingMap: Record<string, ModelPricing> = {};

// Load pricing from JSON
for (const [model, prices] of Object.entries(pricingData.models)) {
  // Skip comment keys (start with _)
  if (model.startsWith('_')) continue;
  pricingMap[model] = prices as ModelPricing;
}

const MILLION = 1_000_000;

/**
 * Get pricing for a specific model
 */
export function getPricing(model: string): ModelPricing {
  const exact = pricingMap[model];
  if (exact) return exact;

  // Try fuzzy match: strip version suffixes
  const base = model.replace(/-20\d{6}$/, ''); // remove date suffixes like -20251001
  for (const [key, val] of Object.entries(pricingMap)) {
    if (base.startsWith(key) || key.startsWith(base)) {
      return val;
    }
  }

  // Default fallback
  console.warn(`[ccgate] Unknown model "${model}", using deepseek-v4-flash pricing`);
  return pricingMap['deepseek-v4-flash']!;
}

/**
 * Calculate cost for a request
 */
export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens: number,
  cacheWriteTokens: number,
): CostBreakdown {
  const pricing = getPricing(model);

  // Safety clamp: cache_read can never exceed total input
  const safeCacheRead = Math.min(cacheReadTokens, inputTokens);
  const safeCacheWrite = Math.min(cacheWriteTokens, inputTokens);

  const inputCost = ((inputTokens - safeCacheRead) / MILLION) * pricing.input;
  const outputCost = (outputTokens / MILLION) * pricing.output;
  const cacheReadCost = (safeCacheRead / MILLION) * pricing.cache_read;
  const cacheWriteCost = (safeCacheWrite / MILLION) * pricing.cache_write;
  const cost = Math.max(0, inputCost + outputCost + cacheReadCost + cacheWriteCost);

  return {
    model,
    inputTokens,
    outputTokens,
    cacheReadTokens: safeCacheRead,
    cacheWriteTokens: safeCacheWrite,
    totalTokens: inputTokens + outputTokens,
    cost,
    inputCost,
    outputCost,
    cacheReadCost,
    cacheWriteCost,
    pricing,
  };
}

/**
 * Format cost as a dollar string
 */
export function formatCost(cost: number): string {
  return `$${cost.toFixed(6)}`;
}

/**
 * Validate that the model exists in our pricing data
 */
export function isKnownModel(model: string): boolean {
  return model in pricingMap;
}
