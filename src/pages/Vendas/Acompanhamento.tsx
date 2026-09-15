/**
 * Acompanhamento — feedback e ausências, pessoa por pessoa (Fase 8).
 *
 * «Um registro por operador. Clicou no operador, vê só os feedbacks dele.
 * Filtro por equipe e setor. Foto para o líder localizar rápido.»
 *
 * ## A lista vem pronta para achar gente, não para ler
 *
 * Cada cartão diz o que o líder procura sem abrir ninguém: a foto, a equipe, se
 * a pessoa está fora hoje e há quanto tempo não recebe feedback. O histórico
 * inteiro só abre ao clicar — é `AcompanhamentoPessoa`.
 *
 * ## O alcance é pela equipe de HOJE
 *
 * Ao contrário de Vendas e Indicações, que congelam a equipe na gravação: o
 * líder que recebe um transferido precisa ler o histórico dele desde o
 * primeiro dia. Quem decide é `fn_acompanhamento_alcancados`; o seletor de
 * nível desta tela só ESTREITA dentro do que o banco entregou.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { UsersRound, Info, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { supabase } from '@/lib/supabase';
import { niveisLiberados, type NivelEscopo } from '@/lib/permissoes-escopo';
import { rotuloDoTipo } from '@/lib/ausencias';
import { cn } from '@/lib/utils';
import { buscarPessoas, type PessoaAcompanhada } from '@/services/vendas/acompanhamento.service';
import { AcompanhamentoPessoa } from './AcompanhamentoPessoa';

const ROTULO_DO_NIVEL: Record<NivelEscopo, string> = {
  individual:    'Só eu',
  equipe:        'Minha equipe',
  setor:         'Meu setor',
  todos_setores: 'Todos',
};

const TODOS = '__todos__';

function diaCurto(iso: string): string {
  return iso.slice(8, 10) + '/' + iso.slice(5, 7);
}

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  const primeira = partes[0][0] ?? '';
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] ?? '' : '';
  return (primeira + ultima).toUpperCase();
}

/** Sem acento e sem caixa: «flávia» acha «FLAVIA». */
function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export default function Acompanhamento() {
  const { perfil } = useAuth();
  const { empresa } = useEmpresa();
  const { temPermissao } = useCargoPermissoes();

  const empresaId = empresa?.id ?? null;
  const podeLerFeedback = temPermissao('ver_feedbacks');

  const [pessoas, setPessoas] = useState<PessoaAcompanhada[]>([]);
  const [disponivel, setDisponivel] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [selecionadaId, setSelecionadaId] = useState<string | null>(null);

  const [busca, setBusca] = useState('');
  const [setorId, setSetorId] = useState(TODOS);
  const [equipeId, setEquipeId] = useState(TODOS);
  const [comDesligados, setComDesligados] = useState(false);

  /*
   * O filtro de alcance — mesma construção de Indicações. A RLS corta o teto;
   * isto estreita dentro dele. Sem o seletor, os quatro níveis do catálogo
   * seriam interruptores que ninguém consegue observar.
   */
  const niveis = useMemo(() => niveisLiberados('acompanhamento', temPermissao), [temPermissao]);
  const maisAmplo = niveis.length > 0 ? niveis[niveis.length - 1] : null;
  const [nivel, setNivel] = useState<NivelEscopo | null>(null);
  const alcance = nivel ?? maisAmplo;

  /* As equipes que contam como «minha»: a do cadastro e as que a pessoa LIDERA. */
  const [minhasEquipes, setMinhasEquipes] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!perfil?.id) return;
    let vivo = true;
    void (async () => {
      const { data } = await supabase
        .from('equipe_lideres').select('equipe_id').eq('lider_id', perfil.id);
      if (!vivo) return;
      const ids = (data ?? []).map(l => String(l.equipe_id));
      if (perfil.equipe_id) ids.push(String(perfil.equipe_id));
      setMinhasEquipes(new Set(ids));
    })();
    return () => { vivo = false; };
  }, [perfil?.id, perfil?.equipe_id]);

  const carregar = useCallback(async () => {
    if (!empresaId) return;
    setCarregando(true);
    const r = await buscarPessoas(empresaId);
    setCarregando(false);
    setDisponivel(r.disponivel);
    setErro(r.erro);
    setPessoas(r.pessoas);
  }, [empresaId]);

  useEffect(() => { void carregar(); }, [carregar]);

  const noAlcance = useCallback((p: PessoaAcompanhada) => {
    if (alcance === 'individual') return p.id === perfil?.id;
    if (alcance === 'equipe') return p.equipe_id !== null && minhasEquipes.has(p.equipe_id);
    return true;
  }, [alcance, perfil?.id, minhasEquipes]);

  const doAlcance = useMemo(
    () => pessoas.filter(p => noAlcance(p) && (comDesligados || p.situacao !== 'desligado')),
    [pessoas, noAlcance, comDesligados],
  );

  // As opções saem de quem está na lista: oferecer um setor sem ninguém dentro
  // seria um filtro que sempre volta vazio.
  const setores = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of doAlcance) if (p.setor_id) m.set(p.setor_id, p.setor_nome ?? 'Setor sem nome');
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [doAlcance]);

  const equipes = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of doAlcance) {
      if (setorId !== TODOS && p.setor_id !== setorId) continue;
      if (p.equipe_id) m.set(p.equipe_id, p.equipe_nome ?? 'Equipe sem nome');
    }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [doAlcance, setorId]);

  // Trocar de setor com uma equipe de outro setor escolhida esvaziaria a lista
  // sem motivo aparente.
  useEffect(() => {
    if (equipeId !== TODOS && !equipes.some(([id]) => id === equipeId)) setEquipeId(TODOS);
  }, [equipes, equipeId]);

  const visiveis = useMemo(() => {
    const termo = normalizar(busca);
    return doAlcance.filter(p =>
      (setorId === TODOS || p.setor_id === setorId)
      && (equipeId === TODOS || p.equipe_id === equipeId)
      && (termo === '' || normalizar(p.nome).includes(termo)),
    );
  }, [doAlcance, setorId, equipeId, busca]);

  const selecionada = useMemo(
    () => pessoas.find(p => p.id === selecionadaId) ?? null,
    [pessoas, selecionadaId],
  );

  const foraHoje = visiveis.filter(p => p.ausente_hoje).length;

  if (!disponivel) {
    return (
      <div className="p-4 sm:p-6">
        <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-4">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="text-sm text-muted-foreground">
            <p>A aba Acompanhamento ainda não foi instalada neste banco.</p>
            <p className="mt-1">
              Falta aplicar a migration
              {' '}<code className="text-xs">20260915220000_vendas_fase8_feedback_e_ausencias.sql</code>.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <UsersRound className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold sm:text-2xl">Acompanhamento</h1>
          <Badge variant="outline" className="tabular-nums">
            {visiveis.length} {visiveis.length === 1 ? 'pessoa' : 'pessoas'}
          </Badge>
          {foraHoje > 0 && (
            <Badge variant="outline" className="border-amber-500/40 tabular-nums text-amber-700 dark:text-amber-400">
              {foraHoje} fora hoje
            </Badge>
          )}
        </div>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Feedback e ausências de cada pessoa. Clique em alguém para ver o histórico
          {podeLerFeedback ? '' : ' de ausências'} e registrar.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={busca} onChange={e => setBusca(e.target.value)}
                   placeholder="Buscar pelo nome" className="pl-8" />
          </div>

          {setores.length > 1 && (
            <Select value={setorId} onValueChange={setSetorId}>
              <SelectTrigger className="w-full sm:w-52" aria-label="Setor"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todos os setores</SelectItem>
                {setores.map(([id, nome]) => <SelectItem key={id} value={id}>{nome}</SelectItem>)}
              </SelectContent>
            </Select>
          )}

          {equipes.length > 1 && (
            <Select value={equipeId} onValueChange={setEquipeId}>
              <SelectTrigger className="w-full sm:w-60" aria-label="Equipe"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todas as equipes</SelectItem>
                {equipes.map(([id, nome]) => <SelectItem key={id} value={id}>{nome}</SelectItem>)}
              </SelectContent>
            </Select>
          )}

          {/* Um nível só não é escolha — mostrar o botão sozinho seria enfeite. */}
          {niveis.length > 1 && (
            <div className="flex overflow-hidden rounded-lg border border-border">
              {niveis.map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setNivel(n)}
                  className={cn(
                    'px-3 py-1.5 text-xs transition-colors',
                    alcance === n
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted',
                  )}
                >
                  {ROTULO_DO_NIVEL[n]}
                </button>
              ))}
            </div>
          )}

          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch checked={comDesligados} onCheckedChange={setComDesligados} />
            Mostrar desligados
          </label>
        </div>

        {erro && (
          <p className="text-sm text-destructive">{erro}</p>
        )}
      </header>

      <div className={cn('grid gap-4', selecionada && 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]')}>
        <section className={cn('space-y-2', selecionada && 'hidden lg:block')}>
          {visiveis.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {carregando ? 'Carregando…' : 'Ninguém com esses filtros.'}
            </p>
          ) : (
            <div className={cn('grid gap-2', selecionada ? 'sm:grid-cols-1' : 'sm:grid-cols-2 xl:grid-cols-3')}>
              {visiveis.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelecionadaId(p.id)}
                  className={cn(
                    'flex items-center gap-3 rounded-xl border bg-card p-3 text-left transition-colors hover:bg-muted/50',
                    p.id === selecionadaId ? 'border-primary ring-1 ring-primary/40' : 'border-border',
                    p.situacao === 'desligado' && 'opacity-60',
                  )}
                >
                  <Avatar className="h-11 w-11">
                    {p.foto_url && <AvatarImage src={p.foto_url} alt="" />}
                    <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                      {iniciais(p.nome)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{p.nome}</div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      {p.equipe_nome ?? 'Sem equipe'}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px]">
                      {p.ausente_hoje && (
                        <span className="text-amber-700 dark:text-amber-400">
                          {rotuloDoTipo(p.ausente_hoje)}
                          {p.ausente_ate ? ` até ${diaCurto(p.ausente_ate)}` : ''}
                        </span>
                      )}
                      {p.feedbacks !== null && (
                        <span className="text-muted-foreground">
                          {p.feedbacks === 0
                            ? 'sem feedback'
                            : `${p.feedbacks} feedback${p.feedbacks === 1 ? '' : 's'} · último ${diaCurto(p.ultimo_feedback ?? '')}`}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        {selecionada && empresaId && (
          <AcompanhamentoPessoa
            pessoa={selecionada}
            empresaId={empresaId}
            onMudou={() => void carregar()}
            onFechar={() => setSelecionadaId(null)}
          />
        )}
      </div>
    </div>
  );
}
