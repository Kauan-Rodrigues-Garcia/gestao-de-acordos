/**
 * SireneConfig.tsx — a sirene em Configurações › Eventos e gincanas (29/10/2026,
 * reorganizada em 11/11/2026: «está muito difícil selecionar, já vem tudo
 * selecionado»).
 *
 *   Horários      a lista («9h · Seg a Sex · Play 1»), cada um liga/desliga,
 *                 edita e apaga; «Novo horário» abre `EditorDeHorario`
 *   Tocar agora   para quem, cor, duração e volume; toca em 5 s
 *   Últimos toques
 *
 * «Para quem»: todos, ou setores e/ou equipes — ouve quem é de um dos setores
 * OU de uma das equipes (migration 20261029195000). Nada vem escolhido.
 *
 * Só super_admin — as funções `fn_sirene_*` conferem de novo no banco. Ver
 * `Sirene/sirene.ts`. A tela em si é `TelaDaSirene` (sem banco, usada no
 * laboratório); o default export lê e grava.
 */
import { useEffect, useMemo, useState } from 'react';
import { Siren, Loader2, Play, Eye, Plus, Pencil, Trash2, Clock, History } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useSetoresDaEmpresa } from '@/pages/AdminPermissoes/useSetoresDaEmpresa';
import {
  DURACAO_PADRAO_S, VOLUME_PADRAO, corDaSirene, duracaoSegura, minutosDaHora, resumoDosDias, volumeSeguro,
  type CorDaSirene,
} from '@/components/Sirene/horario';
import {
  apagarAgendamento, lerPainelDaSirene, salvarAgendamento, tocarAgora, testarEmMim,
  type AgendamentoNoPainel, type Painel,
} from '@/components/Sirene/sirene';
import {
  HORARIO_NOVO, NINGUEM, doBanco, paraBanco, resumoDeQuemOuve, semNinguem,
  type Alvo, type HorarioNaTela, type EquipeDaSirene, type SetorDaSirene,
} from '@/components/Sirene/quemOuve';
import { EscolhaDeQuemOuve } from '@/components/Sirene/EscolhaDeQuemOuve';
import { Bolinha, Etapa, EscolhaDeCor, EscolhaDeDuracao, EscolhaDeVolume } from '@/components/Sirene/CamposDaSirene';
import { EditorDeHorario } from '@/components/Sirene/EditorDeHorario';

function useEquipesDaEmpresa(empresaId: string | null | undefined): EquipeDaSirene[] {
  const [equipes, setEquipes] = useState<EquipeDaSirene[]>([]);
  useEffect(() => {
    let cancelado = false;
    if (!empresaId) { setEquipes([]); return; }
    void supabase.from('equipes').select('id, nome, setor_id').eq('empresa_id', empresaId).order('nome')
      .then(({ data, error }) => {
        if (cancelado) return;
        if (error) console.warn('[SireneConfig] equipes', error.message);
        setEquipes(error ? [] : ((data as EquipeDaSirene[]) ?? []));
      });
    return () => { cancelado = true; };
  }, [empresaId]);
  return equipes;
}

export interface PedidoDeToque { cor: CorDaSirene; alvo: Alvo; duracao_s: number; volume: number }

interface PropsDaTela {
  setores: readonly SetorDaSirene[];
  equipes: readonly EquipeDaSirene[];
  painel: Painel | null;
  erro: string | null;
  /** Grava o horário; devolve o erro, ou `null` se deu certo. */
  onSalvar: (h: HorarioNaTela) => Promise<string | null>;
  onAlternar: (a: AgendamentoNoPainel, ativo: boolean) => Promise<void>;
  onApagar: (a: AgendamentoNoPainel) => Promise<void>;
  /** Toca na hora; devolve o erro, ou `null`. */
  onTocar: (p: PedidoDeToque) => Promise<string | null>;
  onTestar: (cor: CorDaSirene, duracaoS: number, volume: number) => void;
}

const horarioDoPainel = (a: AgendamentoNoPainel): HorarioNaTela => ({
  id: a.id, hora: a.hora, dias: a.dias, cor: a.cor, duracao_s: a.duracao_s, volume: a.volume,
  ativo: a.ativo, descricao: a.descricao ?? '', alvo: doBanco(a.setor_ids, a.equipe_ids),
});

export function TelaDaSirene({ setores, equipes, painel, erro, onSalvar, onAlternar, onApagar, onTocar, onTestar }: PropsDaTela) {
  const [aba, setAba] = useState('horarios');
  const [editando, setEditando] = useState<HorarioNaTela | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [apagando, setApagando] = useState<AgendamentoNoPainel | null>(null);

  // Tocar agora: nada escolhido de começo.
  const [corAgora, setCorAgora] = useState<CorDaSirene>('policia');
  const [alvoAgora, setAlvoAgora] = useState<Alvo>(NINGUEM);
  const [duracaoAgora, setDuracaoAgora] = useState(String(DURACAO_PADRAO_S));
  const [volumeAgora, setVolumeAgora] = useState(VOLUME_PADRAO);
  const [confirmando, setConfirmando] = useState(false);
  const [tocando, setTocando] = useState(false);

  const horarios = useMemo(
    () => [...(painel?.agendamentos ?? [])].sort((x, y) => (minutosDaHora(x.hora) ?? 0) - (minutosDaHora(y.hora) ?? 0)),
    [painel],
  );
  const quem = (s: string[], e: string[]) => resumoDeQuemOuve(doBanco(s, e), setores, equipes);

  async function salvar(h: HorarioNaTela) {
    setSalvando(true);
    const falha = await onSalvar(h);
    setSalvando(false);
    if (falha) { toast.error('Não foi possível salvar', { description: falha }); return; }
    toast.success(h.id ? 'Horário atualizado.' : 'Horário criado.');
    setEditando(null);
  }

  async function tocar() {
    setTocando(true);
    const falha = await onTocar({ cor: corAgora, alvo: alvoAgora, duracao_s: duracaoSegura(duracaoAgora), volume: volumeAgora });
    setTocando(false);
    setConfirmando(false);
    if (falha) { toast.error('Não foi possível tocar a sirene', { description: falha }); return; }
    toast.success('Sirene tocando em 5 segundos 🚨');
  }

  return (
    <Card className="border-border">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Siren className="h-4 w-4 text-primary" /> Sirene
        </CardTitle>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Luz girando no alto da tela e som, para os setores ou equipes escolhidos. O som só sai para
          quem já clicou em algo no app desde que abriu (regra do navegador); quem não clicou vê a luz.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {erro && <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{erro}</p>}

        <Tabs value={aba} onValueChange={setAba}>
          <TabsList className="h-auto flex-wrap justify-start">
            <TabsTrigger value="horarios" className="gap-1.5"><Clock className="h-3.5 w-3.5" /> Horários{painel ? ` (${horarios.length})` : ''}</TabsTrigger>
            <TabsTrigger value="agora" className="gap-1.5"><Play className="h-3.5 w-3.5" /> Tocar agora</TabsTrigger>
            <TabsTrigger value="toques" className="gap-1.5"><History className="h-3.5 w-3.5" /> Últimos toques</TabsTrigger>
          </TabsList>

          {/* ── Horários ─────────────────────────────────────────────── */}
          <TabsContent value="horarios" className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">Cada horário toca sozinho nos dias marcados.</p>
              <Button size="sm" className="gap-1.5" onClick={() => setEditando({ ...HORARIO_NOVO })}>
                <Plus className="h-4 w-4" /> Novo horário
              </Button>
            </div>

            {!painel ? (
              !erro && <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando…</p>
            ) : horarios.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center">
                <p className="text-sm font-medium">Nenhum horário ainda</p>
                <p className="mt-1 text-xs text-muted-foreground">Crie o primeiro: escolha a hora, os dias e quem ouve.</p>
              </div>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {horarios.map(a => (
                  <li key={a.id} className={cn('flex items-center gap-2 px-3 py-2.5 sm:gap-3', !a.ativo && 'opacity-55')}>
                    <span className="shrink-0 font-mono text-base font-semibold tabular-nums sm:w-14">{a.hora}</span>
                    <span className="hidden sm:inline-flex"><Bolinha cor={a.cor} tamanho={16} /></span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm sm:truncate">
                        <span className="font-medium">{resumoDosDias(a.dias)}</span>
                        <span className="text-muted-foreground"> · {corDaSirene(a.cor).nome} · {duracaoSegura(a.duracao_s)} s · {volumeSeguro(a.volume)}%</span>
                        {a.descricao && <span className="text-muted-foreground"> · «{a.descricao}»</span>}
                      </p>
                      <p className="text-xs text-muted-foreground sm:truncate">Para: {quem(a.setor_ids, a.equipe_ids)}</p>
                    </div>
                    <label className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
                      <Switch checked={a.ativo} onCheckedChange={v => void onAlternar(a, v)} aria-label={`Ligar o horário das ${a.hora}`} />
                      <span className="hidden w-14 sm:inline">{a.ativo ? 'Ligado' : 'Desligado'}</span>
                    </label>
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" title="Editar" aria-label={`Editar o horário das ${a.hora}`}
                      onClick={() => setEditando(horarioDoPainel(a))}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 hover:bg-destructive/10 hover:text-destructive" title="Apagar"
                      aria-label={`Apagar o horário das ${a.hora}`} onClick={() => setApagando(a)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>

          {/* ── Tocar agora ──────────────────────────────────────────── */}
          <TabsContent value="agora" className="space-y-5 pt-1">
            <Etapa n={1} titulo="Para quem toca">
              <EscolhaDeQuemOuve id="sirene-agora" setores={setores} equipes={equipes} valor={alvoAgora} onMudar={setAlvoAgora} />
            </Etapa>
            <Etapa n={2} titulo="Como toca">
              <div className="space-y-3">
                <EscolhaDeCor valor={corAgora} onMudar={setCorAgora} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Duração</p>
                    <EscolhaDeDuracao id="sirene-dur-agora" valor={duracaoAgora} onMudar={setDuracaoAgora} />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Volume</p>
                    <EscolhaDeVolume id="sirene-vol-agora" valor={volumeAgora} onMudar={setVolumeAgora} />
                  </div>
                </div>
              </div>
            </Etapa>
            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
              <Button className="gap-1.5" disabled={tocando || semNinguem(alvoAgora)} onClick={() => setConfirmando(true)}>
                <Play className="h-4 w-4" /> Tocar agora
              </Button>
              <Button variant="outline" className="gap-1.5" onClick={() => onTestar(corAgora, duracaoSegura(duracaoAgora), volumeAgora)}>
                <Eye className="h-4 w-4" /> Testar em mim
              </Button>
              {semNinguem(alvoAgora) && <span className="text-xs text-warning">Escolha para quem toca.</span>}
            </div>
          </TabsContent>

          {/* ── Últimos toques ───────────────────────────────────────── */}
          <TabsContent value="toques">
            {!painel || painel.toques.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">Nenhum toque na hora ainda.</p>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {painel.toques.slice(0, 10).map(t => (
                  <li key={t.id} className="flex items-center gap-3 px-3 py-2 text-xs">
                    <Bolinha cor={t.cor} tamanho={12} />
                    <span className="w-24 shrink-0 tabular-nums">
                      {new Date(t.toca_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{quem(t.setor_ids, t.equipe_ids)}</span>
                    <span className="shrink-0 text-muted-foreground">{t.volume}%{t.criado_por_nome && ` · ${t.criado_por_nome}`}</span>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>

      <EditorDeHorario horario={editando} setores={setores} equipes={equipes} salvando={salvando}
        onSalvar={h => void salvar(h)} onTestar={onTestar} onFechar={() => setEditando(null)} />

      <AlertDialog open={confirmando} onOpenChange={v => !tocando && setConfirmando(v)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tocar a sirene agora?</AlertDialogTitle>
            <AlertDialogDescription>
              Em 5 segundos, {corDaSirene(corAgora).nome.toLowerCase()}, por {duracaoSegura(duracaoAgora)} s,
              no volume {volumeAgora}%, para: {resumoDeQuemOuve(alvoAgora, setores, equipes)}. Todo mundo logado deles vê a luz e ouve o som.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={tocando}>Ainda não</AlertDialogCancel>
            <AlertDialogAction disabled={tocando} onClick={e => { e.preventDefault(); void tocar(); }}>
              {tocando ? 'Tocando…' : 'Tocar agora'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!apagando} onOpenChange={v => { if (!v) setApagando(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar o horário das {apagando?.hora}?</AlertDialogTitle>
            <AlertDialogDescription>
              {apagando && <>{resumoDosDias(apagando.dias)}, para {quem(apagando.setor_ids, apagando.equipe_ids)}. </>}
              Para só pausar, use o botão Ligado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { const a = apagando; setApagando(null); if (a) void onApagar(a); }}>
              Apagar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

export default function SireneConfig() {
  const { empresa } = useEmpresa();
  const setores = useSetoresDaEmpresa(empresa?.id);
  const equipes = useEquipesDaEmpresa(empresa?.id);
  const [painel, setPainel] = useState<Painel | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = () => {
    void lerPainelDaSirene().then(r => { setPainel(r.painel); setErro(r.erro); });
  };
  useEffect(recarregar, []);

  return (
    <TelaDaSirene
      setores={setores} equipes={equipes} painel={painel} erro={erro} onTestar={testarEmMim}
      onSalvar={async h => {
        const { alvo, ...resto } = h;
        const { erro: falha } = await salvarAgendamento({ ...resto, ...paraBanco(alvo) });
        if (!falha) recarregar();
        return falha;
      }}
      onAlternar={async (a, ativo) => {
        const { erro: falha } = await salvarAgendamento({ ...a, ativo, descricao: a.descricao ?? '' });
        if (falha) { toast.error('Não foi possível mudar', { description: falha }); return; }
        recarregar();
      }}
      onApagar={async a => {
        const { erro: falha } = await apagarAgendamento(a.id);
        if (falha) { toast.error('Não foi possível apagar', { description: falha }); return; }
        toast.success('Horário apagado.');
        recarregar();
      }}
      onTocar={async p => {
        const b = paraBanco(p.alvo);
        const r = await tocarAgora(p.cor, b.setor_ids, b.equipe_ids, p.duracao_s, p.volume);
        if (r.painel) setPainel(r.painel);
        return r.erro;
      }}
    />
  );
}
