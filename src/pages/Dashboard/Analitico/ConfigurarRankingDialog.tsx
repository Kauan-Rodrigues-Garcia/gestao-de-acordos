/**
 * ConfigurarRankingDialog — a gerência do setor escreve a regra do ranking.
 *
 * Três decisões numa tela só, porque as três se explicam juntas: mudar o
 * critério muda o que significa "participar", e tirar uma equipe muda quem
 * sobra para excluir individualmente.
 *
 * ## O rascunho é local até o Salvar
 *
 * Nada aqui grava a cada clique. O ranking é uma coisa que a operação inteira
 * olha, e um clique errado no meio da configuração viraria placar novo para
 * todo mundo antes de a pessoa terminar de pensar. `Cancelar` descarta o
 * rascunho e a tela volta ao que estava.
 *
 * ## Os grupos entram como "todos participam" por padrão
 *
 * A tela mostra as caixas todas marcadas quando `gruposIncluidos` está vazio,
 * e volta a gravar vazio quando o usuário marca todas de novo. Guardar a lista
 * completa funcionaria igual hoje e quebraria amanhã: equipe criada depois da
 * configuração ficaria fora do ranking sem ninguém ter decidido isso.
 */

import { useEffect, useMemo, useState } from 'react';
import { Trophy, Users, Search } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  CRITERIOS_RANKING, type CriterioRanking, type RankingConfig,
} from '@/services/analitico/rankingConfig.service';
import { LABEL_CRITERIO, DESCRICAO_CRITERIO } from './rankingCriterio';

/** Uma equipe ou subgrupo elegível a participar. */
export interface GrupoConfiguravel {
  id: string;
  nome: string;
  /** Nome da equipe-mãe, quando este grupo é um subgrupo dela. */
  equipeNome?: string | null;
}

/** Uma pessoa que pode ser tirada do ranking. */
export interface PessoaConfiguravel {
  id: string;
  nome: string;
  grupoNome: string | null;
}

interface Props {
  aberto: boolean;
  onFechar: () => void;
  config: RankingConfig;
  grupos: GrupoConfiguravel[];
  pessoas: PessoaConfiguravel[];
  salvando: boolean;
  onSalvar: (config: RankingConfig) => void;
}

export function ConfigurarRankingDialog({
  aberto, onFechar, config, grupos, pessoas, salvando, onSalvar,
}: Props) {
  const [criterio, setCriterio] = useState<CriterioRanking>(config.criterio);
  const [gruposMarcados, setGruposMarcados] = useState<Set<string>>(new Set());
  const [excluidos, setExcluidos] = useState<Set<string>>(new Set());
  const [busca, setBusca] = useState('');

  /*
   * O rascunho renasce a cada abertura, e não a cada mudança de `config`.
   *
   * Sem a condição de `aberto`, um refetch em segundo plano reescreveria o que
   * a pessoa acabou de marcar — o clássico "sumiu o que eu tinha selecionado".
   */
  useEffect(() => {
    if (!aberto) return;
    setCriterio(config.criterio);
    setGruposMarcados(
      config.gruposIncluidos.length === 0
        ? new Set(grupos.map(g => g.id))   // vazio = todos
        : new Set(config.gruposIncluidos),
    );
    setExcluidos(new Set(config.perfisExcluidos));
    setBusca('');
  }, [aberto, config, grupos]);

  const todosMarcados = grupos.length > 0 && gruposMarcados.size === grupos.length;

  const pessoasVisiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return termo
      ? pessoas.filter(p => p.nome.toLowerCase().includes(termo))
      : pessoas;
  }, [pessoas, busca]);

  function alternarGrupo(id: string) {
    setGruposMarcados(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function alternarPessoa(id: string) {
    setExcluidos(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function salvar() {
    onSalvar({
      criterio,
      // Todos marcados volta a ser "vazio = todos", para equipe nova entrar sozinha.
      gruposIncluidos: todosMarcados ? [] : [...gruposMarcados],
      perfisExcluidos: [...excluidos],
    });
  }

  return (
    <Dialog open={aberto} onOpenChange={o => { if (!o) onFechar(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-primary" /> Configurar o ranking
          </DialogTitle>
          <DialogDescription>
            Vale para este setor, deste mês em diante. Só é aplicado depois de salvar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* ── Critério ─────────────────────────────────────────────────── */}
          <section className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Critério da posição
            </p>
            <div className="grid gap-2">
              {CRITERIOS_RANKING.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCriterio(c)}
                  className={cn(
                    'text-left rounded-lg border px-3 py-2 transition-colors',
                    criterio === c
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/40 hover:bg-muted/40',
                  )}
                >
                  <p className="text-sm font-medium">{LABEL_CRITERIO[c]}</p>
                  <p className="text-xs text-muted-foreground">{DESCRICAO_CRITERIO[c]}</p>
                </button>
              ))}
            </div>
          </section>

          {/* ── Equipes e subgrupos participantes ────────────────────────── */}
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Quem disputa
              </p>
              <button
                type="button"
                onClick={() => setGruposMarcados(
                  todosMarcados ? new Set() : new Set(grupos.map(g => g.id)),
                )}
                className="text-xs text-primary hover:underline"
              >
                {todosMarcados ? 'Desmarcar todas' : 'Marcar todas'}
              </button>
            </div>

            {grupos.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">
                Nenhuma equipe neste setor.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {grupos.map(g => (
                  <label
                    key={g.id}
                    className={cn(
                      'flex items-center gap-2 rounded-lg border px-2.5 py-2 cursor-pointer transition-colors',
                      gruposMarcados.has(g.id)
                        ? 'border-primary/40 bg-primary/5'
                        : 'border-border hover:bg-muted/40',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={gruposMarcados.has(g.id)}
                      onChange={() => alternarGrupo(g.id)}
                      className="h-3.5 w-3.5 accent-primary shrink-0"
                    />
                    <span className="text-sm truncate">{g.nome}</span>
                    {g.equipeNome && (
                      <Badge variant="outline" className="text-[10px] px-1.5 shrink-0">
                        {g.equipeNome}
                      </Badge>
                    )}
                  </label>
                ))}
              </div>
            )}
            {!todosMarcados && grupos.length > 0 && (
              <p className="text-[11px] text-muted-foreground">
                Com equipes desmarcadas, quem está fora delas não aparece no ranking —
                o recebimento continua contando nos totais do setor.
              </p>
            )}
          </section>

          {/* ── Exclusões nominais ──────────────────────────────────────── */}
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" /> Pessoas fora do ranking
              </p>
              {excluidos.size > 0 && (
                <Badge variant="secondary" className="text-[10px]">
                  {excluidos.size} fora
                </Badge>
              )}
            </div>

            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                value={busca}
                onChange={e => setBusca(e.target.value)}
                placeholder="Procurar pessoa…"
                className="h-8 pl-8 text-sm"
              />
            </div>

            <div className="max-h-56 overflow-y-auto rounded-lg border border-border divide-y divide-border">
              {pessoasVisiveis.length === 0 ? (
                <p className="text-xs text-muted-foreground italic px-3 py-4 text-center">
                  Ninguém encontrado.
                </p>
              ) : pessoasVisiveis.map(p => (
                <label
                  key={p.id}
                  className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-muted/40 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={excluidos.has(p.id)}
                    onChange={() => alternarPessoa(p.id)}
                    className="h-3.5 w-3.5 accent-destructive shrink-0"
                  />
                  <span className={cn(
                    'text-sm truncate flex-1',
                    excluidos.has(p.id) && 'line-through text-muted-foreground',
                  )}>
                    {p.nome}
                  </span>
                  {p.grupoNome && (
                    <span className="text-[11px] text-muted-foreground truncate max-w-[120px] shrink-0">
                      {p.grupoNome}
                    </span>
                  )}
                </label>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Marcar tira a pessoa do placar. O recebimento dela continua nos totais.
            </p>
          </section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={salvando}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
