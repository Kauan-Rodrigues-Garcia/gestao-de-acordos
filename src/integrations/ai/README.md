/**
 * src/integrations/ai/README.md
 *
 * # Camada de IA — AcordosPRO
 *
 * ## Estrutura
 * ```
 * src/integrations/ai/
 *   index.ts          ← ponto de entrada, factory, funções de domínio
 *   providers/
 *     openai.ts       ← adapter OpenAI (pronto para ativar)
 *     anthropic.ts    ← adapter Anthropic (a implementar)
 *   README.md         ← este arquivo
 * ```
 *
 * ## Como ativar
 *
 * ### 1. Adicionar variáveis no .env
 * ```env
 * VITE_AI_ENABLED=true
 * VITE_AI_PROVIDER=openai
 * VITE_AI_API_KEY=sk-proj-...
 * VITE_AI_MODEL=gpt-4o-mini
 * # Para self-hosted (Ollama, etc.):
 * # VITE_AI_ENDPOINT=http://localhost:11434/v1/chat/completions
 * ```
 *
 * ### 2. Ativar o provider no factory (src/integrations/ai/index.ts)
 * ```ts
 * // Descomentar no createAIProvider():
 * import { createOpenAIProvider } from './providers/openai';
 * return createOpenAIProvider(cfg);
 * ```
 *
 * ## Uso nas telas
 * ```ts
 * import { responderPergunta, sugerirAcaoAcordo } from '@/integrations/ai';
 *
 * const resposta = await responderPergunta('Quais acordos vencem essa semana?', { usuario: perfil });
 * const acao = await sugerirAcaoAcordo(acordo);
 * ```
 *
 * ## Segurança
 * - Para produção, NUNCA expor API key no frontend
 * - Criar Edge Function no Supabase como proxy:
 *   `supabase/edge_function/ai-proxy/index.ts`
 * - A camada atual já está preparada para trocar o endpoint por uma URL interna
 *
 * ## Funcionalidades planejadas
 * - [ ] Chat assistente para operadores (tirar dúvidas)
 * - [ ] Sugestão de ação para acordos vencidos
 * - [ ] Resumo analítico do setor para líderes
 * - [ ] Geração automática de mensagens WhatsApp personalizadas
 * - [ ] Detecção de padrões de inadimplência
 */
