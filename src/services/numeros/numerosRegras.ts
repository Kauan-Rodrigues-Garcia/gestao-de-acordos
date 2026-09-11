/**
 * numerosRegras.ts — os estados de um número, e quem pode movê-lo.
 *
 * ## Os dois eixos, e por que não são um só
 *
 * `situacao` responde **como o número está**: aquecendo, ativo ou banido.
 * `posse` responde **onde ele está**: no Núcleo ou no setor.
 * `operadorId` responde **com quem**, dentro do setor.
 *
 * Juntar os dois primeiros numa lista só parece mais simples até aparecer
 * "banido no Núcleo" e "banido no setor" — dois estados reais e diferentes, que
 * obrigariam a lista a ser o produto dos dois eixos. O pedido é explícito em
 * não criar status a mais, e a forma de não criar é manter as perguntas
 * separadas.
 *
 * ## O caminho inteiro
 *
 * ```
 *   Núcleo                          setor                      operador
 *   ──────                          ─────                      ────────
 *   cadastro
 *     └─ em_aquecimento
 *          └─ ativo ──── liberar ──► posse=setor
 *                                      └── lançar ──────────► operadorId
 *                                      ◄── devolver ─────────┘
 *          ◄──── relançar (motivo) ───┘
 * ```
 *
 * ## Isto é o espelho, não a autoridade
 *
 * As mesmas perguntas são feitas em três lugares: o botão da tela, o serviço
 * antes de chamar a RPC, e a RPC dentro do Postgres. **Quem manda é o banco** —
 * estas funções existem para a tela não oferecer uma ação que o banco vai
 * recusar, o que é feio e confunde quem usa.
 *
 * Módulo puro, no mesmo espírito de `rhEstados.ts`.
 */

// ── Situação ────────────────────────────────────────────────────────────────

/**
 * As situações de um número.
 *
 * Cada uma responde a uma pergunta que alguém faz de verdade: «já dá para
 * usar?», «está em uso?», «morreu?». As quatro de 11/09/2026 respondem a mais
 * uma — «quanto falta?» —, e por isso carregam tempo:
 *
 *   aguardando_12h / _24h .. o WhatsApp pede espera; o prazo é fixo, e quem o
 *                            calcula é o banco, na hora em que a situação muda;
 *   em_restricao ........... restrição temporária; quem marca informa o tempo;
 *   movimentando_proxy ..... sem prazo — conta há quanto tempo está no proxy.
 *
 * Quem marca é o Núcleo (`numeros_administrar`), no Controle de Números e em
 * Meus Chips. O fim do prazo NÃO troca a situação: ela ganha o selo «Pronto»
 * e segue como está até alguém mudar — decisão de 11/09/2026.
 */
export const SITUACOES = [
  'em_aquecimento', 'ativo', 'banido',
  'aguardando_12h', 'aguardando_24h', 'movimentando_proxy', 'em_restricao',
] as const;
export type Situacao = typeof SITUACOES[number];

export const SITUACAO_LABELS: Record<Situacao, string> = {
  em_aquecimento:     'Em aquecimento',
  ativo:              'Ativo',
  banido:             'Banido',
  aguardando_12h:     'Aguardando 12 horas',
  aguardando_24h:     'Aguardando 24 horas',
  movimentando_proxy: 'Movimentando no Proxy',
  em_restricao:       'Em restrição',
};

// ── O tempo das situações ───────────────────────────────────────────────────

/** As situações com prazo. O banco exige `prazo_ate` exatamente nelas. */
export const SITUACOES_COM_PRAZO: readonly Situacao[] = [
  'aguardando_12h', 'aguardando_24h', 'em_restricao',
];

/** As de espera: no fim do prazo o número fica «Pronto», e o banco notifica. */
export const SITUACOES_DE_ESPERA: readonly Situacao[] = ['aguardando_12h', 'aguardando_24h'];

export function temPrazo(situacao: Situacao): boolean {
  return SITUACOES_COM_PRAZO.includes(situacao);
}

export function eEspera(situacao: Situacao): boolean {
  return SITUACOES_DE_ESPERA.includes(situacao);
}

/** A restrição é a única em que quem marca informa o tempo. */
export function exigeTempoInformado(situacao: Situacao): boolean {
  return situacao === 'em_restricao';
}

/** O proxy não tem prazo: a tela conta há quanto tempo ele começou. */
export function contaTempoDecorrido(situacao: Situacao): boolean {
  return situacao === 'movimentando_proxy';
}

/** O maior tempo de restrição que o banco aceita: 90 dias, em minutos. */
export const RESTRICAO_MAX_MINUTOS = 60 * 24 * 90;

const UMA_HORA_MS = 3_600_000;
const UM_DIA_MS   = 24 * UMA_HORA_MS;

/**
 * Quanto falta para o prazo, ou `null` quando não há prazo que valha.
 *
 * `acabou` no instante exato do prazo: a contagem em `00:00:00` e o selo ainda
 * dizendo «aguardando» seriam duas respostas para a mesma pergunta.
 */
export function estadoDoPrazo(
  prazoAte: string | null | undefined, agora: number,
): { restanteMs: number; acabou: boolean } | null {
  if (!prazoAte) return null;
  const fim = new Date(prazoAte).getTime();
  if (Number.isNaN(fim)) return null;
  const restanteMs = Math.max(0, fim - agora);
  return { restanteMs, acabou: restanteMs === 0 };
}

function doisDigitos(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * `11:42:05`, e `2d 03:12:44` quando passa de um dia — a restrição vai a 90.
 *
 * Arredonda os segundos PARA CIMA: com meio segundo restando a tela mostra
 * `00:00:01`, e o `00:00:00` só aparece junto com o «Pronto».
 */
export function formatarRestante(ms: number): string {
  const total    = Math.max(0, Math.ceil(ms / 1000));
  const dias     = Math.floor(total / 86_400);
  const horas    = Math.floor((total % 86_400) / 3600);
  const minutos  = Math.floor((total % 3600) / 60);
  const segundos = total % 60;
  const relogio  = `${doisDigitos(horas)}:${doisDigitos(minutos)}:${doisDigitos(segundos)}`;
  return dias > 0 ? `${dias}d ${relogio}` : relogio;
}

/**
 * Há quanto tempo, em palavras: «menos de 1 hora», «5 horas», «1 dia», «3 dias».
 *
 * O pedido é «Movimentando no Proxy — 1 dia»: a unidade de quem opera é o dia.
 * Antes de completar um, as horas dizem mais do que «0 dias».
 */
export function formatarDecorrido(
  desde: string | null | undefined, agora: number,
): string | null {
  if (!desde) return null;
  const inicio = new Date(desde).getTime();
  if (Number.isNaN(inicio)) return null;
  const ms = Math.max(0, agora - inicio);
  if (ms < UMA_HORA_MS) return 'menos de 1 hora';
  if (ms < UM_DIA_MS) {
    const horas = Math.floor(ms / UMA_HORA_MS);
    return `${horas} ${horas === 1 ? 'hora' : 'horas'}`;
  }
  const dias = Math.floor(ms / UM_DIA_MS);
  return `${dias} ${dias === 1 ? 'dia' : 'dias'}`;
}

// ── Posse ───────────────────────────────────────────────────────────────────

/** Onde o número está. Dois lugares, e não há um terceiro. */
export const POSSES = ['nucleo', 'setor'] as const;
export type Posse = typeof POSSES[number];

export const POSSE_LABELS: Record<Posse, string> = {
  nucleo: 'No Núcleo',
  setor:  'No setor',
};

// ── Motivo do retorno ───────────────────────────────────────────────────────

/**
 * Por que um número voltou.
 *
 * Lista curta com `outro` no fim, em vez de texto livre puro: o Núcleo precisa
 * conseguir contar quantos foram banidos no mês sem ler trezentas observações.
 * A observação livre continua existindo ao lado, para o que a lista não cobre.
 */
export const MOTIVOS_RETORNO = ['banido', 'sem_uso', 'problema_tecnico', 'outro'] as const;
export type MotivoRetorno = typeof MOTIVOS_RETORNO[number];

export const MOTIVO_LABELS: Record<MotivoRetorno, string> = {
  banido:           'Banido',
  sem_uso:          'Sem uso',
  problema_tecnico: 'Problema técnico',
  outro:            'Outro',
};

// ── Etiquetas operacionais ──────────────────────────────────────────────────

/**
 * As marcas que não são `situacao` nem `motivo_retorno`.
 *
 * `situacao` responde «o número serve?». Há estados que não respondem isso: o
 * SMS de verificação não chegou, e a pessoa tem que tentar de novo mais tarde.
 * O número não mudou de qualidade — mudou o que falta fazer com ele hoje.
 *
 * Duas. A segunda, «Retirada do banimento solicitada», entrou em 11/09/2026
 * (migration 20260911170000): o banimento continua sendo `situacao`; o que a
 * etiqueta diz é que alguém já pediu ao WhatsApp para retirá-lo — o que falta
 * fazer é esperar, e não pedir de novo. A lista é `as const` e o tipo sai dela:
 * a próxima é uma linha aqui, uma em cada `Record` abaixo e uma no `CHECK` da
 * migration, e o TypeScript aponta se faltar alguma.
 *
 * O que NÃO entra aqui: etiqueta que duplique `situacao` («ativo», «morto») ou
 * `motivo_retorno` («banido»). Duas colunas para o mesmo fato voltam a
 * discordar, que é o defeito que a migration 20260910210000 foi corrigir.
 */
export const ETIQUETAS = ['nao_chegou_sms', 'retirada_banimento_solicitada'] as const;
export type Etiqueta = typeof ETIQUETAS[number];

export const ETIQUETA_LABELS: Record<Etiqueta, string> = {
  nao_chegou_sms:                'Não chegou SMS',
  retirada_banimento_solicitada: 'Retirada do banimento solicitada',
};

/** O que a etiqueta significa para quem vai agir. Vira `title` na tela. */
export const ETIQUETA_DESCRICOES: Record<Etiqueta, string> = {
  nao_chegou_sms:
    'O SMS de verificação não chegou. Tentar de novo em outro horário.',
  retirada_banimento_solicitada:
    'Já foi pedido ao WhatsApp que retire o banimento. Aguardar a resposta antes de pedir de novo.',
};

/** Veio do banco uma etiqueta que esta versão da tela conhece? */
export function etiquetaValida(valor: unknown): valor is Etiqueta {
  return typeof valor === 'string' && (ETIQUETAS as readonly string[]).includes(valor);
}

/**
 * As etiquetas de uma linha: só as conhecidas, e cada uma uma vez.
 *
 * Duas limpezas, por dois motivos diferentes:
 *
 *   **desconhecida sai** — um deploy antigo lendo uma etiqueta nova receberia
 *   `undefined` no `Record` de rótulos e pintaria um badge em branco. Uma
 *   etiqueta a menos até a página atualizar é melhor do que um badge vazio.
 *
 *   **repetida sai** — o `CHECK` da coluna confere que a etiqueta existe, e não
 *   que ela aparece uma vez só: «sem repetido» precisa de `unnest`, e
 *   subconsulta em CHECK o Postgres recusa. `fn_numeros_etiquetar` normaliza
 *   antes de gravar, então na prática não há repetição — esta linha cobre o
 *   UPDATE direto, feito fora da RPC, cujo pior efeito seria a mesma etiqueta
 *   desenhada duas vezes.
 */
export function etiquetasConhecidas(valor: unknown): Etiqueta[] {
  if (!Array.isArray(valor)) return [];
  return [...new Set(valor.filter(etiquetaValida))];
}

// ── Tratamento do retorno ───────────────────────────────────────────────────

/**
 * Em que pé está o número que voltou de um setor.
 *
 * `null` é o estado normal — a grande maioria dos números nunca voltou de
 * lugar nenhum, e não há nada pendente sobre eles.
 *
 * Esta coluna existe porque **alterar o estado do número e devolvê-lo ao setor
 * são ações diferentes**. Antes elas eram a mesma: limpar o «Voltou: Banido» da
 * tela só acontecia dentro de `liberarAoSetor`, então o Núcleo era obrigado a
 * lançar o número para conseguir encerrar o assunto. Agora ele trata quanto
 * precisar, encerra quando terminou, e libera depois — se e quando fizer
 * sentido.
 */
export const TRATAMENTOS = ['pendente', 'em_andamento'] as const;
export type Tratamento = typeof TRATAMENTOS[number];

export const TRATAMENTO_LABELS: Record<Tratamento, string> = {
  pendente:     'Aguardando tratamento',
  em_andamento: 'Em tratamento',
};

// ── O limite do celular ─────────────────────────────────────────────────────

/**
 * Seis números por celular.
 *
 * Aqui o valor serve à TELA — o contador `4/6` e o botão desabilitado no sexto.
 * A garantia é a trigger no Postgres, que conta com a linha do celular travada:
 * duas pessoas cadastrando ao mesmo tempo não passam de seis, e uma contagem
 * feita no navegador nunca conseguiria prometer isso.
 */
export const LIMITE_POR_CELULAR = 6;

/** Ainda cabe um número neste celular? */
export function cabeMaisNumero(quantidadeAtual: number): boolean {
  return quantidadeAtual < LIMITE_POR_CELULAR;
}

/** Quantas vagas sobram. Nunca negativo — a tela mostraria "-1 vagas". */
export function vagasNoCelular(quantidadeAtual: number): number {
  return Math.max(0, LIMITE_POR_CELULAR - quantidadeAtual);
}

// ── As transições ───────────────────────────────────────────────────────────

/**
 * O que basta saber de um número para decidir o que pode ser feito com ele.
 *
 * `tratamento` é opcional para as chamadas que não o conhecem continuarem
 * compilando, e ausente significa `null` — nada pendente. É o padrão certo: o
 * campo só passa a valer alguma coisa depois que um setor devolve.
 */
export interface EstadoNumero {
  situacao: Situacao;
  posse: Posse;
  operadorId: string | null;
  tratamento?: Tratamento | null;
}

/**
 * O Núcleo pode disponibilizar este número ao setor dono?
 *
 * Três condições, e cada uma fecha um buraco visto na operação:
 *
 *   `posse === 'nucleo'`  .. não se libera o que já está lá fora;
 *   `tratamento == null`  .. o que voltou de um setor passa pelo tratamento
 *                            antes de voltar. Sem isto, um número devolvido
 *                            como banido ainda constava `ativo` e podia ser
 *                            remandado no mesmo minuto — o setor devolvia de
 *                            novo, e ninguém tinha tratado nada;
 *   `situacao === 'ativo'`.. só número pronto sai do Núcleo.
 *
 * As três se repetem em `fn_numeros_liberar_ao_setor`, no banco. Quem manda é
 * lá; isto aqui existe para o botão não aparecer quando a resposta será não.
 */
export function podeLiberarAoSetor(n: EstadoNumero): boolean {
  return n.posse === 'nucleo'
    && (n.tratamento ?? null) === null
    && n.situacao === 'ativo';
}

/**
 * Este número voltou de um setor e ninguém pegou ainda?
 *
 * É a fila de trabalho do Núcleo — o que o painel mostra em primeiro lugar.
 */
export function esperaTratamento(n: EstadoNumero): boolean {
  return n.tratamento === 'pendente';
}

/** O Núcleo já pegou este número para tratar? */
export function emTratamento(n: EstadoNumero): boolean {
  return n.tratamento === 'em_andamento';
}

/**
 * Dá para encerrar o tratamento deste número?
 *
 * Vale nos dois pés — «pendente» e «em andamento». Obrigar a passar por
 * «comecei» antes de «terminei» seria burocracia para o caso comum: o número
 * volta como `sem_uso`, o Núcleo olha, está inteiro, e encerra em um clique.
 */
export function podeConcluirTratamento(n: EstadoNumero): boolean {
  return (n.tratamento ?? null) !== null;
}

/**
 * Este número já saiu da operação interna do Núcleo?
 *
 * A tela pinta os dois estados de forma diferente. O predicado mora aqui, e
 * não no componente, porque as duas telas do módulo fazem a mesma pergunta.
 */
export function foiLancadoAoSetor(n: EstadoNumero): boolean {
  return n.posse === 'setor';
}

/**
 * O Núcleo pode corrigir a digitação deste número?
 *
 * Só enquanto ele está em casa e sem dono. Trocar o número de um chip que
 * alguém está usando mudaria, em silêncio, o que aparece na tela dessa pessoa —
 * e a conversa de ontem passaria a constar de outro número.
 *
 * A trava de verdade é a trigger `fn_numeros_whatsapp_valida`, que recusa o
 * UPDATE. Isto é o espelho.
 */
export function podeCorrigirNumero(n: EstadoNumero): boolean {
  return n.posse === 'nucleo' && n.operadorId === null;
}

/** Quem está excluindo, naquilo que muda a resposta. */
export interface QuemExclui {
  /**
   * A chave-mestra. O super_admin exclui qualquer número, com setor ou com
   * operador — a mesma exceção que `fn_numeros_excluir` faz no banco.
   */
  superAdmin?: boolean;
}

/**
 * Dá para mandar este número para a lixeira?
 *
 * Excluir não apaga mais de vez: a cópia, com a trilha, vai para a Lixeira de
 * Números e volta inteira ao restaurar (migration 20260911150000). Por isso «já
 * circulou por um setor» deixou de segurar — o motivo daquela trava era não
 * apagar prova, e agora nada se perde.
 *
 * O que continua segurando é estar com um setor: tirar um número da mão de quem
 * o usa é decisão de quem manda no sistema, e só o super_admin passa.
 */
export function podeExcluirNumero(n: EstadoNumero, quem: QuemExclui = {}): boolean {
  if (quem.superAdmin) return true;
  return n.posse === 'nucleo' && n.operadorId === null;
}

/**
 * Dá para mandar este APARELHO para a lixeira?
 *
 * Os números vão junto, no mesmo lote, então vale quando cada um pode sair
 * (`podeExcluirNumero`). Aparelho vazio sai sempre.
 */
export function podeExcluirCelular(
  numeros: readonly EstadoNumero[], quem: QuemExclui = {},
): boolean {
  return numeros.every(n => podeExcluirNumero(n, quem));
}

/**
 * A liderança pode lançar este número a um operador?
 *
 * Vale também para TROCAR o operador de um número já lançado — é a mesma ação,
 * e o histórico guarda de quem para quem.
 *
 * Número banido não é lançado mesmo estando no setor: entregar a alguém um
 * número que já se sabe que não funciona é criar trabalho perdido. O caminho
 * dele é o relançamento.
 */
export function podeLancarAoOperador(n: EstadoNumero): boolean {
  return n.posse === 'setor' && n.situacao !== 'banido';
}

/**
 * Este operador pode devolver este número à liderança?
 *
 * Só o dono devolve, e o número não sai do setor — é o passo curto, para o
 * operador não precisar de ninguém quando o número para de servir. Banido
 * devolve também: é justamente o caso mais comum.
 */
export function podeDevolverALideranca(n: EstadoNumero, usuarioId: string): boolean {
  return n.posse === 'setor' && n.operadorId !== null && n.operadorId === usuarioId;
}

/**
 * A liderança pode devolver este número ao Núcleo?
 *
 * Com ou sem operador: relançar um número que está na mão de alguém é legítimo
 * (o operador saiu, o número foi banido), e a RPC solta o operador junto.
 */
export function podeRelancarAoNucleo(n: EstadoNumero): boolean {
  return n.posse === 'setor';
}

/**
 * O motivo informado está na lista?
 *
 * Motivo é obrigatório no relançamento: sem ele o Núcleo recebe o número de
 * volta sem saber o que precisa tratar, que é exatamente o que o pedido manda
 * evitar.
 */
export function motivoValido(motivo: unknown): motivo is MotivoRetorno {
  return typeof motivo === 'string'
    && (MOTIVOS_RETORNO as readonly string[]).includes(motivo);
}
