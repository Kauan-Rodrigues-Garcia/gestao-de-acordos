/**
 * Gráficos da Meus Chips 2.0: a rosca da saúde e as barras por grupo.
 */
import {
  Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import type { StatusChip } from '@/services/chipsFisicos/chipsFisicosRegras';
import { saude, type Contagem, type GrupoPainel } from '@/services/chipsFisicos/chipsPainel';
import { HEX_STATUS, ORDEM_STATUS, ROTULO_STATUS_PLURAL } from './cores';

/** Rosca de status com a saúde (% ativos) no meio. */
export function RoscaSaude({ contagem, titulo = 'Saúde dos chips' }: { contagem: Contagem; titulo?: string }) {
  const dados = ORDEM_STATUS
    .map(s => ({ status: s, nome: ROTULO_STATUS_PLURAL[s], valor: contagem[s] }))
    .filter(d => d.valor > 0);
  const pct = saude(contagem);

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
      <div className="relative h-44 w-44 shrink-0" role="img" aria-label={`${titulo}: ${pct}% ativos`}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={dados.length ? dados : [{ status: 'vazio', nome: 'Sem chips', valor: 1 }]}
              dataKey="valor" nameKey="nome"
              innerRadius="70%" outerRadius="100%" paddingAngle={dados.length > 1 ? 2 : 0}
              stroke="none" isAnimationActive
            >
              {(dados.length ? dados : [{ status: 'vazio' }]).map(d => (
                <Cell key={d.status} fill={d.status === 'vazio' ? '#94a3b833' : HEX_STATUS[d.status as StatusChip]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-4xl font-bold tabular-nums leading-none">{pct}%</span>
          <span className="mt-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">ativos</span>
        </div>
      </div>
      <ul className="w-full space-y-2">
        {ORDEM_STATUS.map(s => (
          <li key={s} className="flex items-center justify-between gap-3 text-base">
            <span className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: HEX_STATUS[s] }} aria-hidden />
              {ROTULO_STATUS_PLURAL[s]}
            </span>
            <span className="font-semibold tabular-nums">{contagem[s]}</span>
          </li>
        ))}
        <li className="flex items-center justify-between gap-3 border-t pt-2 text-base font-semibold">
          <span>Total</span>
          <span className="tabular-nums">{contagem.total}</span>
        </li>
      </ul>
    </div>
  );
}

/** Barras empilhadas: um grupo por linha, status por cor. Até 12 grupos. */
export function BarrasPorGrupo({ grupos }: { grupos: readonly GrupoPainel[] }) {
  const dados = grupos
    .filter(g => g.contagem.total > 0)
    .slice(0, 12)
    .map(g => ({
      nome: g.nome.length > 22 ? `${g.nome.slice(0, 21)}…` : g.nome,
      ativo: g.contagem.ativo, recuperar: g.contagem.recuperar,
      restricao: g.contagem.restricao, banido: g.contagem.banido,
    }));
  if (dados.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Sem chips para comparar.</p>;
  }
  const altura = Math.max(160, dados.length * 38 + 24);

  return (
    <div style={{ height: altura }} role="img" aria-label="Chips por grupo e status">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={dados} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 4 }} barCategoryGap={8}>
          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="nome" width={130} tick={{ fontSize: 13, fill: '#64748b' }} axisLine={false} tickLine={false} />
          <Tooltip
            cursor={{ fill: '#94a3b81a' }}
            contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 13 }}
            formatter={(v: number, chave: string) => [v, ROTULO_STATUS_PLURAL[chave as StatusChip] ?? chave]}
          />
          {ORDEM_STATUS.map((s, i) => (
            <Bar key={s} dataKey={s} stackId="a" fill={HEX_STATUS[s]}
                 radius={i === ORDEM_STATUS.length - 1 ? [0, 6, 6, 0] : 0} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
