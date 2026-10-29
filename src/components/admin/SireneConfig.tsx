/**
 * SireneConfig.tsx — o cartão de Configurações > Geral da sirene (29/10/2026).
 *
 *   Tocar agora   cor, setores e duração; toca em 5 s para quem é dos setores
 *   Horários      «às 9h toca azul, às 14h verde»: hora, dias da semana, cor,
 *                 setores e duração; liga/desliga cada um
 *   Testar em mim só nesta aba, nada gravado
 *
 * Só super_admin — as funções `fn_sirene_*` conferem de novo no banco. Ver
 * `Sirene/sirene.ts` e a migration 20261029160000.
 */
import { useEffect, useState } from 'react';
import { Siren, Loader2, Play, Eye, Plus, Pencil, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useSetoresDaEmpresa, type SetorResumo } from '@/pages/AdminPermissoes/useSetoresDaEmpresa';
import {
  CORES, DIAS_DA_SEMANA, DURACAO_MAX_S, DURACAO_MIN_S, DURACAO_PADRAO_S, corDaSirene, duracaoSegura,
  resumoDosDias, type CorDaSirene,
} from '@/components/Sirene/horario';
import {
  apagarAgendamento, lerPainelDaSirene, salvarAgendamento, tocarAgora, testarEmMim,
  type AgendamentoNoPainel, type Painel, type Rascunho,
} from '@/components/Sirene/sirene';

/**
 * Para quem toca: «todos» ou a lista de setores. No banco, «todos» é a lista
 * vazia — por isso a tela guarda as duas coisas separadas: desmarcar «Todos»
 * deixa a lista vazia para escolher, e lista vazia não se salva.
 */
type Alvo = 'todos' | string[];

const paraBanco = (alvo: Alvo): string[] => (alvo === 'todos' ? [] : alvo);
const doBanco = (ids: string[]): Alvo => (ids.length === 0 ? 'todos' : ids);
const semSetor = (alvo: Alvo) => alvo !== 'todos' && alvo.length === 0;

type RascunhoNaTela = Omit<Rascunho, 'setor_ids'> & { alvo: Alvo };

const NOVO: RascunhoNaTela = {
  id: null, hora: '09:00', dias: [1, 2, 3, 4, 5], cor: 'policia', alvo: [],
  duracao_s: DURACAO_PADRAO_S, ativo: true, descricao: '',
};

function Bolinha({ cor, tamanho = 12 }: { cor: CorDaSirene; tamanho?: number }) {
  const c = corDaSirene(cor);
  return (
    <span
      aria-hidden
      className="inline-block shrink-0 rounded-full border border-border"
      style={{ width: tamanho, height: tamanho, background: `linear-gradient(90deg, ${c.luz} 50%, ${c.luz2} 50%)` }}
    />
  );
}

function EscolhaDeCor({ valor, onMudar }: { valor: CorDaSirene; onMudar: (c: CorDaSirene) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {CORES.map(c => (
        <button
          key={c.slug} type="button" onClick={() => onMudar(c.slug)}
          className={cn(
            'flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs transition-colors',
            valor === c.slug ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:bg-muted',
          )}
        >
          <Bolinha cor={c.slug} /> {c.nome}
        </button>
      ))}
    </div>
  );
}

function EscolhaDeSetores({ setores, valor, onMudar }: {
  setores: SetorResumo[]; valor: Alvo; onMudar: (alvo: Alvo) => void;
}) {
  const todos = valor === 'todos';
  const marcados = todos ? [] : valor;
  return (
    <div className="space-y-1">
      <label className="flex items-center gap-2 text-xs font-medium">
        <Checkbox checked={todos} onCheckedChange={v => onMudar(v ? 'todos' : [])} />
        Todos os setores
      </label>
      {!todos && (
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-md border border-border p-2">
          {setores.map(s => (
            <label key={s.id} className="flex items-center gap-2 text-xs">
              <Checkbox
                checked={marcados.includes(s.id)}
                onCheckedChange={v => onMudar(v ? [...marcados, s.id] : marcados.filter(x => x !== s.id))}
              />
              <span className="truncate">{s.nome}</span>
            </label>
          ))}
          {marcados.length === 0 && (
            <p className="col-span-2 text-[11px] text-muted-foreground">Marque quem ouve a sirene.</p>
          )}
        </div>
      )}
    </div>
  );
}

function nomesDosSetores(ids: Alvo, setores: SetorResumo[]): string {
  if (ids === 'todos' || ids.length === 0) return 'Todos os setores';
  return ids.map(id => setores.find(s => s.id === id)?.nome ?? 'setor de outra empresa').join(', ');
}

export default function SireneConfig() {
  const { empresa } = useEmpresa();
  const setores = useSetoresDaEmpresa(empresa?.id);
  const [painel, setPainel] = useState<Painel | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  // Tocar agora
  const [corAgora, setCorAgora] = useState<CorDaSirene>('policia');
  const [setoresAgora, setSetoresAgora] = useState<Alvo>([]);
  const [duracaoAgora, setDuracaoAgora] = useState(String(DURACAO_PADRAO_S));
  const [confirmando, setConfirmando] = useState(false);

  // Horário sendo criado ou editado
  const [rascunho, setRascunho] = useState<RascunhoNaTela | null>(null);

  const recarregar = () => {
    void lerPainelDaSirene().then(r => { setPainel(r.painel); setErro(r.erro); });
  };
  useEffect(recarregar, []);

  async function tocar() {
    setEnviando(true);
    const r = await tocarAgora(corAgora, paraBanco(setoresAgora), Number(duracaoAgora));
    setEnviando(false);
    setConfirmando(false);
    if (r.erro) { toast.error('Não foi possível tocar a sirene', { description: r.erro }); return; }
    if (r.painel) setPainel(r.painel);
    toast.success('Sirene tocando em 5 segundos 🚨');
  }

  async function salvar() {
    if (!rascunho) return;
    if (rascunho.dias.length === 0) { toast.error('Escolha pelo menos um dia.'); return; }
    if (semSetor(rascunho.alvo)) { toast.error('Escolha os setores, ou marque «Todos os setores».'); return; }
    setEnviando(true);
    const { alvo, ...resto } = rascunho;
    const { erro: falha } = await salvarAgendamento({ ...resto, setor_ids: paraBanco(alvo) });
    setEnviando(false);
    if (falha) { toast.error('Não foi possível salvar', { description: falha }); return; }
    toast.success(rascunho.id ? 'Horário atualizado.' : 'Horário criado.');
    setRascunho(null);
    recarregar();
  }

  async function alternarAtivo(a: AgendamentoNoPainel, ativo: boolean) {
    const { erro: falha } = await salvarAgendamento({ ...a, ativo, descricao: a.descricao ?? '' });
    if (falha) { toast.error('Não foi possível mudar', { description: falha }); return; }
    recarregar();
  }

  async function apagar(a: AgendamentoNoPainel) {
    const { erro: falha } = await apagarAgendamento(a.id);
    if (falha) { toast.error('Não foi possível apagar', { description: falha }); return; }
    toast.success('Horário apagado.');
    recarregar();
  }

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Siren className="w-4 h-4 text-primary" /> Sirene
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground leading-relaxed">
          Uma sirene com luz girando no alto da tela e som, para quem é dos setores escolhidos. Toca
          em horários fixos, cada um com a sua cor, ou na hora pelo «Tocar agora». O som só sai para
          quem já clicou em algo no app desde que abriu (regra do navegador); quem não clicou vê a luz.
        </p>

        {erro && <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{erro}</p>}

        {/* ── Tocar agora ─────────────────────────────────────────────── */}
        <section className="space-y-2 rounded-md border border-border p-3">
          <p className="text-xs font-semibold">Tocar agora</p>
          <EscolhaDeCor valor={corAgora} onMudar={setCorAgora} />
          <EscolhaDeSetores setores={setores} valor={setoresAgora} onMudar={setSetoresAgora} />
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label className="text-xs" htmlFor="sirene-dur-agora">Duração (s)</Label>
              <Input
                id="sirene-dur-agora" type="number" min={DURACAO_MIN_S} max={DURACAO_MAX_S}
                value={duracaoAgora} onChange={e => setDuracaoAgora(e.target.value)} className="h-8 w-20 text-sm"
              />
            </div>
            <Button size="sm" className="gap-1.5" disabled={enviando || semSetor(setoresAgora)} onClick={() => setConfirmando(true)}>
              <Play className="w-3.5 h-3.5" /> Tocar agora
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => testarEmMim(corAgora, Number(duracaoAgora))}>
              <Eye className="w-3.5 h-3.5" /> Testar em mim
            </Button>
          </div>
        </section>

        {/* ── Horários ────────────────────────────────────────────────── */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold">Horários</p>
            {!rascunho && (
              <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => setRascunho({ ...NOVO })}>
                <Plus className="w-3.5 h-3.5" /> Novo horário
              </Button>
            )}
          </div>

          {rascunho && (
            <div className="space-y-2 rounded-md border border-dashed border-primary/40 bg-primary/5 p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium">{rascunho.id ? 'Editar horário' : 'Novo horário'}</p>
                <button type="button" onClick={() => setRascunho(null)} aria-label="Fechar"
                        className="rounded p-0.5 text-muted-foreground hover:bg-muted">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <Label className="text-xs" htmlFor="sirene-hora">Hora</Label>
                  <Input id="sirene-hora" type="time" value={rascunho.hora}
                         onChange={e => setRascunho({ ...rascunho, hora: e.target.value })} className="h-8 w-28 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs" htmlFor="sirene-dur">Duração (s)</Label>
                  <Input id="sirene-dur" type="number" min={DURACAO_MIN_S} max={DURACAO_MAX_S} value={rascunho.duracao_s}
                         onChange={e => setRascunho({ ...rascunho, duracao_s: Number(e.target.value) })} className="h-8 w-20 text-sm" />
                </div>
                <div className="min-w-[10rem] flex-1 space-y-1">
                  <Label className="text-xs" htmlFor="sirene-desc">Texto na tela (opcional)</Label>
                  <Input id="sirene-desc" maxLength={80} value={rascunho.descricao} placeholder="Ex.: Hora do café"
                         onChange={e => setRascunho({ ...rascunho, descricao: e.target.value })} className="h-8 text-sm" />
                </div>
              </div>
              <div className="flex flex-wrap gap-1">
                {DIAS_DA_SEMANA.map((nome, n) => {
                  const marcado = rascunho.dias.includes(n);
                  return (
                    <button
                      key={nome} type="button"
                      onClick={() => setRascunho({ ...rascunho, dias: marcado ? rascunho.dias.filter(d => d !== n) : [...rascunho.dias, n] })}
                      className={cn(
                        'rounded-md border px-2 py-0.5 text-xs',
                        marcado ? 'border-primary bg-primary/10' : 'border-border text-muted-foreground hover:bg-muted',
                      )}
                    >
                      {nome}
                    </button>
                  );
                })}
              </div>
              <EscolhaDeCor valor={rascunho.cor} onMudar={cor => setRascunho({ ...rascunho, cor })} />
              <EscolhaDeSetores setores={setores} valor={rascunho.alvo}
                                onMudar={alvo => setRascunho({ ...rascunho, alvo })} />
              <div className="flex gap-2">
                <Button size="sm" disabled={enviando || !rascunho.hora} onClick={() => void salvar()} className="gap-1.5">
                  {enviando && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Salvar
                </Button>
                <Button size="sm" variant="outline" onClick={() => testarEmMim(rascunho.cor, rascunho.duracao_s)} className="gap-1.5">
                  <Eye className="w-3.5 h-3.5" /> Testar em mim
                </Button>
              </div>
            </div>
          )}

          {!painel ? (
            !erro && <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando…</p>
          ) : painel.agendamentos.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum horário ainda.</p>
          ) : (
            <div className="divide-y divide-border rounded-md border border-border">
              {painel.agendamentos.map(a => (
                <div key={a.id} className={cn('flex items-center gap-3 px-3 py-2', !a.ativo && 'opacity-60')}>
                  <span className="w-12 font-mono text-sm font-semibold">{a.hora}</span>
                  <Bolinha cor={a.cor} tamanho={14} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs">
                      {corDaSirene(a.cor).nome} · {resumoDosDias(a.dias)} · {duracaoSegura(a.duracao_s)} s
                      {a.descricao && <> · «{a.descricao}»</>}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">{nomesDosSetores(a.setor_ids, setores)}</p>
                  </div>
                  <Switch checked={a.ativo} onCheckedChange={v => void alternarAtivo(a, v)} aria-label="Ligado" />
                  <button type="button" title="Editar" aria-label="Editar horário"
                          onClick={() => setRascunho({ ...a, alvo: doBanco(a.setor_ids), descricao: a.descricao ?? '' })}
                          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button type="button" title="Apagar" aria-label="Apagar horário" onClick={() => void apagar(a)}
                          className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {painel && painel.toques.length > 0 && (
          <section className="space-y-1">
            <p className="text-xs font-semibold">Últimos toques na hora</p>
            {painel.toques.slice(0, 5).map(t => (
              <p key={t.id} className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <Bolinha cor={t.cor} tamanho={10} />
                {new Date(t.toca_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                {' · '}{nomesDosSetores(t.setor_ids, setores)}
                {t.criado_por_nome && <> · {t.criado_por_nome}</>}
              </p>
            ))}
          </section>
        )}
      </CardContent>

      <AlertDialog open={confirmando} onOpenChange={v => !enviando && setConfirmando(v)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tocar a sirene agora?</AlertDialogTitle>
            <AlertDialogDescription>
              Em 5 segundos, {corDaSirene(corAgora).nome.toLowerCase()}, por {duracaoSegura(duracaoAgora)} s,
              para: {nomesDosSetores(setoresAgora, setores)}. Todo mundo logado desses setores vê a luz e ouve o som.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={enviando}>Ainda não</AlertDialogCancel>
            <AlertDialogAction disabled={enviando} onClick={e => { e.preventDefault(); void tocar(); }}>
              {enviando ? 'Tocando…' : 'Tocar agora'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
