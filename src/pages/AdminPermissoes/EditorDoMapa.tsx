/**
 * EditorDoMapa — a busca, a barra de salvar e o painel de módulos de um mapa
 * de cargo. É o mesmo nas visões Por cargo e Por setor.
 */
import { useState, type ReactNode } from 'react';
import { Save, RotateCcw, Loader2, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PainelDeModulos } from './PainelDeModulos';
import type { MapaDoCargo } from './useMapaDoCargo';

interface Props {
  mapa: MapaDoCargo;
  /** Mostra o mapa sem deixar mudar — a prévia do cargo no Por setor. */
  somenteLeitura?: boolean;
  /** O que vem acima da busca: de quem é o mapa, avisos, botões. */
  cabecalho?: ReactNode;
}

export function EditorDoMapa({ mapa, somenteLeitura = false, cabecalho }: Props) {
  const [busca, setBusca] = useState('');
  const { rascunho } = mapa;

  return (
    <div className="space-y-3">
      {cabecalho}

      {/* Busca + barra de alterações, coladas no topo ao rolar */}
      <div className="sticky top-0 z-10 -mx-1 space-y-2 bg-background/95 px-1 py-2 backdrop-blur">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar permissão — «excluir equipe», «setor», «importar»…"
            className="h-9 pl-9 pr-9 text-sm"
          />
          {busca && (
            <button
              type="button"
              onClick={() => setBusca('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
              aria-label="Limpar busca"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {rascunho.sujo && !somenteLeitura && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2">
            <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
              {rascunho.total} alteração{rascunho.total !== 1 ? 'ões' : ''} não salva
              {rascunho.total !== 1 ? 's' : ''}
            </span>
            <div className="ml-auto flex gap-1.5">
              <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs"
                onClick={rascunho.descartar}>
                <RotateCcw className="h-3.5 w-3.5" /> Descartar
              </Button>
              <Button size="sm" className="h-7 gap-1 text-xs" onClick={mapa.salvar} disabled={mapa.salvando}>
                {mapa.salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Salvar
              </Button>
            </div>
          </div>
        )}
      </div>

      <PainelDeModulos
        blocos={mapa.blocos}
        valorDe={mapa.valorDe}
        alternar={mapa.alternar}
        alterada={k => k in rascunho.alteracoes}
        somenteLeitura={somenteLeitura || mapa.acessoTotal}
        filtro={busca.trim().toLowerCase()}
        interruptorNaLista
      />
    </div>
  );
}
