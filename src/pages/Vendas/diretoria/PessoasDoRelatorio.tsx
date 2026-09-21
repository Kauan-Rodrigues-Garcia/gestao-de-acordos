/**
 * PessoasDoRelatorio — a aba «Pessoas do relatório» do Painel Diretoria do
 * Comercial.
 *
 * ## O pedido de 21/09/2026
 *
 * «Eu tenha o resultado por pessoas, pessoas que estão no registro e as que não
 * têm o registro.»
 *
 * É o equivalente comercial de `Mestre59Operadores` na BookPlay: o relatório
 * traz um login de vendedor em cada linha, e o sistema só credita a venda a
 * quem ele reconhece. Quem o relatório traz e o cadastro não tem vende, fatura,
 * e não aparece em placar nenhum — some da meta da equipe, do ranking e do
 * Painel Líder, sem erro em lugar algum.
 *
 * Esta aba põe as duas listas lado a lado e diz quanto dinheiro está em cada
 * uma. É a diferença entre «o setor fez menos» e «o setor fez, e uma pessoa não
 * tem cadastro».
 *
 * ## Como o reconhecimento acontece
 *
 * `fn_vendas_perfil_do_login` casa `vendas_relatorio.login_vendedor` com
 * `perfis.usuario`, sem caixa e sem espaço em volta — e só aceita quando o
 * login casa com UMA pessoa. Dois perfis com o mesmo usuário não são resolvidos,
 * de propósito: creditar a venda ao errado é pior do que não creditar.
 *
 * A mesma regra é refeita aqui, sobre a lista de perfis da empresa, e não uma
 * chamada por login: são centenas de logins por carga, e a função é a régua —
 * não a única implementação possível dela. O teste de que as duas concordam é a
 * própria tela: quem aparece como «sem registro» aqui é exatamente quem fica com
 * `operador_id` nulo na projeção.
 *
 * ## O robô não é problema de cadastro
 *
 * A automação tem perfil, e aparece na lista de reconhecidos com a etiqueta
 * dela. Ela não disputa nada aqui — esta aba não é ranking, é conferência.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Loader2, RefreshCw, Search, TriangleAlert, UserCheck, UserX, X, Bot, Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/lib/supabase';
import { useEmpresa } from '@/hooks/useEmpresa';
import { formatBRL } from '@/lib/money';
import { rotuloDoMes } from '@/lib/mesReferencia';
import { cn } from '@/lib/utils';
import { normalizarTexto } from '@/lib/vendasLista';
import { useCargaVigente } from './useCargaVigente';

interface PerfilDoCadastro {
  id: string;
  nome: string | null;
  usuario: string | null;
  perfil: string | null;
  situacao: string | null;
  robo: boolean | null;
  setor_id: string | null;
  equipe_id: string | null;
}

interface LinhaPessoa {
  /** A chave: o login como o relatório o escreveu. */
  login: string;
  /** O nome como o relatório o escreveu — nem sempre igual ao do cadastro. */
  nomeNoRelatorio: string;
  vendas: number;
  total: number;
  qtdNaMeta: number;
  naMeta: number;
  franquias: Set<string>;
  /** O perfil que o login alcançou, ou `null` quando o cadastro não o tem. */
  perfil: PerfilDoCadastro | null;
  /** O login casou com mais de uma pessoa — e por isso não credita ninguém. */
  ambiguo: boolean;
}

interface Props {
  /** `false` congela a leitura — a aba ainda não foi aberta. */
  ativo: boolean;
}

export function PessoasDoRelatorio({ ativo }: Props) {
  const { empresa } = useEmpresa();
  const empresaId = empresa?.id ?? null;

  const carga = useCargaVigente(empresaId, ativo);
  const [perfis, setPerfis] = useState<PerfilDoCadastro[]>([]);
  const [setores, setSetores] = useState<Map<string, string>>(new Map());
  const [busca, setBusca] = useState('');
  const [aba, setAba] = useState<'todos' | 'com' | 'sem'>('todos');

  useEffect(() => {
    if (!empresaId || !ativo) return;
    let vivo = true;
    void Promise.all([
      supabase.from('perfis')
        .select('id, nome, usuario, perfil, situacao, robo, setor_id, equipe_id')
        .eq('empresa_id', empresaId),
      supabase.from('setores').select('id, nome').eq('empresa_id', empresaId),
    ]).then(([p, s]) => {
      if (!vivo) return;
      setPerfis((p.data as unknown as PerfilDoCadastro[] | null) ?? []);
      setSetores(new Map(((s.data as { id: string; nome: string }[] | null) ?? []).map(x => [x.id, x.nome])));
    });
    return () => { vivo = false; };
  }, [empresaId, ativo]);

  /**
   * login (normalizado) → os perfis que o reivindicam.
   *
   * Uma lista, e não um perfil: é a lista com mais de um que produz o caso
   * ambíguo, o mesmo que `fn_vendas_perfil_do_login` recusa resolver.
   */
  const porLogin = useMemo(() => {
    const mapa = new Map<string, PerfilDoCadastro[]>();
    for (const p of perfis) {
      const chave = normalizarTexto(p.usuario);
      if (!chave) continue;
      const atual = mapa.get(chave);
      if (atual) atual.push(p); else mapa.set(chave, [p]);
    }
    return mapa;
  }, [perfis]);

  const linhas = useMemo((): LinhaPessoa[] => {
    const mapa = new Map<string, LinhaPessoa>();
    for (const l of carga.linhas) {
      const login = (l.login_vendedor ?? '').trim();
      const chave = normalizarTexto(login) || `__sem_login__${normalizarTexto(l.nome_vendedor)}`;
      const candidatos = porLogin.get(normalizarTexto(login)) ?? [];
      const atual = mapa.get(chave) ?? {
        login: login || '(sem login no arquivo)',
        nomeNoRelatorio: (l.nome_vendedor ?? '').trim() || '—',
        vendas: 0, total: 0, qtdNaMeta: 0, naMeta: 0,
        franquias: new Set<string>(),
        perfil: candidatos.length === 1 ? candidatos[0] : null,
        ambiguo: candidatos.length > 1,
      };
      atual.vendas += 1;
      atual.total += l.valor_total;
      // A mesma régua do resto do Comercial: confirmada E assinada.
      if (l.situacao === 'confirmada' && l.contrato_assinado === true) {
        atual.qtdNaMeta += 1;
        atual.naMeta += l.valor_total;
      }
      if (l.franquia?.trim()) atual.franquias.add(l.franquia.trim());
      mapa.set(chave, atual);
    }
    return [...mapa.values()].sort((a, b) => b.naMeta - a.naMeta);
  }, [carga.linhas, porLogin]);

  const comRegistro = useMemo(() => linhas.filter(l => l.perfil !== null), [linhas]);
  const semRegistro = useMemo(() => linhas.filter(l => l.perfil === null), [linhas]);

  const dinheiroSem = semRegistro.reduce((s, l) => s + l.naMeta, 0);
  const dinheiroCom = comRegistro.reduce((s, l) => s + l.naMeta, 0);

  const visiveis = useMemo(() => {
    const termo = normalizarTexto(busca);
    const base = aba === 'com' ? comRegistro : aba === 'sem' ? semRegistro : linhas;
    if (!termo) return base;
    return base.filter(l =>
      normalizarTexto(l.login).includes(termo)
      || normalizarTexto(l.nomeNoRelatorio).includes(termo)
      || normalizarTexto(l.perfil?.nome).includes(termo));
  }, [aba, busca, linhas, comRegistro, semRegistro]);

  if (!empresaId) return null;

  return (
    <div className="space-y-4">
      {/* ── O que está sendo lido ──────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="rounded-xl border border-border bg-card p-2">
            <Users className="h-4 w-4 text-muted-foreground" aria-hidden />
          </div>
          <div>
            <h2 className="text-sm font-semibold leading-tight">Pessoas do relatório</h2>
            <p className="text-[11px] text-muted-foreground">
              Quem o relatório trouxe, e quem o cadastro reconhece — o que não é reconhecido não
              entra em placar nenhum
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {carga.vigentes.length > 1 && (
            <Select value={carga.lote?.id ?? undefined} onValueChange={carga.escolher}>
              <SelectTrigger className="h-8 w-[300px] text-xs" aria-label="Carga"><SelectValue /></SelectTrigger>
              <SelectContent>
                {carga.vigentes.map(l => (
                  <SelectItem key={l.id} value={l.id}>
                    {rotuloDoMes(l.mes.slice(0, 7))} · {l.origem === 'geral' ? 'Geral (oficial)' : 'Prévia do setor'}
                    {' · '}{l.linhas_aceitas} linhas
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Recarregar"
            disabled={carga.carregando} onClick={carga.recarregar}>
            <RefreshCw className={cn('h-4 w-4', carga.carregando && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {carga.erro && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-[12px]">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />{carga.erro}
        </div>
      )}

      {/* ── As duas listas, em número ──────────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Numero rotulo="Com registro" valor={String(comRegistro.length)}
          sub={`${formatBRL(dinheiroCom)} na meta`} tom="bom" />
        <Numero rotulo="Sem registro" valor={String(semRegistro.length)}
          sub={`${formatBRL(dinheiroSem)} na meta, sem dono`}
          tom={semRegistro.length > 0 ? 'alerta' : undefined} />
        <Numero rotulo="No relatório" valor={String(linhas.length)}
          sub={`${carga.linhas.length.toLocaleString('pt-BR')} linhas lidas`} />
      </div>

      {/* ── Filtros ────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-border bg-muted/40 p-0.5">
          {([
            { key: 'todos' as const, rotulo: `Todos (${linhas.length})` },
            { key: 'com'   as const, rotulo: `Com registro (${comRegistro.length})` },
            { key: 'sem'   as const, rotulo: `Sem registro (${semRegistro.length})` },
          ]).map(o => (
            <button key={o.key} type="button" onClick={() => setAba(o.key)}
              className={cn(
                'rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors',
                aba === o.key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}>
              {o.rotulo}
            </button>
          ))}
        </div>
        <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="Buscar login ou nome" className="h-8 pl-8 text-xs" aria-label="Buscar pessoa" />
        </div>
        {busca && (
          <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs text-muted-foreground"
            onClick={() => setBusca('')}>
            <X className="h-3.5 w-3.5" /> Limpar
          </Button>
        )}
      </div>

      {semRegistro.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-[11px]">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
          <p className="text-foreground/80">
            <strong>{formatBRL(dinheiroSem)} na meta sem dono.</strong> Estes logins vendem no ERP e o
            cadastro não os tem — a venda entra no total da empresa e some do placar, do ranking e da
            meta da equipe. Cadastre a pessoa em Usuários com o campo{' '}
            <strong>usuário</strong> igual ao login do ERP, e reimporte a carga.
          </p>
        </div>
      )}

      {/* ── A tabela ───────────────────────────────────────────────────── */}
      {carga.carregando ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Lendo o relatório…
        </div>
      ) : carga.vigentes.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">
          Nenhuma carga vigente ainda. Importe o relatório na aba Importar vendas.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="w-full overflow-x-auto">
            <table className="w-full min-w-[920px] text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-[11px]">
                  <th className="min-w-[150px] px-3 py-3 text-left font-semibold text-muted-foreground">LOGIN NO ERP</th>
                  <th className="min-w-[180px] px-3 py-3 text-left font-semibold text-muted-foreground">NOME NO RELATÓRIO</th>
                  <th className="min-w-[190px] px-3 py-3 text-left font-semibold text-muted-foreground">NO CADASTRO</th>
                  <th className="min-w-[140px] px-3 py-3 text-left font-semibold text-muted-foreground">SETOR</th>
                  <th className="w-[80px] px-3 py-3 text-right font-semibold text-muted-foreground">LINHAS</th>
                  <th className="w-[120px] px-3 py-3 text-right font-semibold text-muted-foreground">TOTAL</th>
                  <th className="w-[130px] px-3 py-3 text-right font-semibold text-muted-foreground">NA META</th>
                </tr>
              </thead>
              <tbody>
                {visiveis.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-sm text-muted-foreground">
                      {aba === 'sem' ? 'Todo mundo do relatório tem cadastro.' : 'Nada com esses filtros.'}
                    </td>
                  </tr>
                ) : visiveis.map((l, i) => (
                  <tr key={l.login + l.nomeNoRelatorio}
                    className={cn(
                      'border-b border-border/50',
                      i % 2 === 0 && 'bg-muted/10',
                      l.perfil === null && l.naMeta > 0 && 'bg-amber-500/5',
                    )}>
                    <td className="px-3 py-2.5 font-mono text-muted-foreground">{l.login}</td>
                    <td className="max-w-[220px] truncate px-3 py-2.5 text-foreground">{l.nomeNoRelatorio}</td>
                    <td className="px-3 py-2.5">
                      {l.perfil ? (
                        <span className="flex items-center gap-1.5">
                          {l.perfil.robo
                            ? <Bot className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                            : <UserCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />}
                          <span className="truncate text-foreground">{l.perfil.nome ?? '—'}</span>
                          {l.perfil.situacao === 'desligado' && (
                            <span className="shrink-0 rounded bg-muted px-1 text-[10px] text-muted-foreground">
                              desligado
                            </span>
                          )}
                        </span>
                      ) : l.ambiguo ? (
                        <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                          <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          login repetido em dois cadastros
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <UserX className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          sem registro
                        </span>
                      )}
                    </td>
                    <td className="max-w-[160px] truncate px-3 py-2.5 text-[11px] text-muted-foreground">
                      {l.perfil?.setor_id
                        ? setores.get(l.perfil.setor_id) ?? '—'
                        : (l.franquias.size > 0 ? [...l.franquias][0] : '—')}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">
                      {l.vendas.toLocaleString('pt-BR')}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">
                      {formatBRL(l.total)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-semibold text-foreground">
                      {formatBRL(l.naMeta)}
                      {l.qtdNaMeta > 0 && (
                        <span className="ml-1 text-[10px] font-normal text-muted-foreground">{l.qtdNaMeta}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Numero({
  rotulo, valor, sub, tom,
}: { rotulo: string; valor: string; sub: string; tom?: 'alerta' | 'bom' }) {
  return (
    <div className={cn(
      'rounded-xl border bg-card p-3.5 shadow-sm',
      tom === 'alerta' ? 'border-amber-500/40' : tom === 'bom' ? 'border-emerald-500/40' : 'border-border/70',
    )}>
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{rotulo}</p>
      <p className={cn(
        'mt-1.5 font-mono text-xl font-bold tabular-nums',
        tom === 'alerta' ? 'text-amber-600 dark:text-amber-400' : 'text-foreground',
      )}>
        {valor}
      </p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>
    </div>
  );
}
