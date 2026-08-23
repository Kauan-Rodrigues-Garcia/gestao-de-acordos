/**
 * categorias.ts — o que cada tipo de pedido precisa saber antes de virar chat.
 *
 * A categoria não é etiqueta: ela decide QUAIS CAMPOS aparecem no formulário.
 * "Trocar senha de usuário" pergunta de quem; "erro numa aba" pergunta qual
 * aba. Todos são opcionais de propósito — o chat existe e aceita print. O campo
 * está ali para que a informação chegue ESTRUTURADA quando a pessoa já a tem à
 * mão, e não no meio de um parágrafo que alguém vai ter que reler depois.
 *
 * Vive em TypeScript, não em tabela. Um campo novo é uma linha aqui e um deploy
 * — contra uma tela de administração de formulários que ninguém pediu e que
 * teria que ser mantida para valer.
 */

/** Como o campo é preenchido na tela. */
export type TipoCampo =
  | 'usuario'  // busca em perfis; grava id + nome, e o ticket fica ligado à pessoa
  | 'aba'      // lista de telas, recortada pelo que quem abre enxerga
  | 'setor'    // lista de setores da empresa
  | 'texto'
  | 'nr';      // NR / Código do acordo

export interface CampoCategoria {
  key: string;
  label: string;
  tipo: TipoCampo;
  dica?: string;
}

export interface CategoriaTicket {
  key: string;
  label: string;
  descricao: string;
  campos: CampoCategoria[];
}

export const CATEGORIAS: CategoriaTicket[] = [
  {
    key: 'senha',
    label: 'Trocar senha de usuário',
    descricao: 'Redefinir a senha de alguém que perdeu o acesso',
    campos: [{ key: 'usuario', label: 'Usuário', tipo: 'usuario', dica: 'De quem é a senha' }],
  },
  {
    key: 'acesso',
    label: 'Login / acesso bloqueado',
    descricao: 'Não entra, não vê uma aba, permissão faltando',
    campos: [
      { key: 'usuario', label: 'Usuário', tipo: 'usuario' },
      { key: 'aba', label: 'Aba envolvida', tipo: 'aba' },
    ],
  },
  {
    key: 'erro_acordo',
    label: 'Erro em acordo / tabulação',
    descricao: 'Acordo com dado errado, NR travado, vínculo trocado',
    campos: [
      { key: 'nr', label: 'NR / Código', tipo: 'nr' },
      { key: 'usuario', label: 'Operador do acordo', tipo: 'usuario' },
    ],
  },
  {
    key: 'erro_sistema',
    label: 'Erro no sistema',
    descricao: 'Tela quebrada, número errado, algo que não salva',
    campos: [
      { key: 'aba', label: 'Aba onde acontece', tipo: 'aba' },
      { key: 'quando', label: 'Quando começou', tipo: 'texto', dica: 'Ex.: hoje de manhã' },
    ],
  },
  {
    key: 'recebimento',
    label: 'Divergência de recebimento',
    descricao: 'Valor que não bate no analítico, na equipe ou no setor',
    campos: [
      { key: 'setor', label: 'Setor', tipo: 'setor' },
      { key: 'mes', label: 'Mês de referência', tipo: 'texto', dica: 'Ex.: 2026-08' },
      { key: 'usuario', label: 'Operador', tipo: 'usuario' },
    ],
  },
  {
    key: 'cadastro_usuario',
    label: 'Criar, editar ou desligar usuário',
    descricao: 'Entrada, saída, mudança de cargo, de equipe ou de setor',
    campos: [
      { key: 'usuario', label: 'Usuário', tipo: 'usuario' },
      { key: 'setor', label: 'Setor de destino', tipo: 'setor' },
    ],
  },
  {
    key: 'equipe',
    label: 'Equipe, setor ou clone',
    descricao: 'Montagem de equipe, líder, clone em setor alternativo',
    campos: [{ key: 'setor', label: 'Setor', tipo: 'setor' }],
  },
  {
    key: 'melhoria',
    label: 'Sugestão de melhoria',
    descricao: 'Algo que ajudaria no dia a dia e ainda não existe',
    campos: [{ key: 'aba', label: 'Aba', tipo: 'aba' }],
  },
  {
    key: 'outro',
    label: 'Outro assunto',
    descricao: 'O que não couber nas categorias acima',
    campos: [],
  },
];

export function categoriaPorChave(key: string): CategoriaTicket | undefined {
  return CATEGORIAS.find(c => c.key === key);
}

export function rotuloCategoria(key: string): string {
  return categoriaPorChave(key)?.label ?? key;
}

/**
 * As telas que o campo "aba" oferece.
 *
 * `permissao` é a chave de `cargos_permissoes`: a lista é recortada pelo que
 * quem está abrindo enxerga, para o líder do Play 5 não relatar erro numa aba
 * que ele nunca abriu. Sem chave = todo mundo vê aquela tela.
 */
export const ABAS_DO_SISTEMA: { valor: string; permissao?: string }[] = [
  { valor: 'Dashboard' },
  { valor: 'Acordos',            permissao: 'ver_acordos' },
  { valor: 'Novo Acordo',        permissao: 'criar_acordos' },
  { valor: 'Importar Excel',     permissao: 'importar_excel' },
  { valor: 'Analítico',          permissao: 'ver_analitico' },
  { valor: 'Painel Líder',       permissao: 'ver_painel_lider' },
  { valor: 'Painel Diretoria',   permissao: 'ver_painel_diretoria' },
  { valor: 'Usuários',           permissao: 'ver_usuarios' },
  { valor: 'Metas',              permissao: 'ver_metas' },
  { valor: 'Lixeira',            permissao: 'ver_lixeira' },
  { valor: 'Campanha Fácil',     permissao: 'ver_campanha_facil' },
  { valor: 'Solicitar Atendimento', permissao: 'ver_solicitacoes_whatsapp' },
  { valor: 'Ouvidoria',          permissao: 'ver_ouvidoria' },
  { valor: 'Configurações',      permissao: 'ver_configuracoes' },
  { valor: 'Login / entrada' },
  { valor: 'Outra' },
];

// ── Estados ──────────────────────────────────────────────────────────────────

export type StatusTicket =
  | 'aberto' | 'em_andamento' | 'pendente' | 'concluido' | 'recusado' | 'cancelado';

export const STATUS_TICKET: Record<StatusTicket, { label: string; cor: string }> = {
  aberto:       { label: 'Aberto',       cor: 'bg-blue-500/15 text-blue-600 border-blue-500/30' },
  em_andamento: { label: 'Em andamento', cor: 'bg-amber-500/15 text-amber-600 border-amber-500/30' },
  pendente:     { label: 'Pendente',     cor: 'bg-purple-500/15 text-purple-600 border-purple-500/30' },
  concluido:    { label: 'Concluído',    cor: 'bg-green-500/15 text-green-600 border-green-500/30' },
  recusado:     { label: 'Recusado',     cor: 'bg-destructive/15 text-destructive border-destructive/30' },
  cancelado:    { label: 'Cancelado',    cor: 'bg-muted text-muted-foreground border-border' },
};

/** Estados que já não pedem nada de ninguém — somem do "em aberto". */
export const STATUS_FECHADOS: StatusTicket[] = ['concluido', 'recusado', 'cancelado'];

export type PrioridadeTicket = 'baixa' | 'normal' | 'alta' | 'urgente';

export const PRIORIDADES: Record<PrioridadeTicket, { label: string; cor: string }> = {
  baixa:   { label: 'Baixa',   cor: 'text-muted-foreground' },
  normal:  { label: 'Normal',  cor: 'text-foreground' },
  alta:    { label: 'Alta',    cor: 'text-amber-600' },
  urgente: { label: 'Urgente', cor: 'text-destructive font-semibold' },
};

/**
 * A ordem em que os estados aparecem — no quadro, nos agrupamentos e nos
 * seletores.
 *
 * É a ordem do CAMINHO do ticket, não a alfabética nem a do enum do banco:
 * chega, alguém pega, alguém trava, termina. `recusado` e `cancelado` ficam no
 * fim porque são saídas, não etapas — e no quadro eles nem viram coluna, senão
 * a tela ganharia duas colunas quase sempre vazias ocupando um terço da largura.
 */
export const ORDEM_STATUS: StatusTicket[] = [
  'aberto', 'em_andamento', 'pendente', 'concluido', 'recusado', 'cancelado',
];

/**
 * As colunas do quadro.
 *
 * Quatro, e não seis. Um quadro de tickets com seis colunas numa tela de
 * notebook dá 180 px por coluna — estreito demais para o assunto, que é a
 * única coisa que a pessoa lê ao varrer o quadro. Recusado e cancelado
 * continuam alcançáveis pelo segmento "Encerrados" e pelo filtro de estado.
 */
export const COLUNAS_QUADRO: StatusTicket[] = ['aberto', 'em_andamento', 'pendente', 'concluido'];

/**
 * Uma frase por estado, para o cabeçalho da coluna vazia.
 *
 * Coluna vazia sem explicação parece defeito de carregamento. Com a frase, ela
 * vira informação: "ninguém está travado esperando resposta" é uma boa notícia,
 * e a tela devia saber dizê-la.
 */
export const VAZIO_DA_COLUNA: Record<StatusTicket, string> = {
  aberto:       'Nada esperando para ser pego.',
  em_andamento: 'Ninguém está com a mão em nada agora.',
  pendente:     'Ninguém travado esperando resposta.',
  concluido:    'Nada concluído neste recorte.',
  recusado:     'Nada recusado.',
  cancelado:    'Nada cancelado.',
};

/**
 * A cor da faixa de prioridade do cartão.
 *
 * Separada de `PRIORIDADES[].cor` de propósito: aquela é cor de TEXTO, e usar
 * a mesma classe como fundo produziria uma faixa cinza para "normal" — que é a
 * maioria dos tickets, e faria a tela inteira parecer desabilitada. Aqui
 * "normal" não pinta nada, e a faixa só existe quando ela quer dizer algo.
 */
export const FAIXA_PRIORIDADE: Record<PrioridadeTicket, string> = {
  urgente: 'bg-destructive',
  alta:    'bg-amber-500',
  normal:  'bg-transparent',
  baixa:   'bg-transparent',
};
