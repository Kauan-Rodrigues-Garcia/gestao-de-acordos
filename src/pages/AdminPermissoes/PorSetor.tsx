/**
 * PorSetor — as permissões vistas a partir do setor (03/11/2026).
 *
 * Os mapas próprios de setor (migration 20261026120000) ficavam numa coluna
 * embaixo dos cargos, uma linha por setor × cargo, e para saber «o que a
 * Manutenção pode» era preciso caçar cada combinação. Aqui a pergunta começa
 * pelo setor: escolhe-se o setor, depois o cargo, e a tela diz se ele segue o
 * cargo (prévia, só leitura) ou tem mapa próprio (editável).
 *
 * Personalizar cria o mapa como cópia do cargo; remover devolve quem está no
 * setor às permissões do cargo. Os dois são os mesmos de antes, agora em
 * `useMapaDoCargo`.
 */
import { useMemo, useState } from 'react';
import { Building2, Search, Trash2, Copy, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PERFIL_LABELS } from '@/lib/index';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { useCadastroDeCargos } from '@/hooks/useCargos';
import { cn } from '@/lib/utils';
import { EditorDoMapa } from './EditorDoMapa';
import { useMapaDoCargo, type Alvo } from './useMapaDoCargo';
import { rotuloNoSetor, useSetoresDaEmpresa } from './useSetoresDaEmpresa';

interface Props {
  /** Setor e cargo que abrem primeiro — quando se chega pelo aviso do Por cargo. */
  inicial?: { setorId: string; cargo: string } | null;
}

export function PorSetor({ inicial }: Props) {
  const { empresa } = useEmpresa();
  const { todasPermissoesSetor } = useCargoPermissoes();
  const setores = useSetoresDaEmpresa(empresa?.id);
  const cadastro = useCadastroDeCargos();
  /** Os cargos que podem ter mapa de setor: os de setor, sem acesso total. */
  const cargosDeSetor = useMemo(
    () => cadastro.filter(c => c.ativo && c.pertence_a_setor && !c.acesso_total).map(c => c.slug as string),
    [cadastro],
  );

  const [buscaSetor, setBuscaSetor] = useState('');
  const [escolha, setEscolha] = useState<{ setorId: string | null; cargo: string | null }>({
    setorId: inicial?.setorId ?? null, cargo: inicial?.cargo ?? null,
  });
  const [criando, setCriando] = useState(false);

  const setorId = escolha.setorId ?? setores[0]?.id ?? null;
  const cargo = escolha.cargo && cargosDeSetor.includes(escolha.cargo)
    ? escolha.cargo
    : (cargosDeSetor[0] ?? 'operador');
  const nomeDoSetor = setores.find(s => s.id === setorId)?.nome ?? 'setor';
  const alvo: Alvo = { cargo, setorId };
  const mapa = useMapaDoCargo(alvo, rotuloNoSetor(cargo, nomeDoSetor));
  const { rascunho, temMapaNoSetor } = mapa;

  const propriosDoSetor = (id: string) => todasPermissoesSetor.filter(m => m.setor_id === id).length;
  const termo = buscaSetor.trim().toLowerCase();
  const setoresFiltrados = setores.filter(s => !termo || s.nome.toLowerCase().includes(termo));

  function trocar(nova: { setorId?: string; cargo?: string }) {
    if (rascunho.sujo && !confirm('Descartar as alterações não salvas?')) return;
    rascunho.descartar();
    setEscolha({ setorId: nova.setorId ?? setorId, cargo: nova.cargo ?? cargo });
  }

  async function personalizar() {
    setCriando(true);
    try { await mapa.criarNoSetor(); } finally { setCriando(false); }
  }

  if (setores.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border px-6 py-16 text-center">
        <Building2 className="mx-auto h-8 w-8 text-muted-foreground/40" />
        <p className="mt-3 text-sm font-medium text-foreground">Nenhum setor ativo nesta empresa</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">

      {/* ── Coluna dos setores ──────────────────────────────────────────── */}
      <aside className="space-y-2 lg:sticky lg:top-4 lg:w-52 lg:shrink-0">
        <p className="px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Setor
        </p>
        {setores.length > 6 && (
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={buscaSetor} onChange={e => setBuscaSetor(e.target.value)}
              placeholder="Buscar setor..." className="h-8 pl-8 text-sm" />
          </div>
        )}
        <div className="flex gap-1.5 overflow-x-auto pb-1 lg:max-h-[calc(100vh-16rem)] lg:flex-col lg:overflow-y-auto lg:overflow-x-visible lg:pb-0">
          {setoresFiltrados.map(s => {
            const ativo = s.id === setorId;
            const n = propriosDoSetor(s.id);
            return (
              <button
                key={s.id}
                onClick={() => s.id !== setorId && trocar({ setorId: s.id })}
                className={cn(
                  'flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors lg:w-full',
                  ativo
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground',
                )}
              >
                <span className={cn('h-6 w-1 shrink-0 rounded-full', ativo ? 'bg-primary' : 'bg-transparent')} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{s.nome}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {n === 0 ? 'segue os cargos' : `${n} cargo${n !== 1 ? 's' : ''} com mapa próprio`}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </aside>

      {/* ── Conteúdo ────────────────────────────────────────────────────── */}
      <div className="min-w-0 flex-1 space-y-3">
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Cargo em {nomeDoSetor}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {cargosDeSetor.map(c => {
              const ativo = c === cargo;
              const proprio = !!setorId && todasPermissoesSetor.some(m => m.cargo === c && m.setor_id === setorId);
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => c !== cargo && trocar({ cargo: c })}
                  aria-pressed={ativo}
                  className={cn(
                    'flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                    ativo
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground',
                  )}
                >
                  {PERFIL_LABELS[c] ?? c}
                  <span className={cn(
                    'rounded-full px-1.5 text-[9px] font-semibold uppercase tracking-wide',
                    ativo ? 'bg-primary-foreground/20' : proprio ? 'bg-primary/10 text-primary' : 'bg-muted',
                  )}>
                    {proprio ? 'próprio' : 'do cargo'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {temMapaNoSetor ? (
          <EditorDoMapa
            key={`${setorId}:${cargo}`}
            mapa={mapa}
            cabecalho={(
              <div className="flex flex-wrap items-start gap-3 rounded-xl border border-border bg-muted/20 px-4 py-3 text-sm">
                <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-foreground">{rotuloNoSetor(cargo, nomeDoSetor)}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                    Vale para quem é {PERFIL_LABELS[cargo] ?? cargo} no setor {nomeDoSetor}, no
                    lugar das permissões do cargo. Permissão nova que aparecer depois vem do cargo até
                    ser ligada ou desligada aqui.
                  </p>
                </div>
                <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs text-muted-foreground"
                  onClick={mapa.removerDoSetor}>
                  <Trash2 className="h-3.5 w-3.5" /> Remover
                </Button>
              </div>
            )}
          />
        ) : (
          <EditorDoMapa
            key={`${setorId}:${cargo}:cargo`}
            mapa={mapa}
            somenteLeitura
            cabecalho={(
              <div className="flex flex-wrap items-start gap-3 rounded-xl border border-dashed border-border px-4 py-3 text-sm">
                <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-foreground">
                    {PERFIL_LABELS[cargo] ?? cargo} em {nomeDoSetor} segue o cargo
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                    É o mesmo de todos os setores — abaixo, só para consulta. Para mudar só aqui,
                    personalize: o mapa nasce igual ao cargo e quem está no setor passa a usá-lo.
                  </p>
                </div>
                <Button size="sm" className="h-7 gap-1 text-xs" onClick={personalizar} disabled={criando || !setorId}>
                  {criando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
                  Personalizar para {nomeDoSetor}
                </Button>
              </div>
            )}
          />
        )}
      </div>
    </div>
  );
}
