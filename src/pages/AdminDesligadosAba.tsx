/**
 * AdminDesligadosAba.tsx — o arquivo morto de quem saiu.
 *
 * Marcar alguém como desligado não muda nada no mês corrente: a pessoa segue na
 * equipe, no analítico e nos cards, apenas com uma etiqueta. Na virada do mês
 * ela é ARQUIVADA — some de todas as listas do sistema — e passa a existir
 * aqui, e só aqui.
 *
 * A aba responde uma pergunta que ninguém faz todo dia mas que aparece do nada:
 * «de que equipe era o fulano que saiu em maio?». Antes disso, esse dado ou
 * ficava poluindo a lista de usuários ativos, ou era apagado. Nenhum dos dois é
 * bom: o primeiro atrapalha a operação, o segundo perde histórico.
 *
 * Não apaga nada por conta própria. Sumir da lista é uma coisa; destruir o
 * cadastro de alguém que a empresa talvez precise consultar depois é outra, e
 * essa decisão é de quem administra.
 */
import { useMemo, useState } from 'react';
import { UserX, Search, RotateCcw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { Perfil } from '@/lib/supabase';

interface Props {
  desligados: Perfil[];
  loading: boolean;
  /** Só quem administra contas recebe isto; sem ele o botão não aparece. */
  onReativar?: (perfil: Perfil) => Promise<void> | void;
}

/** «12/05/2026» a partir do timestamp, ou vazio. */
function dataCurta(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR');
}

/**
 * Há quanto tempo saiu.
 *
 * É o que o administrador realmente quer saber ao decidir se ainda precisa da
 * linha: «saiu há 3 meses» responde melhor que uma data que ele teria que
 * subtrair de cabeça.
 */
function tempoDesde(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const meses = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24 * 30.44));
  if (meses < 1)  return 'há menos de um mês';
  if (meses === 1) return 'há 1 mês';
  if (meses < 12) return `há ${meses} meses`;
  const anos = Math.floor(meses / 12);
  return anos === 1 ? 'há mais de 1 ano' : `há mais de ${anos} anos`;
}

export function AdminDesligadosAba({ desligados, loading, onReativar }: Props) {
  const [busca, setBusca] = useState('');
  const [reativando, setReativando] = useState<string | null>(null);

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const filtrados = q
      ? desligados.filter(p =>
          (p.nome ?? '').toLowerCase().includes(q)
          || (p.usuario ?? '').toLowerCase().includes(q)
          || (p.email ?? '').toLowerCase().includes(q))
      : desligados;
    // Mais recentes primeiro: quem saiu ontem é quem ainda se procura.
    return [...filtrados].sort((a, b) =>
      String(b.desligado_em ?? '').localeCompare(String(a.desligado_em ?? '')));
  }, [desligados, busca]);

  async function reativar(p: Perfil) {
    if (!onReativar) return;
    setReativando(p.id);
    try { await onReativar(p); } finally { setReativando(null); }
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
            <UserX className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <h2 className="text-sm font-semibold">Desligados</h2>
            <p className="text-xs text-muted-foreground">
              Saíram em meses anteriores e não aparecem mais em nenhuma lista do sistema.
            </p>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Procurar por nome, usuário ou e-mail"
            className="h-9 w-64 max-w-full rounded-md border border-border bg-background pl-8 pr-2 text-xs outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      ) : lista.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-16 text-center">
          <p className="text-sm text-muted-foreground">
            {busca.trim() ? 'Ninguém encontrado com esse termo.' : 'Ninguém arquivado até agora.'}
          </p>
          {!busca.trim() && (
            <p className="mx-auto mt-1.5 max-w-md text-xs text-muted-foreground/70 leading-relaxed">
              Quem é marcado como desligado continua nas listas até a virada do mês.
              A partir do dia 1º aparece aqui.
            </p>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Pessoa</th>
                <th className="px-3 py-2 text-left font-medium">Cargo</th>
                <th className="px-3 py-2 text-left font-medium">Setor</th>
                <th className="px-3 py-2 text-left font-medium">Desligado em</th>
                {onReativar && <th className="px-3 py-2 text-right font-medium">Ação</th>}
              </tr>
            </thead>
            <tbody>
              {lista.map(p => {
                const setorNome = (p as Perfil & { setores?: { nome?: string } | null }).setores?.nome;
                return (
                  <tr key={p.id} className="border-t border-border/60 hover:bg-muted/20">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-foreground">{p.nome || 'Sem nome'}</p>
                          <p className="truncate text-[11px] text-muted-foreground">
                            {p.usuario ? `@${p.usuario}` : p.email || '—'}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className="text-[10px] font-normal">
                        {p.perfil ?? '—'}
                      </Badge>
                    </td>
                    <td className={cn('px-3 py-2', !setorNome && 'text-muted-foreground')}>
                      {setorNome ?? 'Sem setor'}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="font-mono">{dataCurta(p.desligado_em)}</span>
                      <span className="ml-1.5 text-[11px] text-muted-foreground">
                        {tempoDesde(p.desligado_em)}
                      </span>
                    </td>
                    {onReativar && (
                      <td className="px-3 py-2 text-right">
                        <Button
                          variant="ghost" size="sm" className="h-7 gap-1.5 text-xs"
                          disabled={reativando === p.id}
                          onClick={() => void reativar(p)}
                          title="Devolve a pessoa às listas e libera o login"
                        >
                          {reativando === p.id
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <RotateCcw className="h-3.5 w-3.5" />}
                          Reativar
                        </Button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
