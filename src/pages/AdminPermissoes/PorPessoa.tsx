/**
 * PorPessoa — exceção individual, sobre o que o cargo já concede.
 *
 * Capacidade nova. Antes a permissão era só por cargo: para dar o Analítico a
 * um operador de confiança, era preciso dar a TODOS os operadores, ou mudar o
 * cargo da pessoa.
 *
 * ## Três estados, e por que
 *
 *   herda  → nenhuma exceção; vale o que o cargo diz (padrão)
 *   sim    → força conceder, mesmo que o cargo negue
 *   não    → força negar, mesmo que o cargo conceda
 *
 * No banco isso é a presença da chave em `perfis_permissoes.permissoes`:
 * ausente herda, presente força. Sem inventar tipo novo, e o JSON continua
 * legível por quem abrir a tabela.
 *
 * A coluna «herda» fica sempre visível ao lado da escolha — sem ela você não
 * saberia o que está sobrescrevendo, e uma exceção «sim» sobre um cargo que já
 * concede é ruído que ninguém precisa manter.
 */
import { useMemo, useState } from 'react';
import { Search, Save, RotateCcw, Loader2, UserCog, Filter } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/supabase';
import { PERFIL_LABELS } from '@/lib/index';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useCargoPermissoes, type EstadoExcecao } from '@/hooks/useCargoPermissoes';
import {
  CARGOS_ACESSO_TOTAL, catalogoDoTenant, gruposDoTenant,
} from '@/lib/permissoes-catalogo';
import { cn } from '@/lib/utils';
import { GrupoPermissoes } from './GrupoPermissoes';
import { useRascunho, type ValorRascunho } from './useRascunho';
import { usePessoasDaEmpresa } from './usePessoasDaEmpresa';

const ESTADOS: { valor: EstadoExcecao; label: string; classe: string }[] = [
  { valor: 'herda', label: 'Herda', classe: 'data-[on=true]:bg-muted data-[on=true]:text-foreground' },
  { valor: 'sim',   label: 'Sim',   classe: 'data-[on=true]:bg-emerald-500 data-[on=true]:text-white' },
  { valor: 'nao',   label: 'Não',   classe: 'data-[on=true]:bg-red-500 data-[on=true]:text-white' },
];

export function PorPessoa() {
  const { perfil } = useAuth();
  const { empresa, tenantSlug } = useEmpresa();
  const { todasExcecoes, resolverParaUsuario, estadoExcecao, refresh } = useCargoPermissoes();
  const { pessoas, carregando } = usePessoasDaEmpresa(empresa?.id);

  const [busca, setBusca] = useState('');
  const [soComExcecao, setSoComExcecao] = useState(false);
  const [selecionadaId, setSelecionadaId] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const rascunho = useRascunho<ValorRascunho>();

  const catalogo = useMemo(() => catalogoDoTenant(tenantSlug), [tenantSlug]);
  const grupos   = useMemo(() => gruposDoTenant(tenantSlug), [tenantSlug]);

  /** Quantas exceções cada pessoa tem — vira o contador da lista. */
  const excecoesPorPessoa = useMemo(() => {
    const m: Record<string, number> = {};
    for (const linha of todasExcecoes) {
      m[linha.usuario_id] = Object.keys(linha.permissoes ?? {}).length;
    }
    return m;
  }, [todasExcecoes]);

  const listaFiltrada = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return pessoas
      // Cargo com acesso total não aceita exceção: o app responde «pode» antes
      // de consultar qualquer tabela. Oferecer o controle seria mentir.
      .filter(p => !(CARGOS_ACESSO_TOTAL as readonly string[]).includes(p.perfil))
      .filter(p => !soComExcecao || (excecoesPorPessoa[p.id] ?? 0) > 0)
      .filter(p => !termo
        || p.nome?.toLowerCase().includes(termo)
        || p.usuario?.toLowerCase().includes(termo));
  }, [pessoas, busca, soComExcecao, excecoesPorPessoa]);

  const pessoa = pessoas.find(p => p.id === selecionadaId) ?? null;

  function selecionar(id: string) {
    if (rascunho.sujo && !confirm('Descartar as alterações não salvas?')) return;
    rascunho.descartar();
    setSelecionadaId(id);
  }

  function estadoDe(key: string): EstadoExcecao {
    if (key in rascunho.alteracoes) {
      const v = rascunho.alteracoes[key];
      return v === 'herda' ? 'herda' : v ? 'sim' : 'nao';
    }
    return pessoa ? estadoExcecao(pessoa.id, key) : 'herda';
  }

  function definirEstado(key: string, estado: EstadoExcecao) {
    rascunho.definir(key, estado === 'herda' ? 'herda' : estado === 'sim');
    rascunho.podar(k => {
      if (!pessoa) return 'herda';
      const atual = estadoExcecao(pessoa.id, k);
      return atual === 'herda' ? 'herda' : atual === 'sim';
    });
  }

  async function salvar() {
    if (!empresa?.id || !pessoa || !rascunho.sujo) return;
    setSalvando(true);
    try {
      // Monta o JSON final: só entra chave que NÃO é «herda».
      const atual = todasExcecoes.find(r => r.usuario_id === pessoa.id)?.permissoes ?? {};
      const final: Record<string, boolean> = { ...atual };
      for (const [k, v] of Object.entries(rascunho.alteracoes)) {
        if (v === 'herda') delete final[k];
        else final[k] = v as boolean;
      }

      const { error } = await supabase
        .from('perfis_permissoes')
        .upsert(
          {
            empresa_id: empresa.id,
            usuario_id: pessoa.id,
            permissoes: final,
            atualizado_em: new Date().toISOString(),
            atualizado_por: perfil?.id ?? null,
          },
          { onConflict: 'empresa_id,usuario_id' },
        );
      if (error) throw error;

      const qtd = Object.keys(final).length;
      toast.success(
        qtd === 0
          ? `${pessoa.nome} voltou a herdar tudo do cargo.`
          : `${qtd} exceção(ões) salva(s) para ${pessoa.nome}.`,
      );
      rascunho.descartar();
      await refresh();
    } catch (e) {
      toast.error('Não foi possível salvar. ' + (e instanceof Error ? e.message : ''));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[18rem_1fr] items-start">
      {/* ── Lista de pessoas ── */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar pessoa..."
            className="h-9 pl-8 text-sm"
          />
        </div>

        <button
          onClick={() => setSoComExcecao(v => !v)}
          className={cn(
            'w-full flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors',
            soComExcecao
              ? 'bg-primary/10 border-primary/40 text-primary'
              : 'border-border text-muted-foreground hover:text-foreground',
          )}
        >
          <Filter className="w-3.5 h-3.5" />
          Só quem tem exceção
        </button>

        <div className="rounded-xl border border-border bg-card max-h-[26rem] overflow-y-auto divide-y divide-border/60">
          {carregando ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">Carregando...</p>
          ) : listaFiltrada.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              {soComExcecao ? 'Ninguém tem exceção ainda.' : 'Nenhuma pessoa encontrada.'}
            </p>
          ) : listaFiltrada.map(p => {
            const n = excecoesPorPessoa[p.id] ?? 0;
            return (
              <button
                key={p.id}
                onClick={() => selecionar(p.id)}
                className={cn(
                  'w-full text-left px-3 py-2 hover:bg-accent/40 transition-colors',
                  selecionadaId === p.id && 'bg-primary/10',
                )}
              >
                <p className="text-sm font-medium text-foreground truncate">{p.nome}</p>
                <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                  {PERFIL_LABELS[p.perfil] ?? p.perfil}
                  {n > 0 && (
                    <span className="text-amber-600 dark:text-amber-400 font-medium tabular-nums">
                      · {n} exceção{n !== 1 ? 'ões' : ''}
                    </span>
                  )}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Permissões da pessoa ── */}
      {!pessoa ? (
        <div className="rounded-xl border border-dashed border-border px-6 py-16 text-center">
          <UserCog className="w-8 h-8 mx-auto text-muted-foreground/40" />
          <p className="text-sm font-medium text-foreground mt-3">Escolha uma pessoa</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
            A exceção vale só para ela e vence o que o cargo diz. Sem exceção, tudo
            continua vindo do cargo.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 rounded-xl border border-border bg-card">
            <div>
              <p className="text-sm font-semibold text-foreground">{pessoa.nome}</p>
              <p className="text-[11px] text-muted-foreground">
                {PERFIL_LABELS[pessoa.perfil] ?? pessoa.perfil}
                {' · herda tudo deste cargo, exceto o que estiver marcado abaixo'}
              </p>
            </div>
            {rascunho.sujo && (
              <div className="ml-auto flex items-center gap-1.5">
                <span className="text-xs font-medium text-amber-600 dark:text-amber-400 tabular-nums">
                  {rascunho.total} não salva{rascunho.total !== 1 ? 's' : ''}
                </span>
                <Button size="sm" variant="ghost" className="h-7 text-xs gap-1"
                  onClick={rascunho.descartar}>
                  <RotateCcw className="w-3.5 h-3.5" /> Descartar
                </Button>
                <Button size="sm" className="h-7 text-xs gap-1" onClick={salvar} disabled={salvando}>
                  {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  Salvar
                </Button>
              </div>
            )}
          </div>

          {grupos.map(g => {
            const doGrupo = catalogo.filter(p => p.grupo === g);
            return (
              <GrupoPermissoes
                key={g}
                grupo={g}
                permissoes={doGrupo}
                concedidas={doGrupo.filter(p => {
                  const e = estadoDe(p.key);
                  return e === 'sim'
                    || (e === 'herda' && resolverParaUsuario(pessoa.id, pessoa.perfil, p.key));
                }).length}
                alterada={p => p.key in rascunho.alteracoes}
                renderControle={p => {
                  const estado = estadoDe(p.key);
                  const doCargo = resolverParaUsuario(pessoa.id, pessoa.perfil, p.key);
                  return (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                        cargo: <strong className={doCargo ? 'text-emerald-500' : 'text-muted-foreground'}>
                          {doCargo ? 'sim' : 'não'}
                        </strong>
                      </span>
                      <div className="inline-flex rounded-lg border border-border overflow-hidden">
                        {ESTADOS.map(op => (
                          <button
                            key={op.valor}
                            data-on={estado === op.valor}
                            onClick={() => definirEstado(p.key, op.valor)}
                            className={cn(
                              'px-2 py-1 text-[11px] font-medium transition-colors',
                              'text-muted-foreground hover:text-foreground',
                              op.classe,
                            )}
                          >
                            {op.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
