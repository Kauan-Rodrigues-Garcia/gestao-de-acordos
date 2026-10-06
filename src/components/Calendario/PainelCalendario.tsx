/**
 * Calendário do setor — o painel que abre por cima da tela (pedido de
 * 06/10/2026).
 *
 * «Não quero que seja uma aba tradicional: pode ficar em cima, mostrando o
 * calendário do mês, onde a pessoa clica e não abre uma aba, porém ela vê o
 * calendário só com as coisas importantes.» Por isso não há rota nem item de
 * menu: o botão mora no topo do app (`BotaoCalendario`) e abre este painel, do
 * mesmo jeito que o Desempenho do Dia.
 *
 * ## Rascunho e publicação
 *
 * Todo mês nasce RASCUNHO: só quem monta (`calendario_editar`) vê. Quando a
 * liderança termina de preencher, «Lançar para a operação» publica o mês, e o
 * operador passa a vê-lo. Depois de publicado, o que mudar aparece na hora — e
 * dá para recolher de volta. Quem esconde o rascunho é o banco
 * (`fn_calendario_mes`, migration 20261006190000), não esta tela.
 *
 * ## O dia útil é o da meta
 *
 * Ele vem das Metas (cobrança) ou do calendário de Vendas (Comercial), e não
 * de um feriado lançado aqui. Lançar um feriado que as Metas não têm mostra o
 * aviso para quem edita — a meta diária continua contando aquele dia.
 *
 * ## Copiar imagem
 *
 * O cartão do calendário vira PNG na área de transferência, para colar no
 * grupo do setor — o mesmo caminho do «copiar imagem» do Plantão Elite.
 */
import { useCallback, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  CalendarDays, ChevronLeft, ChevronRight, EyeOff, ImageDown, Loader2, Palette, Send, Wand2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogDescription, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useCalendarioSetor } from '@/hooks/useCalendarioSetor';
import { getTodayISO } from '@/lib/index';
import { deslocarMes } from '@/lib/mesReferencia';
import { produtoDaEmpresa } from '@/lib/produto';
import { copiarImagemDoElemento } from '@/lib/copiarImagem';
import {
  corForte, eventosPorDia, proximosEventos, resumoDoMes, rotuloDoMesLongo,
  temaEfetivo, textoSobreCor, INFO_TIPO, TIPOS_EVENTO, type TipoEvento,
} from '@/lib/calendarioSetor';
import {
  listarPessoasDoSetor, publicarMes, type PessoaDoSetor,
} from '@/services/calendario/calendario.service';
import { GradeDoMes } from './GradeDoMes';
import { DialogoDia } from './DialogoDia';
import { DialogoLote } from './DialogoLote';
import { DialogoCapa } from './DialogoCapa';
import { PainelLateral } from './PainelLateral';
import { IconeTipo } from './tipos';
import './calendario.css';

interface Props {
  aberto: boolean;
  onClose: () => void;
}

export function PainelCalendario({ aberto, onClose }: Props) {
  return (
    <Dialog open={aberto} onOpenChange={a => { if (!a) onClose(); }}>
      <DialogContent className="block max-h-[94vh] w-[calc(100vw-1rem)] max-w-[1400px] overflow-y-auto p-0 sm:rounded-2xl">
        <DialogTitle className="sr-only">Calendário do setor</DialogTitle>
        <DialogDescription className="sr-only">
          O mês do setor: dias úteis, banco de horas, feriados, aniversariantes e avisos.
        </DialogDescription>
        {aberto && <ConteudoCalendario />}
      </DialogContent>
    </Dialog>
  );
}

function ConteudoCalendario() {
  const { perfil } = useAuth();
  const { empresa, tenantSlug } = useEmpresa();
  const empresaId = empresa?.id ?? '';
  const produto = produtoDaEmpresa(empresa, tenantSlug);
  const hojeISO = getTodayISO();

  const [mes, setMes] = useState(() => hojeISO.slice(0, 7));
  const cal = useCalendarioSetor(empresaId, produto, perfil?.setor_id ?? null, mes);
  const { setor, setorId, dados, ehDiaUtil, feriadosOficiais } = cal;
  const podeEditar = setor?.pode_editar === true;

  const [diaAberto, setDiaAberto] = useState<string | null>(null);
  const [loteAberto, setLoteAberto] = useState(false);
  const [capaAberta, setCapaAberta] = useState(false);
  const [copiando, setCopiando] = useState(false);
  const [publicando, setPublicando] = useState(false);
  const [confirmarRecolher, setConfirmarRecolher] = useState(false);
  const cartaoRef = useRef<HTMLDivElement>(null);

  // As pessoas do setor só são lidas quando quem edita abre um formulário.
  const [pessoas, setPessoas] = useState<{ setorId: string; lista: PessoaDoSetor[] } | null>(null);
  const precisaPessoas = useCallback(() => {
    if (!empresaId || !setorId || !podeEditar || pessoas?.setorId === setorId) return;
    listarPessoasDoSetor(empresaId, setorId)
      .then(lista => setPessoas({ setorId, lista }))
      .catch(() => setPessoas({ setorId, lista: [] }));
  }, [empresaId, setorId, podeEditar, pessoas?.setorId]);
  const pessoasDoSetor = pessoas?.setorId === setorId ? pessoas.lista : null;

  // ── O tema ────────────────────────────────────────────────────────────────
  const tema = temaEfetivo(dados.capa?.tema, Number(mes.slice(5, 7)));
  const estiloTema = useMemo<CSSProperties>(() => {
    if (!tema.acento) return {};
    const forte = corForte(tema.acento);
    return {
      '--cal-acento': tema.acento,
      '--cal-forte': forte,
      '--cal-sobre-acento': textoSobreCor(forte),
    } as CSSProperties;
  }, [tema.acento]);
  const titulo = dados.capa?.titulo || tema.titulo || 'Calendário do setor';
  const frase = dados.capa?.frase || tema.frase;

  // ── O mês montado ─────────────────────────────────────────────────────────
  const porDia = useMemo(() => eventosPorDia(dados.eventos), [dados.eventos]);
  const feriadosSet = useMemo(() => new Set(feriadosOficiais), [feriadosOficiais]);
  const resumo = useMemo(
    () => resumoDoMes(mes, dados.eventos, ehDiaUtil, feriadosOficiais, hojeISO),
    [mes, dados.eventos, ehDiaUtil, feriadosOficiais, hojeISO],
  );
  const ehMesCorrente = hojeISO.slice(0, 7) === mes;
  const agenda = useMemo(() => proximosEventos(mes, dados.eventos, hojeISO), [mes, dados.eventos, hojeISO]);
  const aniversarios = useMemo(() => dados.eventos.filter(e => e.tipo === 'aniversario'), [dados.eventos]);
  const tiposNoMes = useMemo(
    () => TIPOS_EVENTO.filter(t => dados.eventos.some(e => e.tipo === t)) as TipoEvento[],
    [dados.eventos],
  );

  const rascunho = dados.temPublicacao && !dados.publicado;
  // O operador num mês ainda não lançado: vê os dias úteis, sem os eventos.
  const aguardandoLideranca = rascunho && !podeEditar && !cal.carregandoMes;

  const avisoFeriado = produto === 'comercial'
    ? 'As Metas de Vendas ainda contam este dia como útil. Para a meta diária descontá-lo, marque o feriado nos dias úteis de Usuários → Metas.'
    : 'As Metas ainda contam este dia como útil. Para a meta diária descontá-lo, inclua o feriado nos dias úteis de Usuários → Metas.';

  async function copiarImagem() {
    if (!cartaoRef.current) return;
    setCopiando(true);
    try {
      const nome = `calendario-${(setor?.nome ?? 'setor').toLowerCase().replace(/\s+/g, '-')}-${mes}.png`;
      const r = await copiarImagemDoElemento(cartaoRef.current, nome);
      toast.success(r === 'copiado' ? 'Imagem copiada — é só colar no grupo.' : 'Imagem baixada.');
    } catch {
      toast.error('Não foi possível gerar a imagem.');
    } finally {
      setCopiando(false);
    }
  }

  async function publicar(lancar: boolean) {
    if (!setorId) return;
    setPublicando(true);
    try {
      await publicarMes(empresaId, setorId, mes, lancar);
      toast.success(lancar
        ? `${rotuloDoMesLongo(mes)} lançado para a operação.`
        : `${rotuloDoMesLongo(mes)} voltou para rascunho.`);
      setConfirmarRecolher(false);
      cal.recarregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível publicar.');
    } finally {
      setPublicando(false);
    }
  }

  // ── Estados de espera e vazio ─────────────────────────────────────────────
  if (cal.carregandoSetores) {
    return (
      <div className="space-y-4 p-4 sm:p-6">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-[480px] w-full rounded-2xl" />
      </div>
    );
  }

  if (!setorId) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <CalendarDays className="h-7 w-7 text-muted-foreground/60" />
        <p className="max-w-md text-sm text-muted-foreground">
          {cal.erro ?? 'Seu cadastro ainda não está em nenhum setor, então não há calendário para mostrar. Peça para a liderança conferir seu setor.'}
        </p>
      </div>
    );
  }

  const diaEventos = diaAberto ? (porDia.get(diaAberto) ?? []) : [];
  const publicadoEm = dados.publicadoEm
    ? new Date(dados.publicadoEm).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div className="cal-raiz space-y-4 p-3 sm:p-5" style={estiloTema}>
      {/* ── Barra de controle (o X do diálogo fica no canto direito) ───────── */}
      <header className="flex flex-wrap items-center justify-between gap-2 pr-8">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label="Mês anterior" onClick={() => setMes(m => deslocarMes(m, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="min-w-[10.5rem] text-center text-lg font-semibold tracking-tight text-foreground">
            {rotuloDoMesLongo(mes)}
          </h2>
          <Button variant="ghost" size="icon" aria-label="Próximo mês" onClick={() => setMes(m => deslocarMes(m, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          {!ehMesCorrente && (
            <Button variant="outline" size="sm" className="ml-1" onClick={() => setMes(hojeISO.slice(0, 7))}>Hoje</Button>
          )}
          {cal.carregandoMes && <Loader2 className="ml-2 h-4 w-4 animate-spin text-muted-foreground" />}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {cal.setores.length > 1 && (
            <Select value={setorId} onValueChange={cal.setSetorId}>
              <SelectTrigger className="h-9 w-[190px]" aria-label="Setor"><SelectValue /></SelectTrigger>
              <SelectContent>
                {cal.setores.map(s => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {!aguardandoLideranca && (
            <Button variant="outline" size="sm" className="gap-2" onClick={() => void copiarImagem()} disabled={copiando}
              title="Copiar o calendário como imagem, para colar no grupo">
              {copiando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageDown className="h-4 w-4" />}
              <span className="hidden md:inline">Copiar imagem</span>
            </Button>
          )}
          {podeEditar && (
            <>
              <Button variant="outline" size="sm" className="gap-2" onClick={() => setCapaAberta(true)}>
                <Palette className="h-4 w-4" /> <span className="hidden md:inline">Personalizar</span>
              </Button>
              <Button variant="outline" size="sm" className="gap-2" onClick={() => { setLoteAberto(true); precisaPessoas(); }}>
                <Wand2 className="h-4 w-4" /> <span className="hidden md:inline">Aplicar em vários dias</span>
              </Button>
            </>
          )}
        </div>
      </header>

      {/* ── Situação do mês, para quem monta ─────────────────────────────────── */}
      {podeEditar && dados.temPublicacao && !cal.carregandoMes && (
        rascunho ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">Rascunho — só a liderança está vendo</p>
              <p className="text-xs text-muted-foreground">
                Preencha {rotuloDoMesLongo(mes).toLowerCase()} com calma. A operação só vê o mês quando você lançar.
              </p>
            </div>
            <Button size="sm" className="gap-2" onClick={() => void publicar(true)} disabled={publicando}>
              {publicando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Lançar para a operação
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5">
            <p className="text-xs text-foreground">
              <span className="font-semibold">Lançado para a operação</span>
              {publicadoEm && <span className="text-muted-foreground"> em {publicadoEm}</span>}
              <span className="text-muted-foreground"> · o que você mudar aparece na hora.</span>
            </p>
            {confirmarRecolher ? (
              <span className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground">A operação deixa de ver o mês.</span>
                <Button size="sm" variant="destructive" className="h-7" disabled={publicando} onClick={() => void publicar(false)}>
                  {publicando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Recolher'}
                </Button>
                <Button size="sm" variant="ghost" className="h-7" onClick={() => setConfirmarRecolher(false)}>Não</Button>
              </span>
            ) : (
              <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-xs" onClick={() => setConfirmarRecolher(true)}>
                <EyeOff className="h-3.5 w-3.5" /> Voltar para rascunho
              </Button>
            )}
          </div>
        )
      )}

      {aguardandoLideranca && (
        <p className="rounded-2xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          A liderança ainda está montando o calendário de {rotuloDoMesLongo(mes).toLowerCase()}. Por enquanto, aqui estão os dias úteis do mês.
        </p>
      )}

      {cal.erro && (
        <p className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">{cal.erro}</p>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        {/* ── O cartão: é ele que vira imagem ──────────────────────────────── */}
        <div ref={cartaoRef} className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="cal-capa flex items-center gap-4 px-4 py-4 sm:px-6 sm:py-5">
            <span className="cal-emoji h-12 w-12 shrink-0 text-2xl sm:h-14 sm:w-14 sm:text-3xl" aria-hidden>{tema.emoji}</span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-muted-foreground">
                {setor?.nome} · {rotuloDoMesLongo(mes)}
              </p>
              <h3 className="cal-capa-titulo truncate text-xl font-bold tracking-tight sm:text-2xl">{titulo}</h3>
              {frase && <p className="mt-0.5 text-sm text-muted-foreground">{frase}</p>}
            </div>
            <div className="hidden shrink-0 text-right sm:block">
              <p className="cal-capa-titulo text-3xl font-bold tabular-nums leading-none">{resumo.diasUteis}</p>
              <p className="text-[11px] font-medium text-muted-foreground">dias úteis</p>
            </div>
          </div>

          <GradeDoMes
            mes={mes}
            porDia={porDia}
            ehDiaUtil={ehDiaUtil}
            feriadosOficiais={feriadosSet}
            hojeISO={hojeISO}
            onAbrirDia={setDiaAberto}
          />

          {/* Legenda: só o que aparece neste mês, mais o dia não útil. */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border px-4 py-2.5 text-[11px] text-muted-foreground sm:px-6">
            {tiposNoMes.map(t => (
              <span key={t} className="inline-flex items-center gap-1.5">
                <IconeTipo tipo={t} className="h-5 w-5 rounded-md" tamanho="h-3 w-3" />
                {INFO_TIPO[t].rotulo}
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5">
              <span className="cal-nao-util h-3.5 w-3.5 rounded border border-border" /> Não é dia útil
            </span>
            {podeEditar && <span className="ml-auto hidden sm:inline">Clique num dia para lançar</span>}
          </div>
        </div>

        <PainelLateral
          resumo={resumo}
          capa={dados.capa}
          aniversarios={aniversarios}
          agenda={agenda}
          ehMesCorrente={ehMesCorrente}
          hojeISO={hojeISO}
          onAbrirDia={setDiaAberto}
        />
      </div>

      <DialogoDia
        iso={diaAberto}
        eventos={diaEventos}
        util={diaAberto ? ehDiaUtil(diaAberto) : false}
        feriadoOficial={diaAberto ? feriadosSet.has(diaAberto) : false}
        podeEditar={podeEditar}
        empresaId={empresaId}
        setorId={setorId}
        pessoas={pessoasDoSetor}
        onPrecisaPessoas={precisaPessoas}
        avisoFeriadoForaDasMetas={avisoFeriado}
        onMudou={cal.recarregar}
        onFechar={() => setDiaAberto(null)}
        tema={estiloTema}
      />
      {podeEditar && (
        <>
          <DialogoLote
            aberto={loteAberto}
            mes={mes}
            ehDiaUtil={ehDiaUtil}
            empresaId={empresaId}
            setorId={setorId}
            pessoas={pessoasDoSetor}
            avisoFeriadoForaDasMetas={avisoFeriado}
            onMudou={cal.recarregar}
            onFechar={() => setLoteAberto(false)}
            tema={estiloTema}
          />
          <DialogoCapa
            aberto={capaAberta}
            mes={mes}
            capa={dados.capa}
            empresaId={empresaId}
            setorId={setorId}
            tema={estiloTema}
            onMudou={cal.recarregar}
            onFechar={() => setCapaAberta(false)}
          />
        </>
      )}
    </div>
  );
}
