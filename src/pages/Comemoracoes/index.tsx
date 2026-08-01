/**
 * pages/Comemoracoes — Comemoração de meta
 * ─────────────────────────────────────────────────────────────────────────────
 * O líder monta a comemoração e dispara (agora ou agendada); ela explode na
 * tela de quem é do setor dos homenageados. Design em
 * `docs/superpowers/specs/2026-07-31-comemoracao-de-meta-design.md`.
 *
 * O preview usa o MESMO componente da exibição (`CardComemoracao`), em
 * `modo="editor"`: é o que garante que o que o líder monta seja o que os
 * outros veem.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  PartyPopper, Sparkles, Trophy, Users, Loader2, Trash2, Ban, Volume2,
  ShieldAlert, RefreshCw, Search, X, CalendarClock, Play, RotateCcw, Clock,
  Image as ImageIcon,
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
  type Comemoracao, type PessoaComemoracao, type AlvoTipo,
} from '@/services/comemoracoes.service';
import { listarMidias, type MidiaComemoracao } from '@/services/comemoracaoMidias.service';
import { EFEITOS, SONS, type EfeitoId, type SomId } from './catalogo';
import { ANIMACOES_TEXTO, type AnimTextoId } from './animacoesTexto';
import { MODELOS, layoutDoModelo, modeloDoLayout, type ModeloId } from './modelos';
import { podeCriarComemoracao } from './permissoes';
import {
  estadoDe, validarAgendamento, MAX_DIAS_AGENDAMENTO,
} from './janela';
import {
  ELEMENTOS, escalarElemento, posicaoDe, type ElementoId, type LayoutComemoracao,
  ESCALA_MIN, ESCALA_MAX,
} from './layout';
import { dispararTeste } from './testeLocal';
import { SeletorMidia } from './SeletorMidia';
import { CardComemoracao } from '@/components/comemoracao/CardComemoracao';

const DURACAO_PADRAO_S = 20;

function dataHora(iso: string): string {
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    });
  } catch { return '—'; }
}

/** `datetime-local` quer 'yyyy-MM-ddTHH:mm' no fuso LOCAL, não ISO em UTC. */
function paraInputLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function Comemoracoes() {
  const { perfil }  = useAuth();
  const { empresa } = useEmpresa();

  const empresaId = empresa?.id ?? perfil?.empresa_id ?? null;
  const usuarioId = perfil?.id ?? null;
  const podeCriar = podeCriarComemoracao(perfil?.perfil);
  const habilitado = podeCriar && !!empresaId;

  const { comemoracoes, loading, dbAtiva, erro, recarregar, agoraCorrigido } =
    useComemoracoes(empresaId, habilitado);

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

  // Agendamento
  const [agendar, setAgendar]     = useState(false);
  const [quando, setQuando]       = useState(() => paraInputLocal(new Date(Date.now() + 10 * 60_000)));

  // Editor
  const [layout, setLayout]       = useState<LayoutComemoracao>(() => layoutDoModelo('midia_topo'));
  const [selecionado, setSelecionado] = useState<ElementoId | null>(null);
  const [animTexto, setAnimTexto] = useState<AnimTextoId>('subir');
  const [volume, setVolume]       = useState(100);

  // Alvo: pessoas (padrão), equipe ou setor inteiro
  const [alvoTipo, setAlvoTipo]   = useState<AlvoTipo>('operadores');
  const [equipeId, setEquipeId]   = useState<string>('');
  const [setorId, setSetorId]     = useState<string>('');
  const [equipes, setEquipes]     = useState<{ id: string; nome: string; setor_id: string | null }[]>([]);
  const [setores, setSetores]     = useState<{ id: string; nome: string }[]>([]);

  // Biblioteca (null enquanto carrega ou se a migration 20260731f falta)
  const [midias, setMidias] = useState<MidiaComemoracao[] | null>(null);
  const [gifEscolhido, setGifEscolhido] = useState<MidiaComemoracao | null>(null);
  const [somEscolhido, setSomEscolhido] = useState<MidiaComemoracao | null>(null);

  const recarregarMidias = useCallback(async () => {
    if (!empresaId || !podeCriar) return;
    setMidias(await listarMidias(empresaId));
  }, [empresaId, podeCriar]);

  useEffect(() => { void recarregarMidias(); }, [recarregarMidias]);

  useEffect(() => {
    if (!empresaId || !podeCriar) return;
    let ativo = true;
    void (async () => {
      const { data } = await supabase
        .from('perfis')
        .select('id, nome, foto_url')
        .eq('empresa_id', empresaId)
        .order('nome');
      if (ativo) setPessoas((data ?? []) as PessoaComemoracao[]);
    })();
    return () => { ativo = false; };
  }, [empresaId, podeCriar]);

  // Equipes e setores para o alvo. Sem `ativo` no filtro de equipes: a RLS já
  // recorta o que este líder enxerga, e equipe some da lista quando é apagada.
  useEffect(() => {
    if (!empresaId || !podeCriar) return;
    let ativo = true;
    void (async () => {
      const [eq, st] = await Promise.all([
        supabase.from('equipes').select('id, nome, setor_id')
          .eq('empresa_id', empresaId).order('nome'),
        supabase.from('setores').select('id, nome')
          .eq('ativo', true).order('nome'),
      ]);
      if (!ativo) return;
      setEquipes((eq.data ?? []) as { id: string; nome: string; setor_id: string | null }[]);
      setSetores((st.data ?? []) as { id: string; nome: string }[]);
    })();
    return () => { ativo = false; };
  }, [empresaId, podeCriar]);

  const sugestoes = useMemo(() => {
    const termo = buscaPessoa.trim().toLowerCase();
    if (!termo) return [];
    const jaEscolhido = new Set(escolhidos.map((p) => p.id));
    return pessoas
      .filter((p) => !jaEscolhido.has(p.id) && p.nome.toLowerCase().includes(termo))
      .slice(0, 6);
  }, [buscaPessoa, pessoas, escolhidos]);

  const erroAgendamento = agendar
    ? validarAgendamento(new Date(quando).toISOString(), agoraCorrigido())
    : null;

  /** Modelo em vigor, ou null quando o layout foi mexido à mão. */
  const modeloAtual: ModeloId | null = modeloDoLayout(layout);

  function adicionar(p: PessoaComemoracao) {
    if (escolhidos.length >= MAX_HOMENAGEADOS) {
      toast.error(`São no máximo ${MAX_HOMENAGEADOS} homenageados.`);
      return;
    }
    setEscolhidos((atual) => [...atual, p]);
    setBuscaPessoa('');
  }

  /** Nome do alvo coletivo escolhido, para sugerir o título. */
  function nomeDoAlvo(tipo: AlvoTipo, eq: string, st: string): string | null {
    if (tipo === 'equipe') return equipes.find((e) => e.id === eq)?.nome ?? null;
    if (tipo === 'setor')  return setores.find((s) => s.id === st)?.nome ?? null;
    return null;
  }

  /**
   * Escolher equipe ou setor sugere o título.
   *
   * Sugestão e não trava: o campo continua editável. Escolher o alvo é ação
   * deliberada, então sobrescrever ali é o que a pessoa espera — diferente de
   * sobrescrever enquanto ela digita.
   */
  function aplicarAlvo(tipo: AlvoTipo, eq = equipeId, st = setorId) {
    setAlvoTipo(tipo);
    setEquipeId(tipo === 'equipe' ? eq : '');
    setSetorId(tipo === 'setor' ? st : '');

    const nome = nomeDoAlvo(tipo, eq, st);
    if (nome) {
      setTitulo(`${tipo === 'equipe' ? 'Equipe' : 'Setor'} ${nome} bateu a meta!`);
    } else if (tipo === 'operadores') {
      setTitulo('META BATIDA!');
    }
  }

  function testar() {
    dispararTeste({
      titulo: titulo || 'META BATIDA!',
      mensagem: mensagem || null,
      homenageados: escolhidos,
      efeito, som,
      gifUrl: gifEscolhido?.url ?? null,
      somUrl: somEscolhido?.url ?? null,
      somInicioS: Number(somEscolhido?.inicio_s ?? 0),
      layout, animTexto, volume,
      duracaoS: duracao,
    });
  }

  async function comemorar() {
    if (!empresaId || !usuarioId) return;
    if (erroAgendamento) { toast.error(erroAgendamento); return; }

    setCriando(true);
    try {
      const { ok, erro: e } = await criarComemoracao({
        empresaId, criadoPor: usuarioId,
        titulo, mensagem: mensagem || null,
        efeito, som, duracaoS: duracao,
        operadorIds: escolhidos.map((p) => p.id),
        iniciaEm: agendar ? new Date(quando).toISOString() : undefined,
        gifMidiaId: gifEscolhido?.id ?? null,
        somMidiaId: somEscolhido?.id ?? null,
        layout,
        modelo: modeloDoLayout(layout) ?? undefined,
        animTexto, volume,
        alvoTipo,
        equipeId: alvoTipo === 'equipe' ? equipeId : null,
        setorId:  alvoTipo === 'setor'  ? setorId  : null,
      });
      if (!ok) { toast.error(e ?? 'Não foi possível comemorar.'); return; }
      toast.success(agendar ? 'Comemoração agendada!' : 'Comemoração no ar!');
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

  // Um estado por comemoração, decidido num lugar só (`estadoDe`): assim
  // nenhuma cai fora das três listas, que é o que acontecia quando cada filtro
  // recortava por conta própria.
  const agora     = agoraCorrigido();
  const noAr      = comemoracoes.filter((c) => estadoDe(c, agora) === 'em-andamento');
  const agendadas = comemoracoes.filter((c) => estadoDe(c, agora) === 'agendada');
  const passadas  = comemoracoes.filter((c) => estadoDe(c, agora) === 'finalizada');
  const posSel    = selecionado ? posicaoDe(layout, selecionado) : null;

  /** Falta escolher a equipe ou o setor do alvo coletivo? */
  const alvoIncompleto =
    (alvoTipo === 'equipe' && !equipeId) || (alvoTipo === 'setor' && !setorId);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-6xl space-y-4 p-6"
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

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
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

          {/* Alvo: pessoas, equipe ou setor */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5 text-xs">
              <Users className="h-3.5 w-3.5" />
              Quem bateu a meta
              {alvoTipo === 'operadores' && (
                <span className="text-muted-foreground">({escolhidos.length}/{MAX_HOMENAGEADOS})</span>
              )}
            </Label>

            <div className="flex gap-1.5">
              {([
                ['operadores', 'Pessoas'],
                ['equipe',     'Equipe'],
                ['setor',      'Setor'],
              ] as const).map(([tipo, rotulo]) => (
                <Button
                  key={tipo} type="button" size="sm"
                  variant={alvoTipo === tipo ? 'default' : 'outline'}
                  className="h-8 flex-1 text-xs"
                  onClick={() => aplicarAlvo(tipo)}
                >
                  {rotulo}
                </Button>
              ))}
            </div>

            {alvoTipo === 'equipe' && (
              <>
                <Select value={equipeId} onValueChange={(v) => aplicarAlvo('equipe', v)}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Escolha a equipe…" />
                  </SelectTrigger>
                  <SelectContent>
                    {equipes.map((e) => (
                      <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Explode para o setor inteiro da equipe. Não precisa escolher ninguém.
                </p>
              </>
            )}

            {alvoTipo === 'setor' && (
              <>
                <Select value={setorId} onValueChange={(v) => aplicarAlvo('setor', equipeId, v)}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Escolha o setor…" />
                  </SelectTrigger>
                  <SelectContent>
                    {setores.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Meta de setor é notícia da empresa: explode para <strong>todo mundo</strong>.
                </p>
              </>
            )}
          </div>

          {/* Homenageados — só quando o alvo é gente */}
          {alvoTipo === 'operadores' && (
          <div className="space-y-1.5">
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
          )}

          {/* Fundo — a chuva que cai na tela inteira, atrás do card */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5 text-xs">
              <Sparkles className="h-3.5 w-3.5" /> Fundo
            </Label>
            <Select value={efeito} onValueChange={(v) => setEfeito(v as EfeitoId)}>
              <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {EFEITOS.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.nome}
                    <span className="ml-2 text-[11px] text-muted-foreground">{e.descricao}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Biblioteca: GIF, imagem e som no mesmo lugar */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5 text-xs">
              <ImageIcon className="h-3.5 w-3.5" /> Mídia
            </Label>
            <SeletorMidia
              midias={midias}
              empresaId={empresaId as string} usuarioId={usuarioId as string}
              visual={gifEscolhido} som={somEscolhido}
              duracaoComemoracaoS={duracao}
              onEscolherVisual={setGifEscolhido}
              onEscolherSom={setSomEscolhido}
              onMudou={() => void recarregarMidias()}
            />
            <p className="text-[11px] text-muted-foreground">
              {gifEscolhido
                ? <>Usando <strong>{gifEscolhido.nome}</strong> no card.</>
                : 'Sem imagem, aparece um troféu no lugar.'}
            </p>
          </div>

          {/* Som do catálogo + volume */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5 text-xs"><Volume2 className="h-3.5 w-3.5" /> Som</Label>
            <div className="flex gap-1.5">
              <Select value={som} onValueChange={(v) => setSom(v as SomId)} disabled={!!somEscolhido}>
                <SelectTrigger className="h-9 flex-1 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SONS.map((s) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
                </SelectContent>
              </Select>
              {/* Ouvir antes ignora o mudo: quem clicou pediu para ouvir. */}
              <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" title="Ouvir"
                onClick={() => tocarSomComemoracao(som, true, volume)}>
                <Volume2 className="h-4 w-4" />
              </Button>
            </div>
            {somEscolhido && (
              <p className="text-[11px] text-muted-foreground">
                Usando <strong>{somEscolhido.nome}</strong> no lugar do som do catálogo.
              </p>
            )}

            <Label htmlFor="cm-vol" className="text-xs">Volume: {volume}%</Label>
            <input id="cm-vol" type="range" min={0} max={100} step={5}
              value={volume} onChange={(e) => setVolume(Number(e.target.value))}
              className="h-6 w-full accent-primary" />
            <p className="text-[11px] text-muted-foreground">
              Percentual do volume normal. Vale para a música e para o som do catálogo.
            </p>
          </div>

          {/* Duração e quando */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="cm-dur" className="text-xs">Duração: {duracao}s</Label>
              <input id="cm-dur" type="range" min={DURACAO_MIN_S} max={DURACAO_MAX_S}
                value={duracao} onChange={(e) => setDuracao(Number(e.target.value))}
                className="h-9 w-full accent-primary" />
            </div>

            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5 text-xs">
                <CalendarClock className="h-3.5 w-3.5" /> Quando
              </Label>
              <div className="flex gap-1.5">
                <Button type="button" size="sm" variant={agendar ? 'outline' : 'default'}
                  className="h-9 flex-1 text-xs" onClick={() => setAgendar(false)}>
                  Agora
                </Button>
                <Button type="button" size="sm" variant={agendar ? 'default' : 'outline'}
                  className="h-9 flex-1 text-xs" onClick={() => setAgendar(true)}>
                  Agendar
                </Button>
              </div>
            </div>
          </div>

          {agendar && (
            <div className="space-y-1.5">
              <Input type="datetime-local" value={quando} className="h-9 text-sm"
                onChange={(e) => setQuando(e.target.value)} />
              <p className={cn('text-[11px]', erroAgendamento ? 'text-destructive' : 'text-muted-foreground')}>
                {erroAgendamento ?? `Até ${MAX_DIAS_AGENDAMENTO} dias à frente. No horário, explode na tela de quem estiver logado.`}
              </p>
            </div>
          )}

          <div className="flex gap-2">
            <Button variant="outline" className="gap-2" onClick={testar}
              title="Mostra só na sua tela — ninguém mais vê">
              <Play className="h-4 w-4" /> Testar
            </Button>
            <Button className="flex-1 gap-2"
              disabled={
                criando || !titulo.trim() || !!erroAgendamento || alvoIncompleto
                || (alvoTipo === 'operadores' && escolhidos.length === 0)
              }
              onClick={() => void comemorar()}>
              {criando ? <Loader2 className="h-4 w-4 animate-spin" />
                : agendar ? <CalendarClock className="h-4 w-4" /> : <PartyPopper className="h-4 w-4" />}
              {agendar ? 'Agendar' : 'Comemorar agora'}
            </Button>
          </div>
        </div>

        {/* ── Editor / prévia ── */}
        <div className="space-y-2">
          {/* Modelo primeiro: quem só quer avisar que a equipe bateu a meta
              resolve num clique e não precisa diagramar nada. */}
          <div className="space-y-1.5">
            <Label className="text-xs">Modelo</Label>
            <div className="grid grid-cols-3 gap-1.5">
              {MODELOS.map((m) => (
                <Button
                  key={m.id} type="button" size="sm"
                  variant={modeloAtual === m.id ? 'default' : 'outline'}
                  className="h-auto whitespace-normal py-1.5 text-[11px] leading-tight"
                  title={m.descricao}
                  onClick={() => { setLayout(layoutDoModelo(m.id)); setSelecionado(null); }}
                >
                  {m.nome}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Animação do texto</Label>
            <Select value={animTexto} onValueChange={(v) => setAnimTexto(v as AnimTextoId)}>
              <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ANIMACOES_TEXTO.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.nome}
                    <span className="ml-2 text-[11px] text-muted-foreground">{a.descricao}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between gap-2 pt-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {modeloAtual ? 'Arraste para ajustar' : 'Personalizado'}
            </p>
            {!modeloAtual && (
              <Button variant="ghost" size="sm" className="h-6 gap-1 px-1.5 text-[11px]"
                onClick={() => { setLayout(layoutDoModelo('midia_topo')); setSelecionado(null); }}>
                <RotateCcw className="h-3 w-3" /> Restaurar
              </Button>
            )}
          </div>

          <CardComemoracao
            titulo={titulo || 'META BATIDA!'}
            mensagem={mensagem || null}
            homenageados={escolhidos}
            gifUrl={gifEscolhido?.url ?? null}
            layout={layout}
            animTexto={animTexto}
            modo="editor"
            selecionado={selecionado}
            onSelecionar={setSelecionado}
            onMover={setLayout}
          />

          {/* Tamanho do elemento escolhido */}
          <div className="rounded-lg border border-border bg-muted/30 p-2.5">
            {selecionado && posSel ? (
              <div className="space-y-1.5">
                <Label className="text-[11px]">
                  Tamanho de <strong>{ELEMENTOS.find((e) => e.id === selecionado)?.nome}</strong>
                  : {Math.round(posSel.escala * 100)}%
                </Label>
                <input
                  type="range" min={ESCALA_MIN * 100} max={ESCALA_MAX * 100}
                  value={Math.round(posSel.escala * 100)}
                  onChange={(e) => setLayout(escalarElemento(layout, selecionado, Number(e.target.value) / 100))}
                  className="h-6 w-full accent-primary"
                />
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                Clique num elemento do card para mudar o tamanho dele.
              </p>
            )}
          </div>

          <p className="text-[11px] text-muted-foreground">
            O card tem proporção fixa, então o que você monta aqui é exatamente o
            que aparece na tela dos outros — em qualquer monitor.
          </p>
        </div>
      </div>

      {/* ── Agendadas ── */}
      {agendadas.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-sky-500" />
            <h2 className="text-sm font-semibold">Agendadas</h2>
            <Badge variant="outline" className="h-4 px-1.5 py-0 text-[10px]">{agendadas.length}</Badge>
          </div>
          <div className="space-y-2">
            {agendadas.map((c) => (
              <LinhaComemoracao key={c.id} c={c} estado="agendada"
                meu={c.criado_por === usuarioId} salvando={salvandoId === c.id}
                onCancelar={() => void aoCancelar(c)} onExcluir={() => void aoExcluir(c)} />
            ))}
          </div>
        </section>
      )}

      {/* ── Em andamento ── */}
      {noAr.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <PartyPopper className="h-4 w-4 text-amber-500" />
            <h2 className="text-sm font-semibold">Em andamento</h2>
            <Badge variant="outline" className="h-4 px-1.5 py-0 text-[10px]">{noAr.length}</Badge>
          </div>
          <div className="space-y-2">
            {noAr.map((c) => (
              <LinhaComemoracao key={c.id} c={c} estado="no-ar"
                meu={c.criado_por === usuarioId} salvando={salvandoId === c.id}
                onCancelar={() => void aoCancelar(c)} onExcluir={() => void aoExcluir(c)} />
            ))}
          </div>
        </section>
      )}

      {/* ── Finalizadas ── */}
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-amber-500" />
          <h2 className="text-sm font-semibold">Finalizadas</h2>
          <Badge variant="outline" className="h-4 px-1.5 py-0 text-[10px]">{passadas.length}</Badge>
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
          </div>
        ) : passadas.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground">
            Nenhuma comemoração ainda. Monte a primeira aí em cima.
          </p>
        ) : (
          <div className="space-y-2">
            {passadas.map((c) => (
              <LinhaComemoracao key={c.id} c={c} estado="passada"
                meu={c.criado_por === usuarioId} salvando={salvandoId === c.id}
                onCancelar={() => void aoCancelar(c)} onExcluir={() => void aoExcluir(c)} />
            ))}
          </div>
        )}
      </section>
    </motion.div>
  );
}

// ── Linha da lista ───────────────────────────────────────────────────────────

function LinhaComemoracao({
  c, estado, meu, salvando, onCancelar, onExcluir,
}: {
  c: Comemoracao;
  estado: 'no-ar' | 'agendada' | 'passada';
  meu: boolean;
  salvando: boolean;
  onCancelar: () => void;
  onExcluir: () => void;
}) {
  return (
    <div className={cn(
      'flex flex-wrap items-center gap-3 rounded-xl border bg-card px-3.5 py-2.5',
      estado === 'no-ar'    && 'border-amber-500/50 shadow-sm',
      estado === 'agendada' && 'border-sky-500/40',
      estado === 'passada'  && 'border-border',
    )}>
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-semibold">{c.titulo}</p>
          {estado === 'no-ar' && (
            <Badge className="h-4 animate-pulse bg-amber-500 px-1.5 py-0 text-[10px] text-white">no ar</Badge>
          )}
          {estado === 'agendada' && (
            <Badge className="h-4 bg-sky-500 px-1.5 py-0 text-[10px] text-white">agendada</Badge>
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

      {meu && estado !== 'passada' && !c.cancelada_em && (
        <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs"
          disabled={salvando} onClick={onCancelar}>
          <Ban className="h-3.5 w-3.5" /> {estado === 'agendada' ? 'Cancelar' : 'Encerrar'}
        </Button>
      )}
      {meu && estado === 'passada' && (
        <Button size="sm" variant="ghost"
          className="h-7 gap-1.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
          disabled={salvando} onClick={onExcluir}>
          <Trash2 className="h-3.5 w-3.5" /> Excluir
        </Button>
      )}
    </div>
  );
}
