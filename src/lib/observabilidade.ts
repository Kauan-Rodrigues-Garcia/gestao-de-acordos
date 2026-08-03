/**
 * observabilidade.ts — configuração do Sentry.
 *
 * ## Por que existe um arquivo para isto
 *
 * O `Sentry.init` morava solto no `main.tsx` com três linhas, e o resultado era
 * um relatório de erro que dizia O QUÊ mas não DE QUAL BUILD nem PARA QUEM:
 *
 *   • sem `release`, dois deploys diferentes viram o mesmo erro na lista, e não
 *     dá para saber se a correção de ontem funcionou;
 *   • sem identidade, um erro não se liga ao operador que reclamou — e é assim
 *     que o suporte descobre a maioria dos problemas aqui;
 *   • `tracesSampleRate` ligava *performance tracing*, que consome cota do plano
 *     e não ajuda em nada a rastrear erro.
 *
 * ## O que NÃO vai junto
 *
 * A diretoria fixou em 28/07/2026 que nenhum CPF de cliente fica no sistema.
 * Mandar um para um serviço externo é pior que gravá-lo no banco — sai do nosso
 * controle e não dá para apagar depois. O `beforeSend` mascara CPF em todo o
 * corpo do evento antes de ele sair da máquina, e `sendDefaultPii` fica
 * desligado para o Sentry não anexar IP e cabeçalhos por conta própria.
 *
 * Sem `VITE_SENTRY_DSN`, nada disto roda: `iniciarSentry` sai na primeira linha
 * e as funções de identidade viram no-op.
 */
import * as Sentry from '@sentry/react';
import { mascararCpf } from '@/lib/cpf';
import { getConfiguredTenantSlug } from '@/lib/tenant';

/** Identificação do build. `__APP_RELEASE__` é injetada em `vite.config.ts`. */
export const RELEASE = __APP_RELEASE__;

let ligado = false;

/** O Sentry está configurado e recebendo? Usado pelos testes e pelo diagnóstico. */
export function sentryAtivo(): boolean {
  return ligado;
}

/**
 * Mascara CPF em qualquer texto do evento, por mais fundo que ele esteja.
 *
 * A varredura é recursiva porque não dá para prever onde o valor aparece: pode
 * estar na mensagem da exceção, no nome de uma breadcrumb, no corpo de uma
 * requisição que falhou ou num `extra` que alguém adicionou depois.
 */
function limparTextos<T>(valor: T, profundidade = 0): T {
  if (profundidade > 8) return valor;
  if (typeof valor === 'string') return mascararCpf(valor) as unknown as T;
  if (Array.isArray(valor)) {
    return valor.map(v => limparTextos(v, profundidade + 1)) as unknown as T;
  }
  if (valor && typeof valor === 'object') {
    const saida: Record<string, unknown> = {};
    for (const [chave, v] of Object.entries(valor as Record<string, unknown>)) {
      saida[chave] = limparTextos(v, profundidade + 1);
    }
    return saida as unknown as T;
  }
  return valor;
}

/**
 * O DSN entra por PARÂMETRO, com o valor do ambiente como padrão.
 *
 * Parece detalhe, mas é o que torna esta função testável sem `vi.stubEnv` nem
 * `vi.resetModules()`. A primeira versão do teste usava os dois, e o preço
 * apareceu longe daqui: mexer no ambiente global e zerar o registro de módulos
 * derrubava um teste de OUTRO arquivo quando os dois caíam no mesmo worker.
 * Injetar o valor não tem esse efeito colateral.
 */
export function iniciarSentry(dsnBruto = import.meta.env.VITE_SENTRY_DSN): void {
  ligado = false;
  const dsn = dsnBruto?.trim();
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    release: RELEASE,
    // Erro é o que interessa. Tracing consumiria cota sem responder nenhuma
    // pergunta que a gente tenha hoje.
    tracesSampleRate: 0,
    // Nada de IP, cookie ou cabeçalho anexado automaticamente.
    sendDefaultPii: false,
    beforeSend: (evento) => limparTextos(evento),
    beforeBreadcrumb: (breadcrumb) => limparTextos(breadcrumb),
  });

  // Duas empresas, dois deploys. Sem esta etiqueta os erros das duas caem na
  // mesma lista e não dá para saber qual operação está quebrada.
  const tenant = getConfiguredTenantSlug();
  if (tenant) Sentry.setTag('tenant', tenant);

  ligado = true;
}

/** Quem está usando o sistema — id e usuário, nunca nome nem e-mail. */
export function identificarUsuario(dados: {
  id: string;
  usuario?: string | null;
  cargo?: string | null;
}): void {
  if (!ligado) return;
  Sentry.setUser({ id: dados.id, username: dados.usuario ?? undefined });
  Sentry.setTag('cargo', dados.cargo ?? 'sem-cargo');
}

/** Logout: o próximo erro não pode sair com o crachá de quem já saiu. */
export function limparUsuario(): void {
  if (!ligado) return;
  Sentry.setUser(null);
}
