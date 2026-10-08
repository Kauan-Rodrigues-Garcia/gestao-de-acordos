/**
 * O `fetch` que o cliente Supabase usa — e que existe por causa do login.
 *
 * Caso de 08/10/2026 (ana_sena): a pessoa entra, o console mostra
 * `POST /auth/v1/token?grant_type=refresh_token 429` e o sistema a desconecta
 * sozinho. Duas coisas do auth-js (2.90) se somam para isso:
 *
 * 1. **O relógio do computador.** O servidor devolve `expires_at` no relógio
 *    DELE, e o auth-js compara com `Date.now()` da máquina. Um computador
 *    adiantado em mais que a validade do token (1 h, menos a margem de 90 s)
 *    vê o token recém-emitido como já vencido, e
 *    cada `getSession()` — o Supabase chama um por consulta — vira uma
 *    renovação. Dezenas por segundo, e o GoTrue responde 429.
 * 2. **O 429 desconecta.** Na renovação, só 502/503/504 contam como falha
 *    passageira. Qualquer outro erro, 429 incluso, faz o auth-js apagar a
 *    sessão (`_removeSession`) e emitir `SIGNED_OUT`. O limite de renovação do
 *    GoTrue é por IP, então numa operação que sai toda pelo mesmo IP uma
 *    máquina em loop pode esgotar a cota e derrubar os colegas também.
 *
 * As duas correções ficam aqui, na borda, sem mexer na biblioteca:
 *
 * - Nas respostas de `/auth/v1/token` o `expires_at` do servidor é retirado.
 *   Sem ele o auth-js calcula `agora + expires_in` pelo relógio local (é o
 *   caminho dele quando o campo não vem). O prazo passa a ser relativo, e a
 *   diferença de relógio deixa de importar. Quem valida o token de verdade é o
 *   servidor, pelo relógio dele.
 * - O 429 na renovação chega ao auth-js como 503. Assim ele mantém a sessão e
 *   tenta de novo com espera crescente, em vez de desconectar a pessoa.
 *   Refresh token inválido de verdade (400) continua desconectando.
 */

type Fetch = typeof fetch;

function urlDe(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

/** `/auth/v1/token`, qualquer grant (senha, renovação, PKCE). */
function ehEmissaoDeToken(url: string): boolean {
  return url.includes('/auth/v1/token');
}

function ehRenovacao(url: string): boolean {
  return ehEmissaoDeToken(url) && url.includes('grant_type=refresh_token');
}

/** Mesma resposta, com outro corpo e/ou outro status. */
function refazer(original: Response, corpo: string, status = original.status, statusText = original.statusText): Response {
  const headers = new Headers(original.headers);
  headers.delete('content-length');
  return new Response(corpo, { status, statusText, headers });
}

async function semExpiresAt(resposta: Response): Promise<Response> {
  let corpo: unknown;
  try {
    corpo = await resposta.clone().json();
  } catch {
    return resposta; // não é JSON: deixa o auth-js lidar como sempre
  }
  if (!corpo || typeof corpo !== 'object' || !('expires_at' in corpo) || !('expires_in' in corpo)) {
    return resposta;
  }
  const { expires_at: _servidor, ...resto } = corpo as Record<string, unknown>;
  return refazer(resposta, JSON.stringify(resto));
}

export function criarFetchAuth(base: Fetch = (...args) => fetch(...args)): Fetch {
  return async (input, init) => {
    const resposta = await base(input, init);
    const url = urlDe(input);
    if (!ehEmissaoDeToken(url)) return resposta;

    if (resposta.status === 429 && ehRenovacao(url)) {
      return refazer(resposta, await resposta.clone().text(), 503, 'Service Unavailable');
    }
    if (resposta.ok) return semExpiresAt(resposta);
    return resposta;
  };
}
