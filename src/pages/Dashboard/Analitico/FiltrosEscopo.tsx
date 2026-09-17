/**
 * FiltrosEscopo — setor e equipe, uma vez, valendo para todas as abas.
 *
 * Vive no cabeçalho do Painel do Líder, acima das abas, porque o recorte é o
 * MESMO para Desempenho Equipes, Quartis e Gráfico. Antes cada aba resolvia
 * sozinha: Quartis tinha seletor próprio, Desempenho e Gráfico não tinham
 * nenhum, e trocar de aba trocava o recorte sem avisar.
 *
 * ## Cards selecionáveis, não um item de cada vez (17/09/2026)
 *
 * Os dois filtros eram `Select` de escolha única: dava para olhar UM setor ou
 * TODOS, e nada no meio. Comparar o Play 4 com o Play 5 exigia abrir um,
 * anotar, abrir o outro — e somar de cabeça.
 *
 * Agora cada lista abre um painel de cards marcáveis: marque três setores e a
 * tela passa a ser a desses três, com os demais fora. Nenhum marcado continua
 * significando «todos», que é como a tela nasce e para onde «Limpar» volta.
 *
 * As equipes oferecidas são só as dos setores marcados — a lista vem pronta de
 * `escopoDoPainel`, que também descarta a equipe que ficou de um recorte
 * anterior.
 *
 * A decisão de quem pode filtrar e de qual escolha sobrevive é de
 * `escopoDoPainel.ts`. Aqui só há tela.
 */

import { useMemo, useState } from 'react';
import { Building2, Check, ChevronDown, Layers, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

import type { EscopoPainel } from './escopoDoPainel';
import type { EquipeAnalitico } from '@/services/analitico/analitico.service';

interface ItemFiltro {
  id: string;
  nome: string;
  /** Linha de apoio no card — o setor da equipe, quando há mais de um em foco. */
  detalhe?: string | null;
}

interface FiltrosEscopoProps {
  escopo: EscopoPainel;
  /** setor_id → nome, na ordem que o admin arrastou na aba Setores. */
  setores: { id: string; nome: string }[];
  onSetores: (setorIds: string[]) => void;
  onEquipes: (equipeIds: string[]) => void;
  /** Rótulo do setor travado, para quem não pode filtrar. */
  nomeSetorTravado?: string | null;
  className?: string;
}

/**
 * O que o botão escreve quando fechado.
 *
 * Nada marcado é «todos», que é a verdade e não um filtro vazio. Um ou dois
 * marcados cabem por nome — é a informação que a pessoa quer de relance. De
 * três em diante o nome não cabe, e a contagem passa a dizer mais.
 */
function rotuloDaSelecao(
  marcados: readonly string[], itens: readonly ItemFiltro[],
  vazio: string, plural: string,
): string {
  if (marcados.length === 0) return vazio;
  if (marcados.length > 2) return `${marcados.length} ${plural}`;
  const nome = (id: string) => itens.find(i => i.id === id)?.nome ?? '—';
  return marcados.map(nome).join(', ');
}

/** Lista de cards marcáveis dentro de um popover. */
function SeletorMultiplo({
  icone: Icone, itens, marcados, onMarcados, vazio, plural, larguraBotao,
}: {
  icone: typeof Building2;
  itens: readonly ItemFiltro[];
  marcados: readonly string[];
  onMarcados: (ids: string[]) => void;
  /** Texto do botão e do card de cima quando nada está marcado. */
  vazio: string;
  /** Palavra da contagem: «3 setores», «5 equipes». */
  plural: string;
  larguraBotao: string;
}) {
  const [aberto, setAberto] = useState(false);
  const marcadosSet = useMemo(() => new Set(marcados), [marcados]);

  const alternar = (id: string) => {
    onMarcados(marcadosSet.has(id)
      ? marcados.filter(m => m !== id)
      : [...marcados, id]);
  };

  return (
    <div className="flex items-center gap-1.5">
      <Icone className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
      <Popover open={aberto} onOpenChange={setAberto}>
        <PopoverTrigger asChild>
          <Button
            variant="outline" size="sm"
            className={cn('h-8 justify-between gap-2 px-2.5 text-xs font-normal', larguraBotao)}
          >
            <span className="truncate">
              {rotuloDaSelecao(marcados, itens, vazio, plural)}
            </span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
          </Button>
        </PopoverTrigger>

        <PopoverContent align="start" className="w-64 p-1.5">
          <div className="max-h-[320px] space-y-1 overflow-y-auto">
            {/* O card de «todos» é o mesmo gesto dos outros: clicar nele
                desmarca tudo, em vez de obrigar a desmarcar um a um. */}
            <button
              type="button"
              onClick={() => onMarcados([])}
              className={cn(
                'flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition-colors',
                marcados.length === 0
                  ? 'border-primary/60 bg-primary/10 text-foreground'
                  : 'border-transparent hover:bg-muted/60',
              )}
            >
              <span className={cn(
                'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                marcados.length === 0 ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
              )}>
                {marcados.length === 0 && <Check className="h-3 w-3" />}
              </span>
              <span className="font-medium">{vazio}</span>
            </button>

            {itens.map(item => {
              const marcado = marcadosSet.has(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => alternar(item.id)}
                  aria-pressed={marcado}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition-colors',
                    marcado
                      ? 'border-primary/60 bg-primary/10 text-foreground'
                      : 'border-transparent hover:bg-muted/60',
                  )}
                >
                  <span className={cn(
                    'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                    marcado ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
                  )}>
                    {marcado && <Check className="h-3 w-3" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{item.nome}</span>
                    {item.detalhe && (
                      <span className="block truncate text-[10px] text-muted-foreground">
                        {item.detalhe}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}

            {itens.length === 0 && (
              <p className="px-2.5 py-3 text-center text-[11px] text-muted-foreground">
                Nada para escolher aqui.
              </p>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function FiltrosEscopo({
  escopo, setores, onSetores, onEquipes, nomeSetorTravado, className,
}: FiltrosEscopoProps) {
  const { podeFiltrarSetor, setorIds, equipeIds, equipesDisponiveis } = escopo;

  // Quem não pode filtrar setor nem tem equipe para escolher não tem barra
  // nenhuma: um seletor com uma opção só é ruído, e uma barra vazia com borda é
  // pior que ausência.
  if (!podeFiltrarSetor && equipesDisponiveis.length <= 1) return null;

  const nomeDoSetor = (id: string | null | undefined) =>
    (id ? setores.find(s => s.id === id)?.nome ?? null : null);

  // O setor sob o nome da equipe só aparece quando o recorte cruza mais de um
  // — com um setor em foco, repetir o nome dele em cada card é ruído.
  const mostrarSetorDaEquipe = setorIds.length !== 1;
  const itensEquipe: ItemFiltro[] = equipesDisponiveis.map((eq: EquipeAnalitico) => ({
    id: eq.id,
    nome: eq.nome,
    detalhe: mostrarSetorDaEquipe ? nomeDoSetor(eq.setor_id) : null,
  }));

  return (
    <div className={cn(
      'flex items-center gap-2 flex-wrap rounded-xl border border-border/70 bg-card/60 px-3 py-2',
      className,
    )}>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Recorte
      </span>

      {podeFiltrarSetor ? (
        <SeletorMultiplo
          icone={Building2}
          itens={setores}
          marcados={setorIds}
          onMarcados={onSetores}
          vazio="Todos os setores"
          plural="setores"
          larguraBotao="w-52"
        />
      ) : nomeSetorTravado ? (
        // Dizer em qual setor a pessoa está evita a leitura de que o painel
        // mostra a empresa inteira.
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Building2 className="w-3.5 h-3.5 shrink-0" />
          {nomeSetorTravado}
        </span>
      ) : null}

      {equipesDisponiveis.length > 0 && (
        <SeletorMultiplo
          icone={Layers}
          itens={itensEquipe}
          marcados={equipeIds}
          onMarcados={onEquipes}
          vazio="Todas as equipes"
          plural="equipes"
          larguraBotao="w-52"
        />
      )}

      {escopo.temFiltroAtivo && (
        <Button
          variant="ghost" size="sm"
          className="h-8 px-2 gap-1 text-xs text-muted-foreground"
          onClick={() => { onSetores([]); onEquipes([]); }}
        >
          <X className="w-3 h-3" /> Limpar
        </Button>
      )}
    </div>
  );
}
