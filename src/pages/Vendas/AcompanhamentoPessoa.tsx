/**
 * AcompanhamentoPessoa — o que se sabe de UMA pessoa: feedbacks e ausências.
 *
 * «Clicou no operador, vê só os feedbacks dele.» A tela de fora escolhe a
 * pessoa; esta mostra o histórico dela e deixa registrar mais.
 *
 * ## Feedback agrupado por mês, porque a planilha era assim
 *
 * Cada aba por operador tinha blocos JANEIRO, FEVEREIRO, MARÇO… com até cinco
 * feedbacks cada. Quem acompanhava lia «o que foi dito em março» — a lista
 * mantém esse corte em vez de virar uma fita contínua.
 *
 * ## A ausência avisa antes do banco recusar
 *
 * Sobreposição e as regras do formulário são conferidas aqui com a mesma frase
 * de `fn_ausencia_salvar`. Quem recusa de verdade continua sendo o banco: a
 * lista desta tela pode estar velha.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MessageSquareText, CalendarOff, Pencil, Trash2, X, Info, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAuth } from '@/hooks/useAuth';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { rotuloDoMes } from '@/lib/mesReferencia';
import { cn } from '@/lib/utils';
import {
  TIPOS_AUSENCIA, rotuloDoTipo, diasDaAusencia, diasNoRecorte, estadoDaAusencia,
  primeiraSobreposta, validarAusencia, rotuloDoPeriodo, type RascunhoAusencia,
} from '@/lib/ausencias';
import {
  buscarFeedbacks, salvarFeedback, excluirFeedback,
  buscarAusencias, salvarAusencia, excluirAusencia,
  type PessoaAcompanhada, type Feedback, type Ausencia,
} from '@/services/vendas/acompanhamento.service';

function hojeISO(): string {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

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

function limitesDoMes(iso: string): { de: string; ate: string } {
  const [ano, m] = iso.slice(0, 7).split('-').map(Number);
  const ultimo = new Date(Date.UTC(ano, m, 0)).getUTCDate();
  return { de: `${iso.slice(0, 7)}-01`, ate: `${iso.slice(0, 7)}-${String(ultimo).padStart(2, '0')}` };
}

const ROTULO_DO_ESTADO = {
  em_curso:  'em curso',
  futura:    'agendada',
  encerrada: 'encerrada',
} as const;

const RASCUNHO_VAZIO = (hoje: string): RascunhoAusencia => ({
  tipo: '', inicio: hoje, fim: hoje, meio_periodo: false, observacao: '',
});

interface Props {
  pessoa: PessoaAcompanhada;
  empresaId: string;
  /** Algo mudou que a lista de fora mostra (contagem, ausente hoje). */
  onMudou: () => void;
  onFechar: () => void;
}

export function AcompanhamentoPessoa({ pessoa, empresaId, onMudou, onFechar }: Props) {
  const { perfil } = useAuth();
  const { temPermissao } = useCargoPermissoes();

  const podeLerFeedback       = temPermissao('ver_feedbacks');
  const podeRegistrarFeedback = temPermissao('registrar_feedbacks');
  const podeExcluirFeedback   = temPermissao('excluir_feedbacks');
  const podeRegistrarAusencia = temPermissao('registrar_ausencias');
  const podeExcluirAusencia   = temPermissao('excluir_ausencias');

  const hoje = useMemo(hojeISO, []);
  // Feedback é sobre OUTRA pessoa: o banco recusa, e o formulário nem aparece.
  const souEu = perfil?.id === pessoa.id;

  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [ausencias, setAusencias] = useState<Ausencia[]>([]);
  const [carregando, setCarregando] = useState(false);

  /*
   * Clicar em três pessoas seguidas dispara três leituras, e a mais lenta pode
   * chegar por último — mostrando os feedbacks da primeira sob o nome da
   * terceira. Só a resposta da última leitura pedida é aplicada.
   */
  const leitura = useRef(0);

  const carregar = useCallback(async () => {
    const minha = ++leitura.current;
    setCarregando(true);
    const [fb, au] = await Promise.all([
      podeLerFeedback
        ? buscarFeedbacks(pessoa.id)
        : Promise.resolve({ ok: true, dado: [] as Feedback[], erro: null }),
      buscarAusencias(pessoa.id),
    ]);
    if (minha !== leitura.current) return;
    setCarregando(false);
    if (!fb.ok) toast.error(fb.erro ?? 'Não deu para ler os feedbacks.');
    if (!au.ok) toast.error(au.erro ?? 'Não deu para ler as ausências.');
    setFeedbacks(fb.dado ?? []);
    setAusencias(au.dado ?? []);
  }, [pessoa.id, podeLerFeedback]);

  useEffect(() => { void carregar(); }, [carregar]);

  /* ── Feedback ─────────────────────────────────────────────────────────── */

  const [fbData, setFbData] = useState(hoje);
  const [fbTexto, setFbTexto] = useState('');
  const [fbEditando, setFbEditando] = useState<Feedback | null>(null);
  const [fbSalvando, setFbSalvando] = useState(false);
  const [fbApagando, setFbApagando] = useState<Feedback | null>(null);

  // Trocar de pessoa com um rascunho aberto não pode levar o texto junto.
  useEffect(() => {
    setFbData(hoje); setFbTexto(''); setFbEditando(null);
  }, [pessoa.id, hoje]);

  function corrigirFeedback(f: Feedback) {
    setFbEditando(f);
    setFbData(f.data_feedback);
    setFbTexto(f.texto);
  }

  function cancelarFeedback() {
    setFbEditando(null);
    setFbData(hoje);
    setFbTexto('');
  }

  async function gravarFeedback() {
    if (fbTexto.trim() === '') { toast.error('O feedback está vazio.'); return; }
    if (fbData > hoje) { toast.error('Feedback não tem data futura.'); return; }

    setFbSalvando(true);
    const r = await salvarFeedback({
      id: fbEditando?.id ?? null,
      empresaId,
      operadorId: pessoa.id,
      data: fbData,
      texto: fbTexto,
    });
    setFbSalvando(false);

    if (!r.ok) { toast.error(r.erro ?? 'Não deu para gravar o feedback.'); return; }
    toast.success(fbEditando ? 'Feedback corrigido.' : 'Feedback registrado.');
    cancelarFeedback();
    void carregar();
    onMudou();
  }

  async function apagarFeedback(f: Feedback) {
    const r = await excluirFeedback(f.id);
    if (!r.ok) { toast.error(r.erro ?? 'Não deu para excluir.'); return; }
    toast.success('Feedback excluído.');
    if (fbEditando?.id === f.id) cancelarFeedback();
    void carregar();
    onMudou();
  }

  const feedbacksPorMes = useMemo(() => {
    const grupos = new Map<string, Feedback[]>();
    for (const f of feedbacks) {
      const mes = f.data_feedback.slice(0, 7);
      grupos.set(mes, [...(grupos.get(mes) ?? []), f]);
    }
    return [...grupos.entries()];
  }, [feedbacks]);

  /* ── Ausência ─────────────────────────────────────────────────────────── */

  const [rascunho, setRascunho] = useState<RascunhoAusencia>(RASCUNHO_VAZIO(hoje));
  const [auEditando, setAuEditando] = useState<Ausencia | null>(null);
  const [auSalvando, setAuSalvando] = useState(false);
  const [auApagando, setAuApagando] = useState<Ausencia | null>(null);

  useEffect(() => {
    setRascunho(RASCUNHO_VAZIO(hoje)); setAuEditando(null);
  }, [pessoa.id, hoje]);

  function mudarRascunho<K extends keyof RascunhoAusencia>(campo: K, valor: RascunhoAusencia[K]) {
    setRascunho(r => {
      const novo = { ...r, [campo]: valor };
      // Primeiro dia depois do último puxa o último junto: é o que a pessoa quis.
      if (campo === 'inicio' && typeof valor === 'string' && novo.fim < valor) novo.fim = valor;
      // Meio período só existe em um dia. Abrir o período desmarca, em vez de travar.
      if (novo.inicio !== novo.fim) novo.meio_periodo = false;
      return novo;
    });
  }

  function corrigirAusencia(a: Ausencia) {
    setAuEditando(a);
    setRascunho({
      tipo: a.tipo, inicio: a.inicio, fim: a.fim,
      meio_periodo: a.meio_periodo, observacao: a.observacao ?? '',
    });
  }

  function cancelarAusencia() {
    setAuEditando(null);
    setRascunho(RASCUNHO_VAZIO(hoje));
  }

  const problemaDoRascunho = useMemo(() => {
    const invalido = validarAusencia(rascunho);
    if (invalido) return invalido;
    const choque = primeiraSobreposta(ausencias, rascunho, auEditando?.id);
    if (choque) {
      return `Já existe ${rotuloDoTipo(choque.tipo).toLowerCase()} de ${rotuloDoPeriodo(choque)} para esta pessoa. `
        + 'Corrija aquela em vez de lançar outra por cima.';
    }
    return null;
  }, [rascunho, ausencias, auEditando?.id]);

  async function gravarAusencia() {
    if (problemaDoRascunho) { toast.error(problemaDoRascunho); return; }

    setAuSalvando(true);
    const r = await salvarAusencia({
      id: auEditando?.id ?? null,
      empresaId,
      operadorId: pessoa.id,
      tipo: rascunho.tipo,
      inicio: rascunho.inicio,
      fim: rascunho.fim,
      meioPeriodo: rascunho.meio_periodo,
      observacao: rascunho.observacao,
    });
    setAuSalvando(false);

    if (!r.ok) { toast.error(r.erro ?? 'Não deu para gravar a ausência.'); return; }

    // Férias cobrindo hoje mudam a situação no cadastro — dizer isso evita a
    // surpresa de a pessoa sumir do ranking «sozinha».
    const feriasHoje = rascunho.tipo === 'ferias' && rascunho.inicio <= hoje && rascunho.fim >= hoje;
    toast.success(
      (auEditando ? 'Ausência corrigida.' : 'Ausência lançada.')
      + (feriasHoje ? ` ${pessoa.nome} está de férias até ${diaCurto(rascunho.fim)}.` : ''),
    );
    cancelarAusencia();
    void carregar();
    onMudou();
  }

  async function apagarAusencia(a: Ausencia) {
    const r = await excluirAusencia(a.id);
    if (!r.ok) { toast.error(r.erro ?? 'Não deu para excluir.'); return; }
    toast.success('Ausência excluída.');
    if (auEditando?.id === a.id) cancelarAusencia();
    void carregar();
    onMudou();
  }

  const { de: mesDe, ate: mesAte } = limitesDoMes(hoje);
  const doMes = useMemo(() => {
    let total = 0;
    let abatem = 0;
    for (const a of ausencias) {
      const d = diasNoRecorte(a, mesDe, mesAte);
      total += d;
      if (TIPOS_AUSENCIA.find(t => t.tipo === a.tipo)?.abateMeta) abatem += d;
    }
    return { total, abatem };
  }, [ausencias, mesDe, mesAte]);

  const detalhe = [pessoa.equipe_nome, pessoa.setor_nome].filter(Boolean).join(' · ');

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-4">
      <header className="flex items-start gap-3">
        <Avatar className="h-14 w-14">
          {pessoa.foto_url && <AvatarImage src={pessoa.foto_url} alt={pessoa.nome} />}
          <AvatarFallback className="bg-primary/10 text-sm font-semibold text-primary">
            {iniciais(pessoa.nome)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold">{pessoa.nome}</h2>
          <p className="truncate text-xs text-muted-foreground">{detalhe || 'Sem equipe'}</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {pessoa.situacao === 'desligado' && <Badge variant="secondary">Desligada</Badge>}
            {pessoa.ausente_hoje && (
              <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-400">
                {rotuloDoTipo(pessoa.ausente_hoje)}
                {pessoa.ausente_ate ? ` até ${diaCurto(pessoa.ausente_ate)}` : ''}
              </Badge>
            )}
          </div>
        </div>
        <Button size="icon" variant="ghost" aria-label="Fechar" onClick={onFechar}>
          <X className="h-4 w-4" />
        </Button>
      </header>

      <Tabs defaultValue={podeLerFeedback ? 'feedbacks' : 'ausencias'} key={pessoa.id}>
        <TabsList>
          {podeLerFeedback && (
            <TabsTrigger value="feedbacks" className="gap-1.5">
              <MessageSquareText className="h-3.5 w-3.5" aria-hidden />
              Feedbacks <span className="tabular-nums text-muted-foreground">({feedbacks.length})</span>
            </TabsTrigger>
          )}
          <TabsTrigger value="ausencias" className="gap-1.5">
            <CalendarOff className="h-3.5 w-3.5" aria-hidden />
            Ausências <span className="tabular-nums text-muted-foreground">({ausencias.length})</span>
          </TabsTrigger>
        </TabsList>

        {podeLerFeedback && (
          <TabsContent value="feedbacks" className="space-y-4">
            {podeRegistrarFeedback && !souEu && (
              <div className="space-y-2 rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[13px] font-semibold">
                    {fbEditando ? `Corrigindo o feedback de ${diaCurto(fbEditando.data_feedback)}` : 'Novo feedback'}
                  </span>
                  <Input type="date" value={fbData} max={hoje} className="w-[160px]"
                         onChange={e => setFbData(e.target.value)} />
                </div>
                <Textarea
                  value={fbTexto}
                  onChange={e => setFbTexto(e.target.value)}
                  rows={4}
                  maxLength={5000}
                  placeholder="O que foi conversado, o que precisa melhorar, o que ficou combinado."
                />
                <div className="flex justify-end gap-2">
                  {fbEditando && (
                    <Button size="sm" variant="ghost" onClick={cancelarFeedback}>Cancelar</Button>
                  )}
                  <Button size="sm" onClick={() => void gravarFeedback()}
                          disabled={fbSalvando || fbTexto.trim() === ''}>
                    {fbSalvando ? 'Gravando…' : fbEditando ? 'Gravar correção' : 'Registrar'}
                  </Button>
                </div>
              </div>
            )}

            {feedbacks.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {carregando ? 'Carregando…' : 'Nenhum feedback registrado.'}
              </p>
            ) : (
              feedbacksPorMes.map(([mes, lista]) => (
                <div key={mes} className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {rotuloDoMes(mes)}
                  </h3>
                  {lista.map(f => {
                    const meu = f.autor_id !== null && f.autor_id === perfil?.id;
                    return (
                      <article key={f.id}
                               className={cn('rounded-lg border p-3',
                                 fbEditando?.id === f.id ? 'border-primary/50 bg-primary/5' : 'border-border')}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs text-muted-foreground">
                            <span className="tabular-nums">{diaCurto(f.data_feedback)}</span>
                            {' · '}{f.autor_nome}
                          </span>
                          <div className="flex items-center">
                            {meu && podeRegistrarFeedback && (
                              <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Corrigir"
                                      onClick={() => corrigirFeedback(f)}>
                                <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                              </Button>
                            )}
                            {podeExcluirFeedback && (
                              <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Excluir"
                                      onClick={() => setFbApagando(f)}>
                                <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                              </Button>
                            )}
                          </div>
                        </div>
                        <p className="mt-1 whitespace-pre-wrap break-words text-sm">{f.texto}</p>
                      </article>
                    );
                  })}
                </div>
              ))
            )}
          </TabsContent>
        )}

        <TabsContent value="ausencias" className="space-y-4">
          {podeRegistrarAusencia && (
            <div className="space-y-3 rounded-lg border border-border p-3">
              <span className="text-[13px] font-semibold">
                {auEditando ? 'Corrigindo a ausência' : 'Lançar ausência'}
              </span>
              <div className="grid gap-2 sm:grid-cols-[1.2fr_1fr_1fr]">
                <Select value={rascunho.tipo} onValueChange={v => mudarRascunho('tipo', v)}>
                  <SelectTrigger aria-label="Tipo"><SelectValue placeholder="Tipo" /></SelectTrigger>
                  <SelectContent>
                    {TIPOS_AUSENCIA.map(t => (
                      <SelectItem key={t.tipo} value={t.tipo}>{t.rotulo}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input type="date" aria-label="Primeiro dia" value={rascunho.inicio}
                       onChange={e => mudarRascunho('inicio', e.target.value)} />
                <Input type="date" aria-label="Último dia" value={rascunho.fim} min={rascunho.inicio}
                       onChange={e => mudarRascunho('fim', e.target.value)} />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <label className={cn('flex items-center gap-2 text-xs',
                  rascunho.inicio !== rascunho.fim && 'text-muted-foreground opacity-60')}>
                  <Checkbox
                    checked={rascunho.meio_periodo}
                    disabled={rascunho.inicio !== rascunho.fim}
                    onCheckedChange={v => mudarRascunho('meio_periodo', v === true)}
                  />
                  Meio período
                </label>
                <Input value={rascunho.observacao} placeholder="Observação (obrigatória em «Outros»)"
                       className="min-w-[200px] flex-1"
                       onChange={e => mudarRascunho('observacao', e.target.value)} />
              </div>

              {rascunho.tipo === 'ferias' && (
                <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  Férias daqui mudam a situação no cadastro: a pessoa fica «de férias» a partir do
                  primeiro dia e volta a ativa sozinha no dia seguinte ao último.
                </p>
              )}
              {problemaDoRascunho && rascunho.tipo !== '' && (
                <p className="flex items-start gap-1.5 text-[11px] text-destructive">
                  <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  {problemaDoRascunho}
                </p>
              )}

              <div className="flex justify-end gap-2">
                {auEditando && (
                  <Button size="sm" variant="ghost" onClick={cancelarAusencia}>Cancelar</Button>
                )}
                <Button size="sm" onClick={() => void gravarAusencia()}
                        disabled={auSalvando || problemaDoRascunho !== null}>
                  {auSalvando ? 'Gravando…' : auEditando ? 'Gravar correção' : 'Lançar'}
                </Button>
              </div>
            </div>
          )}

          {doMes.total > 0 && (
            <p className="text-xs text-muted-foreground">
              Em {rotuloDoMes(hoje.slice(0, 7))}: <strong className="tabular-nums">{doMes.total}</strong>
              {' '}{doMes.total === 1 ? 'dia' : 'dias'} fora
              {doMes.abatem !== doMes.total && (
                <>, <span className="tabular-nums">{doMes.abatem}</span> de ausência justificada</>
              )}.
            </p>
          )}

          {ausencias.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {carregando ? 'Carregando…' : 'Nenhuma ausência lançada.'}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Tipo</th>
                    <th className="px-3 py-2 text-left font-medium">Período</th>
                    <th className="px-3 py-2 text-right font-medium">Dias</th>
                    <th className="px-3 py-2 text-left font-medium">Observação</th>
                    {(podeRegistrarAusencia || podeExcluirAusencia) && <th className="w-16" />}
                  </tr>
                </thead>
                <tbody>
                  {ausencias.map(a => {
                    const estado = estadoDaAusencia(a, hoje);
                    return (
                      <tr key={a.id}
                          className={cn('border-t border-border',
                            auEditando?.id === a.id && 'bg-primary/5')}>
                        <td className="px-3 py-2">
                          <span className="font-medium">{rotuloDoTipo(a.tipo)}</span>
                          <span className={cn('ml-1.5 text-[10px]',
                            estado === 'em_curso' ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground')}>
                            {ROTULO_DO_ESTADO[estado]}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 tabular-nums text-muted-foreground">
                          {rotuloDoPeriodo(a)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{diasDaAusencia(a)}</td>
                        <td className="max-w-[220px] truncate px-3 py-2 text-muted-foreground" title={a.observacao ?? undefined}>
                          {a.observacao ?? '—'}
                        </td>
                        {(podeRegistrarAusencia || podeExcluirAusencia) && (
                          <td className="whitespace-nowrap px-1 py-1">
                            {podeRegistrarAusencia && (
                              <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Corrigir"
                                      onClick={() => corrigirAusencia(a)}>
                                <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                              </Button>
                            )}
                            {podeExcluirAusencia && (
                              <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Excluir"
                                      onClick={() => setAuApagando(a)}>
                                <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                              </Button>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <AlertDialog open={fbApagando !== null} onOpenChange={o => { if (!o) setFbApagando(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir este feedback?</AlertDialogTitle>
            <AlertDialogDescription>
              {fbApagando && <>
                O feedback de {diaCurto(fbApagando.data_feedback)}, escrito por {fbApagando.autor_nome},
                some de vez. Não há lixeira para feedback.
              </>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              const f = fbApagando;
              setFbApagando(null);
              if (f) void apagarFeedback(f);
            }}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={auApagando !== null} onOpenChange={o => { if (!o) setAuApagando(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir esta ausência?</AlertDialogTitle>
            <AlertDialogDescription>
              {auApagando && <>
                {rotuloDoTipo(auApagando.tipo)} de {rotuloDoPeriodo(auApagando)} some de vez.
                {auApagando.tipo === 'ferias' && estadoDaAusencia(auApagando, hoje) === 'em_curso' && (
                  <> Como são férias em curso, {pessoa.nome} volta a ativa agora.</>
                )}
              </>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              const a = auApagando;
              setAuApagando(null);
              if (a) void apagarAusencia(a);
            }}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
