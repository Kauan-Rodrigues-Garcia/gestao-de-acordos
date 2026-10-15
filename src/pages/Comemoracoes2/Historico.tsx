/**
 * Historico — agenda e histórico das comemorações (últimos 30 dias).
 *
 * Cada linha mostra a miniatura do próprio card, para reconhecer a festa de
 * olho. "Duplicar" leva a comemoração de volta ao estúdio, pronta para mandar
 * de novo ou ajustar; comemoração da 1.0 volta com o card 2.0 de fábrica.
 */
import { useMemo, useState } from 'react';
import { Ban, Copy, Loader2, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  cancelarComemoracao, excluirComemoracao, type Comemoracao,
} from '@/services/comemoracoes.service';
import { estadoDe, type EstadoComemoracao } from '@/pages/Comemoracoes/janela';
import { CardV2 } from '@/components/comemoracao2/CardV2';
import { designPadrao } from '@/components/comemoracao2/design';

function dataHora(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—'
    : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

const SECOES: readonly { estado: EstadoComemoracao; titulo: string; vazio?: string }[] = [
  { estado: 'em-andamento', titulo: 'No ar agora' },
  { estado: 'agendada',     titulo: 'Agendadas' },
  { estado: 'finalizada',   titulo: 'Já foram', vazio: 'Nenhuma comemoração nos últimos 30 dias. Monte a primeira na aba Criar.' },
];

export function Historico({
  comemoracoes, usuarioId, agoraCorrigido, carregando, onDuplicar, onMudou,
}: {
  comemoracoes:   Comemoracao[];
  usuarioId:      string;
  agoraCorrigido: () => number;
  carregando:     boolean;
  onDuplicar:     (c: Comemoracao) => void;
  onMudou:        () => Promise<void>;
}) {
  const [busca, setBusca] = useState('');
  const [soMinhas, setSoMinhas] = useState(false);
  const [salvando, setSalvando] = useState<string | null>(null);

  const agora = agoraCorrigido();
  const filtradas = useMemo(() => {
    const t = busca.trim().toLocaleLowerCase('pt-BR');
    return comemoracoes.filter((c) =>
      (!soMinhas || c.criado_por === usuarioId)
      && (!t || c.titulo.toLocaleLowerCase('pt-BR').includes(t)
        || c.homenageados.some((p) => p.nome.toLocaleLowerCase('pt-BR').includes(t))));
  }, [comemoracoes, busca, soMinhas, usuarioId]);

  async function agir(c: Comemoracao, acao: 'cancelar' | 'excluir') {
    setSalvando(c.id);
    try {
      const res = acao === 'cancelar' ? await cancelarComemoracao(c.id) : await excluirComemoracao(c.id);
      if (!res.ok) { toast.error(res.erro ?? 'Não foi possível concluir.'); return; }
      toast.success(acao === 'cancelar' ? 'Comemoração encerrada.' : 'Comemoração excluída.');
      await onMudou();
    } finally {
      setSalvando(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} className="h-9 pl-9 text-sm"
            placeholder="Buscar por título ou pessoa…" aria-label="Buscar comemoração" />
        </div>
        <div className="flex rounded-lg border border-border p-0.5">
          {([['todas', 'Todas'], ['minhas', 'Só as minhas']] as const).map(([id, nome]) => (
            <button key={id} type="button" onClick={() => setSoMinhas(id === 'minhas')}
              className={cn(
                'rounded-md px-3 py-1 text-xs font-medium',
                soMinhas === (id === 'minhas') ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground',
              )}>
              {nome}
            </button>
          ))}
        </div>
      </div>

      {carregando && comemoracoes.length === 0 && (
        <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      )}

      {SECOES.map(({ estado, titulo, vazio }) => {
        const lista = filtradas.filter((c) => estadoDe(c, agora) === estado);
        if (lista.length === 0 && !vazio) return null;
        if (lista.length === 0 && carregando) return null;
        return (
          <section key={estado} className="space-y-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              {estado === 'em-andamento' && <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />}
              {titulo}
              <span className="rounded-full bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">{lista.length}</span>
            </h3>
            {lista.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border py-8 text-center text-xs text-muted-foreground">{vazio}</p>
            ) : (
              <div className="grid gap-2 md:grid-cols-2">
                {lista.map((c) => {
                  const minha = c.criado_por === usuarioId;
                  return (
                    <article key={c.id} className="flex gap-3 rounded-xl border border-border bg-card p-2.5">
                      <div className="w-[132px] shrink-0 overflow-hidden rounded-lg">
                        <CardV2 modo="miniatura" titulo={c.titulo} mensagem={c.mensagem}
                          homenageados={c.homenageados} design={c.design ?? designPadrao()} />
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col">
                        <p className="truncate text-sm font-semibold">{c.titulo}</p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {c.homenageados.map((p) => p.nome.split(' ')[0]).join(', ')
                            || (c.alvo_tipo === 'setor' ? 'Meta de setor' : c.alvo_tipo === 'equipe' ? 'Meta de equipe' : '—')}
                        </p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {dataHora(c.inicia_em)} · {c.duracao_s}s{c.autor && ` · por ${c.autor.nome.split(' ')[0]}`}
                          {c.cancelada_em && ' · encerrada'}{!c.design && ' · versão antiga'}
                        </p>
                        <div className="mt-auto flex flex-wrap gap-1 pt-1.5">
                          <Button size="sm" variant="outline" className="h-6 gap-1 px-2 text-[11px]" onClick={() => onDuplicar(c)}>
                            <Copy className="h-3 w-3" /> Duplicar
                          </Button>
                          {minha && estado !== 'finalizada' && !c.cancelada_em && (
                            <Button size="sm" variant="outline" className="h-6 gap-1 px-2 text-[11px]"
                              disabled={salvando === c.id} onClick={() => void agir(c, 'cancelar')}>
                              <Ban className="h-3 w-3" /> {estado === 'agendada' ? 'Cancelar' : 'Encerrar'}
                            </Button>
                          )}
                          {minha && estado === 'finalizada' && (
                            <Button size="sm" variant="ghost" className="h-6 gap-1 px-2 text-[11px] text-destructive hover:bg-destructive/10 hover:text-destructive"
                              disabled={salvando === c.id} onClick={() => void agir(c, 'excluir')}>
                              <Trash2 className="h-3 w-3" /> Excluir
                            </Button>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
