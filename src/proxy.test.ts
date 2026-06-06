import { describe, it, expect } from 'vitest';
import { remapModel } from './proxy.js';

describe('remapModel', () => {
  it('remaps claude-opus-4-8 to deepseek-v4-pro', () => {
    const result = remapModel('claude-opus-4-8');
    expect(result.remapped).toBe('deepseek-v4-pro');
    expect(result.original).toBe('claude-opus-4-8');
  });

  it('remaps claude-opus-4-8[1m] (with bracket suffix)', () => {
    const result = remapModel('claude-opus-4-8[1m]');
    expect(result.remapped).toBe('deepseek-v4-pro');
  });

  it('remaps claude-sonnet-4-6 to deepseek-v4-flash', () => {
    const result = remapModel('claude-sonnet-4-6');
    expect(result.remapped).toBe('deepseek-v4-flash');
  });

  it('remaps claude-haiku-4-5', () => {
    const result = remapModel('claude-haiku-4-5');
    expect(result.remapped).toBe('deepseek-v4-flash');
  });

  it('remaps deepseek-chat legacy alias', () => {
    const result = remapModel('deepseek-chat');
    expect(result.remapped).toBe('deepseek-v4-flash');
  });

  it('remaps deepseek-reasoner legacy alias', () => {
    const result = remapModel('deepseek-reasoner');
    expect(result.remapped).toBe('deepseek-r1');
  });

  it('passes through unknown model names unchanged', () => {
    const result = remapModel('gpt-5-unobtainium');
    expect(result.remapped).toBe('gpt-5-unobtainium');
    expect(result.original).toBe('gpt-5-unobtainium');
  });

  it('passes through deepseek models directly', () => {
    // deepseek-v4-flash is in MODEL_MAP values but not keys
    // It should pass through (no mapping needed)
    const result = remapModel('deepseek-v4-flash');
    expect(result.remapped).toBe('deepseek-v4-flash');
  });

  it('handles empty model name', () => {
    const result = remapModel('');
    expect(result.remapped).toBe('');
  });

  it('fuzzy-matches claude-opus-4-8 with @date suffix', () => {
    const result = remapModel('claude-opus-4-8@20251001');
    expect(result.remapped).toBe('deepseek-v4-pro');
  });
});
