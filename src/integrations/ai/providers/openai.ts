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

      // Retry com backoff exponencial para rate-limit (HTTP 429) e 529
      // Max: 3 tentativas, delays: 1s, 2s, 4s
      const MAX_RETRIES = 3;
      const RETRYABLE = new Set([429, 500, 502, 503, 529]);
      let response: Response | null = null;

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        response = await fetch(endpoint, {
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

        if (response.ok || !RETRYABLE.has(response.status)) break;
        const retryAfter = response.headers.get('Retry-After');
        const delay = retryAfter
          ? parseFloat(retryAfter) * 1000
          : 1000 * Math.pow(2, attempt - 1);
        console.warn(`[OpenAI] HTTP ${response.status} - tentativa ${attempt}/${MAX_RETRIES} em ${delay}ms`);
        if (attempt < MAX_RETRIES) await new Promise(r => setTimeout(r, delay));
      }

      if (!response?.ok) {
        const err = await response?.text() ?? 'no response';
        throw new Error(`OpenAI error ${response?.status}: ${err}`);
      }

      const data: OpenAIResponse = await response!.json();
      const text = data.choices[0]?.message?.content || '';
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
