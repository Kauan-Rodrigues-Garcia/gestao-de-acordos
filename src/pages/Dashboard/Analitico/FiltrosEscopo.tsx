/**
 * FiltrosEscopo — setor e equipe, uma vez, valendo para as três abas.
 *
 * Vive no cabeçalho do Painel do Líder, acima das abas, porque o recorte é o
 * MESMO para Desempenho Equipes, Quartis e Gráfico. Antes cada aba resolvia
 * sozinha: Quartis tinha seletor próprio, Desempenho e Gráfico não tinham
 * nenhum, e trocar de aba trocava o recorte sem avisar.
 *
 * A decisão de quem pode filtrar e de qual escolha sobrevive é de
 * `escopoDoPainel.ts`. Aqui só há tela.
 */

import { Building2, Layers, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

import type { EscopoPainel } from './escopoDoPainel';
import type { EquipeAnalitico } from '@/services/analitico/analitico.service';

/** Sentinelas dos `Select`: Radix não aceita `value=""` num `SelectItem`. */
const TODOS_SETORES = '__todos_setores__';
const TODAS_EQUIPES = '__todas_equipes__';

interface FiltrosEscopoProps {
  escopo: EscopoPainel;
  /** setor_id → nome, na ordem que o admin arrastou na aba Setores. */
  setores: { id: string; nome: string }[];
  onSetor: (setorId: string | null) => void;
  onEquipe: (equipeId: string | null) => void;
  /** Rótulo do setor travado, para quem não pode filtrar. */
  nomeSetorTravado?: string | null;
  className?: string;
}

export function FiltrosEscopo({
  escopo, setores, onSetor, onEquipe, nomeSetorTravado, className,
}: FiltrosEscopoProps) {
  const { podeFiltrarSetor, setorId, equipeId, equipesDisponiveis, temFiltroAtivo } = escopo;

  // Quem não pode filtrar setor nem tem equipe para escolher não tem barra
  // nenhuma: um seletor com uma opção só é ruído, e uma barra vazia com borda é
  // pior que ausência.
  if (!podeFiltrarSetor && equipesDisponiveis.length <= 1) return null;

  return (
    <div className={cn(
      'flex items-center gap-2 flex-wrap rounded-xl border border-border/70 bg-card/60 px-3 py-2',
      className,
    )}>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Recorte
      </span>

      {podeFiltrarSetor ? (
        <div className="flex items-center gap-1.5">
          <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <Select
            value={setorId ?? TODOS_SETORES}
            onValueChange={v => onSetor(v === TODOS_SETORES ? null : v)}
          >
            <SelectTrigger className="h-8 w-48 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS_SETORES}>Todos os setores</SelectItem>
              {setores.map(s => (
                <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : nomeSetorTravado ? (
        // Dizer em qual setor a pessoa está evita a leitura de que o painel
        // mostra a empresa inteira.
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Building2 className="w-3.5 h-3.5 shrink-0" />
          {nomeSetorTravado}
        </span>
      ) : null}

      {equipesDisponiveis.length > 0 && (
        <div className="flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <Select
            value={equipeId ?? TODAS_EQUIPES}
            onValueChange={v => onEquipe(v === TODAS_EQUIPES ? null : v)}
          >
            <SelectTrigger className="h-8 w-48 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={TODAS_EQUIPES}>Todas as equipes</SelectItem>
              {equipesDisponiveis.map((eq: EquipeAnalitico) => (
                <SelectItem key={eq.id} value={eq.id}>{eq.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {temFiltroAtivo && (
        <Button
          variant="ghost" size="sm"
          className="h-8 px-2 gap-1 text-xs text-muted-foreground"
          onClick={() => { onSetor(null); onEquipe(null); }}
        >
          <X className="w-3 h-3" /> Limpar
        </Button>
      )}
    </div>
  );
}
