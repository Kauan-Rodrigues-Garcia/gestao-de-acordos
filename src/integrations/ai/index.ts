/**
 * src/integrations/ai/index.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Ponto de entrada da camada de integração com APIs de IA.
 *
 * ESTADO ATUAL: Preparado para expansão — não faz chamadas reais ainda.
 *
 * Quando pronto para integrar:
 *  1. Adicionar no .env: VITE_AI_PROVIDER, VITE_AI_API_KEY, VITE_AI_ENDPOINT
 *  2. Implementar o adapter específico do provider (OpenAI, Anthropic, etc.)
 *  3. As chamadas de IA NÃO devem ir direto das telas — sempre via este módulo
 *
 * Arquitetura:
 *  - AIProvider (interface): contrato que qualquer LLM deve implementar
 *  - AIContext (React context): injeção nas telas via hook useAI()
 *  - Funções de domínio: resumirAcordo(), sugerirAcao(), responderPergunta()
 */

// ─── Tipos ──────────────────────────────────────────────────────────────

export interface AIMessage {
  role:    'system' | 'user' | 'assistant';
  content: string;
}

export interface AICompletionOptions {
  messages:    AIMessage[];
  maxTokens?:  number;
  temperature?: number;
  systemPrompt?: string;
}

export interface AICompletionResult {
  text:     string;
  provider: string;
  model:    string;
  usage?: {
    promptTokens:     number;
    completionTokens: number;
    totalTokens:      number;
  };
}

/** Contrato que qualquer provider de IA deve implementar */
export interface AIProvider {
  name:    string;
  model:   string;
  enabled: boolean;
  complete(opts: AICompletionOptions): Promise<AICompletionResult>;
}

// ─── Configuração do provider ────────────────────────────────────────────

export interface AIConfig {
  provider:    'openai' | 'anthropic' | 'gemini' | 'ollama' | 'none';
  apiKey?:     string;        // via env VITE_AI_API_KEY
  endpoint?:   string;        // via env VITE_AI_ENDPOINT (para self-hosted)
  model?:      string;        // via env VITE_AI_MODEL
  enabled:     boolean;
}

export function getAIConfig(): AIConfig {
  return {
    provider:  (import.meta.env.VITE_AI_PROVIDER as AIConfig['provider']) || 'none',
    apiKey:    import.meta.env.VITE_AI_API_KEY   || undefined,
    endpoint:  import.meta.env.VITE_AI_ENDPOINT  || undefined,
    model:     import.meta.env.VITE_AI_MODEL      || undefined,
    enabled:   import.meta.env.VITE_AI_ENABLED === 'true',
  };
}

// ─── Provider NullObject (padrão enquanto IA não está configurada) ───────

const NullProvider: AIProvider = {
  name:    'none',
  model:   'none',
  enabled: false,
  async complete(_opts: AICompletionOptions): Promise<AICompletionResult> {
    return {
      text:     '[IA não configurada. Adicione VITE_AI_PROVIDER e VITE_AI_API_KEY no .env]',
      provider: 'none',
      model:    'none',
    };
  },
};

// ─── Factory do provider ─────────────────────────────────────────────────

/** Retorna o provider ativo com base na configuração do ambiente */
export function createAIProvider(): AIProvider {
  const cfg = getAIConfig();
  if (!cfg.enabled || cfg.provider === 'none' || !cfg.apiKey) {
    return NullProvider;
  }
  // Adapters específicos serão importados dinamicamente quando necessário
  // Ex: import('./providers/openai').then(m => m.createOpenAIProvider(cfg))
  console.info(`[AI] Provider ${cfg.provider} configurado mas adapter não implementado ainda.`);
  return NullProvider;
}

// ─── Funções de domínio (prontas para implementação) ─────────────────────

const provider = createAIProvider();

/**
 * Responde perguntas sobre o sistema (acordos, clientes, prazos).
 * Context: perfil do usuário + dados relevantes.
 */
export async function responderPergunta(
  pergunta: string,
  contexto?: Record<string, unknown>
): Promise<string> {
  const result = await provider.complete({
    systemPrompt: `Você é um assistente interno do sistema AcordosPRO, especializado em gestão de acordos financeiros. 
Contexto do usuário: ${JSON.stringify(contexto || {})}.
Responda de forma direta, profissional e objetiva.`,
    messages: [{ role: 'user', content: pergunta }],
    maxTokens: 500,
  });
  return result.text;
}

/**
 * Sugere ação para um acordo baseado em seu status e histórico.
 * Retorna uma ação sugerida como texto.
 */
export async function sugerirAcaoAcordo(
  acordo: {
    nome_cliente: string;
    nr_cliente: string;
    status: string;
    vencimento: string;
    valor: number;
    observacoes?: string | null;
  }
): Promise<string> {
  const result = await provider.complete({
    systemPrompt: 'Você é um assistente de cobranças. Analise o acordo e sugira a melhor ação.',
    messages: [{
      role: 'user',
      content: `Acordo: NR ${acordo.nr_cliente}, Cliente: ${acordo.nome_cliente}, Status: ${acordo.status}, Vencimento: ${acordo.vencimento}, Valor: R$${acordo.valor}. O que fazer?`,
    }],
    maxTokens: 200,
  });
  return result.text;
}

/**
 * Gera resumo analítico de um conjunto de acordos.
 * Útil para líderes entenderem a situação do setor.
 */
export async function resumirAnalitico(dados: {
  totalAcordos:  number;
  valorPrevisto: number;
  valorRecebido: number;
  vencidos:      number;
  operadores:    string[];
}): Promise<string> {
  const result = await provider.complete({
    systemPrompt: 'Você é um analista financeiro. Resuma os dados de forma objetiva em 2-3 frases.',
    messages: [{
      role: 'user',
      content: `Dados do setor: ${JSON.stringify(dados)}. Gere um resumo executivo.`,
    }],
    maxTokens: 300,
  });
  return result.text;
}

export { provider as aiProvider };
