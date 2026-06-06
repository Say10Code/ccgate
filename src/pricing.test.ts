import { describe, it, expect } from 'vitest';
import { calculateCost, getPricing, isKnownModel } from './pricing.js';

describe('Pricing', () => {
  describe('getPricing', () => {
    it('returns pricing for known models', () => {
      expect(getPricing('deepseek-v4-flash')).toBeDefined();
      expect(getPricing('deepseek-v4-flash').input).toBe(0.30);
      expect(getPricing('deepseek-v4-flash').output).toBe(0.50);

      expect(getPricing('deepseek-v4-pro')).toBeDefined();
      expect(getPricing('deepseek-r1')).toBeDefined();
      expect(getPricing('deepseek-v3.2')).toBeDefined();
    });

    it('returns default pricing for unknown models', () => {
      const pricing = getPricing('unknown-model-12345');
      expect(pricing).toBeDefined();
      expect(pricing.input).toBe(0.30); // defaults to v4-flash
    });

    it('fuzzy-matches model names with date suffixes', () => {
      const pricing = getPricing('deepseek-v4-flash-20251001');
      expect(pricing.input).toBe(0.30);
    });
  });

  describe('calculateCost', () => {
    it('calculates cost for basic input/output', () => {
      const result = calculateCost('deepseek-v4-flash', 1000000, 500000, 0, 0);
      // 1M input * $0.30/M = $0.30, 0.5M output * $0.50/M = $0.25
      expect(result.inputCost).toBeCloseTo(0.30, 4);
      expect(result.outputCost).toBeCloseTo(0.25, 4);
      expect(result.cost).toBeCloseTo(0.55, 4);
    });

    it('calculates cost with cache hit discount', () => {
      const result = calculateCost('deepseek-v4-flash', 1000000, 0, 500000, 0);
      // 500K cache read * $0.03/M + 500K input * $0.30/M
      expect(result.cacheReadCost).toBeCloseTo(0.015, 4);
      expect(result.inputCost).toBeCloseTo(0.15, 4); // (1M - 500K) * 0.30/M
    });

    it('calculates zero cost for empty request', () => {
      const result = calculateCost('deepseek-v4-flash', 0, 0, 0, 0);
      expect(result.cost).toBe(0);
    });

    it('rounds to reasonable precision', () => {
      const result = calculateCost('deepseek-v4-flash', 1, 1, 0, 0);
      // 1 token: $0.0000003 for input, $0.0000005 for output
      expect(result.cost).toBeCloseTo(0.0000008, 6);
    });

    it('provides full breakdown', () => {
      const result = calculateCost('deepseek-v4-pro', 2000000, 1000000, 500000, 100000);
      expect(result.model).toBe('deepseek-v4-pro');
      expect(result.totalTokens).toBe(3000000);
      expect(result.pricing.input).toBe(0.42);
      expect(result.pricing.output).toBe(0.84);
    });
  });

  describe('isKnownModel', () => {
    it('recognizes configured models', () => {
      expect(isKnownModel('deepseek-v4-flash')).toBe(true);
      expect(isKnownModel('deepseek-v4-pro')).toBe(true);
      expect(isKnownModel('deepseek-r1')).toBe(true);
      expect(isKnownModel('deepseek-v3.2')).toBe(true);
    });

    it('returns false for unknown models', () => {
      expect(isKnownModel('claude-sonnet-4-6')).toBe(false);
      expect(isKnownModel('gpt-5')).toBe(false);
    });
  });
});
