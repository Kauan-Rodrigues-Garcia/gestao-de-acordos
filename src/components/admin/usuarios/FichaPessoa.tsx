/**
 * A ficha de uma pessoa, aberta ao clicar na linha da lista de Usuários.
 *
 * Responde, sem trocar de tela: como ela está no mês (recebido contra a meta,
 * na mesma conta da aba Quartis do Painel Líder), onde ela está (setor,
 * equipe, marca, regra) e como ela entra (login, e-mail, senha). As ações
 * ficam no topo — editar, transferir, redefinir senha, entrar como.
 *
 * O mês só aparece para quem tem meta individual. No setor de regra Cofen o
 * recebido e a meta vêm em H.O., como no Painel Líder.
 */
import { useEffect, useState } from 'react';
import { ArrowRightLeft, Copy, Edit, KeyRound, LogIn, Users2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { PERFIL_LABELS, getTodayISO } from '@/lib/index';
import { formatBRL } from '@/lib/money';
import { calcularProjecao } from '@/lib/projecaoMetas';
import { diasUteisDecorridos, diasUteisDoMes, QUARTIS_PADRAO, COR_QUARTIL } from '@/lib/diasUteis';
import { metaNaUnidade } from '@/lib/unidadeValor';
import { supabase, type Perfil, type SituacaoUsuario } from '@/lib/supabase';
import { getMetasConfig } from '@/services/metas/metasConfig.service';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { InfoDeSetor } from './modelo';

const ROTULO_SITUACAO: Record<SituacaoUsuario, string> = { ativo: 'Ativo', ferias: 'Férias', desligado: 'Desligado' };
const COR_SITUACAO: Record<SituacaoUsuario, string> = { ativo: 'var(--success)', ferias: 'var(--warning)', desligado: 'var(--destructive)' };

interface MesDaPessoa {
  recebido: number;
  meta: number;
  esperado: number;
  pct: number;
  quartil: number | null;
  emHO: boolean;
}

/** O mês da pessoa: o Analítico dela contra a meta individual. */
async function lerMes(u: Perfil, meta: number, cofen: boolean): Promise<MesDaPessoa | null> {
  const hoje = getTodayISO();
  const mes = hoje.slice(0, 7);
  const [ano, mesNum] = mes.split('-').map(Number);
  const fim = new Date(ano, mesNum, 1).toISOString().slice(0, 10);
  const [lin, cfg] = await Promise.all([
    supabase.from('analitico_recebimentos').select('valor_recebido, total_ho')
      .eq('operador_id', u.id).gte('data_pagamento', `${mes}-01`).lt('data_pagamento', fim),
    getMetasConfig(u.empresa_id ?? '', mesNum, ano),
  ]);
  if (lin.error) return null;
  const linhas = (lin.data as { valor_recebido: number; total_ho: number | null }[] | null) ?? [];
  const recebido = linhas.reduce((a, l) => a + (Number(cofen ? l.total_ho : l.valor_recebido) || 0), 0);
  const metaUnid = cofen ? metaNaUnidade(meta, 'ho') ?? meta : meta;
  const feriados = cfg.data?.feriados ?? [];
  const quartis = cfg.data?.quartis?.length ? cfg.data.quartis : QUARTIS_PADRAO;
  const p = calcularProjecao({
    meta: metaUnid, recebido, quartis,
    totalUteis: diasUteisDoMes(ano, mesNum, feriados),
    decorridos: diasUteisDecorridos(ano, mesNum, feriados, hoje, undefined, cfg.data?.contar_dia_atual === true),
  });
  if (!p) return null;
  return { recebido, meta: metaUnid, esperado: p.esperado, pct: p.projecaoPct, quartil: p.quartil?.quartil ?? null, emHO: cofen };
}

export function FichaPessoa({
  pessoa, aberta, onFechar, online, setor, equipe, empresa, meta,
  podeEditar, podeTransferir, podeImpersonar, souEu, onEditar, onTransferir, onEntrarComo,
}: {
  pessoa: Perfil | null; aberta: boolean; onFechar: () => void; online: boolean;
  setor: { nome: string; info: InfoDeSetor | null } | null;
  equipe: string | null; empresa: string; meta: number | null;
  podeEditar: boolean; podeTransferir: boolean; podeImpersonar: boolean; souEu: boolean;
  onEditar: (u: Perfil) => void; onTransferir: (u: Perfil) => void; onEntrarComo: (u: Perfil) => void;
}) {
  const [mes, setMes] = useState<MesDaPessoa | null | undefined>(undefined);
  const cofen = setor?.info?.regra === 'cofen';
  const id = pessoa?.id;

  useEffect(() => {
    if (!pessoa || !meta) { setMes(null); return; }
    let vivo = true;
    setMes(undefined);
    lerMes(pessoa, meta, cofen).then(m => { if (vivo) setMes(m); }, () => { if (vivo) setMes(null); });
    return () => { vivo = false; };
    // A pessoa é a mesma enquanto o id não muda.
  }, [id, meta, cofen]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!pessoa) return null;
  const u = pessoa;
  const marca = setor?.info?.marca ?? null;
  const situacao = u.situacao ?? 'ativo';
  const iniciais = u.nome.split(' ').map(n => n[0]).slice(0, 2).join('');
  const senhaProvisoria = (u as { senha_alterada?: boolean | null }).senha_alterada === false;
  const multiempresa = (u as { acesso_multiempresa?: boolean | null }).acesso_multiempresa === true;
  const copiar = (texto: string) => {
    navigator.clipboard?.writeText(texto).then(() => toast.success('Copiado'), () => toast.error('Não foi possível copiar'));
  };

  return (
    <Sheet open={aberta} onOpenChange={v => { if (!v) onFechar(); }}>
      <SheetContent side="right" className="us w-full sm:max-w-[460px] p-0 gap-0 flex flex-col overflow-hidden">
        <div className={cn('us-ficha-topo', marca)}>
          <div className="flex items-center gap-3.5 pr-8">
            <div className="relative shrink-0">
              <Avatar className="w-14 h-14">
                {u.foto_url && <AvatarImage src={u.foto_url} alt={u.nome} />}
                <AvatarFallback className="bg-primary/10 text-primary font-semibold">{iniciais}</AvatarFallback>
              </Avatar>
              <span className={cn('absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-card', online ? 'bg-success' : 'bg-muted-foreground/30')} />
            </div>
            <div className="min-w-0">
              <SheetTitle className="us-num text-[22px] font-bold leading-tight truncate">{u.nome}</SheetTitle>
              <SheetDescription className="text-xs">
                {online ? <span className="text-success font-semibold">● online agora</span> : 'offline'} · <span className="font-mono">{u.usuario || u.email}</span>
              </SheetDescription>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold">{PERFIL_LABELS[u.perfil] ?? u.perfil}</span>
            {marca && <span className={cn('us-tag', marca)}>{marca === 'bp' ? 'BookPlay' : 'PaguePlay'}</span>}
            {cofen && <span className="us-tag cofen">Regra Cofen</span>}
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: COR_SITUACAO[situacao] }}>
              <span className="us-ponto" style={{ background: COR_SITUACAO[situacao] }} />{ROTULO_SITUACAO[situacao]}
              {situacao === 'ferias' && u.ferias_ate && <span className="font-normal text-muted-foreground">até {u.ferias_ate.slice(8, 10)}/{u.ferias_ate.slice(5, 7)}</span>}
            </span>
            {souEu && <span className="us-tag">você</span>}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {podeEditar && <Button size="sm" className="h-8 gap-1.5" onClick={() => onEditar(u)}><Edit className="w-3.5 h-3.5" /> Editar</Button>}
            {podeTransferir && <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => onTransferir(u)}><ArrowRightLeft className="w-3.5 h-3.5" /> Transferir</Button>}
            {podeEditar && <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => onEditar(u)}><KeyRound className="w-3.5 h-3.5" /> Senha e foto</Button>}
            {podeImpersonar && !souEu && <Button size="sm" variant="outline" className="h-8 gap-1.5 text-warning" onClick={() => onEntrarComo(u)}><LogIn className="w-3.5 h-3.5" /> Entrar como</Button>}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 grid gap-5 content-start">
          <section>
            <h3 className="us-rot mb-2">O mês até hoje{cofen ? ' · em H.O.' : ''}</h3>
            {meta === null ? (
              <p className="text-sm text-muted-foreground">
                {['operador', 'elite'].includes(u.perfil)
                  ? <><b className="text-warning">Sem meta individual neste mês</b> — fica fora dos quartis. A meta é cadastrada na aba Metas.</>
                  : 'Este cargo não tem meta individual.'}
              </p>
            ) : mes === undefined ? (
              <div className="grid grid-cols-2 gap-2"><Skeleton className="h-16 rounded-xl" /><Skeleton className="h-16 rounded-xl" /></div>
            ) : mes === null ? (
              <p className="text-sm text-muted-foreground">Meta de {formatBRL(meta)}. O recebido não está disponível para este login.</p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div className="us-kpi"><small>Recebido</small><b>{formatBRL(mes.recebido)}</b><em>de {formatBRL(mes.meta)}</em></div>
                  <div className="us-kpi"><small>Projeção</small>
                    <b style={mes.quartil ? { color: COR_QUARTIL[mes.quartil] } : undefined}>{mes.pct}%</b>
                    <em>{mes.quartil ? `quartil Q${mes.quartil}` : 'sem faixa'}</em></div>
                </div>
                <div className="us-meta mt-2.5" style={{ ['--s' as string]: mes.quartil ? COR_QUARTIL[mes.quartil] : 'var(--primary)' }}>
                  <i style={{ width: `${Math.min(100, (mes.recebido / mes.meta) * 100)}%` }} />
                  <u style={{ left: `${Math.min(100, (mes.esperado / mes.meta) * 100)}%` }} />
                </div>
                <p className="text-xs text-muted-foreground mt-1.5">
                  Hoje deveria ter {formatBRL(mes.esperado)} ·{' '}
                  {mes.recebido >= mes.esperado
                    ? <span className="text-success">sobra {formatBRL(mes.recebido - mes.esperado)}</span>
                    : <span className="text-destructive">falta {formatBRL(mes.esperado - mes.recebido)}</span>}
                  {' '}· a conta da aba Quartis do Painel Líder
                </p>
              </>
            )}
          </section>

          <section>
            <h3 className="us-rot mb-2">Onde está</h3>
            <dl className="us-dl">
              <dt>Setor</dt><dd>{setor ? setor.nome : <b className="text-destructive">sem setor</b>}</dd>
              <dt>Equipe</dt><dd className="flex items-center gap-1.5">{equipe ? <><Users2 className="w-3.5 h-3.5 text-muted-foreground" />{equipe}</> : <span className="text-muted-foreground">nenhuma</span>}</dd>
              <dt>Marca</dt><dd>{marca ? <>{marca === 'bp' ? 'BookPlay' : 'PaguePlay'} <span className="text-muted-foreground text-xs">pela cidade do setor</span></> : <span className="text-muted-foreground">setor sem cidade</span>}</dd>
              <dt>Regra de negócio</dt><dd>{setor?.info?.regra === 'cofen' ? 'Cofen' : setor?.info?.regra === 'nosso_produto' ? 'Nosso produto' : <span className="text-muted-foreground">—</span>}</dd>
              <dt>Empresa</dt><dd>{empresa}{multiempresa && <span className="text-muted-foreground text-xs"> · vê as duas operações</span>}</dd>
            </dl>
          </section>

          <section>
            <h3 className="us-rot mb-2">Como entra</h3>
            <dl className="us-dl">
              <dt>Login</dt><dd className="font-mono text-xs flex items-center gap-2">{u.usuario || '—'}
                {u.usuario && <button type="button" className="us-link inline-flex items-center gap-1" onClick={() => copiar(u.usuario as string)}><Copy className="w-3 h-3" />copiar</button>}</dd>
              <dt>E-mail</dt><dd className="font-mono text-xs">{u.email}</dd>
              <dt>Senha</dt><dd>{senhaProvisoria ? <span className="text-primary font-semibold">provisória · ainda não trocou</span> : 'definida pela pessoa'}</dd>
            </dl>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
