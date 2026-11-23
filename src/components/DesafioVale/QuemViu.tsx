/**
 * Quem já leu a arte do Desafio do Vale (fechou com «Bora pra cima», 23/11/2026).
 *
 * Na tela do super_admin: todos os setores que participam, com a barra e a
 * lista de quem falta. No painel do líder (`compacto`): o setor dele, para
 * cobrar quem ainda não viu. A conta é do banco (`fn_desafio_vale_vistos`).
 */
import { useState } from 'react';
import { ChevronDown, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useVistosVale } from '@/hooks/useDesafioVale';

export function QuemViu({ compacto = false, setorId }: { compacto?: boolean; setorId?: string | null }) {
  const q = useVistosVale(true);
  const [aberto, setAberto] = useState<string | null>(null);
  if (q.data === null) return compacto ? null : <p className="text-sm text-muted-foreground">A contagem aparece depois de colar a migration 20261123235000.</p>;
  if (!q.data) return compacto ? null : <p className="text-sm text-muted-foreground">Carregando…</p>;

  const setores = setorId ? q.data.setores.filter(s => s.setor_id === setorId) : q.data.setores;
  const total = setores.reduce((a, s) => a + s.total, 0);
  const viram = setores.reduce((a, s) => a + s.viram, 0);
  const pct = total ? Math.floor((viram / total) * 100) : 0;

  if (compacto) {
    const s = setores[0];
    if (!s) return null;
    const faltam = s.faltam;
    return (
      <div className="dv-viu">
        <p className="dv-viu-linha">
          <Eye size={14} aria-hidden /> <strong>{s.viram}/{s.total}</strong> do time já leram a arte
          {faltam.length > 0 && <button type="button" className="dv-viu-ver" onClick={() => setAberto(aberto ? null : s.setor_id)}>
            {aberto ? 'esconder' : `ver os ${faltam.length} que faltam`}
          </button>}
        </p>
        <div className="dv-viu-barra" aria-hidden><span style={{ width: `${s.total ? (s.viram / s.total) * 100 : 0}%` }} /></div>
        {aberto && <p className="dv-viu-faltam">{faltam.map(f => f.nome).join(' · ')}</p>}
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm">
        <strong className="text-lg tabular-nums">{viram}</strong> de {total} pessoas já leram a arte ({pct}%).
        {q.data.liberado_em ? <span className="text-muted-foreground"> Liberado em {new Date(q.data.liberado_em).toLocaleString('pt-BR')}.</span> : null}
      </p>
      <ul className="mt-3 space-y-2">
        {setores.map(s => {
          const p = s.total ? (s.viram / s.total) * 100 : 0;
          const abre = aberto === s.setor_id;
          return (
            <li key={s.setor_id} className="rounded-lg border border-border p-2">
              <button type="button" className="flex w-full items-center gap-3 text-left text-sm" onClick={() => setAberto(abre ? null : s.setor_id)}
                aria-expanded={abre} disabled={s.faltam.length === 0}>
                <span className="w-36 shrink-0 truncate font-medium">{s.nome}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <span className={cn('block h-full rounded-full', p >= 100 ? 'bg-success' : 'bg-orange-500')} style={{ width: `${p}%` }} />
                </span>
                <span className="w-16 shrink-0 text-right tabular-nums">{s.viram}/{s.total}</span>
                {s.faltam.length > 0 && <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform', abre && 'rotate-180')} aria-hidden />}
              </button>
              {abre && (
                <p className="mt-2 text-xs text-muted-foreground">
                  <strong className="text-foreground">Faltam {s.faltam.length}:</strong> {s.faltam.map(f => f.nome).join(' · ')}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
