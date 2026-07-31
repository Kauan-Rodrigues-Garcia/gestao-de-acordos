/**
 * pages/Comemoracoes — Comemoração de meta (fase 1)
 * ─────────────────────────────────────────────────────────────────────────────
 * O líder monta a comemoração e dispara; ela explode na tela de quem é do setor
 * dos homenageados. Design em
 * `docs/superpowers/specs/2026-07-31-comemoracao-de-meta-design.md`.
 *
 * Fase 1: disparo imediato, card com layout padrão, catálogo de efeito e som.
 * A fase 2 traz o editor de arrastar, o upload de mídia e o botão Testar; a
 * fase 3, o agendamento e os parabéns.
 */
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  PartyPopper, Sparkles, Trophy, Users, Loader2, Trash2, Ban, Volume2,
  ShieldAlert, RefreshCw, Search, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useComemoracoes } from '@/hooks/useComemoracoes';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { tocarSomComemoracao } from '@/lib/som-comemoracao';
import {
  criarComemoracao, cancelarComemoracao, excluirComemoracao,
  DURACAO_MIN_S, DURACAO_MAX_S, MAX_HOMENAGEADOS,
  type Comemoracao, type PessoaComemoracao,
} from '@/services/comemoracoes.service';
import { EFEITOS, SONS, type EfeitoId, type SomId } from './catalogo';
import { podeCriarComemoracao } from './permissoes';
import { estaNoAr } from './janela';
import { CardComemoracao } from '@/components/comemoracao/CardComemoracao';

const DURACAO_PADRAO_S = 20;

function dataHora(iso: string): string {
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    });
  } catch { return '—'; }
}

export default function Comemoracoes() {
  const { perfil }  = useAuth();
  const { empresa } = useEmpresa();

  const empresaId = empresa?.id ?? perfil?.empresa_id ?? null;
  const usuarioId = perfil?.id ?? null;
  const podeCriar = podeCriarComemoracao(perfil?.perfil);

  const { comemoracoes, loading, dbAtiva, erro, recarregar, agoraCorrigido } =
    useComemoracoes(empresaId, podeCriar && !!empresaId);

  // ── Formulário ─────────────────────────────────────────────────────────────
  const [titulo, setTitulo]       = useState('META BATIDA!');
  const [mensagem, setMensagem]   = useState('');
  const [efeito, setEfeito]       = useState<EfeitoId>('confete');
  const [som, setSom]             = useState<SomId>('fanfarra');
  const [duracao, setDuracao]     = useState(DURACAO_PADRAO_S);
  const [escolhidos, setEscolhidos] = useState<PessoaComemoracao[]>([]);
  const [buscaPessoa, setBuscaPessoa] = useState('');
  const [pessoas, setPessoas]     = useState<PessoaComemoracao[]>([]);
  const [criando, setCriando]     = useState(false);
  const [salvandoId, setSalvandoId] = useState<string | null>(null);

  // Diretório da empresa, para escolher quem foi homenageado.
  useMemo(() => {
    if (!empresaId || !podeCriar) return;
    void (async () => {
      const { data } = await supabase
        .from('perfis')
        .select('id, nome, foto_url')
        .eq('empresa_id', empresaId)
        .order('nome');
      setPessoas((data ?? []) as PessoaComemoracao[]);
    })();
  }, [empresaId, podeCriar]);

  const sugestoes = useMemo(() => {
    const termo = buscaPessoa.trim().toLowerCase();
    if (!termo) return [];
    const jaEscolhido = new Set(escolhidos.map((p) => p.id));
    return pessoas
      .filter((p) => !jaEscolhido.has(p.id) && p.nome.toLowerCase().includes(termo))
      .slice(0, 6);
  }, [buscaPessoa, pessoas, escolhidos]);

  function adicionar(p: PessoaComemoracao) {
    if (escolhidos.length >= MAX_HOMENAGEADOS) {
      toast.error(`São no máximo ${MAX_HOMENAGEADOS} homenageados.`);
      return;
    }
    setEscolhidos((atual) => [...atual, p]);
    setBuscaPessoa('');
  }

  async function comemorar() {
    if (!empresaId || !usuarioId) return;
    setCriando(true);
    try {
      const { ok, erro: e } = await criarComemoracao({
        empresaId, criadoPor: usuarioId,
        titulo, mensagem: mensagem || null,
        efeito, som, duracaoS: duracao,
        operadorIds: escolhidos.map((p) => p.id),
      });
      if (!ok) { toast.error(e ?? 'Não foi possível comemorar.'); return; }
      toast.success('Comemoração no ar!');
      setEscolhidos([]);
      setMensagem('');
      await recarregar();
    } finally {
      setCriando(false);
    }
  }

  async function aoCancelar(c: Comemoracao) {
    setSalvandoId(c.id);
    try {
      const { ok, erro: e } = await cancelarComemoracao(c.id);
      if (!ok) { toast.error(e ?? 'Não foi possível cancelar.'); return; }
      toast.success('Comemoração encerrada.');
      await recarregar();
    } finally {
      setSalvandoId(null);
    }
  }

  async function aoExcluir(c: Comemoracao) {
    setSalvandoId(c.id);
    try {
      const { ok, erro: e } = await excluirComemoracao(c.id);
      if (!ok) { toast.error(e ?? 'Não foi possível excluir.'); return; }
      toast.success('Comemoração excluída.');
      await recarregar();
    } finally {
      setSalvandoId(null);
    }
  }

  // ── Portas de entrada ──────────────────────────────────────────────────────
  if (!podeCriar) {
    return (
      <div className="flex flex-col items-center gap-2 p-6 py-16 text-center text-muted-foreground">
        <ShieldAlert className="h-8 w-8 opacity-50" />
        <p className="text-sm">Comemorações são criadas por líderes e acima.</p>
      </div>
    );
  }

  if (!dbAtiva) {
    return (
      <div className="flex flex-col items-center gap-2 p-6 py-16 text-center text-muted-foreground">
        <ShieldAlert className="h-8 w-8 opacity-50" />
        <p className="max-w-sm text-sm">
          A migration <code className="font-mono text-xs">20260731e_comemoracoes.sql</code> ainda
          não foi aplicada no banco. Rode o SQL no Supabase para a aba funcionar.
        </p>
      </div>
    );
  }

  const agora = agoraCorrigido();
  const noAr  = comemoracoes.filter((c) => !c.cancelada_em && estaNoAr(c, agora));
  const passadas = comemoracoes.filter((c) => !noAr.includes(c));

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-5xl space-y-4 p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <PartyPopper className="h-5 w-5 text-primary" />
            Comemorações
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Bateu a meta? Explode na tela de todo mundo do setor.
          </p>
        </div>
        <Button variant="outline" size="icon" className="h-9 w-9" title="Atualizar"
          onClick={() => void recarregar()}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </div>

      {erro && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {erro}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* ── Montagem ── */}
        <div className="space-y-4 rounded-xl border border-border bg-card p-4">
          <div className="space-y-1.5">
            <Label htmlFor="cm-titulo" className="text-xs">Título</Label>
            <Input id="cm-titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)}
              maxLength={40} placeholder="META BATIDA!" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cm-msg" className="text-xs">Mensagem (opcional)</Label>
            <Textarea id="cm-msg" rows={2} value={mensagem} maxLength={140}
              onChange={(e) => setMensagem(e.target.value)}
              placeholder="Time do Receptivo fechou o mês antes do prazo!" />
          </div>

          {/* Homenageados */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5 text-xs">
              <Users className="h-3.5 w-3.5" />
              Quem bateu a meta
              <span className="text-muted-foreground">({escolhidos.length}/{MAX_HOMENAGEADOS})</span>
            </Label>

            {escolhidos.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pb-1">
                {escolhidos.map((p) => (
                  <span key={p.id}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 py-0.5 pl-1 pr-2 text-xs">
                    <Avatar className="h-5 w-5">
                      {p.foto_url && <AvatarImage src={p.foto_url} alt={p.nome} className="object-cover" />}
                      <AvatarFallback className="bg-primary/10 text-[9px] font-bold">
                        {p.nome.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    {p.nome.split(' ')[0]}
                    <button type="button" aria-label={`Tirar ${p.nome}`}
                      onClick={() => setEscolhidos((a) => a.filter((x) => x.id !== p.id))}
                      className="text-muted-foreground hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={buscaPessoa} onChange={(e) => setBuscaPessoa(e.target.value)}
                className="h-9 pl-9 text-sm" placeholder="Buscar pelo nome…" />
              {sugestoes.length > 0 && (
                <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
                  {sugestoes.map((p) => (
                    <button key={p.id} type="button" onClick={() => adicionar(p)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent">
                      <Avatar className="h-6 w-6">
                        {p.foto_url && <AvatarImage src={p.foto_url} alt={p.nome} className="object-cover" />}
                        <AvatarFallback className="bg-muted text-[9px] font-bold">
                          {p.nome.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="truncate">{p.nome}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Quem vê é o setor de cada homenageado — e os setores onde ele tem clone.
            </p>
          </div>

          {/* Efeito, som e duração */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5 text-xs"><Sparkles className="h-3.5 w-3.5" /> Efeito</Label>
              <Select value={efeito} onValueChange={(v) => setEfeito(v as EfeitoId)}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EFEITOS.map((e) => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5 text-xs"><Volume2 className="h-3.5 w-3.5" /> Som</Label>
              <div className="flex gap-1.5">
                <Select value={som} onValueChange={(v) => setSom(v as SomId)}>
                  <SelectTrigger className="h-9 flex-1 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SONS.map((s) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
                {/* Ouvir antes ignora o mudo: quem clicou pediu para ouvir. */}
                <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" title="Ouvir"
                  onClick={() => tocarSomComemoracao(som, true)}>
                  <Volume2 className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cm-dur" className="text-xs">Duração: {duracao}s</Label>
              <input id="cm-dur" type="range" min={DURACAO_MIN_S} max={DURACAO_MAX_S}
                value={duracao} onChange={(e) => setDuracao(Number(e.target.value))}
                className="h-9 w-full accent-primary" />
            </div>
          </div>

          <Button className="w-full gap-2" disabled={criando || escolhidos.length === 0 || !titulo.trim()}
            onClick={() => void comemorar()}>
            {criando ? <Loader2 className="h-4 w-4 animate-spin" /> : <PartyPopper className="h-4 w-4" />}
            Comemorar agora
          </Button>
        </div>

        {/* ── Prévia ── */}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Prévia
          </p>
          <CardComemoracao
            titulo={titulo || 'META BATIDA!'}
            mensagem={mensagem || null}
            homenageados={escolhidos}
            modo="editor"
          />
          <p className="text-[11px] text-muted-foreground">
            É assim que aparece no topo da tela de quem for do setor.
          </p>
        </div>
      </div>

      {/* ── Histórico ── */}
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-amber-500" />
          <h2 className="text-sm font-semibold">Comemorações</h2>
          <Badge variant="outline" className="h-4 px-1.5 py-0 text-[10px]">
            {comemoracoes.length}
          </Badge>
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
          </div>
        ) : comemoracoes.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground">
            Nenhuma comemoração ainda. Monte a primeira aí em cima.
          </p>
        ) : (
          <div className="space-y-2">
            {[...noAr, ...passadas].map((c) => {
              const rolando = noAr.includes(c);
              const meu = c.criado_por === usuarioId;
              return (
                <div key={c.id} className={cn(
                  'flex flex-wrap items-center gap-3 rounded-xl border bg-card px-3.5 py-2.5',
                  rolando ? 'border-amber-500/50 shadow-sm' : 'border-border',
                )}>
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold">{c.titulo}</p>
                      {rolando && (
                        <Badge className="h-4 animate-pulse bg-amber-500 px-1.5 py-0 text-[10px] text-white">
                          no ar
                        </Badge>
                      )}
                      {c.cancelada_em && (
                        <Badge variant="outline" className="h-4 px-1.5 py-0 text-[10px] text-muted-foreground">
                          encerrada
                        </Badge>
                      )}
                    </div>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {dataHora(c.inicia_em)} · {c.duracao_s}s ·{' '}
                      {c.homenageados.map((p) => p.nome.split(' ')[0]).join(', ') || 'sem homenageados'}
                      {c.autor && ` · por ${c.autor.nome.split(' ')[0]}`}
                    </p>
                  </div>

                  {meu && rolando && !c.cancelada_em && (
                    <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs"
                      disabled={salvandoId === c.id} onClick={() => void aoCancelar(c)}>
                      <Ban className="h-3.5 w-3.5" /> Encerrar
                    </Button>
                  )}
                  {meu && !rolando && (
                    <Button size="sm" variant="ghost"
                      className="h-7 gap-1.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                      disabled={salvandoId === c.id} onClick={() => void aoExcluir(c)}>
                      <Trash2 className="h-3.5 w-3.5" /> Excluir
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </motion.div>
  );
}
