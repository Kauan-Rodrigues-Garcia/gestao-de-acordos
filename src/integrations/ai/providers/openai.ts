/**
 * src/integrations/ai/providers/openai.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Adapter OpenAI — implementar quando VITE_AI_PROVIDER=openai
 *
 * Para ativar:
 *  1. VITE_AI_PROVIDER=openai
 *  2. VITE_AI_API_KEY=sk-...
 *  3. VITE_AI_MODEL=gpt-4o-mini  (ou outro)
 *  4. VITE_AI_ENABLED=true
 *
 * ATENÇÃO: chamadas com API key no frontend expõem a chave.
 * Para produção, use um backend/edge function como proxy.
 */

import type { AIProvider, AIConfig, AICompletionOptions, AICompletionResult } from '../index';

interface OpenAIMessage {
  role:    string;
  content: string;
}

interface OpenAIResponse {
  choices: { message: { content: string } }[];
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  model: string;
}

export function createOpenAIProvider(cfg: AIConfig): AIProvider {
  const model    = cfg.model    || 'gpt-4o-mini';
  const endpoint = cfg.endpoint || 'https://api.openai.com/v1/chat/completions';

  return {
    name:    'openai',
    model,
    enabled: cfg.enabled,

    async complete(opts: AICompletionOptions): Promise<AICompletionResult> {
      const messages: OpenAIMessage[] = [];

      if (opts.systemPrompt) {
        messages.push({ role: 'system', content: opts.systemPrompt });
      }
      messages.push(...opts.messages.map(m => ({ role: m.role, content: m.content })));

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${cfg.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          max_tokens:  opts.maxTokens  ?? 500,
          temperature: opts.temperature ?? 0.7,
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`OpenAI error ${response.status}: ${err}`);
      }

      const data: OpenAIResponse = await response.json();
      const text = data.choices[0]?.message?.content || '';

      return {
        text,
        provider: 'openai',
        model,
        usage: data.usage ? {
          promptTokens:     data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens:      data.usage.total_tokens,
        } : undefined,
      };
    },
  };
}
