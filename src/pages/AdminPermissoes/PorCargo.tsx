/**
 * PorCargo — a permissão que vale para todo mundo daquele cargo.
 *
 * ## O desenho, e o que ele conserta
 *
 * 1. **Duas colunas.** Os cargos ficam numa coluna fixa à esquerda, com quantas
 *    permissões cada um tem. Antes eram pílulas numa fileira no topo: para
 *    comparar dois cargos era preciso trocar e decorar o que se viu.
 * 2. **Cartões, não linhas.** Cada permissão é um cartão estreito com o
 *    interruptor ao lado do rótulo. Em linha de largura total, num monitor
 *    grande, o controle ficava a mil e seiscentos pixels do texto que governa —
 *    e é aí que se erra o clique.
 * 3. **Busca.** Com mais de oitenta chaves, rolar para achar «quem exclui
 *    equipe» não é navegação, é garimpo.
 * 4. **A barra de salvar acompanha a rolagem**, porque a alteração acontece no
 *    fim da página e o botão ficava no começo.
 *
 * Os oito cargos aparecem — `ouvidoria` era invisível na versão antiga —, e
 * `administrador`/`super_admin` aparecem em leitura, com a explicação de por
 * que não são editáveis.
 *
 * ## Próprias do setor (26/10/2026)
 *
 * Embaixo dos cargos ficam os mapas próprios de setor («Operador -
 * Manutenção»): quem está naquele setor com aquele cargo usa este mapa, e a
 * chave que ele não tiver vem do cargo. Nasce como cópia do cargo, e apagar
 * devolve a pessoa às permissões do cargo (migration 20261026120000).
 */
import { useMemo, useState } from 'react';
import { Save, RotateCcw, ShieldCheck, Loader2, Search, X, Plus, Building2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/supabase';
import { PERFIL_LABELS } from '@/lib/index';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { useCadastroDeCargos } from '@/hooks/useCargos';
import {
  CARGOS_CONFIGURAVEIS, CARGOS_ACESSO_TOTAL,
  catalogoDoTenant, gruposDoTenant, permissoesPadraoDoCargo,
} from '@/lib/permissoes-catalogo';
import { montarPorAba } from '@/lib/permissoes-abas';
import { cn } from '@/lib/utils';
import { BlocoAba } from './BlocoAba';
import { useRascunho } from './useRascunho';
import { rotuloNoSetor, useSetoresDaEmpresa } from './useSetoresDaEmpresa';

/** O que está aberto: um cargo, ou o mapa dele num setor. */
interface Alvo {
  cargo: string;
  setorId: string | null;
}

export function PorCargo() {
  const { empresa, tenantSlug } = useEmpresa();
  const { todasPermissoes, todasPermissoesSetor, refresh } = useCargoPermissoes();
  const setores = useSetoresDaEmpresa(empresa?.id);
  // As listas mudam quando o cadastro de cargos chega do banco (cargo novo
  // criado em Configurações > Cargos aparece aqui sem deploy).
  const cadastro = useCadastroDeCargos();
  const TODOS_OS_CARGOS = useMemo(
    () => [...CARGOS_CONFIGURAVEIS, ...CARGOS_ACESSO_TOTAL],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- as listas mudam com o cadastro
    [cadastro],
  );
  /** Os cargos que podem ter mapa de setor: os de setor, sem acesso total. */
  const cargosDeSetor = useMemo(
    () => cadastro.filter(c => c.ativo && c.pertence_a_setor && !c.acesso_total).map(c => c.slug as string),
    [cadastro],
  );

  const [alvo, setAlvo] = useState<Alvo>({ cargo: 'operador', setorId: null });
  const { cargo, setorId } = alvo;
  const [salvando, setSalvando] = useState(false);
  const [busca, setBusca] = useState('');
  const [criando, setCriando] = useState<{ setorId: string; cargo: string } | null>(null);
  const rascunho = useRascunho<boolean>();

  const nomeDoSetor = (id: string) => setores.find(s => s.id === id)?.nome ?? 'setor';
  /** O mapa próprio do cargo no setor (vazio quando não há). */
  const doSetor = (c: string, s: string | null) =>
    (s ? todasPermissoesSetor.find(r => r.cargo === c && r.setor_id === s)?.permissoes : undefined) ?? {};
  const rotuloDoAlvo = setorId ? rotuloNoSetor(cargo, nomeDoSetor(setorId)) : (PERFIL_LABELS[cargo] ?? cargo);

  /** Os mapas de setor, por setor e na ordem dos cargos. */
  const mapasDeSetor = useMemo(() => {
    const ordem = (c: string) => { const i = TODOS_OS_CARGOS.indexOf(c as never); return i < 0 ? 99 : i; };
    return [...todasPermissoesSetor].sort((a, b) =>
      nomeDoSetor(a.setor_id).localeCompare(nomeDoSetor(b.setor_id)) || ordem(a.cargo) - ordem(b.cargo));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nomeDoSetor lê `setores`
  }, [todasPermissoesSetor, setores, TODOS_OS_CARGOS]);

  const catalogo = useMemo(() => catalogoDoTenant(tenantSlug), [tenantSlug]);
  const grupos   = useMemo(() => gruposDoTenant(tenantSlug), [tenantSlug]);

  /*
   * O catálogo remontado na ordem em que a pergunta nasce: cargo → aba → o que
   * ele vê e o que ele faz ali. Antes a tela listava por categoria, e responder
   * "o que o líder pode no Analítico?" exigia caçar a chave da aba num grupo, o
   * alcance em outro e as ações num terceiro.
   */
  const { blocos } = useMemo(
    () => montarPorAba(catalogo, grupos, tenantSlug),
    [catalogo, grupos, tenantSlug],
  );

  const acessoTotal = (CARGOS_ACESSO_TOTAL as readonly string[]).includes(cargo);
  const filtro = busca.trim().toLowerCase();

  /**
   * O valor gravado. Depois da migration `20260815154058` toda chave existe em
   * todo cargo; o `permissoesPadraoDoCargo` só cobre a janela entre o deploy do
   * frontend e a aplicação da migration.
   */
  const salvo = useMemo(() => {
    const doBanco = todasPermissoes.find(r => r.cargo === cargo)?.permissoes;
    const doCargo = doBanco && Object.keys(doBanco).length > 0
      ? doBanco
      : permissoesPadraoDoCargo(cargo);
    // No mapa de setor, o que vale é o do cargo com o do setor por cima — o
    // mesmo que a pessoa do setor recebe (`mapaDoCargoNoSetor`).
    return { ...doCargo, ...doSetor(cargo, setorId) };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- doSetor lê todasPermissoesSetor
  }, [todasPermissoes, todasPermissoesSetor, cargo, setorId]);

  const valorDe = (key: string): boolean =>
    key in rascunho.alteracoes ? rascunho.alteracoes[key] : !!salvo[key];

  /** Quantas permissões cada cargo tem — o número que a coluna da esquerda mostra. */
  const contarDe = useMemo(() => (c: string, setor: string | null = null): number => {
    if ((CARGOS_ACESSO_TOTAL as readonly string[]).includes(c)) return catalogo.length;
    const doCargo = todasPermissoes.find(r => r.cargo === c)?.permissoes
      ?? permissoesPadraoDoCargo(c);
    const mapa = { ...doCargo, ...doSetor(c, setor) };
    return catalogo.filter(p => !!mapa[p.key]).length;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- doSetor lê todasPermissoesSetor
  }, [todasPermissoes, todasPermissoesSetor, catalogo]);

  function trocarAlvo(novo: Alvo) {
    if (rascunho.sujo && !confirm('Descartar as alterações não salvas?')) return;
    rascunho.descartar();
    setAlvo(novo);
  }

  /** Cria o mapa do cargo no setor, cópia do mapa do cargo, e o abre. */
  async function criarMapaDeSetor() {
    if (!empresa?.id || !criando) return;
    const doCargo = todasPermissoes.find(r => r.cargo === criando.cargo)?.permissoes
      ?? permissoesPadraoDoCargo(criando.cargo);
    const { error } = await supabase
      .from('cargos_permissoes_setor')
      .insert({ empresa_id: empresa.id, setor_id: criando.setorId, cargo: criando.cargo, permissoes: doCargo });
    if (error) {
      toast.error('Não foi possível criar. ' + error.message);
      return;
    }
    toast.success(`${rotuloNoSetor(criando.cargo, nomeDoSetor(criando.setorId))} criado, igual ao cargo.`);
    rascunho.descartar();
    setAlvo({ cargo: criando.cargo, setorId: criando.setorId });
    setCriando(null);
    await refresh();
  }

  /** Apaga o mapa do setor: quem está lá volta às permissões do cargo. */
  async function removerMapaDeSetor() {
    if (!setorId) return;
    if (!confirm(`Remover as permissões próprias de ${rotuloDoAlvo}? Quem está no setor volta às permissões de ${PERFIL_LABELS[cargo] ?? cargo}.`)) return;
    const { error } = await supabase
      .from('cargos_permissoes_setor')
      .delete()
      .eq('setor_id', setorId)
      .eq('cargo', cargo);
    if (error) {
      toast.error('Não foi possível remover. ' + error.message);
      return;
    }
    toast.success(`${rotuloDoAlvo} removido.`);
    rascunho.descartar();
    setAlvo({ cargo, setorId: null });
    await refresh();
  }

  function alternar(key: string) {
    if (acessoTotal) return;
    rascunho.definir(key, !valorDe(key));
    rascunho.podar(k => !!salvo[k]);
  }

  async function salvar() {
    if (!empresa?.id || !rascunho.sujo) return;
    setSalvando(true);
    try {
      // Grava o mapa INTEIRO, nunca só o que mudou: chave ausente era
      // exatamente o defeito que esta versão veio corrigir.
      //
      // E inteiro quer dizer o que JÁ estava gravado mais o que a tela mostra.
      // Até 02/10/2026 ia só o recorte deste produto: no Comercial, cada
      // «Salvar» apagava `ver_painel_lider`, `ver_tickets` e as outras chaves
      // que a tela não mostrava — e o líder perdia a aba sem ninguém tê-la
      // desligado. Chave fora do recorte não é decisão desta tela; fica como
      // estava.
      const completo = {
        ...salvo,
        ...Object.fromEntries(catalogo.map(p => [p.key, valorDe(p.key)])),
      };
      const { error } = setorId
        ? await supabase
          .from('cargos_permissoes_setor')
          .upsert(
            { empresa_id: empresa.id, setor_id: setorId, cargo, permissoes: completo },
            { onConflict: 'setor_id,cargo' },
          )
        : await supabase
          .from('cargos_permissoes')
          .upsert(
            { empresa_id: empresa.id, cargo, permissoes: completo },
            { onConflict: 'empresa_id,cargo' },
          );
      if (error) throw error;
      toast.success(`Permissões de ${rotuloDoAlvo} salvas.`);
      rascunho.descartar();
      await refresh();
    } catch (e) {
      toast.error('Não foi possível salvar. ' + (e instanceof Error ? e.message : ''));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">

      {/* ── Coluna dos cargos ───────────────────────────────────────────── */}
      <aside className="lg:sticky lg:top-4 lg:w-56 lg:shrink-0">
        <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Cargo
        </p>
        <div className="flex gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
          {TODOS_OS_CARGOS.map(c => {
            const total = (CARGOS_ACESSO_TOTAL as readonly string[]).includes(c);
            const ativo = cargo === c && !setorId;
            return (
              <button
                key={c}
                onClick={() => trocarAlvo({ cargo: c, setorId: null })}
                className={cn(
                  'flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors lg:w-full',
                  ativo
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground',
                )}
              >
                <span className={cn(
                  'h-6 w-1 shrink-0 rounded-full transition-colors',
                  ativo ? 'bg-primary' : 'bg-transparent',
                )} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1 text-[13px] font-medium">
                    {PERFIL_LABELS[c] ?? c}
                    {total && <ShieldCheck className="h-3 w-3 text-primary/70" />}
                  </span>
                  <span className="text-[10px] tabular-nums text-muted-foreground">
                    {total ? 'acesso total' : `${contarDe(c)} de ${catalogo.length}`}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {/* ── Próprias do setor ── */}
        <p className="mb-2 mt-5 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Próprias do setor
        </p>
        <div className="flex gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
          {mapasDeSetor.map(m => {
            const ativo = cargo === m.cargo && setorId === m.setor_id;
            return (
              <button
                key={m.id}
                onClick={() => trocarAlvo({ cargo: m.cargo, setorId: m.setor_id })}
                className={cn(
                  'flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors lg:w-full',
                  ativo
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground',
                )}
              >
                <span className={cn(
                  'h-6 w-1 shrink-0 rounded-full transition-colors',
                  ativo ? 'bg-primary' : 'bg-transparent',
                )} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1 text-[13px] font-medium">
                    {rotuloNoSetor(m.cargo, nomeDoSetor(m.setor_id))}
                  </span>
                  <span className="text-[10px] tabular-nums text-muted-foreground">
                    {`${contarDe(m.cargo, m.setor_id)} de ${catalogo.length}`}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {criando ? (
          <div className="mt-2 space-y-2 rounded-lg border border-border bg-card p-3">
            <label className="block text-[11px] text-muted-foreground">
              Setor
              <select
                value={criando.setorId}
                onChange={e => setCriando({ ...criando, setorId: e.target.value })}
                className="mt-1 h-8 w-full rounded-md border bg-background px-2 text-sm text-foreground"
              >
                <option value="">Escolha…</option>
                {setores.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
              </select>
            </label>
            <label className="block text-[11px] text-muted-foreground">
              Cargo
              <select
                value={criando.cargo}
                onChange={e => setCriando({ ...criando, cargo: e.target.value })}
                className="mt-1 h-8 w-full rounded-md border bg-background px-2 text-sm text-foreground"
              >
                {cargosDeSetor.map(c => (
                  <option key={c} value={c}
                    disabled={!!criando.setorId && todasPermissoesSetor.some(m => m.cargo === c && m.setor_id === criando.setorId)}>
                    {PERFIL_LABELS[c] ?? c}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Começa igual ao cargo. Quem está no setor com esse cargo passa a usar este mapa.
            </p>
            <div className="flex justify-end gap-1.5">
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setCriando(null)}>
                Cancelar
              </Button>
              <Button
                size="sm" className="h-7 text-xs" onClick={criarMapaDeSetor}
                disabled={!criando.setorId || todasPermissoesSetor.some(m => m.cargo === criando.cargo && m.setor_id === criando.setorId)}
              >
                Criar
              </Button>
            </div>
          </div>
        ) : (
          <Button
            size="sm" variant="outline" className="mt-2 h-8 w-full gap-1 text-xs"
            onClick={() => setCriando({ setorId: '', cargo: cargosDeSetor[0] ?? 'operador' })}
          >
            <Plus className="h-3.5 w-3.5" /> Permissões próprias de um setor
          </Button>
        )}
      </aside>

      {/* ── Conteúdo ────────────────────────────────────────────────────── */}
      <div className="min-w-0 flex-1 space-y-3">

        {acessoTotal ? (
          <div className="rounded-xl border border-border bg-muted/20 px-4 py-4 text-sm">
            <p className="flex items-center gap-1.5 font-semibold text-foreground">
              <ShieldCheck className="h-4 w-4" />
              {PERFIL_LABELS[cargo]} tem acesso total, por construção
            </p>
            <p className="mt-1 leading-relaxed text-muted-foreground">
              Não é uma lista de permissões que dá esse acesso — é o próprio cargo.
              A migration <code className="text-xs">20260812b</code> estabeleceu isso no
              banco, e o app responde &laquo;pode&raquo; antes mesmo de consultar a tabela.
              Para tirar o acesso de alguém, <strong>troque o cargo da pessoa</strong>.
            </p>
            {/* A exceção existe; omiti-la faria o painel prometer mais do que
                entrega, justamente no ponto em que a diferença aparece. */}
            <p className="mt-2 border-t border-border/60 pt-2 leading-relaxed text-muted-foreground">
              <strong className="text-foreground">Uma exceção:</strong> escrever em
              mês já fechado não vem junto. Só o super admin passa por esse cadeado,
              e ele passa por regra de código — não por esta tela. É o único poder
              aqui que ninguém herda de &laquo;acesso total&raquo;.
            </p>
          </div>
        ) : (
          <>
            {setorId && (
              <div className="flex flex-wrap items-start gap-3 rounded-xl border border-border bg-muted/20 px-4 py-3 text-sm">
                <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-foreground">{rotuloDoAlvo}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                    Vale para quem é {PERFIL_LABELS[cargo] ?? cargo} no setor {nomeDoSetor(setorId)}, no
                    lugar das permissões do cargo. Permissão nova que aparecer depois vem do cargo até
                    ser ligada ou desligada aqui.
                  </p>
                </div>
                <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs text-muted-foreground"
                  onClick={removerMapaDeSetor}>
                  <Trash2 className="h-3.5 w-3.5" /> Remover
                </Button>
              </div>
            )}

            {/* Busca + barra de alterações, coladas no topo ao rolar */}
            <div className="sticky top-0 z-10 -mx-1 space-y-2 bg-background/95 px-1 py-2 backdrop-blur">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={busca}
                  onChange={e => setBusca(e.target.value)}
                  placeholder="Buscar permissão — «excluir equipe», «setor», «importar»…"
                  className="h-9 pl-9 pr-9 text-sm"
                />
                {busca && (
                  <button
                    type="button"
                    onClick={() => setBusca('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                    aria-label="Limpar busca"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {rascunho.sujo && (
                <div className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2">
                  <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
                    {rascunho.total} alteração{rascunho.total !== 1 ? 'ões' : ''} não salva
                    {rascunho.total !== 1 ? 's' : ''}
                  </span>
                  <div className="ml-auto flex gap-1.5">
                    <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs"
                      onClick={rascunho.descartar}>
                      <RotateCcw className="h-3.5 w-3.5" /> Descartar
                    </Button>
                    <Button size="sm" className="h-7 gap-1 text-xs" onClick={salvar} disabled={salvando}>
                      {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                      Salvar
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {blocos.map(b => (
              <BlocoAba
                key={b.aba}
                bloco={b}
                valorDe={valorDe}
                alternar={alternar}
                alterada={k => k in rascunho.alteracoes}
                somenteLeitura={acessoTotal}
                filtro={filtro}
              />
            ))}

          </>
        )}
      </div>
    </div>
  );
}
