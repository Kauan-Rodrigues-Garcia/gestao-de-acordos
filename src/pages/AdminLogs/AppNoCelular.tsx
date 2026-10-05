/**
 * AppNoCelular.tsx — Monitoramento de uso › App no celular (05/10/2026).
 *
 * Dois indicadores, a pedido do Cleber — sem medir uso do app:
 *
 *   Instalou            abriu o gestão ao menos uma vez como app instalado
 *                       (`app_instalacoes`, gravado por `RegistroAppInstalado`).
 *   Celular registrado  tem aparelho inscrito para os avisos
 *                       (`push_inscricoes`).
 *
 * Quem ativou os avisos antes de o registro de instalação existir aparece com
 * celular registrado e «instalou» em branco — não dá para saber a data.
 *
 * A lista vem de `fn_app_celular_painel`, com a mesma régua do resto da tela:
 * super_admin vê todas as empresas; quem tem `ver_monitoramento_uso`, a sua.
 */
import { useEffect, useMemo, useState } from 'react';
import { Smartphone, BellRing, BellOff, Download, Loader2, Search } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { PERFIL_LABELS } from '@/lib/index';
import { supabase } from '@/lib/supabase';
import { tempoRelativo, dataHoraCompleta, numeroBr } from './formatos';
import { resumoAppCelular, type LinhaAppCelular } from './appCelular';

const ROTULO_APARELHO: Record<string, string> = { iphone: 'iPhone', android: 'Android', outro: 'Outro' };

function Numero({ icone, rotulo, valor, sub }: { icone: React.ReactNode; rotulo: string; valor: number; sub: string }) {
  return (
    <Card className="p-3.5 flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{rotulo}</span>
        <span className="text-muted-foreground">{icone}</span>
      </div>
      <span className="text-xl font-bold font-mono tabular-nums leading-tight">{numeroBr(valor)}</span>
      <span className="text-[10px] text-muted-foreground leading-snug">{sub}</span>
    </Card>
  );
}

export default function AppNoCelular({ empresaId, mostrarEmpresa }: {
  empresaId: string | null;
  mostrarEmpresa: boolean;
}) {
  const [linhas, setLinhas] = useState<LinhaAppCelular[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState('');

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    setErro(null);
    const cliente = supabase as unknown as {
      rpc: (n: string, a: Record<string, unknown>) => PromiseLike<{ data: LinhaAppCelular[] | null; error: { message: string } | null }>;
    };
    void cliente.rpc('fn_app_celular_painel', { p_empresa_id: empresaId }).then(({ data, error }) => {
      if (!vivo) return;
      if (error) setErro(error.message);
      setLinhas(data ?? []);
      setCarregando(false);
    });
    return () => { vivo = false; };
  }, [empresaId]);

  const resumo = useMemo(() => resumoAppCelular(linhas), [linhas]);
  const termo = busca.trim().toLowerCase();
  const visiveis = termo
    ? linhas.filter(l => l.nome.toLowerCase().includes(termo) || (l.setor_nome ?? '').toLowerCase().includes(termo))
    : linhas;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Numero icone={<Download className="w-4 h-4" />} rotulo="Instalaram o app" valor={resumo.instalaram}
          sub="Abriram o gestão ao menos uma vez como app instalado." />
        <Numero icone={<BellRing className="w-4 h-4" />} rotulo="Celular registrado" valor={resumo.comCelular}
          sub="Têm aparelho inscrito para receber os avisos." />
        <Numero icone={<BellOff className="w-4 h-4" />} rotulo="Instalaram sem avisos" valor={resumo.instalaramSemAviso}
          sub="Instalaram, mas não ativaram os avisos no celular." />
      </div>

      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-[11px] text-muted-foreground leading-snug max-w-xl">
            O registro de instalação começou em 05/10/2026. Quem ativou os avisos antes disso aparece
            com o celular registrado e a data de instalação em branco.
          </p>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={busca} onChange={e => setBusca(e.target.value)}
              placeholder="Buscar por nome ou setor…" className="h-8 w-64 pl-8 text-xs" />
          </div>
        </div>

        {carregando ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : erro ? (
          <p className="text-xs text-destructive text-center py-10">Não foi possível carregar: {erro}</p>
        ) : visiveis.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-10">
            {linhas.length === 0 ? 'Ninguém instalou o app nem registrou um celular ainda.' : 'Ninguém com esse nome ou setor.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] text-muted-foreground border-b border-border">
                  <th className="text-left px-2 py-1.5 font-semibold">PESSOA</th>
                  <th className="text-left px-2 py-1.5 font-semibold">CARGO</th>
                  <th className="text-left px-2 py-1.5 font-semibold">SETOR</th>
                  {mostrarEmpresa && <th className="text-left px-2 py-1.5 font-semibold">EMPRESA</th>}
                  <th className="text-left px-2 py-1.5 font-semibold">INSTALOU</th>
                  <th className="text-left px-2 py-1.5 font-semibold">CELULAR REGISTRADO</th>
                  <th className="text-left px-2 py-1.5 font-semibold">APARELHO</th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map(l => (
                  <tr key={l.perfil_id} className={cn('border-b border-border/50', l.situacao === 'desligado' && 'opacity-60')}>
                    <td className="px-2 py-1.5 font-medium">{l.nome}</td>
                    <td className="px-2 py-1.5 text-muted-foreground">{PERFIL_LABELS[l.cargo as keyof typeof PERFIL_LABELS] ?? l.cargo ?? '—'}</td>
                    <td className="px-2 py-1.5 text-muted-foreground">{l.setor_nome ?? '—'}</td>
                    {mostrarEmpresa && <td className="px-2 py-1.5 text-muted-foreground">{l.empresa_nome ?? '—'}</td>}
                    <td className="px-2 py-1.5" title={l.instalado_em ? dataHoraCompleta(l.instalado_em) : undefined}>
                      {l.instalado_em ? tempoRelativo(l.instalado_em) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-2 py-1.5">
                      {l.celulares > 0
                        ? <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                            <Smartphone className="w-3 h-3" /> Sim{l.celulares > 1 ? ` (${l.celulares})` : ''}
                          </span>
                        : <span className="text-muted-foreground">Não</span>}
                    </td>
                    <td className="px-2 py-1.5 text-muted-foreground">{l.aparelho ? ROTULO_APARELHO[l.aparelho] : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
