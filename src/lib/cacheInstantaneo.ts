/**
 * cacheInstantaneo.ts — a tela abre com a última resposta conhecida.
 *
 * ## O milissegundo que não existe
 *
 * `reconciliarLista` já tirou o piscar das ATUALIZAÇÕES. Sobrou o pior caso, que
 * é o mais comum de todos: **abrir a tela**. Sair do Dashboard, ir aos Acordos e
 * voltar desmonta o componente, e na volta o estado nasce vazio — esqueleto de
 * novo, 400 ms de tela cinza, para no fim mostrar exatamente os mesmos números
 * que estavam ali quinze segundos atrás.
 *
 * Este módulo guarda a última resposta de cada consulta. Na volta, a tela é
 * pintada com ela em tempo ZERO (é memória, não rede), a releitura acontece em
 * silêncio por trás e os números andam até o valor novo. Quem está olhando não
 * vê carregamento nenhum — vê a tela, e depois vê o número mudar, se mudou.
 *
 * É o padrão *stale-while-revalidate*: nunca mostre vazio para quem já teve uma
 * resposta; mostre a resposta velha e conserte-a.
 *
 * ## Duas camadas, e por que a de memória é a que importa
 *
 * | Camada | Sobrevive a | Custo |
 * |---|---|---|
 * | `Map` de módulo | navegação entre abas do sistema | zero — nem serializa |
 * | `sessionStorage` | F5, restaurar a aba do navegador | um `JSON.stringify` |
 *
 * A navegação entre telas é o caso de longe mais frequente, e ela é atendida
 * pela memória: sem serialização, sem cota, sem risco. A persistência é opcional
 * (`persistir: true`) e existe para as telas que a pessoa recarrega de fato.
 *
 * ## O que NUNCA entra aqui
 *
 * Nada que não possa ser recalculado. Este cache é uma conveniência de pintura:
 * se ele sumir por completo, o sistema se comporta como antes — busca e mostra
 * o esqueleto. Ele nunca é a fonte de uma decisão, nunca é gravado no banco e
 * nunca substitui uma leitura.
 *
 * ## Isolamento entre pessoas e empresas
 *
 * A chave é montada por quem chama, e `chaveDeCache` existe para que ela sempre
 * carregue empresa e perfil. Um cache de "tickets" sem empresa na chave pintaria
 * a fila da PaguePlay por um instante para quem entrou na BookPlay — dado que a
 * RLS jamais teria devolvido. `esquecerInstantaneos()` roda no logout: o
 * `sessionStorage` é por aba, mas trocar de usuário na mesma aba é um caminho
 * real, e a tela do próximo não pode começar com os números do anterior.
 */
import { logger } from '@/lib/logger';

// ── Constantes ───────────────────────────────────────────────────────────────

/** Prefixo e versão. Subir a versão invalida tudo que ficou de um deploy velho. */
const PREFIXO = 'gac:instantaneo:v1:';

/**
 * Idade máxima do que é lido do `sessionStorage`.
 *
 * A camada de memória não expira — ela morre com a aba, e nada nela é mais
 * velho que a sessão. O disco é outra conversa: uma aba restaurada no dia
 * seguinte pintaria os números de ontem como se fossem os de agora. Meia hora
 * é o bastante para cobrir F5 e restauração de aba, e curto o suficiente para
 * que o instantâneo nunca seja de "outro dia de trabalho".
 */
const VALIDADE_PERSISTIDA_MS = 30 * 60 * 1000;

/**
 * Teto do que vale a pena serializar.
 *
 * `JSON.stringify` de 2.400 linhas do Analítico custa alguns milissegundos e
 * ocupa quase um megabyte da cota de 5 MB. Passou daqui, o instantâneo fica só
 * na memória — que já resolve a navegação, o caso que importa.
 */
const TETO_PERSISTIDO_BYTES = 512 * 1024;

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface Instantaneo<T> {
  valor: T;
  /** `Date.now()` de quando a resposta chegou do servidor. */
  gravadoEm: number;
  /** Veio do disco (F5) e não da memória. Diagnóstico. */
  doDisco?: boolean;
}

export interface OpcoesGravacao {
  /**
   * Grava também no `sessionStorage`, para o instantâneo sobreviver a um F5.
   * Padrão: `false` — a memória já cobre a navegação entre telas.
   */
  persistir?: boolean;
}

// ── Estado do módulo ─────────────────────────────────────────────────────────

const memoria = new Map<string, Instantaneo<unknown>>();

// ── Chave ────────────────────────────────────────────────────────────────────

/**
 * Monta a chave de um instantâneo.
 *
 * Inclua TUDO que muda o resultado: empresa, perfil, mês, filtro. Uma parte
 * esquecida não dá erro — dá a tela de outra pergunta pintada por 300 ms, que é
 * pior que um esqueleto.
 *
 * Partes `null`/`undefined` viram `-`, para que "sem filtro" seja uma chave
 * estável e não se confunda com o filtro chamado `"undefined"`.
 */
export function chaveDeCache(...partes: (string | number | null | undefined)[]): string {
  return partes.map(p => (p === null || p === undefined || p === '' ? '-' : String(p))).join('|');
}

// ── Leitura ──────────────────────────────────────────────────────────────────

/**
 * A última resposta conhecida desta consulta, ou `null`.
 *
 * A memória responde primeiro. Só quando ela não tem — primeira pintura depois
 * de um F5 — o disco é consultado, e o que vem de lá é promovido para a memória
 * para que a segunda leitura não pague o `JSON.parse` de novo.
 */
export function lerInstantaneo<T>(chave: string): Instantaneo<T> | null {
  const emMemoria = memoria.get(chave);
  if (emMemoria) return emMemoria as Instantaneo<T>;

  const bruto = lerDoDisco(chave);
  if (!bruto) return null;

  // Vencido: não pinta e não fica ocupando cota.
  if (Date.now() - bruto.gravadoEm > VALIDADE_PERSISTIDA_MS) {
    apagarDoDisco(chave);
    return null;
  }

  const instantaneo: Instantaneo<T> = { ...(bruto as Instantaneo<T>), doDisco: true };
  memoria.set(chave, instantaneo);
  return instantaneo;
}

/** Só o valor, para quem não se importa com a idade. */
export function valorInstantaneo<T>(chave: string): T | null {
  return lerInstantaneo<T>(chave)?.valor ?? null;
}

/** Há quanto tempo esta resposta chegou, em ms. `null` se não há instantâneo. */
export function idadeDoInstantaneo(chave: string): number | null {
  const i = lerInstantaneo(chave);
  return i ? Date.now() - i.gravadoEm : null;
}

// ── Escrita ──────────────────────────────────────────────────────────────────

/**
 * Guarda a resposta que acabou de chegar.
 *
 * Não copia o valor: quem grava acabou de recebê-lo do `fetch` e não vai mexer
 * nele. Clonar aqui dobraria a memória de toda lista grande do sistema para
 * proteger contra uma mutação que o projeto não faz — as listas vêm do
 * PostgREST e são tratadas como imutáveis em todo lugar.
 */
export function gravarInstantaneo<T>(
  chave: string, valor: T, { persistir = false }: OpcoesGravacao = {},
): void {
  memoria.set(chave, { valor, gravadoEm: Date.now() });
  if (persistir) gravarNoDisco(chave, valor);
}

/**
 * Descarta instantâneos.
 *
 * Sem argumento apaga tudo — é o que o logout chama. Com prefixo apaga um
 * recorte, para quando uma tela sabe que o que ela guardou deixou de valer
 * (a competência foi reaberta, a importação apagou o mês).
 */
export function esquecerInstantaneos(prefixo?: string): void {
  if (!prefixo) {
    memoria.clear();
    limparDiscoInteiro();
    return;
  }
  for (const chave of [...memoria.keys()]) {
    if (chave.startsWith(prefixo)) memoria.delete(chave);
  }
  paraCadaChaveNoDisco(chave => {
    if (chave.startsWith(prefixo)) apagarDoDisco(chave);
  });
}

// ── Disco ────────────────────────────────────────────────────────────────────

/**
 * `sessionStorage` pode simplesmente não existir (SSR, `file://`) e pode lançar
 * (modo privado do Safari, cota estourada). Nenhum desses casos é motivo para
 * derrubar uma tela: o cache é conveniência, e sem ele tudo funciona.
 */
function deposito(): Storage | null {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    return sessionStorage;
  } catch {
    return null;
  }
}

function lerDoDisco(chave: string): Instantaneo<unknown> | null {
  const d = deposito();
  if (!d) return null;
  try {
    const texto = d.getItem(PREFIXO + chave);
    if (!texto) return null;
    const objeto = JSON.parse(texto) as Instantaneo<unknown>;
    if (typeof objeto?.gravadoEm !== 'number') return null;
    return objeto;
  } catch {
    // JSON corrompido por um deploy que mudou o formato: apaga e segue.
    apagarDoDisco(chave);
    return null;
  }
}

function gravarNoDisco<T>(chave: string, valor: T): void {
  const d = deposito();
  if (!d) return;
  try {
    const texto = JSON.stringify({ valor, gravadoEm: Date.now() });
    if (texto.length > TETO_PERSISTIDO_BYTES) {
      logger.debug(`[cache] "${chave}" grande demais para o disco (${texto.length} B) — fica só na memória.`);
      return;
    }
    d.setItem(PREFIXO + chave, texto);
  } catch {
    // Cota estourada é o caso comum. Limpar os nossos abre espaço sem tocar no
    // que é de outra biblioteca (a sessão do Supabase mora no localStorage,
    // mas ninguém garante que só o nosso prefixo vive aqui).
    limparDiscoInteiro();
  }
}

function apagarDoDisco(chave: string): void {
  try { deposito()?.removeItem(PREFIXO + chave); } catch { /* nada a fazer */ }
}

function paraCadaChaveNoDisco(fn: (chave: string) => void): void {
  const d = deposito();
  if (!d) return;
  try {
    const nossas: string[] = [];
    for (let i = 0; i < d.length; i++) {
      const bruta = d.key(i);
      if (bruta?.startsWith(PREFIXO)) nossas.push(bruta.slice(PREFIXO.length));
    }
    // Percorre a cópia: `fn` costuma remover, e remover durante o `for` pula.
    for (const chave of nossas) fn(chave);
  } catch { /* nada a fazer */ }
}

function limparDiscoInteiro(): void {
  paraCadaChaveNoDisco(apagarDoDisco);
}

/** Só para os testes: o registro é de módulo e vazaria de um caso para o outro. */
export function __resetCacheParaTestes(): void {
  memoria.clear();
  limparDiscoInteiro();
}
