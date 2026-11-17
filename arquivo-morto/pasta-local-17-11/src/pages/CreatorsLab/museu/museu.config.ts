/**
 * museu.config.ts — TODO o conteúdo do Museu mora aqui.
 * ─────────────────────────────────────────────────────────────────────────────
 * O Museu é uma visita pela história do Gestão, em salas agrupadas por época.
 * Cada sala é um objeto de `SALAS`. **Incluir um evento novo é acrescentar um
 * objeto aqui** — o programa, a lista lateral, a contagem de salas visitadas e
 * a ordem da visita saem desta lista sozinhos.
 *
 * ## De onde vêm os fatos
 *
 * Nada aqui é de memória. Cada data e cada frase sai de um destes lugares, e a
 * sala diz qual em `fontes`:
 *
 *   • o README da pasta em `arquivo-morto/` («No ar desde», «Arquivado em»,
 *     «O que era», «Por que saiu»);
 *   • um documento de `docs/`;
 *   • o histórico do git (data do primeiro commit do arquivo) e o nome das
 *     migrations em `supabase/migrations/`.
 *
 * O que não deu para confirmar em nenhum deles está como `PENDENTE('...')`, o
 * mesmo mecanismo de `creators.config.ts`: a tela mostra a lacuna marcada em
 * vez de um texto inventado. **Não preencha por adivinhação.** Se a data não
 * está escrita em lugar nenhum, a sala fica com a lacuna até alguém que sabe
 * informar.
 *
 * ## «No código vivo» não é «no ar»
 *
 * Para os eventos que não foram arquivados, o que dá para afirmar olhando o
 * repositório é que o código está em `src/`. Se está ligado para as pessoas
 * hoje é decisão de configuração, guardada no banco — e o Museu não lê o
 * banco. Por isso a situação dessas salas é `vivo` («no código vivo»), não
 * «no ar».
 *
 * ## As peças
 *
 * `peca` liga a sala a uma demonstração para mexer (`museu/pecas.tsx`). São
 * encenações com dados fictícios: nenhuma lê ou grava no banco, nenhuma mostra
 * nome, foto ou valor de pessoa real, e nenhuma tem placar.
 */
import { PENDENTE } from '../creators.config';

export type IdEpoca = 'primeiros' | 'halloween' | 'corridas' | 'fim-de-ano';

export interface EpocaMuseu {
  id: IdEpoca;
  nome: string;
  /** Texto livre: «julho a setembro de 2026». */
  periodo: string;
  resumo: string;
}

/** A arte de cada sala. O desenho mora em `museu/artes.tsx`. */
export type IdArte =
  | 'pet' | 'comemoracoes' | 'colchao' | 'ouvidoria' | 'modo-tv'
  | 'halloween' | 'caca' | 'pesquisa' | 'insignias'
  | 'corrida' | 'cavalos' | 'guerra' | 'sirene' | 'natal';

/** As peças para mexer. O componente mora em `museu/pecas.tsx`. */
export type IdPeca = 'caca' | 'pesquisa' | 'corrida' | 'sirene' | 'modo-tv';

export interface SalaMuseu {
  /** Único. É o que fica gravado em `Progresso.museuVisto` — não renomeie. */
  id: string;
  epoca: IdEpoca;
  nome: string;
  /** Quando começou. Data `dd/mm/aaaa`, texto curto ou `PENDENTE(...)`. */
  inicio: string;
  /** Quando saiu. `null` para o que segue no código vivo. */
  fim: string | null;
  situacao: 'arquivado' | 'vivo';
  /** O que era, em poucas linhas. */
  texto: string;
  /** Datas de dentro do período, na ordem em que aconteceram. */
  marcos?: { data: string; oQue: string }[];
  /** Por que saiu — só para o que foi arquivado. */
  porQueSaiu?: string;
  arte: IdArte;
  /** De quem é o desenho: tirado do código da época, ou refeito para o Museu. */
  origemDaArte: 'da-epoca' | 'reconstituicao';
  peca?: IdPeca;
  /** De onde saíram as datas e os fatos desta sala. */
  fontes: string[];
}

export const EPOCAS: EpocaMuseu[] = [
  {
    id: 'primeiros',
    nome: 'Os primeiros experimentos',
    periodo: 'julho a setembro de 2026',
    resumo: 'Um mascote, um editor de festas, uma aba de controle e uma TV na parede. Quase tudo daqui já saiu.',
  },
  {
    id: 'halloween',
    nome: 'O mês do Halloween',
    periodo: 'outubro de 2026',
    resumo: 'O sistema inteiro fantasiado por um mês, com gincana, chefões e um álbum de medalhas.',
  },
  {
    id: 'corridas',
    nome: 'As corridas',
    periodo: 'a partir de 20/10/2026',
    resumo: 'A gincana da vez virou sorteio em forma de corrida — primeiro com bichinhos, depois com cavalos.',
  },
  {
    id: 'fim-de-ano',
    nome: 'Sirene e Natal',
    periodo: 'do fim de outubro em diante',
    resumo: 'O que chegou por último e ainda está no código vivo.',
  },
];

export const SALAS: SalaMuseu[] = [
  // ── Os primeiros experimentos ──────────────────────────────────────────────
  {
    id: 'pet',
    epoca: 'primeiros',
    nome: 'Aura, o mascote',
    inicio: '09/07/2026',
    fim: '05/09/2026',
    situacao: 'arquivado',
    texto:
      'Um mascote que morava no canto da tela, com economia própria: moedas ganhas por '
      + 'recebimento, XP, nível, sequência de dias, loja de roupas e móveis, um quartinho para '
      + 'decorar e uma votação para escolher o nome. Comemorava com confete quando um acordo '
      + 'era marcado como pago.',
    marcos: [
      { data: '09/07/2026', oQue: 'primeiro commit do joguinho, ainda como esboço para admin e super admin' },
      { data: PENDENTE('data em que o mascote passou a aparecer para todos'), oQue: 'aberto para todos os cargos' },
      { data: '09/08/2026', oQue: 'desligado e substituído por um card de despedida' },
      { data: '05/09/2026', oQue: 'o código sai para o arquivo morto' },
    ],
    porQueSaiu:
      'Foi desligado em 09/08/2026, e a remoção do código ficou combinada como «depois». Até '
      + '05/09/2026 eram cerca de 150 KB de fonte que ninguém executava, mas que continuavam '
      + 'sendo lidos em busca, mantidos em refatoração e incluídos no pacote.',
    arte: 'pet',
    origemDaArte: 'reconstituicao',
    fontes: [
      'arquivo-morto/pet/README.md',
      'docs/contexto-pet-loja-mensal-2026-07-11.md',
      'git: primeiro commit de src/components/pet (09/07/2026)',
    ],
  },
  {
    id: 'comemoracoes-1',
    epoca: 'primeiros',
    nome: 'Comemorações 1.0',
    inicio: '31/07/2026',
    fim: '15/10/2026',
    situacao: 'arquivado',
    texto:
      'O editor antigo da aba Comemorações: o formulário de uma página com a prévia ao lado, o '
      + 'texto solto sobre a tela, a biblioteca de GIFs e imagens enviados pela empresa, o '
      + 'recorte da música no envio e o painel de quem bateu a meta.',
    porQueSaiu:
      'Decisão do Cleber, 15/10/2026: a Comemorações 2.0 vira a versão oficial. O editor 1.0 '
      + 'ficava atrás dela como «versão atual» só enquanto a 2.0 estava em teste.',
    arte: 'comemoracoes',
    origemDaArte: 'reconstituicao',
    fontes: ['arquivo-morto/comemoracoes-1.0/README.md'],
  },
  {
    id: 'colchao',
    epoca: 'primeiros',
    nome: 'Controle do Colchão',
    inicio: '14/08/2026',
    fim: '21/10/2026',
    situacao: 'arquivado',
    texto:
      'A aba Colchão dentro do Analítico. A cada importação do relatório 58, as linhas marcadas '
      + 'como colchão que ficavam fora da meta eram gravadas uma a uma, e a aba listava essas '
      + 'linhas por dia e por operador, com total do dia e do mês. Era acompanhamento: nunca '
      + 'entrou em total nem em meta.',
    porQueSaiu: 'Decisão de 21/10/2026: o controle do colchão não estava sendo utilizado.',
    arte: 'colchao',
    origemDaArte: 'reconstituicao',
    fontes: ['arquivo-morto/colchao-controle/README.md'],
  },
  {
    id: 'ouvidoria',
    epoca: 'primeiros',
    nome: 'A primeira aba Ouvidoria',
    inicio: PENDENTE('data em que a primeira aba Ouvidoria entrou no ar'),
    fim: '05/09/2026',
    situacao: 'arquivado',
    texto:
      'Uma aba exclusiva da PaguePlay para registrar e acompanhar atendimentos de ouvidoria. '
      + 'Tinha concessão de acesso por pessoa, um responsável que via tudo e quatro chaves de '
      + 'permissão próprias. O que saiu foi a aba: o cargo de mesmo nome continuou existindo, '
      + 'com tudo o que tinha.',
    marcos: [
      { data: '05/09/2026', oQue: 'a aba é arquivada; o cargo «ouvidoria» é mantido' },
      { data: '06/11/2026', oQue: 'nasce outra aba Ouvidoria, a da regra Cofen, sem reaproveitar nada desta' },
    ],
    porQueSaiu: PENDENTE('motivo do arquivamento da primeira aba Ouvidoria'),
    arte: 'ouvidoria',
    origemDaArte: 'reconstituicao',
    fontes: ['arquivo-morto/ouvidoria/README.md'],
  },
  {
    id: 'modo-tv',
    epoca: 'primeiros',
    nome: 'Modo TV',
    inicio: '01/09/2026',
    fim: '13/10/2026',
    situacao: 'arquivado',
    texto:
      'A apresentação que rodava no PC ligado à TV do setor. Eram duas telas: a mesa, onde se '
      + 'montavam as cenas (fundo, relógio, métricas do setor, jogos, sorteio, bingo, alertas ao '
      + 'vivo) com prévia, «no ar» e o corte; e o palco, a tela cheia que a TV mostrava o dia '
      + 'inteiro.',
    marcos: [
      { data: '06/10/2026', oQue: 'o palco passa a exigir login, depois de uma auditoria' },
    ],
    porQueSaiu: 'Decisão de 13/10/2026: o Modo TV não será utilizado.',
    arte: 'modo-tv',
    origemDaArte: 'reconstituicao',
    peca: 'modo-tv',
    fontes: ['arquivo-morto/modo-tv/README.md'],
  },

  // ── O mês do Halloween ─────────────────────────────────────────────────────
  {
    id: 'halloween',
    epoca: 'halloween',
    nome: 'O tema de Halloween',
    inicio: '01/10/2026',
    fim: '03/11/2026',
    situacao: 'arquivado',
    texto:
      'Tudo o que o Halloween de 2026 pôs no sistema: teias, aranha, chuva com trovão, névoa, '
      + 'fantasmas, morcegos, chapéus de bruxa nas fotos e a abóbora no lugar da bolha do chat. '
      + 'Valia só em outubro, depois que o super admin liberava, e cada pessoa podia desligar. '
      + 'Vieram junto a mensagem de outubro, os temas de terror do som ambiente, o Jumpscare e '
      + 'o Mural de Outubro.',
    marcos: [
      { data: '23/10/2026', oQue: 'o Jumpscare: uma imagem em tela cheia para todos, num horário marcado' },
      { data: '31/10/2026', oQue: 'último dia do Mural de Outubro, que tinha começado no dia 26' },
    ],
    porQueSaiu:
      'Decisão do Cleber, 03/11/2026: acabou outubro, tudo do tema sai para o arquivo morto — '
      + 'de um jeito que dê para pôr de novo exatamente igual.',
    arte: 'halloween',
    origemDaArte: 'reconstituicao',
    fontes: ['arquivo-morto/halloween/README.md'],
  },
  {
    id: 'caca',
    epoca: 'halloween',
    nome: 'Caça aos Zumbis e às Bruxas',
    inicio: '05/10/2026',
    fim: '20/10/2026',
    situacao: 'arquivado',
    texto:
      'A gincana do Halloween. Um zumbi ficava escondido num canto livre da tela, e quem '
      + 'acertava primeiro ganhava a faixa no topo por dez minutos. Depois vieram os chefões, '
      + 'com lobby, contagem, música e a luta de todo mundo junto, e as bruxas na vassoura no '
      + 'lugar dos zumbis.',
    marcos: [
      { data: '05/10/2026', oQue: 'entra no ar, ainda como Caça à Abóbora' },
      { data: '07/10/2026', oQue: 'último dia com o nome de Caça à Abóbora; vira Caça aos Zumbis' },
      { data: '09/10/2026', oQue: 'o chefão: o Rei do Pop zumbi' },
      { data: '14/10/2026', oQue: 'Caça às Bruxas' },
      { data: '15/10/2026', oQue: 'a chefona: a Bruxa do Pântano' },
    ],
    porQueSaiu:
      'Decisão do Cleber, 20/10/2026: a parte do zumbi e da bruxa sai para o arquivo morto, e a '
      + 'gincana da vez passa a ser a Corrida da Sorte.',
    arte: 'caca',
    origemDaArte: 'da-epoca',
    peca: 'caca',
    fontes: ['arquivo-morto/caca-zumbis-bruxas/README.md'],
  },
  {
    id: 'pesquisa',
    epoca: 'halloween',
    nome: 'Pesquisa de experiência',
    inicio: '08/10/2026',
    fim: '15/10/2026',
    situacao: 'arquivado',
    texto:
      'A pergunta «Como tá sendo usar o Gestão de Acordos?», com três carinhas — Ruim, Tá ok e '
      + 'Tô curtindo — e um comentário opcional, no canto da tela. Uma vez por pessoa.',
    marcos: [
      { data: '13/10/2026', oQue: 'passa a aparecer só para a cobrança' },
    ],
    porQueSaiu:
      'Decisão do Cleber, 15/10/2026: a pesquisa já foi feita. Não precisava mais aparecer, e o '
      + 'card na aba Geral só poluía a tela.',
    arte: 'pesquisa',
    origemDaArte: 'reconstituicao',
    peca: 'pesquisa',
    fontes: [
      'arquivo-morto/pesquisa-experiencia/README.md',
      'supabase/migrations: 20261013150000_pesquisa_experiencia_so_cobranca',
    ],
  },
  {
    id: 'insignias',
    epoca: 'halloween',
    nome: 'O álbum de insígnias',
    inicio: '19/10/2026',
    fim: '03/11/2026',
    situacao: 'arquivado',
    texto:
      'As medalhas penduradas no topo da tela, uma por gincana completada: zumbi, Rei do Pop, '
      + 'bruxas, Pântano e, mais tarde, o Cavalo da Guerra — além das Lendas de Outubro.',
    marcos: [
      { data: '20/10/2026', oQue: 'sai junto com a Caça e volta ao código vivo no mesmo dia, sem ela' },
      { data: '03/11/2026', oQue: 'sai de vez, com o resto do Halloween' },
    ],
    porQueSaiu: 'Saiu com o Halloween, em 03/11/2026.',
    arte: 'insignias',
    origemDaArte: 'da-epoca',
    fontes: [
      'arquivo-morto/caca-zumbis-bruxas/README.md',
      'arquivo-morto/halloween/README.md',
    ],
  },

  // ── As corridas ────────────────────────────────────────────────────────────
  {
    id: 'corrida-da-sorte',
    epoca: 'corridas',
    nome: 'Corrida da Sorte',
    inicio: '20/10/2026',
    fim: null,
    situacao: 'vivo',
    texto:
      'O sorteio em forma de corrida. Cada pessoa escolhida corre com um bichinho, e quem '
      + 'cruzar primeiro leva o prêmio. Todo mundo assiste junto, no mesmo segundo. Substituiu a '
      + 'Caça aos Zumbis e às Bruxas.',
    arte: 'corrida',
    origemDaArte: 'da-epoca',
    peca: 'corrida',
    fontes: [
      'docs/CORRIDA-DA-SORTE.md',
      'git: primeiro commit de src/components/Corrida (20/10/2026)',
    ],
  },
  {
    id: 'corrida-de-cavalos',
    epoca: 'corridas',
    nome: 'Corrida de Cavalos',
    inicio: '22/10/2026',
    fim: null,
    situacao: 'vivo',
    texto:
      'A segunda categoria da corrida, ao lado da de bichinhos: cada pessoa que corre escolhe '
      + 'um cavalo, e quem assiste dá um palpite só pela sorte, sem prêmio. É desenhada ao vivo '
      + 'em cada computador, numa janela no canto.',
    marcos: [
      { data: '21/10/2026', oQue: 'fechada como laboratório, ainda sem banco' },
      { data: '22/10/2026', oQue: 'entra no sistema, ao lado da corrida de bichinhos' },
    ],
    arte: 'cavalos',
    origemDaArte: 'reconstituicao',
    fontes: [
      'docs/CORRIDA_CAVALOS.md',
      'git: primeiro commit de src/components/Corrida/cavalos (22/10/2026)',
    ],
  },
  {
    id: 'guerra-na-corrida',
    epoca: 'corridas',
    nome: 'Guerra na Corrida',
    inicio: '23/10/2026',
    fim: null,
    situacao: 'vivo',
    texto:
      'Na Corrida de Cavalos, a janela da corrida estoura e o Cavalo da Guerra sai dela para a '
      + 'página do Gestão. No mesmo dia ele ganhou ranking e uma insígnia própria.',
    arte: 'guerra',
    origemDaArte: 'da-epoca',
    fontes: [
      'src/components/Corrida/guerra/CenaGuerra.tsx (cabeçalho)',
      'git: primeiro commit de src/components/Corrida/guerra (23/10/2026)',
      'supabase/migrations: 20261023150000_corrida_guerra, 20261023200000_corrida_guerra_ranking_e_insignia',
    ],
  },

  // ── Sirene e Natal ─────────────────────────────────────────────────────────
  {
    id: 'sirene',
    epoca: 'fim-de-ano',
    nome: 'Sirene',
    inicio: '29/10/2026',
    fim: null,
    situacao: 'vivo',
    texto:
      'Luz e som na tela, por horário, por cor e por setor, mais um botão «Tocar agora».',
    marcos: [
      { data: '11/11/2026', oQue: 'a tela é reorganizada em abas, e o setor passa a abrir as equipes' },
    ],
    arte: 'sirene',
    origemDaArte: 'reconstituicao',
    peca: 'sirene',
    fontes: [
      'src/components/Sirene/CamposDaSirene.tsx (cabeçalho)',
      'git: primeiro commit de src/components/Sirene (29/10/2026)',
      'supabase/migrations: 20261029160000_sirene',
    ],
  },
  {
    id: 'natal',
    epoca: 'fim-de-ano',
    nome: 'O tema de Natal',
    inicio: '26/10/2026',
    fim: null,
    situacao: 'vivo',
    texto:
      'O tema de fim de ano, no mesmo molde do Halloween: sobe desligado e o super admin libera '
      + 'para todos. Começou como prévia, com a cena, a bolha do chat e o gorro, e foi ganhando '
      + 'boneco de neve, árvore, música, trenzinho e o quebra-nozes.',
    marcos: [
      { data: '26/10/2026', oQue: 'primeira prévia: a cena, a bolha do chat e o gorro' },
      { data: '09/11/2026', oQue: 'migration da liberação para todos e da abertura' },
      { data: '12/11/2026', oQue: 'migration do quebra-nozes' },
      // Sem data conhecida, fica por último: a ordem entre ele e os outros
      // marcos também não está escrita em lugar nenhum.
      { data: PENDENTE('data em que o Natal foi liberado para todos'), oQue: 'liberado para todos' },
    ],
    arte: 'natal',
    origemDaArte: 'reconstituicao',
    fontes: [
      'src/components/Natal/liberacao.ts (cabeçalho)',
      'git: histórico de src/components/Natal (primeiro commit em 26/10/2026)',
      'supabase/migrations: 20261109150000_natal_liberacao_e_abertura, 20261112180100_natal_quebra_nozes',
    ],
  },
];

/** As salas de uma época, na ordem da visita. */
export function salasDaEpoca(epoca: IdEpoca): SalaMuseu[] {
  return SALAS.filter(s => s.epoca === epoca);
}

/**
 * A ordem da visita: época por época, na ordem de `EPOCAS`, e dentro de cada
 * uma na ordem em que as salas estão escritas. Uma sala cuja época não existe
 * fica de fora — e o teste acusa.
 */
export function ordemDaVisita(): SalaMuseu[] {
  return EPOCAS.flatMap(e => salasDaEpoca(e.id));
}

/** A sala seguinte e a anterior na visita, ou `null` nas pontas. */
export function vizinhas(id: string): { anterior: SalaMuseu | null; proxima: SalaMuseu | null } {
  const ordem = ordemDaVisita();
  const i = ordem.findIndex(s => s.id === id);
  if (i < 0) return { anterior: null, proxima: null };
  return { anterior: ordem[i - 1] ?? null, proxima: ordem[i + 1] ?? null };
}

/**
 * Quantas salas existentes a pessoa já visitou.
 *
 * Conta só id que ainda existe: uma sala removida do Museu continua gravada no
 * progresso de quem a visitou (progresso não retrocede), mas não pode fazer a
 * contagem passar do total.
 */
export function salasVisitadas(vistas: readonly string[]): number {
  const existentes = new Set(SALAS.map(s => s.id));
  return new Set(vistas.filter(id => existentes.has(id))).size;
}
