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
 */
import { useMemo, useState } from 'react';
import { Save, RotateCcw, ShieldCheck, Loader2, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/supabase';
import { PERFIL_LABELS } from '@/lib/index';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import {
  CARGOS_CONFIGURAVEIS, CARGOS_ACESSO_TOTAL,
  catalogoDoTenant, gruposDoTenant, permissoesPadraoDoCargo,
} from '@/lib/permissoes-catalogo';
import { montarPorAba } from '@/lib/permissoes-abas';
import { cn } from '@/lib/utils';
import { BlocoAba } from './BlocoAba';
import { useRascunho } from './useRascunho';

const TODOS_OS_CARGOS = [...CARGOS_CONFIGURAVEIS, ...CARGOS_ACESSO_TOTAL] as const;

export function PorCargo() {
  const { empresa, tenantSlug } = useEmpresa();
  const { todasPermissoes, refresh } = useCargoPermissoes();

  const [cargo, setCargo] = useState<string>('operador');
  const [salvando, setSalvando] = useState(false);
  const [busca, setBusca] = useState('');
  const rascunho = useRascunho<boolean>();

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
    return doBanco && Object.keys(doBanco).length > 0
      ? doBanco
      : permissoesPadraoDoCargo(cargo);
  }, [todasPermissoes, cargo]);

  const valorDe = (key: string): boolean =>
    key in rascunho.alteracoes ? rascunho.alteracoes[key] : !!salvo[key];

  /** Quantas permissões cada cargo tem — o número que a coluna da esquerda mostra. */
  const contarDe = useMemo(() => (c: string): number => {
    if ((CARGOS_ACESSO_TOTAL as readonly string[]).includes(c)) return catalogo.length;
    const mapa = todasPermissoes.find(r => r.cargo === c)?.permissoes
      ?? permissoesPadraoDoCargo(c);
    return catalogo.filter(p => !!mapa[p.key]).length;
  }, [todasPermissoes, catalogo]);

  function trocarCargo(novo: string) {
    if (rascunho.sujo && !confirm('Descartar as alterações não salvas?')) return;
    rascunho.descartar();
    setCargo(novo);
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
      const completo = Object.fromEntries(
        catalogo.map(p => [p.key, valorDe(p.key)]),
      );
      const { error } = await supabase
        .from('cargos_permissoes')
        .upsert(
          { empresa_id: empresa.id, cargo, permissoes: completo },
          { onConflict: 'empresa_id,cargo' },
        );
      if (error) throw error;
      toast.success(`Permissões de ${PERFIL_LABELS[cargo] ?? cargo} salvas.`);
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
            const ativo = cargo === c;
            return (
              <button
                key={c}
                onClick={() => trocarCargo(c)}
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
