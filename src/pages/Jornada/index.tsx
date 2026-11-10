/**
 * Abas «Acesso» e «Retenção» do Jornada (04/11/2026).
 *
 * Quem está na equipe ou no subgrupo Suporte lança aqui os acessos; quem está
 * na equipe ou no subgrupo Retenção, as retenções. Os dois lançam só o NR e a data — e a tela filtra
 * pelo dia. A liderança do setor vê todo mundo e configura a meta DO MÊS que
 * vale para cada operador.
 *
 * O desenho é feito para lançar em sequência: o NR nasce com o cursor, Enter
 * grava, o campo limpa e o cursor volta. A data fica onde a pessoa deixou.
 *
 * Quem pode o quê é do banco (migrations 20261104180000 e 20261104200000): a
 * tela só pergunta.
 *
 * NR com pessoas diferentes (10/11/2026, migration 20261110120000): a mesma
 * pessoa não lança o mesmo NR duas vezes no mês; outra pessoa pode, e o NR
 * fica marcado — a etiqueta amarela na linha, o aviso ao lançar e a lista
 * «Compartilhados» do mês. Sem grupo nenhum, o super_admin vê uma prévia com dados de
 * exemplo (`previa.ts`) que não grava nada.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  CalendarDays, ChevronLeft, ChevronRight, Copy, Download, Eye, KeyRound, Loader2, Plus,
  Search, Settings2, ShieldCheck, Target, Trash2, Trophy, Upload, Users, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getTodayISO } from '@/lib/index';
import { propsSoNumeros } from '@/lib/soNumeros';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useJornadaAbas } from '@/hooks/useJornadaAbas';
import {
  buscarPainel, excluir, excluirLote, exportar, lancar, lancarLote, salvarFaixas, salvarMeta, salvarMetasPessoas,
  listarLixeira, restaurar, type ItemImportado, type ItemLixeira, type ResultadoLote,
  type PainelJornada, type PessoaPlacar, type RegistroJornada, type GrupoJornada, type TipoJornada,
  type OutroNoNr,
} from '@/services/jornada/jornada.service';
import { DialogCompartilhados } from './DialogCompartilhados';
import { DialogMeta, type MetaIndividual } from './DialogMeta';
import { DialogImportar } from './DialogImportar';
import { DialogLixeira } from './DialogLixeira';
import { baixarCsv, paraCsv } from './importar';
import { gerarPrevia, outrosNoMes, painelDaPrevia, type EstadoPrevia } from './previa';
import {
  ORDINAIS, TEXTOS, contagem, diaDaSemana, diaPorExtenso, diasDoMesAte,
  diaMes, horaSaoPaulo, iniciais, mesPorExtenso, nomesCurtos, percentual, situacaoMetas, somarDias,
  textoDosOutros,
} from './jornada';

/** «Retenção · Jornada» (equipe) ou «Suporte · Equipe X · Jornada» (subgrupo). */
function descreverGrupo(g: GrupoJornada): string {
  const partes = g.grupo === 'equipe'
    ? [g.grupo_nome, g.setor_nome]
    : [g.grupo_nome, g.equipe_nome, g.setor_nome];
  return partes.filter(Boolean).join(' · ');
}

export default function PaginaJornada({ tipo }: { tipo: TipoJornada }) {
  const textos = TEXTOS[tipo];
  const { grupos: todos, carregando, bancoSemAbas } = useJornadaAbas();
  const { perfil } = useAuth();
  const superAdmin = perfil?.perfil === 'super_admin';
  const grupos = useMemo(() => todos.filter(s => s.tipo === tipo), [todos, tipo]);

  // O grupo aberto: o da pessoa, quando ela é membro; senão o primeiro.
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const grupo: GrupoJornada | null =
    grupos.find(s => s.grupo_id === escolhido)
    ?? grupos.find(s => s.sou_membro)
    ?? grupos[0]
    ?? null;

  const Icone = tipo === 'acesso' ? KeyRound : ShieldCheck;

  return (
    <div className="p-3 sm:p-5">
      <div className="max-w-[1200px] mx-auto space-y-4">
        {/* Cabeçalho */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Icone className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold leading-tight">{textos.titulo}</h1>
            <p className="text-xs text-muted-foreground truncate">
              {grupo
                ? descreverGrupo(grupo)
                : `Equipe ou subgrupo ${textos.grupo}`}
            </p>
          </div>
          {grupos.length > 1 && (
            <select
              className="h-9 rounded-md border bg-background px-3 text-sm"
              value={grupo?.grupo_id ?? ''}
              onChange={e => setEscolhido(e.target.value)}
              aria-label="Grupo"
            >
              {grupos.map(s => (
                <option key={s.grupo_id} value={s.grupo_id}>{descreverGrupo(s)}</option>
              ))}
            </select>
          )}
        </div>

        {carregando ? (
          <div className="flex items-center gap-2 text-muted-foreground py-16 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </div>
        ) : bancoSemAbas ? (
          <div className="rounded-xl border border-warning/50 bg-warning/10 p-6 space-y-2">
            <p className="font-medium">O banco ainda não tem esta aba.</p>
            <p className="text-sm text-muted-foreground">
              Falta aplicar a migration <code className="font-mono">20261104180000_jornada_acesso_e_retencao.sql</code> no
              SQL Editor do Supabase. Depois dela, recarregue a página.
            </p>
          </div>
        ) : !grupo && superAdmin ? (
          <PainelPrevia tipo={tipo} />
        ) : !grupo ? (
          <div className="rounded-xl border bg-card p-8 text-center space-y-2">
            <p className="font-medium">Esta aba é da equipe ou do subgrupo {textos.grupo} do Jornada.</p>
            <p className="text-sm text-muted-foreground">
              Ela aparece para quem está, no setor Jornada, numa equipe ou num subgrupo com «{textos.grupo}» no nome (em Usuários › Equipes) e para a liderança do setor — com a aba ligada em Configurações › Permissões. Nesta empresa ainda não há nenhum.
            </p>
          </div>
        ) : (
          <Painel key={grupo.grupo_id} grupo={grupo} tipo={tipo} />
        )}
      </div>
    </div>
  );
}

/** O que a tela faz com o que a pessoa digita — no banco, ou na prévia. */
interface AcoesJornada {
  /** Grava; devolve quem MAIS tem o NR na aba no mês (vazio = só você). */
  lancar: (nr: string, data: string) => Promise<OutroNoNr[]>;
  excluir: (id: string) => Promise<void>;
  /** Metas do grupo no mês (vazia tira) e as individuais que mudaram. Só a liderança. */
  salvarMeta: (metas: number[], individuais: MetaIndividual[]) => Promise<void>;
  /** Importar muitos de uma vez. */
  lancarLote: (itens: ItemImportado[]) => Promise<ResultadoLote>;
  /** Apagar os marcados; devolve quantos saíram. */
  excluirLote: (ids: string[]) => Promise<number>;
  /** NR + data de um período, para baixar (o operador recebe só os dele). */
  exportar: (ini: string, fim: string) => Promise<ItemImportado[]>;
  /** O que foi apagado nos últimos 30 dias. */
  lixeira: () => Promise<ItemLixeira[]>;
  /** Tira da lixeira (o NR lançado de novo no mês fica lá). */
  restaurar: (ids: string[]) => Promise<{ restaurados: number; repetidos: number }>;
}

/** O painel de verdade: lê e grava no banco. */
function Painel({ grupo, tipo }: { grupo: GrupoJornada; tipo: TipoJornada }) {
  const hoje = getTodayISO();
  const [dia, setDia] = useState(hoje);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['jornada-painel', grupo.grupo_id, dia],
    queryFn: () => buscarPainel(grupo.grupo_id, dia),
    placeholderData: anterior => anterior,
  });
  const painel = query.data;
  const recarregar = () => queryClient.invalidateQueries({ queryKey: ['jornada-painel', grupo.grupo_id] });

  const acoes: AcoesJornada = {
    lancar: async (nr, data) => {
      const id = await lancar(grupo.grupo_id, nr, data);
      // O painel do dia do lançamento já relido traz o `outros` dele (e é o que a tela vai mostrar).
      const chave = ['jornada-painel', grupo.grupo_id, data];
      const novo = await queryClient.fetchQuery({ queryKey: chave, queryFn: () => buscarPainel(grupo.grupo_id, data), staleTime: 0 })
        .catch((): null => null);
      void queryClient.invalidateQueries({
        queryKey: ['jornada-painel', grupo.grupo_id],
        predicate: q => q.queryKey[2] !== data,
      });
      return novo?.registros.find(r => r.id === id)?.outros ?? [];
    },
    excluir: async id => { await excluir(id); void recarregar(); },
    salvarMeta: async (metas, individuais) => {
      try {
        // A 1ª meta pelas funções de sempre; a 2ª, 3ª e 4ª depois, por cima dela.
        await salvarMeta(grupo.grupo_id, metas[0] ?? null);
        await salvarMetasPessoas(grupo.grupo_id, individuais.map(i => ({
          perfil_id: i.perfil_id, meta: i.metas?.[0] ?? null,
        })));
        const pessoasComFaixa = individuais
          .filter(i => i.metas && i.metas.length > 0)
          .map(i => ({ perfil_id: i.perfil_id, extras: (i.metas ?? []).slice(1) }));
        // Só chama as faixas quando há (ou havia) 2ª meta em algum lugar: quem só
        // usa a 1ª não depende da migration 20261105140000.
        const haviaFaixa = (painel?.metas.length ?? 0) > 1
          || (painel?.pessoas ?? []).some(p => p.meta_propria && p.metas.length > 1);
        const temFaixa = metas.length > 1 || pessoasComFaixa.some(p => p.extras.length > 0);
        if (temFaixa || haviaFaixa) {
          await salvarFaixas(grupo.grupo_id, metas.length ? metas.slice(1) : null, pessoasComFaixa);
        }
      } finally {
        void recarregar();
      }
    },
    lancarLote: async itens => {
      try { return await lancarLote(grupo.grupo_id, itens); } finally { void recarregar(); }
    },
    excluirLote: async ids => {
      try { return await excluirLote(ids); } finally { void recarregar(); }
    },
    exportar: (ini, fim) => exportar(grupo.grupo_id, ini, fim),
    lixeira: () => listarLixeira(grupo.grupo_id),
    restaurar: async ids => {
      try { return await restaurar(ids); } finally { void recarregar(); }
    },
  };

  if (query.isError && !painel) {
    return (
      <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-6 text-sm">
        Não foi possível abrir o painel: {(query.error as Error).message}
      </div>
    );
  }
  if (!painel) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground py-16 justify-center">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
      </div>
    );
  }

  return (
    <Tela
      painel={painel} tipo={tipo} hoje={hoje} dia={dia} setDia={setDia}
      atualizando={query.isFetching} acoes={acoes}
    />
  );
}

/**
 * A prévia do super_admin: a aba inteira com gente e NRs inventados, para ver
 * como fica antes de existir a equipe. Nada vai para o banco.
 */
function PainelPrevia({ tipo }: { tipo: TipoJornada }) {
  const { perfil } = useAuth();
  const hoje = getTodayISO();
  const eu = perfil?.id ?? 'eu';
  const meuNome = perfil?.nome ?? 'Você';
  const [dia, setDia] = useState(hoje);
  const [estado, setEstado] = useState<EstadoPrevia>(() => gerarPrevia(tipo, hoje, { id: eu, nome: meuNome }));
  const painel = useMemo(() => painelDaPrevia(estado, tipo, dia), [estado, tipo, dia]);
  // O «Desfazer» do aviso roda depois do apagar: lê sempre o estado de agora.
  const agora = useRef(estado);
  agora.current = estado;
  const paraLixeira = (e: EstadoPrevia, ids: Set<string>): EstadoPrevia => ({
    ...e,
    registros: e.registros.filter(r => !ids.has(r.id)),
    apagados: [
      ...e.apagados,
      ...e.registros.filter(r => ids.has(r.id)).map(r => ({ ...r, apagado_em: new Date().toISOString() })),
    ],
  });
  const novoRegistro = (nr: string, data: string) => ({
    id: `previa-novo-${crypto.randomUUID()}`, nr, data, perfil_id: eu,
    nome: meuNome, criado_em: new Date().toISOString(),
  });

  const acoes: AcoesJornada = {
    lancar: async (nr, data) => {
      // A mesma regra do banco: a mesma pessoa não repete o NR no mês; outra pessoa pode.
      if (estado.registros.some(r => r.nr === nr && r.perfil_id === eu && r.data.slice(0, 7) === data.slice(0, 7))) {
        throw new Error('Este NR já foi lançado por você neste mês.');
      }
      const novo = novoRegistro(nr, data);
      setEstado(e => ({ ...e, registros: [...e.registros, novo] }));
      return outrosNoMes(estado.registros, novo);
    },
    excluir: async id => setEstado(e => paraLixeira(e, new Set([id]))),
    lancarLote: async itens => {
      const meus = new Set(estado.registros.filter(r => r.perfil_id === eu).map(r => `${r.nr}|${r.data.slice(0, 7)}`));
      const deOutros = new Set(estado.registros.filter(r => r.perfil_id !== eu).map(r => `${r.nr}|${r.data.slice(0, 7)}`));
      const novos = itens.filter(i => {
        const k = `${i.nr}|${i.data.slice(0, 7)}`;
        if (meus.has(k)) return false;
        meus.add(k);
        return true;
      });
      setEstado(e => ({ ...e, registros: [...e.registros, ...novos.map(i => novoRegistro(i.nr, i.data))] }));
      return {
        inseridos: novos.length, repetidos: itens.length - novos.length, invalidos: 0,
        compartilhados: novos.filter(i => deOutros.has(`${i.nr}|${i.data.slice(0, 7)}`)).length,
      };
    },
    excluirLote: async ids => {
      setEstado(e => paraLixeira(e, new Set(ids)));
      return ids.length;
    },
    lixeira: async () => [...agora.current.apagados]
      .sort((a, b) => b.apagado_em.localeCompare(a.apagado_em))
      .map(({ id, nr, data, apagado_em }) => ({ id, nr, data, apagado_em })),
    restaurar: async ids => {
      const querem = new Set(ids);
      // Por pessoa: só barra quem relançou o mesmo NR no mês.
      const vivos = new Set(agora.current.registros.map(r => `${r.nr}|${r.data.slice(0, 7)}|${r.perfil_id}`));
      const voltam = agora.current.apagados.filter(a => {
        const k = `${a.nr}|${a.data.slice(0, 7)}|${a.perfil_id}`;
        if (!querem.has(a.id) || vivos.has(k)) return false;
        vivos.add(k);
        return true;
      });
      const ok = new Set(voltam.map(a => a.id));
      setEstado(e => ({
        ...e,
        registros: [...e.registros, ...voltam.map(({ apagado_em: _, ...r }) => r)],
        apagados: e.apagados.filter(a => !ok.has(a.id)),
      }));
      return { restaurados: voltam.length, repetidos: ids.length - voltam.length };
    },
    exportar: async (ini, fim) => estado.registros
      .filter(r => r.data >= ini && r.data <= fim)
      .sort((a, b) => a.data.localeCompare(b.data) || a.criado_em.localeCompare(b.criado_em))
      .map(r => ({ nr: r.nr, data: r.data })),
    salvarMeta: async (metas, individuais) => setEstado(e => {
      const metasPessoa = { ...e.metasPessoa };
      for (const i of individuais) {
        if (i.metas?.length) metasPessoa[i.perfil_id] = i.metas;
        else delete metasPessoa[i.perfil_id];
      }
      return { ...e, metas, metasPessoa };
    }),
  };

  return (
    <div className="space-y-4">
      <div
        className="rounded-lg border border-warning/50 bg-warning/10 px-3 py-1.5 text-xs flex items-center gap-2"
        title={`Ainda não há, no setor Jornada, equipe nem subgrupo com «${TEXTOS[tipo].grupo}» no nome.`}
      >
        <Eye className="h-3.5 w-3.5 shrink-0 text-warning" />
        <span className="truncate">
          <span className="font-medium">Prévia com dados de exemplo</span>
          <span className="text-muted-foreground"> — lançar, importar, apagar e meta não gravam nada; F5 recomeça.</span>
        </span>
      </div>
      <Tela painel={painel} tipo={tipo} hoje={hoje} dia={dia} setDia={setDia} atualizando={false} acoes={acoes} />
    </div>
  );
}

/**
 * A tela, enxuta: em cima dois cartões da mesma altura — lançar e a meta do
 * mês —; embaixo o dia (lista em colunas) e, para a liderança, a equipe.
 */
function Tela({
  painel, tipo, hoje, dia, setDia, atualizando, acoes,
}: {
  painel: PainelJornada;
  tipo: TipoJornada;
  hoje: string;
  dia: string;
  setDia: (d: string) => void;
  atualizando: boolean;
  acoes: AcoesJornada;
}) {
  // false = fechado; true = aberto; id = aberto com o cursor na meta dessa pessoa.
  const [metaAberta, setMetaAberta] = useState<boolean | string>(false);
  const abrirMetas = painel.pode_gerir ? (perfilId?: string) => setMetaAberta(perfilId ?? true) : undefined;
  const [importando, setImportando] = useState(false);

  return (
    <>
      <div className="grid gap-3 md:grid-cols-2">
        <section className="rounded-xl border bg-card px-4 py-3 space-y-2">
          <Rotulo
            icone={Plus}
            direita={painel.sou_membro ? (
              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setImportando(true)}>
                <Upload className="h-3.5 w-3.5" /> Importar
              </Button>
            ) : null}
          >
            Lançar {TEXTOS[tipo].unidadeUm}
          </Rotulo>
          {painel.sou_membro ? (
            <FormLancar
              tipo={tipo}
              hoje={hoje}
              aoGravar={async (nr, data) => {
                const outros = await acoes.lancar(nr, data);
                if (data !== dia) setDia(data);
                // Lançou, e o cliente já está com outra pessoa: fica marcado (não é erro).
                if (outros.length) {
                  toast.warning(`NR ${nr} também está com ${textoDosOutros(outros)}.`, {
                    description: 'Foi lançado e conta para você. Ele fica marcado como compartilhado.',
                    duration: 8000,
                  });
                }
              }}
            />
          ) : (
            <p className="h-9 flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="h-4 w-4 shrink-0" />
              Quem lança é o grupo — você vê como liderança.
            </p>
          )}
        </section>

        <section className="rounded-xl border bg-card px-4 py-3 space-y-2">
          <ResumoMeta painel={painel} tipo={tipo} dia={dia} aoConfigurar={() => setMetaAberta(true)} />
        </section>
      </div>

      {/* O operador só vê o que é dele: o placar da equipe é da liderança. */}
      <div className={cn('grid gap-4 items-start', painel.pode_gerir && 'lg:grid-cols-[minmax(0,1fr)_300px]')}>
        <CardDia
          painel={painel}
          tipo={tipo}
          dia={dia}
          hoje={hoje}
          setDia={setDia}
          atualizando={atualizando}
          acoes={acoes}
        />
        {painel.pode_gerir && <CardEquipe painel={painel} tipo={tipo} dia={dia} aoAbrirMeta={abrirMetas} />}
      </div>

      {painel.sou_membro && (
        <DialogImportar
          aberto={importando}
          aoFechar={() => setImportando(false)}
          tipo={tipo}
          hoje={hoje}
          aoImportar={acoes.lancarLote}
        />
      )}

      {painel.pode_gerir && (
        <DialogMeta
          aberto={metaAberta !== false}
          aoFechar={() => setMetaAberta(false)}
          tipo={tipo}
          metasAtuais={painel.metas}
          pessoas={painel.pessoas.filter(p => p.no_grupo)}
          focoPessoa={typeof metaAberta === 'string' ? metaAberta : null}
          aoSalvar={acoes.salvarMeta}
        />
      )}
    </>
  );
}

/** O rótulo pequeno do topo de cada cartão; `children` à direita, se houver. */
function Rotulo({
  icone: Icone, children, direita,
}: {
  icone: typeof Plus;
  children: React.ReactNode;
  direita?: React.ReactNode;
}) {
  return (
    <div className="h-6 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
      <Icone className="h-3.5 w-3.5 text-primary" />
      <span className="truncate">{children}</span>
      {direita && <span className="ml-auto flex items-center gap-1.5 normal-case tracking-normal">{direita}</span>}
    </div>
  );
}

/** O valor de «Todos os operadores» no filtro (o Select não aceita valor vazio). */
const TODOS = '__todos__';

/** «novembro», do dia aberto. */
function nomeDoMes(dia: string): string {
  return mesPorExtenso(dia).split(' de ')[0];
}

// ─── Lançar ─────────────────────────────────────────────────────────────────

/** NR + data + Adicionar numa linha. Enter grava e o cursor volta ao NR. */
function FormLancar({
  tipo, hoje, aoGravar,
}: {
  tipo: TipoJornada;
  hoje: string;
  aoGravar: (nr: string, data: string) => Promise<void>;
}) {
  const [nr, setNr] = useState('');
  const [data, setData] = useState(hoje);
  const [gravando, setGravando] = useState(false);
  const [ultimo, setUltimo] = useState<string | null>(null);
  const campoNr = useRef<HTMLInputElement>(null);

  useEffect(() => { campoNr.current?.focus(); }, []);

  async function gravar(e?: React.FormEvent) {
    e?.preventDefault();
    const limpo = nr.trim();
    if (!limpo) { campoNr.current?.focus(); return; }
    if (!data || data > hoje) { toast.error('A data não pode ser depois de hoje.'); return; }
    setGravando(true);
    try {
      await aoGravar(limpo, data);
      setUltimo(limpo);
      setNr('');
    } catch (erro) {
      toast.error((erro as Error).message);
    } finally {
      setGravando(false);
      campoNr.current?.focus();
    }
  }

  const rotuloData = tipo === 'acesso' ? 'Data do acesso' : 'Data da retenção';

  return (
    <form onSubmit={gravar} className="flex items-center gap-2">
      <Input
        ref={campoNr}
        value={nr}
        placeholder={ultimo ? `✓ ${ultimo} lançado — próximo NR` : 'NR'}
        aria-label="NR"
        className={cn('h-9 flex-1 min-w-0 font-mono', ultimo && !nr && 'placeholder:text-success')}
        maxLength={20}
        disabled={gravando}
        {...propsSoNumeros(setNr, 'NR')}
      />
      <Input
        type="date"
        value={data}
        max={hoje}
        aria-label={rotuloData}
        title={rotuloData}
        className={cn('h-9 w-[136px] shrink-0', data !== hoje && 'border-warning text-warning')}
        onChange={e => setData(e.target.value)}
        disabled={gravando}
      />
      <Button type="submit" className="h-9 px-3 shrink-0" disabled={gravando || !nr}>
        {gravando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        <span className="hidden sm:inline">Adicionar</span>
      </Button>
    </form>
  );
}

// ─── Meta (sempre do mês) ───────────────────────────────────────────────────

function ResumoMeta({
  painel, tipo, dia, aoConfigurar,
}: {
  painel: PainelJornada;
  tipo: TipoJornada;
  dia: string;
  aoConfigurar: () => void;
}) {
  const { perfil } = useAuth();
  const mes = nomeDoMes(dia);
  const eu = painel.pessoas.find(p => p.id === perfil?.id);
  // Quem tem meta (a própria ou a do grupo) e ainda está no grupo.
  const comMeta = painel.pessoas.filter(p => p.no_grupo && p.meta);
  const minhaMeta = painel.sou_membro ? (eu?.meta ?? painel.meta) : null;
  const minhasMetas = painel.sou_membro ? (eu?.metas ?? painel.metas) : [];
  const temMeta = painel.sou_membro ? !!minhaMeta : comMeta.length > 0;

  const engrenagem = painel.pode_gerir && temMeta ? (
    <Button
      variant="ghost" size="icon" className="h-6 w-6"
      onClick={aoConfigurar}
      title="Metas do grupo e individuais"
      aria-label="Configurar as metas"
    >
      <Settings2 className="h-3.5 w-3.5" />
    </Button>
  ) : null;

  const titulo = painel.sou_membro
    ? `Meta de ${TEXTOS[tipo].unidade}`
    : `Meta de ${TEXTOS[tipo].unidade} · equipe`;

  if (!temMeta) {
    return (
      <>
        <Rotulo icone={Target}>{titulo}</Rotulo>
        <div className="h-9 flex items-center gap-2">
          <p className="text-sm text-muted-foreground flex-1">
            Sem meta para o mês{painel.pode_gerir ? '.' : ' — a liderança define.'}
          </p>
          {painel.pode_gerir && (
            <Button variant="outline" size="sm" className="h-8" onClick={aoConfigurar}>Configurar meta</Button>
          )}
        </div>
      </>
    );
  }

  // Membro: o próprio número do mês. Liderança: quantos já bateram a sua.
  let numero: React.ReactNode;
  let pct: number;
  let lado: string;
  if (painel.sou_membro && minhaMeta) {
    const feito = eu?.no_mes ?? 0;
    // Até 4 metas (05/11/2026): a barra mede a PRÓXIMA a bater.
    const sit = situacaoMetas(feito, minhasMetas.length ? minhasMetas : [minhaMeta]);
    const alvo = sit.alvo ?? minhaMeta;
    const varias = minhasMetas.length > 1;
    pct = percentual(feito, alvo) ?? 0;
    numero = (
      <>
        <span className="text-xl font-bold tabular-nums">{feito}</span>
        <span className="text-sm text-muted-foreground tabular-nums">/{alvo}</span>
      </>
    );
    if (!varias) {
      lado = pct >= 100 ? `Meta batida! ${pct}%` : `${pct}% · faltam ${alvo - feito}`;
    } else if (sit.todas) {
      lado = `Bateu as ${minhasMetas.length} metas!`;
    } else {
      lado = sit.batidas > 0
        ? `${ORDINAIS[sit.batidas - 1]} batida · faltam ${sit.faltam} p/ ${ORDINAIS[sit.indiceAlvo]}`
        : `${pct}% · faltam ${sit.faltam} p/ 1ª`;
      // A barra só fica verde ao bater TODAS; até lá ela mede a próxima.
      pct = Math.min(pct, 99);
    }
  } else {
    const bateram = comMeta.filter(p => p.no_mes >= (p.meta ?? 0)).length;
    pct = Math.floor((bateram / comMeta.length) * 100);
    numero = (
      <>
        <span className="text-xl font-bold tabular-nums">{bateram}</span>
        <span className="text-sm text-muted-foreground tabular-nums">/{comMeta.length}</span>
      </>
    );
    lado = painel.meta
      ? `bateram · meta ${painel.meta} ${TEXTOS[tipo].unidade}`
      : 'bateram a meta individual';
  }
  const bateu = pct >= 100;

  return (
    <>
      <Rotulo
        icone={bateu ? Trophy : Target}
        direita={<><span className="text-[11px] capitalize">{mes}</span>{engrenagem}</>}
      >
        {titulo}
      </Rotulo>
      <div className="h-9 flex items-center gap-3">
        <span className={cn('flex items-baseline gap-0.5 shrink-0', bateu && '[&>span:first-child]:text-success')}>
          {numero}
        </span>
        <Progress value={Math.min(100, pct)} className={cn('h-2 flex-1', bateu && '[&>div]:bg-success')} />
        <span className={cn('text-xs whitespace-nowrap shrink-0', bateu ? 'text-success font-semibold' : 'text-muted-foreground')}>
          {lado}
        </span>
      </div>
    </>
  );
}

// ─── O dia ──────────────────────────────────────────────────────────────────

function CardDia({
  painel, tipo, dia, hoje, setDia, atualizando, acoes,
}: {
  painel: PainelJornada;
  tipo: TipoJornada;
  dia: string;
  hoje: string;
  setDia: (d: string) => void;
  atualizando: boolean;
  acoes: AcoesJornada;
}) {
  const [busca, setBusca] = useState('');
  // Filtro de operador (só a liderança): '' = todos. Fica ao trocar de dia.
  const [operador, setOperador] = useState('');
  const [selecao, setSelecao] = useState<Set<string>>(() => new Set());
  const [confirmarApagar, setConfirmarApagar] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [lixeiraAberta, setLixeiraAberta] = useState(false);
  const [compartilhadosAberto, setCompartilhadosAberto] = useState(false);
  const euId = useAuth().perfil?.id ?? null;
  const ultimoClicado = useRef<number | null>(null);
  const totalPorDia = useMemo(
    () => new Map(painel.dias.map(d => [d.dia, Number(d.total)])),
    [painel.dias],
  );
  const dias = useMemo(() => diasDoMesAte(dia, hoje), [dia, hoje]);
  const maiorDoMes = Math.max(1, ...dias.map(d => totalPorDia.get(d) ?? 0));
  const totalDoMes = painel.dias.reduce((s, d) => s + Number(d.total), 0);
  const tira = useRef<HTMLDivElement>(null);

  // Mantém o dia aberto à vista na tira; trocar de dia limpa a seleção.
  useEffect(() => {
    const el = tira.current?.querySelector<HTMLElement>(`[data-dia="${dia}"]`);
    el?.scrollIntoView({ block: 'nearest', inline: 'center' });
    setSelecao(new Set());
    setBusca('');
    ultimoClicado.current = null;
  }, [dia]);

  useEffect(() => {
    if (!confirmarApagar) return;
    const t = window.setTimeout(() => setConfirmarApagar(false), 3000);
    return () => window.clearTimeout(t);
  }, [confirmarApagar]);

  /**
   * Quem pode aparecer no filtro e na tag: o grupo (do placar) e quem lançou
   * no dia sem estar mais nele. O operador só recebe os dele — não há filtro.
   */
  const verDeQuem = painel.pode_gerir;
  const operadores = useMemo(() => {
    if (!verDeQuem) return [];
    const doDia = new Map<string, { id: string; nome: string; no_dia: number }>();
    for (const p of painel.pessoas) doDia.set(p.id, { id: p.id, nome: p.nome, no_dia: 0 });
    for (const r of painel.registros) {
      const o = doDia.get(r.perfil_id) ?? { id: r.perfil_id, nome: r.nome ?? 'Sem nome', no_dia: 0 };
      o.no_dia += 1;
      doDia.set(r.perfil_id, o);
    }
    return [...doDia.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [verDeQuem, painel.pessoas, painel.registros]);
  const curtos = useMemo(() => nomesCurtos(operadores), [operadores]);
  const filtroOperador = verDeQuem && operador && operadores.some(o => o.id === operador) ? operador : '';
  const nomeFiltrado = operadores.find(o => o.id === filtroOperador)?.nome ?? null;

  // Trocar de operador desmarca: não copiar/apagar NR que saiu da vista.
  useEffect(() => { setSelecao(new Set()); ultimoClicado.current = null; }, [filtroOperador]);

  const doOperador = filtroOperador ? painel.registros.filter(r => r.perfil_id === filtroOperador) : painel.registros;
  const registros = busca ? doOperador.filter(r => r.nr.includes(busca)) : doOperador;
  const selecionados = painel.registros.filter(r => selecao.has(r.id));
  const todosMarcados = registros.length > 0 && registros.every(r => selecao.has(r.id));

  const inicioDoMes = `${dia.slice(0, 7)}-01`;
  const mesAnterior = somarDias(inicioDoMes, -1);
  const proximoMes = somarDias(inicioDoMes, 32).slice(0, 7) + '-01';
  const arquivo = tipo === 'acesso' ? 'acessos' : 'retencoes';

  /** Clique marca/desmarca; com Shift, marca do último clicado até aqui. */
  function alternar(i: number, shift: boolean) {
    setSelecao(atual => {
      const nova = new Set(atual);
      const marcar = !atual.has(registros[i].id);
      if (shift && ultimoClicado.current !== null) {
        const [a, b] = [Math.min(ultimoClicado.current, i), Math.max(ultimoClicado.current, i)];
        for (let k = a; k <= b; k++) {
          if (marcar) nova.add(registros[k].id); else nova.delete(registros[k].id);
        }
      } else if (marcar) nova.add(registros[i].id); else nova.delete(registros[i].id);
      return nova;
    });
    ultimoClicado.current = i;
  }

  /** O «Desfazer» do aviso de apagado: tira da lixeira na hora. */
  function desfazer(ids: string[]) {
    acoes.restaurar(ids)
      .then(r => {
        if (r.restaurados) toast.success(`${r.restaurados} NR(s) de volta.`);
        if (r.repetidos) toast.warning('Não voltou: esse NR já foi lançado de novo pela mesma pessoa neste mês.');
      })
      .catch(e => toast.error((e as Error).message));
  }

  /** Clique no nome: marca os NRs da pessoa (os à vista); se já estão todos marcados, desmarca só eles. */
  function alternarPessoa(perfilId: string) {
    const dela = registros.filter(r => r.perfil_id === perfilId).map(r => r.id);
    setSelecao(atual => {
      const nova = new Set(atual);
      const todos = dela.every(id => atual.has(id));
      for (const id of dela) if (todos) nova.delete(id); else nova.add(id);
      return nova;
    });
    ultimoClicado.current = null;
  }

  function marcarTodos() {
    setSelecao(todosMarcados ? new Set() : new Set(registros.map(r => r.id)));
  }

  function copiar() {
    void navigator.clipboard?.writeText(selecionados.map(r => r.nr).join('\n'));
    toast.success(`${selecionados.length} NR(s) copiado(s).`);
  }

  function baixar(lista: { nr: string; data: string }[], nome: string) {
    if (lista.length === 0) { toast.info('Nada para baixar.'); return; }
    baixarCsv(nome, paraCsv(lista));
  }

  async function baixarMes() {
    setOcupado(true);
    try {
      const fim = somarDias(proximoMes, -1);
      baixar(await acoes.exportar(inicioDoMes, fim < hoje ? fim : hoje), `${arquivo}-${dia.slice(0, 7)}.csv`);
    } catch (erro) {
      toast.error((erro as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  async function apagarSelecionados() {
    if (!confirmarApagar) { setConfirmarApagar(true); return; }
    setOcupado(true);
    try {
      const ids = selecionados.map(r => r.id);
      const n = await acoes.excluirLote(ids);
      toast.success(`${n} NR(s) foram para a lixeira.`, {
        action: { label: 'Desfazer', onClick: () => desfazer(ids) },
        duration: 8000,
      });
      setSelecao(new Set());
    } catch (erro) {
      toast.error((erro as Error).message);
    } finally {
      setOcupado(false);
      setConfirmarApagar(false);
    }
  }

  return (
    <section className="rounded-xl border bg-card min-w-0">
      {/* Dia aberto + navegação */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2 px-3 py-2.5 border-b">
        <CalendarDays className="h-4 w-4 text-primary shrink-0" />
        <h2 className="text-sm font-semibold capitalize">{diaPorExtenso(dia)}</h2>
        <span className="text-xs text-muted-foreground">
          · {filtroOperador
            ? `${contagem(doOperador.length, tipo)} de ${nomeFiltrado} (de ${painel.registros.length})`
            : contagem(painel.registros.length, tipo)}
        </span>
        {(atualizando || ocupado) && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        <div className="ml-auto flex items-center gap-1">
          {painel.registros.length > 5 && (
            <div className="relative w-32 mr-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={busca}
                onChange={e => setBusca(e.target.value.replace(/\D/g, ''))}
                inputMode="numeric"
                placeholder="Buscar NR"
                className="h-8 pl-7 text-sm"
              />
            </div>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 px-2.5" disabled={ocupado}>
                <Download className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Baixar</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => baixar(
                  doOperador,
                  `${arquivo}-${dia}${nomeFiltrado ? `-${curtos.get(filtroOperador)?.replace(/\W+/g, '') || 'operador'}` : ''}.csv`,
                )}
              >
                NRs do dia{nomeFiltrado ? ` de ${curtos.get(filtroOperador)}` : ''} ({doOperador.length})
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void baixarMes()}>
                NRs do mês de <span className="capitalize">{nomeDoMes(dia)}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {/* Os clientes do mês com mais de uma pessoa (10/11/2026). */}
          {painel.compartilhados.length > 0 && (
            <Button
              variant="outline" size="sm"
              className="h-8 px-2.5 border-warning/50 text-warning hover:bg-warning/10 hover:text-warning"
              onClick={() => setCompartilhadosAberto(true)}
              title={`Clientes de ${nomeDoMes(dia)} lançados por mais de uma pessoa`}
            >
              <Users className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Compartilhados</span>
              <span className="tabular-nums">{painel.compartilhados.length}</span>
            </Button>
          )}
          <Button
            variant="outline" size="icon" className="h-8 w-8"
            onClick={() => setLixeiraAberta(true)}
            title="Lixeira: o que foi apagado nos últimos 30 dias"
            aria-label="Lixeira"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setDia(somarDias(dia, -1))} aria-label="Dia anterior">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Input
            type="date"
            value={dia}
            max={hoje}
            onChange={e => e.target.value && setDia(e.target.value > hoje ? hoje : e.target.value)}
            className="h-8 w-[136px]"
            aria-label="Escolher dia"
          />
          <Button
            variant="outline" size="icon" className="h-8 w-8"
            onClick={() => setDia(somarDias(dia, 1))}
            disabled={dia >= hoje}
            aria-label="Próximo dia"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          {dia !== hoje && (
            <Button variant="secondary" size="sm" className="h-8 px-2.5" onClick={() => setDia(hoje)}>Hoje</Button>
          )}
        </div>
      </div>

      {/* Filtro de operador (só a liderança), numa linha só dele */}
      {verDeQuem && operadores.length > 0 && (
        <div className="flex items-center gap-2 px-3 h-11 border-b">
          <Users className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-xs font-medium text-muted-foreground shrink-0">Operador</span>
          <Select value={filtroOperador || TODOS} onValueChange={v => setOperador(v === TODOS ? '' : v)}>
            <SelectTrigger
              className={cn(
                'h-8 w-[240px] max-w-full text-sm',
                filtroOperador && 'border-primary/50 bg-primary/5 font-medium',
              )}
              aria-label="Filtrar por operador"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todos os operadores ({painel.registros.length})</SelectItem>
              {operadores.map(o => (
                <SelectItem key={o.id} value={o.id}>
                  {o.nome} <span className="text-muted-foreground tabular-nums">({o.no_dia})</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {filtroOperador && (
            <Button
              variant="ghost" size="sm" className="h-8 px-2 text-xs text-muted-foreground"
              onClick={() => setOperador('')}
            >
              <X className="h-3.5 w-3.5" /> Limpar
            </Button>
          )}
        </div>
      )}

      {/* Tira do mês: dia e total; a linha embaixo cresce com o total */}
      <div className="px-3 pt-2 pb-2 border-b">
        <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
          <button type="button" className="hover:text-foreground" onClick={() => setDia(mesAnterior)}>‹ anterior</button>
          <span className="capitalize">{mesPorExtenso(dia)} · {contagem(totalDoMes, tipo)}</span>
          {proximoMes <= hoje
            ? <button type="button" className="hover:text-foreground" onClick={() => setDia(proximoMes)}>próximo ›</button>
            : <span className="w-[52px]" />}
        </div>
        <div ref={tira} className="flex gap-1 overflow-x-auto pb-1">
          {dias.map(d => {
            const total = totalPorDia.get(d) ?? 0;
            const aberto = d === dia;
            const fimDeSemana = ['sáb', 'dom'].includes(diaDaSemana(d));
            return (
              <button
                key={d}
                type="button"
                data-dia={d}
                onClick={() => setDia(d)}
                title={`${diaDaSemana(d)} ${d.split('-').reverse().join('/')} · ${contagem(total, tipo)}`}
                className={cn(
                  'shrink-0 min-w-[34px] flex-1 rounded-md px-1 pt-1 pb-0.5 flex flex-col items-center transition-colors',
                  aberto ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
                  !aberto && fimDeSemana && 'opacity-50',
                )}
              >
                <span className="text-xs font-semibold leading-none">{Number(d.slice(8))}</span>
                <span className={cn('text-[10px] tabular-nums leading-tight', !aberto && !total && 'text-muted-foreground')}>
                  {total}
                </span>
                <span className="h-[3px] w-full rounded-full bg-muted/60 overflow-hidden">
                  <span
                    className={cn('block h-full rounded-full', aberto ? 'bg-primary-foreground/80' : 'bg-primary/70')}
                    style={{ width: `${(total / maiorDoMes) * 100}%` }}
                  />
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Seleção: marcar todos e o que fazer com os marcados */}
      {registros.length > 0 && (
        <div className={cn('flex items-center gap-2 px-3 h-10 border-b text-sm', selecionados.length > 0 && 'bg-primary/5')}>
          <Checkbox checked={todosMarcados} onCheckedChange={marcarTodos} aria-label="Marcar todos" />
          {selecionados.length === 0 ? (
            <span className="text-xs text-muted-foreground">
              Marcar todos · Shift + clique marca um intervalo
            </span>
          ) : (
            <>
              <span className="font-medium tabular-nums">{selecionados.length} marcado(s)</span>
              <div className="ml-auto flex items-center gap-1">
                <Button variant="ghost" size="sm" className="h-7 px-2" onClick={copiar}>
                  <Copy className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Copiar</span>
                </Button>
                <Button
                  variant="ghost" size="sm" className="h-7 px-2"
                  onClick={() => baixar(selecionados, `${arquivo}-${dia}-marcados.csv`)}
                >
                  <Download className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Baixar</span>
                </Button>
                <Button
                  variant={confirmarApagar ? 'destructive' : 'ghost'} size="sm" className="h-7 px-2"
                  onClick={apagarSelecionados}
                  disabled={ocupado}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span className={cn(!confirmarApagar && 'hidden sm:inline')}>
                    {confirmarApagar ? `Apagar ${selecionados.length}?` : 'Apagar'}
                  </span>
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSelecao(new Set())} aria-label="Desmarcar">
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Lançamentos do dia: só o NR, em colunas para não esticar a página */}
      {registros.length === 0 ? (
        <p className="px-3 py-6 text-sm text-muted-foreground text-center">
          {busca
            ? 'Nada com essa busca.'
            : nomeFiltrado ? `${nomeFiltrado} não lançou neste dia.` : 'Nenhum lançamento neste dia.'}
        </p>
      ) : (
        <ul className="grid sm:grid-cols-2 xl:grid-cols-3 gap-x-2 p-1.5 max-h-[340px] overflow-y-auto select-none">
          {registros.map((r, i) => (
            <LinhaRegistro
              key={r.id}
              registro={r}
              ordem={registros.length - i}
              dono={verDeQuem ? {
                curto: curtos.get(r.perfil_id) ?? r.nome ?? '?',
                nome: r.nome ?? 'Sem nome',
                aoClicar: () => alternarPessoa(r.perfil_id),
              } : null}
              marcado={selecao.has(r.id)}
              aoMarcar={shift => alternar(i, shift)}
              aoExcluir={acoes.excluir}
              aoDesfazer={() => desfazer([r.id])}
            />
          ))}
        </ul>
      )}

      <DialogLixeira
        aberto={lixeiraAberta}
        aoFechar={() => setLixeiraAberta(false)}
        carregar={acoes.lixeira}
        aoRestaurar={acoes.restaurar}
      />
      <DialogCompartilhados
        aberto={compartilhadosAberto}
        aoFechar={() => setCompartilhadosAberto(false)}
        lista={painel.compartilhados}
        nomeDoMes={nomeDoMes(dia)}
        euId={euId}
        aoAbrirDia={setDia}
      />
    </section>
  );
}

function LinhaRegistro({
  registro, ordem, dono, marcado, aoMarcar, aoExcluir, aoDesfazer,
}: {
  registro: RegistroJornada;
  ordem: number;
  /** A tag de quem lançou — só para a liderança (o operador só vê os dele). */
  dono: { curto: string; nome: string; aoClicar: () => void } | null;
  marcado: boolean;
  aoMarcar: (shift: boolean) => void;
  aoExcluir: (id: string) => Promise<void>;
  aoDesfazer: () => void;
}) {
  const [confirmar, setConfirmar] = useState(false);
  const [apagando, setApagando] = useState(false);

  useEffect(() => {
    if (!confirmar) return;
    const t = window.setTimeout(() => setConfirmar(false), 3000);
    return () => window.clearTimeout(t);
  }, [confirmar]);

  async function apagar(e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirmar) { setConfirmar(true); return; }
    setApagando(true);
    try {
      await aoExcluir(registro.id);
      toast.success(`NR ${registro.nr} foi para a lixeira.`, {
        action: { label: 'Desfazer', onClick: aoDesfazer },
        duration: 8000,
      });
    } catch (erro) {
      toast.error((erro as Error).message);
      setApagando(false);
    }
  }

  return (
    <li
      className={cn(
        'group flex items-center gap-2 rounded-md px-1.5 h-8 cursor-pointer min-w-0',
        marcado ? 'bg-primary/10' : 'hover:bg-muted/50',
      )}
      onClick={e => aoMarcar(e.shiftKey)}
    >
      <Checkbox
        checked={marcado}
        onClick={e => { e.stopPropagation(); aoMarcar(e.shiftKey); }}
        aria-label={`Marcar NR ${registro.nr}`}
      />
      <span className="w-6 text-[11px] text-muted-foreground tabular-nums text-right shrink-0">{ordem}</span>
      <button
        type="button"
        className="font-mono text-sm font-medium hover:text-primary shrink-0"
        title="Copiar NR"
        onClick={e => {
          e.stopPropagation();
          void navigator.clipboard?.writeText(registro.nr);
          toast.success('NR copiado.');
        }}
      >
        {registro.nr}
      </button>
      {dono && (
        <button
          type="button"
          className="min-w-0 truncate rounded px-1.5 h-5 text-[11px] font-medium bg-primary/10 text-primary hover:bg-primary/20"
          title={`${dono.nome} — clique para marcar/desmarcar só os NRs desta pessoa`}
          onClick={e => {
            e.stopPropagation();
            dono.aoClicar();
          }}
        >
          {dono.curto}
        </button>
      )}
      {/* O cliente também está com outra pessoa neste mês (10/11/2026). */}
      {registro.outros.length > 0 && (
        <span
          className="min-w-0 truncate inline-flex items-center gap-1 rounded px-1.5 h-5 text-[11px] font-medium bg-warning/15 text-warning"
          title={`Também com ${textoDosOutros(registro.outros)} neste mês`}
          aria-label={`Também com ${textoDosOutros(registro.outros)}`}
        >
          <Users className="h-3 w-3 shrink-0" />
          {registro.outros.length === 1
            ? `${(registro.outros[0].nome ?? '').trim().split(/\s+/)[0] || 'outra pessoa'} · ${diaMes(registro.outros[0].data)}`
            : `+${registro.outros.length}`}
        </span>
      )}
      <span className="ml-auto text-[11px] text-muted-foreground tabular-nums shrink-0">{horaSaoPaulo(registro.criado_em)}</span>
      <Button
        variant={confirmar ? 'destructive' : 'ghost'}
        size="sm"
        className={cn(
          'h-6 shrink-0',
          confirmar ? 'px-1.5' : 'w-6 px-0 opacity-40 group-hover:opacity-100 focus-visible:opacity-100',
        )}
        onClick={apagar}
        disabled={apagando}
        aria-label="Apagar lançamento"
      >
        {apagando ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
        {confirmar && !apagando && <span className="text-[11px]">Apagar?</span>}
      </Button>
    </li>
  );
}

// ─── Equipe ─────────────────────────────────────────────────────────────────

function CardEquipe({
  painel, tipo, dia, aoAbrirMeta,
}: {
  painel: PainelJornada;
  tipo: TipoJornada;
  dia: string;
  /** Só para a liderança: abre as metas (com a pessoa clicada em foco). */
  aoAbrirMeta?: (perfilId?: string) => void;
}) {
  const { perfil } = useAuth();
  const pessoas = [...painel.pessoas].sort((a, b) => b.no_mes - a.no_mes || a.nome.localeCompare(b.nome));
  const maior = Math.max(1, ...pessoas.map(p => Math.max(p.no_mes, p.meta ?? 0)));
  /** A próxima meta de cada um (até 4 no mês) — é contra ela que a barra mede. */
  const situacao = (p: PessoaPlacar) => situacaoMetas(p.no_mes, p.metas.length ? p.metas : (p.meta ? [p.meta] : []));
  const total = pessoas.reduce((s, p) => s + p.no_mes, 0);

  return (
    <section className="rounded-xl border bg-card">
      <div className="flex items-center gap-2 px-3 h-11 border-b">
        <Users className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">Equipe</h2>
        <span className="text-xs text-muted-foreground">
          · <span className="capitalize">{nomeDoMes(dia)}</span> · {total.toLocaleString('pt-BR')}
        </span>
        {aoAbrirMeta && (
          <Button variant="ghost" size="sm" className="ml-auto h-7 px-2 text-xs" onClick={() => aoAbrirMeta()}>
            <Settings2 className="h-3.5 w-3.5" /> Metas
          </Button>
        )}
      </div>
      {pessoas.length === 0 ? (
        <p className="px-3 py-6 text-sm text-muted-foreground text-center">Ninguém no grupo ainda.</p>
      ) : (
        <ul className="p-1.5 max-h-[380px] overflow-y-auto">
          {pessoas.map((p, i) => {
            const feito = p.no_mes;
            const sit = situacao(p);
            const bateu = !!p.meta && feito >= p.meta;
            const alvo = sit.alvo ?? p.meta;
            const souEu = p.id === perfil?.id;
            const podeClicar = !!aoAbrirMeta && p.no_grupo;
            const conteudo = (
              <>
                <span className="w-4 text-[11px] text-muted-foreground tabular-nums text-right shrink-0">{i + 1}</span>
                {p.foto_url ? (
                  <img src={p.foto_url} alt="" className="h-6 w-6 rounded-full object-cover shrink-0" />
                ) : (
                  <span className="h-6 w-6 rounded-full bg-muted text-[10px] font-semibold flex items-center justify-center shrink-0">
                    {iniciais(p.nome)}
                  </span>
                )}
                <span className={cn('text-sm truncate flex-1 min-w-0 text-left', souEu && 'font-semibold text-primary')}>
                  {p.nome}{souEu ? ' (você)' : ''}
                </span>
                <span className="w-12 h-1.5 rounded-full bg-muted overflow-hidden shrink-0">
                  <span
                    className={cn('block h-full rounded-full', bateu ? 'bg-success' : 'bg-primary')}
                    style={{ width: `${Math.min(100, (feito / (alvo ?? maior)) * 100)}%` }}
                  />
                </span>
                {p.metas.length > 1 && sit.batidas > 0 && (
                  <span
                    className="text-[10px] font-semibold text-success shrink-0"
                    title={`Bateu ${sit.batidas} de ${p.metas.length} metas`}
                  >
                    {ORDINAIS[sit.batidas - 1]}✓
                  </span>
                )}
                <span className={cn('w-16 text-right text-sm font-semibold tabular-nums shrink-0', bateu && 'text-success')}>
                  {feito}
                  {alvo ? (
                    <span className={cn('text-[11px] font-normal', p.meta_propria ? 'text-primary' : 'text-muted-foreground')}>
                      /{alvo}{p.meta_propria ? '*' : ''}
                    </span>
                  ) : null}
                </span>
              </>
            );
            const dica = `${p.nome} · ${contagem(feito, tipo)} no mês, ${contagem(p.no_dia, tipo)} no dia aberto`
              + (p.meta
                ? ` · ${p.metas.length > 1 ? `metas ${p.metas.join(' / ')}` : `meta ${p.meta}`}`
                  + (p.meta_propria ? ' (individual)' : ' (do grupo)')
                : '');
            const classe = cn(
              'w-full flex items-center gap-2 rounded-md px-1.5 h-8',
              souEu && 'bg-primary/5',
              !p.no_grupo && 'opacity-60',
            );
            return (
              <li key={p.id}>
                {podeClicar ? (
                  <button
                    type="button"
                    className={cn(classe, 'hover:bg-muted/60')}
                    title={`${dica} — clique para mudar a meta`}
                    onClick={() => aoAbrirMeta(p.id)}
                  >
                    {conteudo}
                  </button>
                ) : (
                  <div className={classe} title={dica}>{conteudo}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {pessoas.some(p => p.meta_propria) && (
        <p className="px-3 pb-2 text-[11px] text-muted-foreground">
          <span className="text-primary">*</span> meta individual
        </p>
      )}
    </section>
  );
}
