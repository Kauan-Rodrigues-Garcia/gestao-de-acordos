/**
 * RhUsuarios — a aba Usuários do sistema do RH (13/11/2026).
 *
 * Pedido do Cleber: o gerente do RH entra pela empresa Recursos Humanos e tem
 * que ver «igual eu vejo» — quantos estão online em Birigui, quantos em
 * Marília, quem é quem — e não os poucos usuários cadastrados na empresa RH.
 *
 * Por isso esta NÃO é a aba Usuários da cobrança (criar, mover, trocar cargo,
 * resetar senha): é uma lista de leitura de todas as operações que a pessoa
 * alcança, com quem está online agora. Quem administra cadastro continua sendo
 * a aba Usuários de cada operação.
 *
 * ## De onde vem cada coisa
 *
 *   - as pessoas, setores e cidades: a mesma leitura do Quadro de Pessoal
 *     (`carregarQuadroDeVarias`), que respeita a RLS de `perfis`;
 *   - o online: `onlineIdsGlobal` do PresenceProvider — a lista da aplicação
 *     inteira que o chat já usa. Nada de banco novo, nada de consulta a cada N
 *     segundos: entrar e sair chega pelo aviso do Realtime.
 *
 * Abre com a mesma chave do Quadro (`ver_quadro_pessoal`, explícita).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertTriangle, Briefcase, Circle, Eye, IdCard, MapPin, RefreshCw, Search, Users, Wifi,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useEmpresa } from '@/hooks/useEmpresa';
import { usePresence } from '@/hooks/usePresence';
import { useVeQuadroPessoal } from '@/hooks/useVeQuadroPessoal';
import { produtoDaEmpresa } from '@/lib/produto';
import type { Empresa } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { fetchEmpresasLiberadas } from '@/services/empresas.service';
import {
  GRUPOS_CARGO, montarQuadro, normalizar, recortarPorCidade, type Quadro,
} from '@/services/rh/quadroPessoal';
import { carregarQuadro, carregarQuadroDeVarias } from '@/services/rh/quadroPessoal.service';
import { FiltroCidade } from '@/pages/RhQuadro/FiltroCidade';
import { SeletorFiltro } from '@/pages/RhQuadro/SeletorFiltro';
import { CartaoPessoa, Foto, SeloAfastado, SeloFerias } from '@/pages/RhQuadro/partes';
import { GRUPO_META, lugarTexto, plural, rotuloCargo } from '@/pages/RhQuadro/formato';

type Presenca = 'todos' | 'online' | 'offline';

const PRESENCAS: { k: Presenca; rotulo: string }[] = [
  { k: 'todos', rotulo: 'Todos' },
  { k: 'online', rotulo: 'Online agora' },
  { k: 'offline', rotulo: 'Offline' },
];

/** Quantas linhas a tabela desenha antes do «mostrar mais» (são centenas de pessoas). */
const PAGINA = 80;

export default function RhUsuarios() {
  const { empresa } = useEmpresa();
  const { podeVer, carregando: permCarregando } = useVeQuadroPessoal();
  const { onlineIdsGlobal } = usePresence();

  const [quadro, setQuadro] = useState<Quadro | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [atualizando, setAtualizando] = useState(false);

  const carregar = useCallback(async () => {
    if (!empresa) return;
    setAtualizando(true);
    try {
      const ehOperacao = (e: Empresa) => {
        const p = produtoDaEmpresa(e);
        return p === 'cobranca' || p === 'comercial';
      };
      const lista = await fetchEmpresasLiberadas().catch(() => [] as Empresa[]);
      const ops = lista.filter(ehOperacao);
      if (ehOperacao(empresa) && !ops.some(e => e.id === empresa.id)) ops.unshift(empresa);
      if (ops.length === 0) {
        setErro('Nenhuma operação está liberada para você ver.');
        return;
      }
      const dados = ops.length === 1
        ? await carregarQuadro(ops[0].id)
        : await carregarQuadroDeVarias(ops.map(e => ({ id: e.id, nome: e.nome })));
      setQuadro(montarQuadro(dados));
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String((e as { message?: unknown })?.message ?? e));
    } finally {
      setAtualizando(false);
    }
  }, [empresa]);

  useEffect(() => { if (podeVer) void carregar(); }, [podeVer, carregar]);

  // ── Filtros (moram no endereço: o link aberto de novo cai no mesmo lugar) ──
  const [params, setParams] = useSearchParams();
  const mudar = useCallback((chave: string, valor: string | null) => {
    setParams(p => { const n = new URLSearchParams(p); if (valor === null) n.delete(chave); else n.set(chave, valor); return n; }, { replace: true });
  }, [setParams]);
  const cidadeUrl = params.get('cidade');
  const cidade = cidadeUrl === null ? null : cidadeUrl === '~' ? '' : cidadeUrl;
  const presenca = (params.get('presenca') as Presenca | null) ?? 'todos';
  const setor = params.get('setor');
  const grupo = params.get('cargo');
  const [busca, setBusca] = useState('');
  const [limite, setLimite] = useState(PAGINA);
  useEffect(() => { setLimite(PAGINA); }, [cidade, presenca, setor, grupo, busca]);

  const vista = useMemo(() => (quadro ? recortarPorCidade(quadro, cidade) : null), [quadro, cidade]);

  /** A pessoa com setor, cidade e online resolvidos — uma vez, para filtrar e contar. */
  const linhas = useMemo(() => {
    if (!quadro || !vista) return [];
    const setorDe = new Map(quadro.setores.map(s => [s.id, s]));
    const pessoas = cidade === null ? quadro.todas : vista.setores.flatMap(s => s.pessoas);
    return pessoas.map(p => {
      const s = p.setorId ? setorDe.get(p.setorId) : undefined;
      return { p, setor: s ?? null, online: onlineIdsGlobal.has(p.id), lugar: lugarTexto(quadro, p) };
    });
  }, [quadro, vista, cidade, onlineIdsGlobal]);

  /** Online e total por cidade, para os cartões do topo. */
  const porCidade = useMemo(() => {
    const m = new Map<string, { total: number; online: number }>();
    if (!quadro) return m;
    const setorDe = new Map(quadro.setores.map(s => [s.id, s]));
    for (const p of quadro.todas) {
      const chave = (p.setorId && setorDe.get(p.setorId)?.cidade.chave) ?? '~sem';
      const c = m.get(chave) ?? { total: 0, online: 0 };
      c.total += 1;
      if (onlineIdsGlobal.has(p.id)) c.online += 1;
      m.set(chave, c);
    }
    return m;
  }, [quadro, onlineIdsGlobal]);
  const onlineTotal = useMemo(
    () => (quadro ? quadro.todas.filter(p => onlineIdsGlobal.has(p.id)).length : 0),
    [quadro, onlineIdsGlobal],
  );

  const visiveis = useMemo(() => {
    const b = normalizar(busca);
    return linhas
      .filter(l =>
        (presenca === 'todos' || (presenca === 'online') === l.online)
        && (!setor || l.p.setorId === setor)
        && (!grupo || l.p.grupo === grupo)
        && (!b || normalizar(l.p.nome).includes(b) || normalizar(l.p.email).includes(b) || (l.p.cracha ?? '').includes(b)))
      // Online primeiro; depois, nome.
      .sort((a, z) => Number(z.online) - Number(a.online) || a.p.nome.localeCompare(z.p.nome, 'pt-BR'));
  }, [linhas, presenca, setor, grupo, busca]);

  const filtrosLigados = [cidade !== null, presenca !== 'todos', !!setor, !!grupo, !!busca].filter(Boolean).length;
  const limparTudo = () => {
    setBusca('');
    setParams(new URLSearchParams(), { replace: true });
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (permCarregando || (podeVer && !quadro && !erro)) return <Esqueleto />;

  if (!podeVer) {
    return (
      <div className="mx-auto max-w-md space-y-2 px-6 py-16 text-center">
        <Users className="mx-auto size-8 opacity-40" />
        <p className="text-sm font-medium">Esta é a visão de usuários do RH.</p>
        <p className="text-xs text-muted-foreground">
          Ela abre para o RH e para quem o super admin liberar a chave «Aba Quadro de Pessoal (RH)», em Configurações › Permissões.
        </p>
      </div>
    );
  }

  if (erro || !quadro || !vista) {
    return (
      <div className="mx-auto max-w-md space-y-3 px-6 py-16 text-center">
        <AlertTriangle className="mx-auto size-8 text-warning" />
        <p className="text-sm font-medium">Não foi possível carregar os usuários.</p>
        <p className="text-xs text-muted-foreground">{erro}</p>
        <Button size="sm" variant="outline" onClick={() => void carregar()}>Tentar de novo</Button>
      </div>
    );
  }

  const cartoesCidade = [
    ...quadro.cidades.map(c => ({ chave: c.chave, nome: c.nome, marca: c.marca, ...(porCidade.get(c.chave) ?? { total: 0, online: 0 }) })),
    ...(porCidade.get('~sem') ? [{ chave: '~sem', nome: 'Sem setor', marca: null, ...porCidade.get('~sem')! }] : []),
  ];

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-4 md:p-6">
      {/* Cabeçalho */}
      <header className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">Usuários</h1>
            <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              <Eye className="size-3" /> Visão do RH
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Todas as operações · {plural(quadro.todas.length, 'pessoa', 'pessoas')} · online atualiza sozinho
          </p>
        </div>
        <Button variant="ghost" size="sm" className="h-9 gap-1.5" onClick={() => void carregar()} disabled={atualizando}>
          <RefreshCw className={cn('size-4', atualizando && 'animate-spin')} /> Atualizar lista
        </Button>
      </header>

      {/* Online agora, por cidade */}
      <section className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,15rem),1fr))]">
        <CartaoOnline
          titulo="Online agora" subtitulo="todas as cidades" online={onlineTotal} total={quadro.todas.length} destaque
          ativo={cidade === null && presenca === 'online'}
          onClick={() => { mudar('cidade', null); mudar('presenca', 'online'); }}
        />
        {cartoesCidade.map(c => (
          <CartaoOnline
            key={c.chave}
            titulo={c.nome}
            subtitulo={c.marca}
            online={c.online}
            total={c.total}
            ativo={cidade === (c.chave === '~sem' ? '~' : c.chave) && presenca === 'online'}
            onClick={c.chave === '~sem' ? undefined : () => { mudar('cidade', c.chave === '' ? '~' : c.chave); mudar('presenca', 'online'); }}
          />
        ))}
      </section>

      {/* Filtros: uma linha, cada um diz o que é */}
      <section className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
        <FiltroCidade
          cidades={quadro.cidades}
          porCidade={new Map(cartoesCidade.map(c => [c.chave, c.total]))}
          total={quadro.todas.length}
          ativa={cidade}
          onTrocar={c => { mudar('cidade', c === null ? null : c === '' ? '~' : c); mudar('setor', null); }}
        />
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <div className="inline-flex h-9 items-center rounded-md border border-input bg-background p-0.5" role="group" aria-label="Presença">
            {PRESENCAS.map(o => (
              <button
                key={o.k}
                type="button"
                aria-pressed={presenca === o.k}
                onClick={() => mudar('presenca', o.k === 'todos' ? null : o.k)}
                className={cn(
                  'inline-flex h-full items-center gap-1.5 rounded px-3 text-xs font-medium transition-colors',
                  presenca === o.k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
                )}
              >
                {o.k === 'online' && <Circle className={cn('size-2 fill-current', presenca === o.k ? '' : 'text-success')} />}
                {o.rotulo}
              </button>
            ))}
          </div>
          <SeletorFiltro
            valor={setor}
            onTrocar={v => mudar('setor', v)}
            Icone={MapPin}
            rotulo="Setor"
            rotuloTodos="Todos os setores"
            placeholderBusca="Buscar setor…"
            className="max-w-[16rem]"
            opcoes={vista.setores.map(s => ({
              valor: s.id,
              rotulo: s.nome,
              grupo: [s.cidade.nome, s.cidade.marca].filter(Boolean).join(' · '),
              contagem: s.numeros.pessoas,
            }))}
          />
          <SeletorFiltro
            valor={grupo}
            onTrocar={v => mudar('cargo', v)}
            Icone={Briefcase}
            rotulo="Cargo"
            rotuloTodos="Todos os cargos"
            largura="w-60"
            opcoes={GRUPOS_CARGO.filter(g => vista.numeros.porGrupo[g] > 0).map(g => ({
              valor: g, rotulo: GRUPO_META[g].rotulo, contagem: vista.numeros.porGrupo[g],
            }))}
          />
          <div className="relative min-w-[14rem] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar nome, e-mail ou crachá…" className="h-9 pl-9" />
          </div>
          {filtrosLigados > 0 && (
            <Button variant="ghost" size="sm" className="h-9" onClick={limparTudo}>Limpar filtros</Button>
          )}
        </div>
      </section>

      {/* A lista */}
      <section className="rounded-2xl border border-border bg-card shadow-sm">
        <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3 md:px-5">
          <h2 className="text-base font-semibold text-foreground">{plural(visiveis.length, 'pessoa', 'pessoas')}</h2>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">
            <Wifi className="size-3" /> {visiveis.filter(l => l.online).length} online
          </span>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[52rem] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs font-semibold text-foreground/80">
                <th className="px-4 py-2.5">Pessoa</th>
                <th className="px-4 py-2.5">Agora</th>
                <th className="px-4 py-2.5">Cargo</th>
                <th className="px-4 py-2.5">Setor · Equipe</th>
                <th className="px-4 py-2.5">Cidade</th>
                <th className="px-4 py-2.5">Crachá</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.slice(0, limite).map(({ p, setor: s, online, lugar }) => (
                <tr key={p.id} className="border-b border-border/60 last:border-0 hover:bg-muted/40">
                  <td className="px-4 py-2.5">
                    <CartaoPessoa pessoa={p} lugar={lugar}>
                      <button type="button" className="flex items-center gap-3 text-left">
                        <span className="relative">
                          <Foto pessoa={p} tamanho="md" />
                          <span className={cn(
                            'absolute -bottom-0.5 -right-0.5 size-3 rounded-full ring-2 ring-card',
                            online ? 'bg-success' : 'bg-muted-foreground/40',
                          )} />
                        </span>
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5 font-medium text-foreground">
                            <span className="truncate">{p.nome}</span>
                            <SeloFerias pessoa={p} compacto />
                            <SeloAfastado pessoa={p} />
                          </span>
                          {p.email && <span className="block truncate text-xs text-foreground/65">{p.email}</span>}
                        </span>
                      </button>
                    </CartaoPessoa>
                  </td>
                  <td className="px-4 py-2.5">
                    {online
                      ? <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-success"><Circle className="size-2 fill-current" /> Online</span>
                      : <span className="text-xs text-muted-foreground">Offline</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="inline-flex items-center gap-2 text-foreground">
                      <span className={cn('size-2.5 shrink-0 rounded-full', GRUPO_META[p.grupo].cor)} />
                      {rotuloCargo(p.cargo)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-foreground">
                    {lugar.setor}
                    {lugar.equipe && <span className="text-foreground/65"> · {lugar.equipe}</span>}
                  </td>
                  <td className="px-4 py-2.5 text-foreground">
                    {s ? <>{s.cidade.nome}{s.cidade.marca && <span className="text-foreground/60"> · {s.cidade.marca}</span>}</> : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    {p.cracha
                      ? <span className="font-mono text-sm tabular-nums text-foreground">{p.cracha}</span>
                      : <span className="inline-flex items-center gap-1 text-xs italic text-warning"><IdCard className="size-3" /> Sem crachá</span>}
                  </td>
                </tr>
              ))}
              {visiveis.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-muted-foreground">Ninguém com esse filtro.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {visiveis.length > limite && (
          <div className="border-t border-border p-3 text-center">
            <Button variant="ghost" size="sm" onClick={() => setLimite(l => l + PAGINA)}>
              Mostrar mais {Math.min(PAGINA, visiveis.length - limite)} de {visiveis.length - limite}
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}

function CartaoOnline({
  titulo, subtitulo, online, total, destaque, ativo, onClick,
}: {
  titulo: string; subtitulo: string | null; online: number; total: number;
  destaque?: boolean; ativo?: boolean; onClick?: () => void;
}) {
  const pct = total ? Math.round((online / total) * 100) : 0;
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      className={cn(
        'rounded-2xl border bg-card p-4 text-left shadow-sm transition',
        destaque ? 'border-success/40' : 'border-border',
        ativo && 'ring-2 ring-success/50',
        onClick && 'hover:-translate-y-0.5 hover:shadow-md',
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-semibold text-foreground">{titulo}</p>
        {subtitulo && <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{subtitulo}</p>}
      </div>
      <p className="mt-3 leading-none">
        <span className="text-4xl font-bold tabular-nums tracking-tight text-foreground">{online}</span>
        <span className="ml-1.5 text-sm font-medium text-success">online</span>
        <span className="ml-1 text-sm text-muted-foreground">de {total}</span>
      </p>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-success transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
    </Tag>
  );
}

function Esqueleto() {
  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-4 md:p-6">
      <Skeleton className="h-9 w-56" />
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,15rem),1fr))]">
        {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
      </div>
      <Skeleton className="h-28 rounded-2xl" />
      <Skeleton className="h-96 rounded-2xl" />
    </div>
  );
}

