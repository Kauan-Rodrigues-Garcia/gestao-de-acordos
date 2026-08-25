/**
 * permissoes-abas.ts — o catálogo reorganizado do jeito que a pergunta é feita.
 *
 * ## O problema da tela antiga
 *
 * O painel listava as permissões por CATEGORIA: "Abas e telas", "Filtros e
 * visão", "Ações específicas". Para responder "o que o líder pode fazer no
 * Analítico?" era preciso caçar a chave da aba num grupo, o alcance em outro e
 * as ações num terceiro — e nada dizia que as três eram a mesma aba.
 *
 * Aqui o catálogo é remontado na ordem em que a pergunta nasce:
 *
 *     cargo → aba → o que ele vê e o que ele faz naquela aba
 *
 * Nada muda no catálogo em si. Isto é uma leitura dele.
 *
 * ## Por que a montagem mora aqui, e não na tela
 *
 * Porque tem regra dentro. A chave que liga a aba vive no grupo "Abas e telas",
 * o alcance vive no grupo com nome da aba, e as duas precisam aparecer juntas —
 * com a chave da aba PRIMEIRO, porque desligá-la torna o resto inefetivo. Essa
 * dependência é do modelo, não do desenho, e uma tela que a reinventasse
 * poderia contradizê-la.
 */
import {
  ABAS_COM_ESCOPO, chaveEscopo, type AbaEscopada,
} from './permissoes-escopo';
import type { PermissaoMeta, GrupoPermissao } from './permissoes-catalogo';

/**
 * O grupo do catálogo que corresponde a cada aba.
 *
 * Só existe para as abas que já foram reestruturadas. Grupo sem aba aqui
 * continua sendo desenhado como lista simples — é o caso de "Importações" e
 * "Ações específicas", que não pertencem a uma tela só.
 */
export const ABA_DO_GRUPO: Partial<Record<GrupoPermissao, AbaEscopada>> = {
  'Acordos':          'acordos',
  'Dashboard':        'dashboard',
  'Analítico':        'analitico',
  'Pix Automático':   'pix',
  'Lixeira':          'lixeira',
  'Painel Líder':     'painel_lider',
  'Painel Diretoria': 'painel_diretoria',
  'Gestão de pessoas': 'usuarios',
  'Chat':             'chat',
};

/** Rótulo humano de cada nível, na ordem do mais estreito ao mais amplo. */
export const ROTULO_NIVEL: Record<string, string> = {
  individual:    'Só os próprios',
  equipe:        'Da equipe',
  setor:         'Do setor',
  todos_setores: 'De todos os setores',
};

export interface BlocoDeAba {
  aba: AbaEscopada;
  /** O nome do grupo, que é como o admin já chama a aba. */
  rotulo: GrupoPermissao;
  /** A chave que liga e desliga a aba inteira. `null` no Dashboard. */
  interruptor: PermissaoMeta | null;
  /** Os níveis de alcance desta aba, do mais estreito ao mais amplo. */
  niveis: PermissaoMeta[];
  /** Abas internas e ações — tudo que sobra do grupo. */
  acoes: PermissaoMeta[];
}

export interface LeituraPorAba {
  blocos: BlocoDeAba[];
  /** Grupos que não são de uma aba só, já sem as chaves usadas como interruptor. */
  avulsos: { grupo: GrupoPermissao; permissoes: PermissaoMeta[] }[];
}

/**
 * Remonta um catálogo (já recortado pela operação) na forma cargo → aba.
 *
 * A ordem dos blocos segue a ordem dos grupos que veio de fora, para o painel
 * não reordenar sozinho o que o catálogo já ordenou.
 */
export function montarPorAba(
  catalogo: PermissaoMeta[],
  gruposNaOrdem: readonly GrupoPermissao[],
): LeituraPorAba {
  const porChave = new Map(catalogo.map(p => [p.key, p]));
  const consumidas = new Set<string>();

  const blocos: BlocoDeAba[] = [];

  for (const grupo of gruposNaOrdem) {
    const aba = ABA_DO_GRUPO[grupo];
    if (!aba) continue;

    const meta = ABAS_COM_ESCOPO[aba];

    // O interruptor pode viver em outro grupo ("Abas e telas") — por isso a
    // busca é no catálogo inteiro, e não só no grupo.
    const interruptor = meta.chaveAba ? porChave.get(meta.chaveAba) ?? null : null;
    if (interruptor) consumidas.add(interruptor.key);

    const chavesDeNivel = meta.niveis.map(n => chaveEscopo(meta.prefixo, n));
    const niveis = chavesDeNivel
      .map(k => porChave.get(k))
      .filter((p): p is PermissaoMeta => !!p);
    niveis.forEach(p => consumidas.add(p.key));

    const acoes = catalogo.filter(
      p => p.grupo === grupo && !consumidas.has(p.key),
    );
    acoes.forEach(p => consumidas.add(p.key));

    // Aba sem nada configurável não vira bloco: seria uma moldura vazia.
    if (!interruptor && niveis.length === 0 && acoes.length === 0) continue;

    blocos.push({ aba, rotulo: grupo, interruptor, niveis, acoes });
  }

  const avulsos = gruposNaOrdem
    .filter(g => !ABA_DO_GRUPO[g])
    .map(grupo => ({
      grupo,
      permissoes: catalogo.filter(p => p.grupo === grupo && !consumidas.has(p.key)),
    }))
    .filter(x => x.permissoes.length > 0);

  return { blocos, avulsos };
}
