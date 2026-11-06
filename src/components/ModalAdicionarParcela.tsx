/**
 * ModalAdicionarParcela.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Modal único das duas portas de "adicionar parcela ao mesmo NR":
 *  • Porta A — tabulação bloqueada porque o NR já é do próprio operador
 *    (AcordoNovoInline): campos chegam preenchidos com o que foi digitado.
 *  • Porta B — botão "Adicionar parcela" no detalhe do acordo
 *    (AcordoDetalheInline): campos abrem com sugestões do acordo.
 *
 * Mostra o acordo existente + parcelas do grupo e deixa o operador revisar
 * vencimento, valor, forma e status antes de confirmar.
 *
 * Parcela em aberto (06/11/2026): o grupo só tem uma parcela em aberto por
 * vez, e a nova não vira registro enquanto a atual não for quitada. Antes isso
 * acontecia calado — o valor, a data e a forma digitados se perdiam. Agora o
 * modal avisa e a pessoa escolhe: marcar a atual como paga e registrar a nova,
 * ou (Nosso produto) só aumentar o total de parcelas.
 *
 * Regra Cofen (`isPaguePlay`): uma parcela por vez, que sempre vira registro e
 * soma no valor total do acordo. Por isso a atual precisa estar paga e o plano
 * já declarado precisa estar todo registrado.
 */
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Layers, Plus } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { DatePickerField } from '@/components/DatePickerField';
import { supabase, type Acordo } from '@/lib/supabase';
import type { NovaParcelaInput, QuitarAntes } from '@/services/parcelas.service';
import {
  planejarParcelas, validarPlano, MAX_PARCELAS_LOTE, type AjustePersonalizado,
} from '@/services/parcelasLote';
import {
  formatCurrency, formatDate, parseCurrencyInput, getTodayISO,
  STATUS_LABELS, STATUS_LABELS_PAGUEPLAY, STATUS_COLORS,
  TIPO_LABELS, TIPO_LABELS_PAGUEPLAY,
} from '@/lib/index';
import { TIPOS_PAGUEPLAY, TIPOS_BOOKPLAY, STATUS_OPTIONS } from '@/components/AcordoNovoInline/constants';
import { ehFormaRecorrente, erroVencimentoRecorrente, nomeDaFormaRecorrente } from '@/lib/formasRecorrentes';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export interface ModalAdicionarParcelaProps {
  aberto:      boolean;
  /** Acordo existente que receberá a nova parcela (qualquer parcela do grupo). */
  acordo:      Acordo | null;
  isPaguePlay: boolean;
  /** Valores iniciais dos campos (porta A: o que o operador digitou na tabulação). */
  inicial?:    Partial<NovaParcelaInput>;
  /** Texto de contexto no topo (porta A explica o bloqueio do NR). */
  descricao?:  string;
  salvando:    boolean;
  /**
   * Recebe SEMPRE uma lista — com quantidade 1 ela tem um item só. `quitar`
   * vem preenchido quando a pessoa escolheu marcar a parcela em aberto como
   * paga antes da inclusão.
   */
  onConfirm:   (inputs: NovaParcelaInput[], opcoes: { quitar: QuitarAntes | null }) => void | Promise<void>;
  onClose:     () => void;
}

/** O que fazer com a parcela em aberto do grupo. */
type EscolhaAberta = 'quitar' | 'so_total' | null;

/** No form PaguePlay boleto/pix são exibidos como a opção única 'boleto_pix'. */
function tipoParaOpcao(tipo: string | undefined, isPP: boolean): string {
  if (!tipo) return isPP ? 'boleto_pix' : 'boleto';
  if (isPP && (tipo === 'boleto' || tipo === 'pix')) return 'boleto_pix';
  return tipo;
}

type ParcelaResumo = Pick<Acordo, 'id' | 'numero_parcela' | 'vencimento' | 'valor' | 'status' | 'parcelas'>;

export function ModalAdicionarParcela({
  aberto, acordo, isPaguePlay, inicial, descricao, salvando, onConfirm, onClose,
}: ModalAdicionarParcelaProps) {
  const tipos        = isPaguePlay ? TIPOS_PAGUEPLAY : TIPOS_BOOKPLAY;
  const tipoLabels   = isPaguePlay ? TIPO_LABELS_PAGUEPLAY : TIPO_LABELS;
  const statusLabels = isPaguePlay ? STATUS_LABELS_PAGUEPLAY : STATUS_LABELS;
  const nrLabel      = isPaguePlay ? 'Código' : 'NR';
  const nrValor      = (isPaguePlay ? acordo?.instituicao : acordo?.nr_cliente) ?? '—';

  /**
   * Formas da lista personalizada. A lista trabalha com o valor que vai para o
   * banco, e a PaguePlay grava 'boleto' para a opção 'boleto_pix' — sem essa
   * troca o select ficava vazio, porque 'boleto' não existia entre as opções.
   */
  const tiposDaParcela = tipos.map(t => ({
    value: t.value === 'boleto_pix' ? 'boleto' : t.value,
    label: t.label,
  }));

  const [vencimento, setVencimento] = useState('');
  const [valorStr,   setValorStr]   = useState('');
  const [tipoSel,    setTipoSel]    = useState('boleto');
  const [statusSel,  setStatusSel]  = useState('verificar_pendente');
  const [parcelas,   setParcelas]   = useState<ParcelaResumo[]>([]);
  const [loadingParcelas, setLoadingParcelas] = useState(false);

  // Quantas parcelas adicionar de uma vez. Padrão 1: quem só quer uma parcela
  // não percebe que o campo existe. Na regra Cofen é sempre uma: cada parcela
  // entra com o próprio valor e soma no total.
  const [qtdStr, setQtdStr] = useState('1');
  const quantidade = isPaguePlay ? 1 : Math.min(Math.max(1, parseInt(qtdStr) || 1), MAX_PARCELAS_LOTE);

  // Parcela em aberto no grupo: o que a pessoa escolheu fazer com ela, e a
  // data do pagamento quando for marcá-la como paga (vazio = o vencimento dela).
  const [escolhaAberta, setEscolhaAberta] = useState<EscolhaAberta>(null);
  const [dataQuitar, setDataQuitar] = useState('');

  // Personalização por parcela. `Record` por índice, e não array, para uma
  // linha em branco continuar em branco quando a quantidade muda.
  //
  // O valor fica como TEXTO, exatamente o que a pessoa digitou. Guardar o número
  // já convertido quebrava a digitação: "150," virava 150 e o campo reescrevia
  // "150" na mesma tecla, apagando a vírgula — nunca dava para chegar aos
  // centavos. A conversão acontece só na hora de montar o plano.
  type AjusteDigitado = {
    valorStr?:   string;
    vencimento?: string | null;
    tipo?:       string | null;
  };
  const [personalizar, setPersonalizar] = useState(false);
  /*
   * PIX Automático / Cartão Recorrente como a PRÓXIMA parcela (08/10/2026):
   * a entrada foi paga num Pix comum e o restante vai para a recorrência. Entra
   * como UMA parcela, com o VALOR TOTAL do Pix Automático — a comissão sai da
   * aba Pix Automático, sobre o total —, e a pessoa confirma isso, como no
   * formulário de acordo novo.
   */
  const [confirmouValorTotal, setConfirmouValorTotal] = useState(false);
  const recorrenteSel = !isPaguePlay && ehFormaRecorrente(tipoSel);
  const escolherTipo = (t: string) => {
    if (t !== tipoSel) setConfirmouValorTotal(false);
    setTipoSel(t);
    // Recorrente é sempre uma parcela só: quem parcela é a recorrência.
    if (!isPaguePlay && ehFormaRecorrente(t)) { setQtdStr('1'); setPersonalizar(false); }
  };
  const [ajustes, setAjustes] = useState<Record<number, AjusteDigitado>>({});
  const setAjuste = (i: number, patch: AjusteDigitado) =>
    setAjustes(prev => ({ ...prev, [i]: { ...prev[i], ...patch } }));

  // (Re)inicializa os campos toda vez que o modal abre para um acordo.
  useEffect(() => {
    if (!aberto || !acordo) return;
    setVencimento(inicial?.vencimento ?? '');
    setValorStr(
      inicial?.valor != null && inicial.valor > 0
        ? inicial.valor.toFixed(2).replace('.', ',')
        : '',
    );
    // O acordo base recorrente não chega aqui (não tem reparcelamento); a
    // forma que vem do formulário, recorrente inclusive, abre como veio.
    const tipoBase = inicial?.tipo ?? (ehFormaRecorrente(acordo.tipo) ? 'boleto' : acordo.tipo);
    setTipoSel(tipoParaOpcao(tipoBase, isPaguePlay));
    setConfirmouValorTotal(false);
    setStatusSel(inicial?.status ?? 'verificar_pendente');
    setQtdStr('1');
    setPersonalizar(false);
    setAjustes({});
    setEscolhaAberta(null);
    setDataQuitar('');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, acordo?.id]);

  /**
   * O lote que será gravado. Recalculado a cada tecla para a lista de
   * personalização e o total na tela mostrarem exatamente o que vai ser salvo.
   */
  const plano = useMemo(() => planejarParcelas({
    quantidade,
    vencimentoBase: vencimento,
    valorBase:      parseCurrencyInput(valorStr),
    tipoBase:       tipoSel === 'boleto_pix' ? 'boleto' : tipoSel,
    statusBase:     statusSel,
    isPaguePlay,
    personalizadas: personalizar
      ? Array.from({ length: quantidade }, (_, i): AjustePersonalizado => {
          const a = ajustes[i];
          const digitado = (a?.valorStr ?? '').trim();
          return {
            // Campo em branco devolve null de propósito: `planejarParcelas`
            // trata null como "usa o valor do lote".
            valor:      digitado === '' ? null : parseCurrencyInput(digitado),
            vencimento: a?.vencimento,
            tipo:       a?.tipo,
          };
        })
      : undefined,
  }), [quantidade, vencimento, valorStr, tipoSel, statusSel, isPaguePlay, personalizar, ajustes]);

  // Parcelas já registradas do grupo (para o operador ver o que existe).
  useEffect(() => {
    if (!aberto || !acordo) return;
    if (!acordo.acordo_grupo_id) { setParcelas([acordo]); return; }
    setLoadingParcelas(true);
    supabase
      .from('acordos')
      .select('id, numero_parcela, vencimento, valor, status, parcelas')
      .eq('acordo_grupo_id', acordo.acordo_grupo_id)
      .order('numero_parcela', { ascending: true })
      .then(({ data }) => {
        const linhas = (data ?? []) as ParcelaResumo[];
        setParcelas(linhas.length > 0 ? linhas : [acordo]);
        setLoadingParcelas(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, acordo?.id, acordo?.acordo_grupo_id]);

  // ── Situação do grupo ──────────────────────────────────────────────────────
  // `verificar_pendente` é o único status em aberto (ver `temParcelaEmAberto`).
  const abertas = parcelas.filter(p => p.status === 'verificar_pendente');
  // Marcar como paga só é oferecido com UMA em aberto: com mais de uma, quitar
  // uma não libera a inclusão, e escolher qual é coisa do detalhe do acordo.
  const parcelaAberta = abertas.length === 1 ? abertas[0] : null;
  const maiorNumero    = Math.max(0, ...parcelas.map(p => p.numero_parcela ?? 1));
  const totalDeclarado = Math.max(acordo?.parcelas ?? 1, ...parcelas.map(p => p.parcelas ?? 1));
  // Cofen com parcela prevista que ainda não é registro: a próxima vem pelo
  // reagendamento, que já sabe o valor dela pela divisão do total.
  const planoIncompletoCofen = isPaguePlay && maiorNumero < totalDeclarado;
  const dataQuitarEfetiva = dataQuitar || parcelaAberta?.vencimento || '';
  const soAumentaTotal = abertas.length > 0 && escolhaAberta === 'so_total';

  // Cofen: o total de antes e o de depois, para a pessoa ver a soma.
  const totalAntesCofen = acordo?.valor_total != null
    ? Number(acordo.valor_total)
    : Math.round(parcelas.reduce((s, p) => s + Math.round(Number(p.valor ?? 0) * 100), 0)) / 100;
  const totalDepoisCofen = Math.round((totalAntesCofen + parseCurrencyInput(valorStr)) * 100) / 100;

  function confirmar() {
    if (loadingParcelas) return;
    if (planoIncompletoCofen) {
      toast.error(
        `Este acordo já prevê ${totalDeclarado} parcelas e só ${maiorNumero} estão registradas. `
        + 'Lance a próxima pelo reagendamento da parcela paga, no detalhe do acordo.',
        { duration: 8000 },
      );
      return;
    }
    // A conferência roda sobre o PLANO, não sobre os campos soltos: é o plano
    // que vai para o banco, e é nele que uma linha personalizada em branco
    // apareceria.
    const erro = validarPlano(plano);
    if (erro) { toast.error(erro); return; }

    /*
     * Acordo recorrente não tem reparcelamento (22/09/2026).
     *
     * O botão já some do detalhe desse acordo; esta linha é para a porta A
     * (NR já tabulado) e para qualquer caminho novo que abra o modal. Vem
     * antes da parcela em aberto: não adianta escolher o que fazer com ela
     * num acordo que não recebe parcela nenhuma.
     */
    if (!isPaguePlay && acordo && ehFormaRecorrente(acordo.tipo)) {
      toast.error(
        `${nomeDaFormaRecorrente(acordo.tipo)} não tem parcelas nem reparcelamento — `
        + 'não é possível adicionar parcela a este acordo.',
        { duration: 8000 },
      );
      return;
    }

    // Parcela em aberto: a pessoa precisa dizer o que fazer com ela.
    let quitar: QuitarAntes | null = null;
    if (abertas.length > 0) {
      if (!parcelaAberta && (isPaguePlay || escolhaAberta !== 'so_total')) {
        toast.error(
          'Este acordo tem mais de uma parcela em aberto. Resolva as parcelas no detalhe do acordo antes de lançar outra.',
          { duration: 8000 },
        );
        return;
      }
      if (isPaguePlay && escolhaAberta !== 'quitar') {
        toast.error(
          `A parcela #${parcelaAberta?.numero_parcela ?? 1} ainda está em aberto. `
          + 'Marque-a como paga para lançar a próxima neste acordo.',
          { duration: 8000 },
        );
        return;
      }
      if (escolhaAberta === null) {
        toast.error('A parcela atual está em aberto: escolha o que fazer com ela antes de continuar.');
        return;
      }
      if (escolhaAberta === 'quitar' && parcelaAberta) {
        if (!dataQuitarEfetiva) { toast.error('Informe a data do pagamento da parcela em aberto.'); return; }
        if (dataQuitarEfetiva > getTodayISO()) {
          toast.error('A data do pagamento da parcela em aberto não pode ser no futuro.');
          return;
        }
        quitar = { parcelaId: parcelaAberta.id, dataPagamento: dataQuitarEfetiva };
      }
    }
    /*
     * PIX Automático e Cartão Recorrente como parcela (liberado em 08/10/2026).
     *
     * Até aqui era recusado: como parcela, o valor seria só um pedaço do
     * acordo, e o Pix Automático paga comissão sobre o total (14/09/2026). Mas
     * o caso real é «entrada hoje no Pix, o resto no Pix Automático dia 24», e
     * a pessoa acabava salvando como Pix comum — fora da comissão. Agora entra,
     * com as mesmas travas do acordo novo: UMA parcela, data de hoje até o fim
     * do mês, e a confirmação de que o valor é o TOTAL. Depois de gravar, quem
     * chamou registra o NR na aba Pix Automático (ver `useRegistrarPixAoPagar`).
     */
    const recorrente = !isPaguePlay && plano.parcelas.find(p => ehFormaRecorrente(p.tipo));
    if (recorrente) {
      const nome = nomeDaFormaRecorrente(recorrente.tipo);
      // Sem virar registro agora, o NR iria para a aba Pix sem a linha de
      // acordo correspondente.
      if (soAumentaTotal) {
        toast.error(
          `${nome} só entra como próxima parcela depois que a atual for paga. `
          + 'Marque a parcela em aberto como paga ou escolha outra forma.',
          { duration: 8000 },
        );
        return;
      }
      if (plano.parcelas.length > 1) {
        toast.error(
          `${nome} entra como UMA parcela só, com o valor total — quem parcela é a recorrência. `
          + 'Adicione as outras formas separadamente.',
          { duration: 8000 },
        );
        return;
      }
      const erroData = erroVencimentoRecorrente(recorrente.tipo, recorrente.vencimento, getTodayISO());
      if (erroData) { toast.error(erroData, { duration: 8000 }); return; }
      if (!confirmouValorTotal) {
        toast.error(
          `${nome} é lançado com o VALOR TOTAL, não o da parcela — confira o valor e marque a confirmação.`,
          { duration: 8000 },
        );
        return;
      }
    }
    void onConfirm(plano.parcelas.map(p => ({
      vencimento: p.vencimento,
      valor:      p.valor,
      tipo:       p.tipo,
      status:     p.status,
    })), { quitar });
  }

  if (!acordo) return null;

  return (
    <Dialog open={aberto} onOpenChange={(open) => { if (!open && !salvando) onClose(); }}>
      {/*
        Teto de altura + miolo rolável. Sem isso o diálogo cresce com a
        quantidade de parcelas e, como ele é centralizado por translate,
        estoura para cima E para baixo — o footer sai da tela e o botão de
        salvar fica inalcançável (10 parcelas personalizadas já bastam).
      */}
      <DialogContent
        className={cn(
          'max-w-md max-h-[90dvh] flex flex-col overflow-hidden',
          // A lista personalizada tem quatro colunas; em max-w-md o campo de
          // data nativo não cabe e fica cortado.
          personalizar && quantidade > 1 && 'max-w-lg',
        )}
        aria-describedby="modal-adicionar-parcela-desc"
      >
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2 text-primary text-sm">
            <Layers className="w-4 h-4" />
            Adicionar parcela ao acordo
          </DialogTitle>
          <DialogDescription id="modal-adicionar-parcela-desc" className="text-xs">
            {descricao ?? `A nova parcela ficará vinculada ao ${nrLabel} "${nrValor}".`}
          </DialogDescription>
        </DialogHeader>

        {/* `min-h-0` é o que deixa este bloco encolher dentro do flex e rolar. */}
        <div className="flex-1 min-h-0 overflow-y-auto space-y-4 -mr-3 pr-3">
          {/* Acordo existente */}
          <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono font-semibold text-foreground">{nrLabel} {nrValor}</span>
              <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border', STATUS_COLORS[acordo.status])}>
                {statusLabels[acordo.status] ?? acordo.status}
              </span>
            </div>
            {acordo.nome_cliente && (
              <p className="text-muted-foreground truncate">{acordo.nome_cliente}</p>
            )}
            <p className="text-muted-foreground">
              Forma atual: <strong className="text-foreground">{tipoLabels[acordo.tipo] ?? acordo.tipo}</strong>
              {' · '}Operador: <strong className="text-foreground">{(acordo.perfis as { nome?: string } | undefined)?.nome ?? '—'}</strong>
            </p>
          </div>

          {/* Parcelas já registradas */}
          <div className="text-xs">
            <p className="font-semibold text-muted-foreground uppercase tracking-wide text-[10px] mb-1.5">
              Parcelas registradas
            </p>
            {loadingParcelas ? (
              <div className="h-6 rounded bg-muted animate-pulse" />
            ) : (
              <ul className="space-y-1 max-h-28 overflow-y-auto pr-1">
                {parcelas.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 font-mono">
                    <span className="text-primary font-bold">#{p.numero_parcela ?? 1}</span>
                    <span>{formatDate(p.vencimento)}</span>
                    <span className="font-semibold">{formatCurrency(p.valor)}</span>
                    <span className={cn('inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium border font-sans', STATUS_COLORS[p.status])}>
                      {statusLabels[p.status] ?? p.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Cofen com plano declarado ainda não registrado: a próxima vem pelo
              reagendamento, não por aqui. */}
          {!loadingParcelas && planoIncompletoCofen && (
            <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs space-y-1">
              <p className="flex items-start gap-2 font-semibold text-destructive">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
                Este acordo já tem parcelas previstas
              </p>
              <p className="text-foreground/80">
                Ele prevê {totalDeclarado} parcelas e só {maiorNumero} estão registradas. A próxima é lançada
                pelo <strong>reagendamento</strong> da parcela paga, no detalhe do acordo — o valor dela já
                vem da divisão do total.
              </p>
            </div>
          )}

          {/* Parcela em aberto: a nova não vira registro enquanto ela não for
              quitada. Antes o modal seguia calado e os dados digitados se
              perdiam; agora a pessoa escolhe. */}
          {!loadingParcelas && !planoIncompletoCofen && abertas.length > 0 && (
            <div role="alert" className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 space-y-2 text-xs">
              <p className="flex items-start gap-2 font-semibold text-amber-900 dark:text-amber-300">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
                {parcelaAberta
                  ? `A parcela #${parcelaAberta.numero_parcela ?? 1} (${formatCurrency(parcelaAberta.valor)}, vence ${formatDate(parcelaAberta.vencimento)}) ainda está em aberto`
                  : `Este acordo tem ${abertas.length} parcelas em aberto`}
              </p>
              <p className="text-amber-900/90 dark:text-amber-200/90">
                {isPaguePlay
                  ? 'A parcela nova entra com o valor dela no total do acordo, e só pode ser lançada com a atual paga.'
                  : 'O acordo tem uma parcela em aberto por vez: a nova só vira registro depois que a atual for quitada.'}
              </p>
              <div className="space-y-2 pt-1" role="radiogroup" aria-label="O que fazer com a parcela em aberto">
                {parcelaAberta && (
                  <label className="flex items-start gap-2 cursor-pointer select-none font-medium text-foreground">
                    <input
                      type="radio" name="escolha-parcela-aberta"
                      checked={escolhaAberta === 'quitar'}
                      onChange={() => setEscolhaAberta('quitar')}
                      className="h-3.5 w-3.5 mt-0.5 accent-primary cursor-pointer"
                    />
                    <span>
                      A #{parcelaAberta.numero_parcela ?? 1} já foi paga — marcar como paga e registrar esta parcela
                    </span>
                  </label>
                )}
                {escolhaAberta === 'quitar' && parcelaAberta && (
                  <div className="pl-6 max-w-[12rem]">
                    <DatePickerField
                      label="Data do pagamento" required
                      value={dataQuitarEfetiva}
                      onChange={setDataQuitar}
                    />
                  </div>
                )}
                {!isPaguePlay && (
                  <label className="flex items-start gap-2 cursor-pointer select-none font-medium text-foreground">
                    <input
                      type="radio" name="escolha-parcela-aberta"
                      checked={escolhaAberta === 'so_total'}
                      onChange={() => setEscolhaAberta('so_total')}
                      className="h-3.5 w-3.5 mt-0.5 accent-primary cursor-pointer"
                    />
                    <span>
                      Ainda não foi paga — só aumentar o total de parcelas
                      <span className="block font-normal text-muted-foreground">
                        O valor, a data e a forma digitados aqui <strong>não ficam guardados</strong>: a próxima
                        parcela é lançada no reagendamento, quando a atual for quitada.
                      </span>
                    </span>
                  </label>
                )}
                {isPaguePlay && !parcelaAberta && (
                  <p className="text-foreground/80">Resolva as parcelas em aberto no detalhe do acordo antes de lançar outra.</p>
                )}
              </div>
            </div>
          )}

          {/* Nova parcela */}
          <div className="space-y-3 border-t border-border pt-3">
            <p className="font-semibold text-muted-foreground uppercase tracking-wide text-[10px]">
              Nova parcela
            </p>
            <div className="grid grid-cols-2 gap-3">
              <DatePickerField label="Vencimento" required value={vencimento} onChange={setVencimento} />
              <div className="space-y-1">
                <Label className="text-xs">{recorrenteSel ? 'Valor TOTAL *' : 'Valor *'}</Label>
                <Input
                  value={valorStr}
                  onChange={(e) => setValorStr(e.target.value)}
                  placeholder="0,00"
                  className="h-8 text-xs font-mono"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Forma de Pagamento</Label>
                <Select value={tipoSel} onValueChange={escolherTipo}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {tipos.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Status</Label>
                <Select value={statusSel} onValueChange={setStatusSel}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {!recorrenteSel && !isPaguePlay && (
              <div className="space-y-1">
                <Label className="text-xs">Quantidade de parcelas</Label>
                <Input
                  type="number" min={1} max={MAX_PARCELAS_LOTE} inputMode="numeric"
                  value={qtdStr}
                  onChange={(e) => setQtdStr(e.target.value.replace(/\D/g, '').slice(0, 2))}
                  className="h-8 text-xs font-mono"
                />
              </div>
              )}
            </div>

            {/* PIX Automático / Cartão Recorrente como próxima parcela. */}
            {recorrenteSel && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 space-y-2 text-xs">
                <p className="flex items-start gap-2 font-semibold text-amber-900 dark:text-amber-300">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
                  {nomeDaFormaRecorrente(tipoSel)}: sem parcelamento
                </p>
                <ul className="list-disc pl-5 space-y-1 text-amber-900/90 dark:text-amber-200/90">
                  <li>Coloque o <strong>VALOR TOTAL</strong> do {nomeDaFormaRecorrente(tipoSel)}, não o valor de uma parcela.</li>
                  <li>Entra como <strong>uma parcela só</strong>, com data de hoje até o fim do mês.</li>
                  <li>
                    A comissão sai da aba <strong>Pix Automático</strong>: ao salvar, o {nrLabel} {nrValor} é
                    registrado lá com este valor. Se não der, o aviso diz como registrar.
                  </li>
                </ul>
                <label className="flex items-start gap-2 cursor-pointer select-none pt-1 font-medium text-foreground">
                  <input
                    type="checkbox"
                    checked={confirmouValorTotal}
                    onChange={(e) => setConfirmouValorTotal(e.target.checked)}
                    className="h-3.5 w-3.5 mt-0.5 accent-primary cursor-pointer"
                  />
                  Confirmo que o valor é o TOTAL do {nomeDaFormaRecorrente(tipoSel)}
                </label>
              </div>
            )}

            {/* Parcelas personalizadas — só faz sentido com mais de uma. */}
            {quantidade > 1 && (
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={personalizar}
                  onChange={(e) => setPersonalizar(e.target.checked)}
                  className="h-3.5 w-3.5 accent-primary cursor-pointer"
                />
                <span className="text-xs font-medium">Parcelas personalizadas</span>
                <span className="text-[10px] text-muted-foreground">
                  valor, data e forma de cada uma
                </span>
              </label>
            )}

            {/* A lista não tem rolagem própria: quem rola é o miolo do diálogo,
                para não ficarem duas barras uma dentro da outra. */}
            {personalizar && quantidade > 1 && (
              <div className="rounded-lg border border-border bg-muted/20 p-2 space-y-1.5">
                <div className="grid grid-cols-[22px_minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,1.1fr)] gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                  <span />
                  <span>Vencimento</span>
                  <span>Valor (R$)</span>
                  <span>Forma</span>
                </div>
                {plano.parcelas.map((p, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-[22px_minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,1.1fr)] gap-1.5 items-center"
                  >
                    <span className="text-[10px] font-mono font-bold text-primary text-center">
                      {i + 1}
                    </span>
                    <Input
                      type="date"
                      value={p.vencimento}
                      onChange={(e) => setAjuste(i, { vencimento: e.target.value })}
                      className="h-7 text-[11px] font-mono px-1.5"
                    />
                    <Input
                      // Vazio mostra o valor do lote como placeholder: fica claro
                      // que não preencher mantém o padrão, em vez de zerar.
                      value={ajustes[i]?.valorStr ?? ''}
                      onChange={(e) => setAjuste(i, { valorStr: e.target.value })}
                      placeholder={formatCurrency(p.valor)}
                      inputMode="decimal"
                      className="h-7 text-[11px] font-mono px-1.5"
                    />
                    <Select
                      value={p.tipo}
                      onValueChange={(v) => setAjuste(i, { tipo: v })}
                    >
                      <SelectTrigger className="h-7 text-[11px] px-1.5"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {tiposDaParcela.map((t) => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            )}

            {/* Cofen: a parcela soma no valor total do acordo. */}
            {isPaguePlay && !planoIncompletoCofen && (
              <p className="text-[11px] text-muted-foreground">
                Valor total do acordo: {formatCurrency(totalAntesCofen)} →{' '}
                <strong className="text-foreground">{formatCurrency(totalDepoisCofen)}</strong>
                {' '}({maiorNumero + 1} parcelas).
              </p>
            )}

            {/* Resumo: o operador confere o total antes de confirmar. */}
            {quantidade > 1 && (
              <p className="text-[11px] text-muted-foreground">
                Serão criadas <strong className="text-foreground">{quantidade}</strong> parcelas,
                de {formatDate(plano.parcelas[0]?.vencimento ?? '')} a{' '}
                {formatDate(plano.parcelas[plano.parcelas.length - 1]?.vencimento ?? '')} — total{' '}
                <strong className="text-foreground">{formatCurrency(plano.total)}</strong>.
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="shrink-0 gap-2 sm:gap-0 border-t border-border pt-3">
          <Button variant="outline" size="sm" onClick={onClose} disabled={salvando}>
            Cancelar
          </Button>
          <Button
            size="sm" className="gap-1.5" onClick={confirmar}
            disabled={salvando || loadingParcelas || planoIncompletoCofen}
          >
            <Plus className="w-3.5 h-3.5" />
            {salvando ? 'Adicionando...' : soAumentaTotal ? 'Aumentar total de parcelas' : 'Adicionar parcela'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
