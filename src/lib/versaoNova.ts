/**
 * versaoNova.ts — o deploy chega a quem está com o sistema aberto.
 *
 * ## O que era (até 05/10/2026)
 *
 * Uma pergunta a `/version.json` a cada 5 minutos, fixos. Quem estava com a aba
 * aberta levava até 5 min para saber do deploy, e depois dependia de apertar
 * «Recarregar» no aviso — quem não apertava ficava na versão velha o dia
 * inteiro. E quem abria um painel sob demanda nesse meio-tempo pedia arquivos
 * que o deploy já tinha apagado, e via a tela de erro.
 *
 * ## O que é
 *
 *   1. PERGUNTA LOGO. A cada 60 s com a aba visível, e na hora em que a aba
 *      volta a aparecer, a janela ganha foco ou a internet volta. A pergunta é
 *      um JSON de 20 bytes servido pela CDN — 150 abas perguntando por minuto
 *      não pesam em nada. Aba escondida não pergunta: pergunta ao voltar.
 *
 *   2. TROCA SOZINHA NA HORA SEGURA: a próxima troca de tela. Mudar de página
 *      já descarta o que estava na tela, então recarregar ali não perde
 *      formulário nenhum — e cada pessoa recarrega num momento diferente, em
 *      vez de 150 abas no mesmo minuto (o que estourava o limite de presence do
 *      Realtime em todo deploy, ver o registro de 28/09).
 *
 *   3. O AVISO CONTINUA, com «Atualizar agora», para quem está parado numa tela
 *      só.
 *
 *   4. ARQUIVO QUE O DEPLOY APAGOU: o Vite avisa (`vite:preloadError`) quando um
 *      pedaço do app não carrega. Em vez da tela de erro, recarrega — uma vez:
 *      se falhar de novo logo em seguida, o erro segue o caminho de sempre.
 *
 * Nenhuma recarga em laço: cada versão recarrega sozinha no máximo uma vez por
 * aba. Se a CDN ainda estiver servindo a página velha, sobra o aviso.
 */

declare const __APP_VERSION__: string;

export const INTERVALO_MS = 60_000;
/** Foco e visibilidade disparam juntos: uma pergunta basta. */
export const MINIMO_ENTRE_PERGUNTAS_MS = 10_000;
/** Duas falhas de arquivo dentro disto = não é deploy, é outra coisa. */
export const JANELA_PEDACO_MS = 30_000;

const CHAVE_VERSAO = 'versao:recarregou-para';
const CHAVE_PEDACO = 'versao:recarregou-por-pedaco';

function lerSessao(chave: string): string | null {
  try { return sessionStorage.getItem(chave); } catch { return null; }
}
function gravarSessao(chave: string, valor: string): void {
  try { sessionStorage.setItem(chave, valor); } catch { /* sem armazenamento: segue sem a trava */ }
}

/** A versão que esta aba está rodando. `'dev'` no `vite dev`. */
export function versaoAtual(): string {
  return typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
}

/** Esta aba já recarregou sozinha para esta versão? Então não de novo. */
export function podeRecarregarPara(versao: string, lido: string | null = lerSessao(CHAVE_VERSAO)): boolean {
  return lido !== versao;
}

/** A última recarga por arquivo perdido foi agora há pouco? Então não de novo. */
export function podeRecarregarPorPedaco(agora: number, lido: string | null = lerSessao(CHAVE_PEDACO)): boolean {
  const antes = Number(lido);
  return !lido || !Number.isFinite(antes) || agora - antes > JANELA_PEDACO_MS;
}

// ── O estado da aba ──────────────────────────────────────────────────────────

let novaVersao: string | null = null;

export function versaoNovaDetectada(): string | null {
  return novaVersao;
}

/**
 * Pergunta ao servidor. Devolve a versão nova quando há uma (e guarda), `null`
 * quando está tudo em dia ou a rede falhou.
 */
export async function perguntarVersao(): Promise<string | null> {
  if (novaVersao) return novaVersao;
  try {
    const res = await fetch(`/version.json?_t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const { v } = (await res.json()) as { v?: string };
    if (v && v !== versaoAtual()) novaVersao = v;
    return novaVersao;
  } catch {
    return null; // rede caiu: a próxima pergunta tenta
  }
}

/** «Atualizar agora», e a troca de tela com versão nova. */
export function recarregarParaVersaoNova(): void {
  if (novaVersao) gravarSessao(CHAVE_VERSAO, novaVersao);
  window.location.reload();
}

/**
 * Na troca de tela: com versão nova esperando, recarrega (a nova tela abre já
 * na versão nova). Devolve se recarregou.
 */
export function trocarDeVersaoSePuder(): boolean {
  if (!novaVersao || !podeRecarregarPara(novaVersao)) return false;
  recarregarParaVersaoNova();
  return true;
}

/**
 * Arquivo do app que não carregou — no começo do `main.tsx`, antes de qualquer
 * `import()`. `preventDefault` segura o erro só quando vamos recarregar.
 */
export function instalarRecargaPorPedacoPerdido(): void {
  if (typeof window === 'undefined' || versaoAtual() === 'dev') return;
  window.addEventListener('vite:preloadError', evento => {
    const agora = Date.now();
    if (!podeRecarregarPorPedaco(agora)) return;
    gravarSessao(CHAVE_PEDACO, String(agora));
    evento.preventDefault();
    window.location.reload();
  });
}

/** Só para os testes. */
export function __resetVersaoParaTestes(): void {
  novaVersao = null;
}
