/**
 * FiltroEscopo — o recorte do Dashboard, num controle só.
 *
 * ## O que havia antes
 *
 * Dois filtros, em lugares diferentes da tela e sem conversa entre si:
 *
 *   • "Visualizar:" — setor geral / equipes / individual, no cabeçalho, visível
 *     só para `lider` e `elite`;
 *   • "Filtrar setor:" — pílulas de setor, acima do painel, visível só para
 *     `administrador` e `super_admin`.
 *
 * Isso produzia três defeitos de uma vez:
 *
 *   1. **A diretoria não tinha filtro nenhum.** Ela carregava a lista de
 *      setores e nunca via o controle: enxergava todos os setores sem como
 *      estreitar.
 *   2. **As equipes não seguiam o setor.** Com alcance amplo, a lista trazia as
 *      equipes da empresa inteira. Escolher o setor B e depois uma equipe do
 *      setor A cruzava dois recortes impossíveis e devolvia tela vazia —
 *      parecendo "não há dados" quando o filtro é que era contraditório.
 *   3. **Quem podia o quê saía de listas de cargo escritas à mão**, que
 *      discordavam das permissões configuradas.
 *
 * ## O desenho agora
 *
 * Um controle, em cascata, e as opções saem dos NÍVEIS DA ABA — o que o cargo
 * pode escolher no Dashboard, e nada mais:
 *
 *   Setor  → aparece para quem tem `todos_setores`
 *   Equipe → aparece para quem tem `equipe`, e SÓ com um setor em foco
 *   Individual → aparece quando há algo mais amplo do que ele para contrastar
 *
 * Escolher "Todos os setores" esconde a linha de equipe, porque equipe de qual
 * setor não teria resposta.
 */

import { Building2, Layers, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { NivelEscopo } from '@/lib/permissoes-escopo';
import type { SetorResumo, EquipeResumo } from '@/hooks/useSetoresEquipes';

/** O que a tela mostra hoje. `equipe:<id>` guarda a equipe escolhida. */
export type VisaoEscopo = 'setor' | 'individual' | `equipe:${string}`;

interface Props {
  /** Níveis que este cargo pode escolher no Dashboard. */
  niveis: readonly NivelEscopo[];
  setores: readonly SetorResumo[];
  /** Setor escolhido. `null` = todos os setores. */
  setorFiltro: string | null;
  onSetor: (id: string | null) => void;
  /** Equipes do setor em foco — já recortadas por quem chama. */
  equipes: readonly EquipeResumo[];
  /**
   * O alcance de equipe cobre TODAS as equipes do setor?
   *
   * `false` esconde o botão «Todas as equipes» — ele É o setor sem recorte, e
   * oferecê-lo a quem foi limitado à própria equipe desfaz o limite com um
   * clique.
   */
  podeTodasEquipes: boolean;
  visao: VisaoEscopo;
  onVisao: (v: VisaoEscopo) => void;
  /** Setor do próprio perfil, para quem não escolhe. */
  setorDoPerfil: string | null;
}

export function FiltroEscopo({
  niveis, setores, setorFiltro, onSetor, equipes, podeTodasEquipes,
  visao, onVisao, setorDoPerfil,
}: Props) {
  const podeEscolherSetor = niveis.includes('todos_setores');
  const podeEquipe = niveis.includes('equipe');
  /*
   * «Todas as equipes» é o SETOR sem recorte, e some por dois motivos
   * independentes:
   *
   *   • sem alcance de setor, ele daria num clique a visão que o painel negou;
   *   • com `dashboard_escopo_equipe_todas` desligada, ele desfaz o limite que
   *     a chave acabou de impor — a pessoa foi limitada à própria equipe e o
   *     botão devolveria o setor inteiro.
   *
   * O segundo motivo é pedido explícito: «se essa opção de ver todas as
   * equipes estiver desativada, o botão de todas as equipes deve sumir».
   */
  const mostrarTodasEquipes =
    (niveis.includes('setor') || podeEscolherSetor) && podeTodasEquipes;

  /*
   * Quem escolhe setor usa o escolhido; quem não escolhe fica no próprio. Este
   * valor decide se a linha de equipe faz sentido — e é por isso que "todos os
   * setores" (`null` com escolha possível) a esconde.
   */
  const setorEmFoco = podeEscolherSetor ? setorFiltro : setorDoPerfil;

  const mostrarEquipes = podeEquipe && setorEmFoco !== null && equipes.length > 0;
  // Um "individual" sozinho não é escolha — é a única coisa que a pessoa vê.
  const mostrarIndividual = niveis.includes('individual') && niveis.length > 1;

  /*
   * O "sair do individual" da linha Pessoa.
   *
   * Era sempre `'setor'`, e isso é uma porta dos fundos para o botão que
   * acabamos de esconder: quem está limitado à própria equipe clicaria em
   * «Todas as pessoas» e cairia no setor inteiro. Sem «Todas as equipes» na
   * tela, o mais amplo que essa pessoa tem é a primeira equipe da lista.
   */
  const visaoMaisAmpla: VisaoEscopo =
    mostrarTodasEquipes || !mostrarEquipes ? 'setor' : `equipe:${equipes[0].id}`;

  // Nada a oferecer: o controle inteiro some em vez de virar moldura vazia.
  if (!podeEscolherSetor && !mostrarEquipes && !mostrarIndividual) return null;

  const equipeAtiva = visao.startsWith('equipe:') ? visao.slice('equipe:'.length) : null;

  return (
    <div
      className="flex flex-col gap-2 px-4 py-3 rounded-xl border border-border bg-card"
      data-tour="filtro-escopo"
    >
      {podeEscolherSetor && setores.length > 0 && (
        <Linha icone={<Building2 className="w-4 h-4 text-muted-foreground shrink-0" />} rotulo="Setor">
          <Chip
            ativo={setorFiltro === null}
            onClick={() => { onSetor(null); onVisao('setor'); }}
            titulo="Ver todos os setores da empresa"
          >
            Todos os setores
          </Chip>
          {setores.map(s => (
            <Chip
              key={s.id}
              ativo={setorFiltro === s.id}
              // Trocar de setor volta a visão para "setor geral": manter a
              // equipe anterior selecionada deixaria um recorte de outro setor
              // vivo, que é o defeito nº 2 do cabeçalho.
              onClick={() => { onSetor(setorFiltro === s.id ? null : s.id); onVisao('setor'); }}
              titulo={`Ver dados do setor ${s.nome}`}
            >
              {s.nome}
            </Chip>
          ))}
        </Linha>
      )}

      {mostrarEquipes && (
        <Linha icone={<Layers className="w-4 h-4 text-muted-foreground shrink-0" />} rotulo="Equipe">
          {mostrarTodasEquipes && (
            <Chip
              ativo={visao === 'setor'}
              onClick={() => onVisao('setor')}
              titulo="Ver o setor inteiro, sem recorte por equipe"
            >
              Todas as equipes
            </Chip>
          )}
          {equipes.map(eq => (
            <Chip
              key={eq.id}
              ativo={equipeAtiva === eq.id}
              onClick={() => onVisao(`equipe:${eq.id}`)}
              titulo={`Ver dados da equipe ${eq.nome}`}
            >
              {eq.nome}
            </Chip>
          ))}
        </Linha>
      )}

      {mostrarIndividual && (
        <Linha icone={<Users className="w-4 h-4 text-muted-foreground shrink-0" />} rotulo="Pessoa">
          <Chip
            ativo={visao !== 'individual'}
            onClick={() => onVisao(visaoMaisAmpla)}
            titulo="Ver os dados de todo mundo no recorte acima"
          >
            Todas as pessoas
          </Chip>
          <Chip
            ativo={visao === 'individual'}
            onClick={() => onVisao('individual')}
            titulo="Ver apenas os seus próprios acordos"
          >
            Só os meus
          </Chip>
        </Linha>
      )}
    </div>
  );
}

function Linha({
  icone, rotulo, children,
}: { icone: React.ReactNode; rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {icone}
      <span className="text-xs font-medium text-muted-foreground w-14 shrink-0">{rotulo}:</span>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Chip({
  ativo, onClick, titulo, children,
}: { ativo: boolean; onClick: () => void; titulo: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={titulo}
      aria-pressed={ativo}
      className={cn(
        'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
        ativo
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}
