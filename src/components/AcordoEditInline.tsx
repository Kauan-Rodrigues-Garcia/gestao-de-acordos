/**
 * AcordoEditInline.tsx
 * Inline expandable row editor for agreements in the Acordos list.
 */
import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Save, X, DollarSign, Smartphone, Link2, Building2, MessageCircle, FileText, AlertTriangle, Pencil, Wallet, Layers } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { supabase, Acordo } from '@/lib/supabase';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useAuth } from '@/hooks/useAuth';
import { useDiretoExtraConfig } from '@/hooks/useDiretoExtraConfig';
import { fetchIsDiretoExtraAtivo } from '@/services/direto_extra.service';
import { converterParaExtra } from '@/services/diretoExtraRpc';
import type { Perfil } from '@/lib/supabase';
import { verificarNrRegistro, mensagemErroNr } from '@/services/nr_registros.service';
import {
  coletarFatosConflitoNr, decidirConflitoNr, type DecisaoConflitoNr,
} from '@/services/conflitoNr.service';
import { criarNotificacao } from '@/services/notificacoes.service';
import { registrarLog } from '@/services/logs.service';
import { autenticarLider } from '@/services/autorizacao_lider.service';
import {
  transferirAcordoDeDesligado, transferirAcordoNoServidor, mensagemErroTransferencia,
} from '@/services/desligamento.service';
import { ModalAutorizacaoNR, ModalAvisoDiretoExtra } from '@/components/AcordoNovoInline';
import type { ConflitNR } from '@/components/AcordoNovoInline';
import {
  parseCurrencyInput,
  ESTADOS_BRASIL, STATUS_LABELS, STATUS_LABELS_PAGUEPLAY, TIPO_LABELS, TIPO_LABELS_PAGUEPLAY,
  getEstadoFromAcordo, extractLinkAcordo, buildObservacoesComEstado, formatarTelefonePP,
  INSTITUICOES_OPTIONS,
} from '@/lib/index';
import { abrirChatplay } from '@/lib/chatplay';
import { camposComCpf, ERRO_CPF_NO_CODIGO } from '@/lib/cpf';
import {
  estadoFechamentoDaData, mensagemFechamento, mesDaData,
} from '@/lib/fechamentoMes';
import {
  calcularParcelas, formatBRL, temEntrada, valorDemaisParcelas, totalComEntrada,
} from '@/lib/money';
import { PARCELAS_MAX_DEFAULT } from '@/lib/index';
import { springPresets } from '@/lib/motion';
import { DatePickerField } from '@/components/DatePickerField';
import { useEmpresaTags } from '@/hooks/useEmpresaTags';
import { TagsSelector } from '@/components/TagsSelector';
import {
  planejarQuantidade, descreverRemocao, type PlanoQuantidade,
} from '@/services/quantidadeParcelas';
import { carregarLinhasDoGrupo, aplicarQuantidade } from '@/services/quantidadeParcelas.service';
import { ModalEditarAcordoParcelado } from '@/components/AcordoDetalheInline/ModalEditarAcordoParcelado';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter,
  AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel,
} from '@/components/ui/alert-dialog';

/**
 * Formas que geram parcelamento na PaguePlay. Na BookPlay a trava não existe
 * mais desde 05/08/2026 — qualquer forma parcela, Pix inclusive.
 */
const TIPOS_PARCELADOS_PP = ['boleto', 'cartao_recorrente', 'pix_automatico'];

/**
 * Valor sentinela do "sem instituição" no Select.
 *
 * `instituicao` é opcional, mas o Select do Radix não aceita item com value
 * vazio — string vazia é o que ele usa internamente para "nada selecionado".
 * Daí o sentinela, traduzido de volta para '' na hora de gravar.
 */
const INSTITUICAO_NENHUMA = '__sem_instituicao__';

/**
 * Um conflito de NR que parou a gravação e espera o operador (ou o líder).
 *
 * Carrega o `plano` de parcelas junto: quem trocou o NR *e* mexeu na
 * quantidade no mesmo save já confirmou a remoção antes do modal abrir.
 * Recalcular depois perderia a mudança de parcelas ou pediria a mesma
 * confirmação de novo.
 */
interface PendenciaConflitoNr {
  decisao:    DecisaoConflitoNr;
  campoChave: 'nr_cliente' | 'instituicao';
  valorChave: string;
  label:      string;
  plano:      PlanoQuantidade | null;
}

interface AcordoEditInlineProps {
  acordo: Acordo;
  isPaguePlay?: boolean;
  colSpan?: number;
  /** Recebe o acordo atualizado para optimistic update no pai */
  onSaved: (atualizado: Acordo) => void;
  /**
   * Parcelas gravadas pelo modal de parcelas. Separado de `onSaved` porque
   * aquele FECHA a edição — e salvar parcelas não pode descartar o que a
   * pessoa já digitou nos outros campos da área aberta.
   */
  onParcelasAtualizadas?: (linhas: Acordo[]) => void;
  onCancel: () => void;
}


export function AcordoEditInline({
  acordo, isPaguePlay = false, colSpan = 10, onSaved, onParcelasAtualizadas, onCancel,
}: AcordoEditInlineProps) {
  const { empresa } = useEmpresa();
  const { perfil }  = useAuth();
  const { isAtivoParaUsuario } = useDiretoExtraConfig();
  const usuarioTemLogicaDiretoExtra = isAtivoParaUsuario(
    perfil?.id ?? '',
    perfil?.setor_id ?? null,
    (perfil as (Perfil & { equipe_id?: string | null }) | null)?.equipe_id ?? null,
  );
  const [saving, setSaving] = useState(false);

  // ── Conflito de NR ────────────────────────────────────────────────────────
  // Trocar a chave (NR na BookPlay, Código na PaguePlay) para uma que já é de
  // outro operador cai na MESMA escada do cadastro novo — `conflitoNr.service`.
  // Antes a edição parava num toast de "não é possível duplicar" mesmo quando
  // a lógica Direto/Extra do dono liberava o caminho sem autorização nenhuma.
  const [pendencia,        setPendencia]        = useState<PendenciaConflitoNr | null>(null);
  const [liderEmail,       setLiderEmail]       = useState('');
  const [liderSenha,       setLiderSenha]       = useState('');
  const [autorizando,      setAutorizando]      = useState(false);
  const [confirmandoAviso, setConfirmandoAviso] = useState(false);

  // Form state initialised from acordo
  const initialEstado = getEstadoFromAcordo(acordo);
  const initialLink   = extractLinkAcordo(acordo.observacoes);
  const initialObservacoes = isPaguePlay ? initialLink : (acordo.observacoes || '');

  const [nomeCliente, setNomeCliente] = useState(acordo.nome_cliente);
  const [nrCliente,   setNrCliente]   = useState(acordo.nr_cliente);
  const [vencimento,  setVencimento]  = useState(acordo.vencimento);
  const [valor,       setValor]       = useState(Number(acordo.valor).toFixed(2).replace('.', ','));
  const [tipo,        setTipo]        = useState<Acordo['tipo']>(acordo.tipo);
  const [parcelas,    setParcelas]    = useState(String(acordo.parcelas || 1));
  const [whatsapp,    setWhatsapp]    = useState(acordo.whatsapp || '');
  const [instituicao, setInstituicao] = useState(acordo.instituicao || '');
  const [estado,      setEstado]      = useState(initialEstado);
  const [observacoes, setObservacoes] = useState(initialObservacoes);
  const [status,      setStatus]      = useState<Acordo['status']>(acordo.status);
  const [isExtra,     setIsExtra]     = useState(acordo.tipo_vinculo === 'extra');
  const [tagIds,      setTagIds]      = useState<string[]>(acordo.tag_ids ?? []);
  const { tags: empresaTags }         = useEmpresaTags();

  // Instituições oferecidas na edição BookPlay: as quatro oficiais, mais o
  // valor atual quando ele estiver fora da lista.
  //
  // Existem acordos gravados com valor fora do padrão, de quando este campo era
  // texto livre. Sem incluí-lo, o Select abriria mostrando o placeholder — a
  // tela diria "vazio" enquanto o banco tem conteúdo, e o operador salvaria por
  // cima sem perceber. Aparecendo na lista, o valor fica visível e ele escolhe
  // se troca por um dos oficiais.
  const instituicoesDisponiveis = useMemo(() => {
    const oficiais = [...INSTITUICOES_OPTIONS] as string[];
    const atual    = instituicao.trim();
    return atual && !oficiais.includes(atual) ? [...oficiais, atual] : oficiais;
  }, [instituicao]);

  // PP: trocar forma de pagamento ou parcelas na edição refaz o parcelamento
  // com a mesma fórmula do acordo novo — o campo Valor passa a ser lido como
  // VALOR TOTAL. O aviso abaixo alerta o operador antes de salvar.
  const parcelamentoAlterado = isPaguePlay &&
    (tipo !== acordo.tipo || parseInt(parcelas || '1', 10) !== (acordo.parcelas || 1));

  // ── Parcelas (BookPlay) ───────────────────────────────────────────────────
  // Acordo já parcelado abre com a quantidade ESCRITA, não editável: mudar o
  // número cria ou apaga linha de parcela, e isso não pode acontecer por um
  // clique errado num campo que estava logo ali. O botão é o gesto que diz
  // "sim, quero mexer nisso".
  const jaParcelado = (acordo.parcelas ?? 1) > 1;
  const [editandoParcelas, setEditandoParcelas] = useState(false);
  const [modalParcelasOpen, setModalParcelasOpen] = useState(false);
  // Remoção de parcela é destrutiva: fica pendente até o operador confirmar.
  const [remocaoPendente, setRemocaoPendente] = useState<{
    plano: Extract<PlanoQuantidade, { acao: 'remover' }>;
  } | null>(null);

  // ── Entrada (BookPlay) ────────────────────────────────────────────────────
  // O acordo com entrada guarda `valor_entrada` e `valor_total`; o valor das
  // demais é derivado. Aqui a edição só precisa RECONHECER isso: o campo Valor
  // continua sendo o desta linha, e o total é recalculado quando a quantidade
  // muda, para os três números não divergirem.
  const entradaAtiva     = !isPaguePlay && temEntrada(acordo);
  const demaisAtual      = entradaAtiva ? valorDemaisParcelas(acordo) : null;
  const ehLinhaDaEntrada = (acordo.numero_parcela ?? 1) === 1;
  const parcelasNumAtual = Math.max(1, parseInt(parcelas || '1', 10) || 1);
  const entradaPrevista  = entradaAtiva && ehLinhaDaEntrada
    ? parseCurrencyInput(valor)
    : Number(acordo.valor_entrada ?? 0);

  async function handleSave(confirmouRemocao = false) {
    if (!isPaguePlay && !nomeCliente.trim()) { toast.error('Nome é obrigatório'); return; }
    if (!vencimento)         { toast.error('Vencimento é obrigatório'); return; }
    // Os DOIS meses precisam estar abertos: o de origem (o mês que perderia o
    // valor) e o de destino (o que ganharia). Checar só um deles deixaria mover
    // dinheiro para dentro ou para fora de um fechamento já apresentado.
    for (const data of [acordo.vencimento, vencimento]) {
      if (estadoFechamentoDaData({ data, cargo: perfil?.perfil }).bloqueado) {
        toast.error(mensagemFechamento(mesDaData(data)));
        return;
      }
    }

    const valorNum = parseCurrencyInput(valor);
    if (isNaN(valorNum) || valorNum <= 0) { toast.error('Valor inválido'); return; }
    // PaguePlay: estado obrigatório. O gatilho no banco só recusa quando o
    // acordo JÁ tinha estado (para não travar dado histórico); aqui a edição
    // exige sempre, que é a regra que a diretoria pediu.
    if (isPaguePlay && !estado.trim()) { toast.error('Selecione o estado (UF) do cliente'); return; }
    // CPF em qualquer campo de texto — recusado no banco pelo
    // `trg_acordos_recusa_cpf`. Aqui a mensagem já diz ONDE está.
    const comCpf = camposComCpf({
      instituicao, nr_cliente: nrCliente, nome_cliente: nomeCliente, observacoes,
    });
    if (comCpf.length) {
      toast.error(`${ERRO_CPF_NO_CODIGO} Encontrado em: ${comCpf.join(', ')}.`);
      return;
    }
    const parcelasNum = parseInt(parcelas || '1', 10);

    // ─── BookPlay: a quantidade de parcelas é do GRUPO, não desta linha ────
    // Mudar o número aqui cria as parcelas que faltam ou apaga as que sobram;
    // sem isso o contador N/N passaria a mentir sobre o que existe no banco.
    // O plano é calculado ANTES de qualquer gravação, para um caso impossível
    // (reduzir por cima de parcela paga) parar antes de salvar meia coisa.
    const mudouQuantidade = !isPaguePlay && parcelasNum !== (acordo.parcelas ?? 1);
    const camposDoGrupo = entradaAtiva && demaisAtual != null
      ? {
          valor_entrada: entradaPrevista,
          valor_total:   totalComEntrada(entradaPrevista, demaisAtual, parcelasNum),
        }
      : undefined;

    let planoQuantidade: PlanoQuantidade | null = null;
    if (!isPaguePlay && mudouQuantidade) {
      const grupo = await carregarLinhasDoGrupo(acordo);
      // `'erro' in` e não `!grupo.ok`: com `strict: false` o TypeScript não
      // estreita união por discriminante booleano (mesmo caso já documentado
      // em parcelas.service).
      if ('erro' in grupo) { toast.error(grupo.erro); return; }
      planoQuantidade = planejarQuantidade({
        linhas:             grupo.linhas,
        quantidadeAtual:    acordo.parcelas ?? 1,
        novaQuantidade:     parcelasNum,
        // Com entrada, quem entra é sempre parcela 2+: vale o das demais.
        valorNovasParcelas: demaisAtual ?? valorNum,
        tipo,
        isPaguePlay:        false,
      });
      if (planoQuantidade.acao === 'bloqueado') { toast.error(planoQuantidade.motivo); return; }
      if (planoQuantidade.acao === 'remover' && !confirmouRemocao) {
        setRemocaoPendente({ plano: planoQuantidade });
        return;
      }
    } else if (!isPaguePlay && camposDoGrupo) {
      // Valor da entrada editado sem mexer na quantidade: o total do acordo
      // muda junto e precisa cair em todas as linhas do grupo.
      planoQuantidade = { acao: 'contador', novoTotal: parcelasNum };
    }

    // ─── Conflito de NR/Código na edição ──────────────────────────────────
    // Só entra aqui quem MUDOU a chave para um valor que não era seu. Editar
    // valor, vencimento ou observação não passa por nada disto.
    //
    // Chaves:
    //   • PaguePlay → `instituicao` (Inscrição do profissional, que É o código)
    //   • Bookplay  → `nr_cliente`   (NR do cliente)
    //
    // Na BookPlay `instituicao` é CATEGORIA (BOOKPLAY, MUNDIAL EDITORA…), não
    // chave — foi registrá-la como chave que travou a categoria inteira em nome
    // do primeiro operador que salvasse. Ver migration 20260810b.
    if (empresa?.id && perfil?.id) {
      const campoChave: 'nr_cliente' | 'instituicao' = isPaguePlay ? 'instituicao' : 'nr_cliente';
      const valorNovo   = isPaguePlay ? instituicao.trim() : nrCliente.trim();
      const valorAntigo = isPaguePlay ? (acordo.instituicao ?? '').trim() : (acordo.nr_cliente ?? '').trim();
      const label       = isPaguePlay ? 'Código' : 'NR';

      if (valorNovo && valorNovo !== valorAntigo) {
        let conflito;
        try {
          conflito = await verificarNrRegistro(
            valorNovo,
            empresa.id,
            campoChave,
            acordo.id, // ignora o próprio acordo
          );
        } catch (e) {
          console.warn('[AcordoEditInline] falha ao verificar nr_registros', e);
          // BLOQUEIA. Antes, falha na verificação salvava assim mesmo — o que
          // transformava uma instabilidade de rede numa tabulação duplicada
          // sem autorização. Um portão que abre ao falhar não é um portão.
          toast.error(
            mensagemErroNr(e, label)
              ?? `Não foi possível verificar se este ${label} já está tabulado. `
               + 'O acordo NÃO foi salvo — verifique a conexão e tente de novo.',
            { duration: 7000 },
          );
          return;
        }

        if (conflito) {
          setSaving(true);
          let decisao: DecisaoConflitoNr;
          try {
            decisao = decidirConflitoNr(await coletarFatosConflitoNr({
              conflito,
              empresaId:     empresa.id,
              meuOperadorId: perfil.id,
              euTemLogica:   usuarioTemLogicaDiretoExtra,
              campoChave,
              valorChave:    valorNovo,
            }));
          } catch (e) {
            toast.error(
              mensagemErroNr(e, label) ?? (e instanceof Error ? e.message : 'Erro ao verificar o vínculo.'),
              { duration: 7000 },
            );
            return;
          } finally {
            setSaving(false);
          }

          const pend: PendenciaConflitoNr = {
            decisao, campoChave, valorChave: valorNovo, label, plano: planoQuantidade,
          };

          switch (decisao.caso) {
            // Outro acordo MEU já usa essa chave — nada a autorizar, é engano.
            case 'proprio_acordo':
              toast.error(`${label} ${valorNovo} já está em outro acordo seu.`, { duration: 6000 });
              return;

            // Dono saiu da empresa: assume e segue, sem líder no caminho.
            case 'dono_desligado': {
              setSaving(true);
              const r = await transferirAcordoDeDesligado({
                acordoAnteriorId: decisao.acordoId,
                empresaId:        empresa.id,
                operadorAntId:    decisao.operadorId,
                operadorAntNome:  decisao.operadorNome,
                novoOperadorId:   perfil.id,
                novoOperadorNome: perfil.nome ?? 'Operador',
                labelNr:          label,
                valorNr:          valorNovo,
              });
              setSaving(false);
              if (!r.ok) {
                toast.error(`Erro ao liberar o acordo do operador desligado: ${r.erro}`);
                return;
              }
              toast.success(`${label} "${valorNovo}" liberado: ${decisao.operadorNome} está desligado.`);
              break; // segue para a gravação
            }

            // CASO A — eu tenho a lógica e o dono não: o acordo que estou
            // editando passa a ser o EXTRA, e o dono segue DIRETO.
            case 'eu_viro_extra':
              await gravar(planoQuantidade, {
                tipo_vinculo:          'extra',
                vinculo_operador_id:   decisao.operadorId,
                vinculo_operador_nome: decisao.operadorNome,
              });
              return;

            // CASO B e C/D dependem do operador (ou do líder): guarda o estado
            // e devolve o controle para o modal.
            case 'aviso_direto_extra':
            case 'troca_extra':
            case 'autorizacao_lider':
              setPendencia(pend);
              return;
          }
        }
      }
    }

    await gravar(planoQuantidade);
  }

  /**
   * A gravação em si. Separada de `handleSave` porque os fluxos de conflito
   * precisam RETOMAR daqui depois que o operador confirma ou o líder autoriza
   * — sem refazer validação, plano de parcelas nem checagem de NR.
   *
   * `override` entra por cima do payload: é como os casos Direto/Extra gravam
   * `tipo_vinculo` e o par do vínculo na mesma ida ao banco.
   */
  async function gravar(
    planoQuantidade: PlanoQuantidade | null,
    override: Record<string, unknown> = {},
  ) {
    const valorNum    = parseCurrencyInput(valor);
    const parcelasNum = parseInt(parcelas || '1', 10);

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        nome_cliente: nomeCliente.trim(),
        nr_cliente:   nrCliente.trim(),
        vencimento,
        valor:        valorNum,
        tipo,
        // BookPlay: qualquer forma parcela, então o número vale sempre. Na
        // PaguePlay a trava por forma continua valendo.
        parcelas:     isPaguePlay
          ? (TIPOS_PARCELADOS_PP.includes(tipo) && !Number.isNaN(parcelasNum) ? parcelasNum : 1)
          : (Number.isNaN(parcelasNum) ? 1 : parcelasNum),
        whatsapp:     isPaguePlay ? formatarTelefonePP(whatsapp) : (whatsapp.trim() || null),
        status,
        observacoes:  isPaguePlay
          ? buildObservacoesComEstado(estado, observacoes)
          : (observacoes.trim() || null),
        tipo_vinculo: isExtra ? 'extra' : 'direto',
        tag_ids: tagIds.length > 0 ? tagIds : null,
      };

      if (instituicao.trim() !== undefined) payload.instituicao = instituicao.trim() || null;

      // Depois do payload base: os casos Direto/Extra mandam em `tipo_vinculo`
      // e no par do vínculo, e o toggle da tela não pode desfazer a decisão.
      Object.assign(payload, override);

      // PP + parcelamento alterado: mesma fórmula do acordo novo. O valor
      // digitado é lido como TOTAL; a linha guarda a parcela corrente (valor)
      // e o total (valor_total), respeitando a regra dos 40% do acordo.
      if (parcelamentoAlterado) {
        const ehParcelado = ['boleto', 'cartao_recorrente', 'pix_automatico'].includes(tipo) && parcelasNum > 1;
        if (ehParcelado) {
          const quarentaEfetivo = Boolean(acordo.usou_quarenta_pct) && parcelasNum > 2;
          const numeroParcela   = Math.min(acordo.numero_parcela ?? 1, parcelasNum);
          const todas = calcularParcelas(valorNum, parcelasNum, quarentaEfetivo);
          payload.valor             = todas[numeroParcela - 1];
          payload.valor_total       = valorNum;
          payload.usou_quarenta_pct = quarentaEfetivo;
          payload.numero_parcela    = numeroParcela;
        } else {
          payload.valor_total       = null;
          payload.usou_quarenta_pct = false;
        }
      }

      const { data: updated, error } = await supabase
        .from('acordos')
        .update(payload)
        .eq('id', acordo.id)
        .select('*, perfis(id, nome, email, perfil, setor_id)')
        .single();
      if (error) {
        // A recusa do trigger de NR (NR_JA_REGISTRADO) chega por aqui quando
        // alguém tomou a chave entre a checagem e o UPDATE. Despejar o erro
        // cru de Postgres na tela foi o que o operador viu no print.
        toast.error(
          mensagemErroNr(error, isPaguePlay ? 'Código' : 'NR')
            ?? `Erro ao salvar: ${error.message}`,
          { duration: 7000 },
        );
        return;
      }

      // Grupo depois da linha: se o UPDATE acima for recusado (RLS, validação
      // do banco), nenhuma parcela foi criada nem apagada.
      if (planoQuantidade) {
        const camposDoGrupo = entradaAtiva && demaisAtual != null
          ? {
              valor_entrada: entradaPrevista,
              valor_total:   totalComEntrada(entradaPrevista, demaisAtual, parcelasNum),
            }
          : undefined;
        const r = await aplicarQuantidade(acordo, planoQuantidade, {
          isPaguePlay: false,
          camposDoGrupo,
        });
        if ('erro' in r) {
          // A linha já foi salva — dizer só "erro" esconderia metade do que
          // aconteceu, e o operador precisa saber o que conferir.
          toast.error(`Acordo salvo, mas a quantidade de parcelas não mudou: ${r.erro}`, { duration: 8000 });
          onSaved((updated ?? { ...acordo, ...payload }) as Acordo);
          return;
        }
        if (r.criadas.length) toast.success(`${r.criadas.length} parcela(s) criada(s).`);
        if (r.removidas.length) toast.success(`${r.removidas.length} parcela(s) apagada(s).`);
      }

      // `nr_registros` NÃO é sincronizado daqui. O trigger trg_sync_nr_registros
      // já grava a titularidade dentro da mesma transação do UPDATE, com a
      // checagem de dono junto. O upsert que existia aqui rodava DEPOIS e por
      // fora dessa checagem — `onConflict → overwrite` — ou seja, reabria pelo
      // cliente exatamente o roubo silencioso de NR que a 20260809d fechou no
      // banco. Ver migration 20260810b.

      toast.success('Acordo atualizado!');
      onSaved((updated ?? { ...acordo, ...payload }) as Acordo);
    } catch (e) {
      toast.error(
        mensagemErroNr(e, isPaguePlay ? 'Código' : 'NR')
          ?? (e instanceof Error ? e.message : 'Erro inesperado'),
        { duration: 7000 },
      );
    } finally {
      setSaving(false);
    }
  }

  /**
   * CASO B — o dono tem a lógica Direto/Extra e eu não. Ao confirmar, o acordo
   * DELE cai para EXTRA e o que estou editando fica DIRETO.
   */
  async function confirmarAvisoDiretoExtra() {
    if (!pendencia || pendencia.decisao.caso !== 'aviso_direto_extra') return;
    if (!empresa?.id || !perfil?.id) return;
    const { decisao, label, valorChave, plano } = pendencia;

    setConfirmandoAviso(true);
    try {
      // A config pode ter sido desligada entre abrir o aviso e confirmar. Sem
      // esta releitura o acordo do outro operador cairia para EXTRA por uma
      // permissão que já não existe.
      const aindaAtiva = await fetchIsDiretoExtraAtivo({
        userId: decisao.operadorId, empresaId: empresa.id,
      });
      if (!aindaAtiva) {
        toast.error('A lógica Direto/Extra do operador foi desativada. Atualize e tente novamente.');
        return;
      }

      const rpcErr = await converterParaExtra({
        acordoId: decisao.acordoId,
        novoDiretoOperadorId: perfil.id,
        novoDiretoOperadorNome: perfil.nome ?? 'Operador',
        valor: parseCurrencyInput(valor),
        vencimento,
        nomeCliente: nomeCliente.trim(),
        tipo,
        nrCliente: nrCliente.trim(),
        instituicao: instituicao.trim(),
        whatsapp: isPaguePlay ? formatarTelefonePP(whatsapp) : (whatsapp.trim() || null),
        parcelas: parseInt(parcelas || '1', 10) || 1,
      });
      if (rpcErr) {
        toast.error(`Erro ao converter o acordo de ${decisao.operadorNome}: ${rpcErr.message}`);
        return;
      }

      setPendencia(null);
      await gravar(plano, {
        tipo_vinculo:          'direto',
        vinculo_operador_id:   decisao.operadorId,
        vinculo_operador_nome: decisao.operadorNome,
      });

      await criarNotificacao({
        usuario_id: decisao.operadorId,
        titulo:     'Seu acordo foi convertido em EXTRA',
        mensagem:   `O ${label} "${valorChave}" foi tabulado como DIRETO pelo operador `
                  + `${perfil.nome ?? 'outro operador'}. Seu acordo continua ativo como EXTRA.`,
        empresa_id: empresa.id,
      });
      toast.success(`Acordo tabulado como DIRETO. ${decisao.operadorNome} foi notificado.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro inesperado ao tabular');
    } finally {
      setConfirmandoAviso(false);
    }
  }

  /**
   * CASO C/D e troca de EXTRA — passa pela senha do líder. A transferência sai
   * pela RPC com o TOKEN DO LÍDER: a RLS fail-closed barra o operador de ler
   * ou apagar acordo alheio, e sem isso a tela dizia "acordo não encontrado"
   * mesmo com a senha certa.
   */
  async function autorizarComLider() {
    if (!pendencia || !empresa?.id || !perfil?.id) return;
    if (!liderEmail.trim() || !liderSenha.trim()) {
      toast.error('Informe o e-mail e a senha do líder');
      return;
    }
    const { decisao, label, valorChave, plano } = pendencia;
    if (decisao.caso !== 'autorizacao_lider' && decisao.caso !== 'troca_extra') return;

    setAutorizando(true);
    try {
      const auth = await autenticarLider({ email: liderEmail, senha: liderSenha });
      // `'erro' in auth` e não `!auth.ok`: com `strict: false` o TS não estreita
      // união por discriminante booleano. Mesmo idioma de parcelas.service.
      if ('erro' in auth) { toast.error(auth.erro); return; }

      // Troca de EXTRA: quem sai é o EXTRA atual, e o DIRETO do dono continua
      // intacto — por isso este caminho grava o acordo editado como EXTRA.
      if (decisao.caso === 'troca_extra') {
        if (decisao.extraAtualId) {
          const { error: errDel } = await supabase
            .from('acordos').delete().eq('id', decisao.extraAtualId);
          if (errDel) { toast.error(`Erro ao remover o vínculo extra anterior: ${errDel.message}`); return; }
        }

        setPendencia(null);
        await gravar(plano, {
          tipo_vinculo:          'extra',
          vinculo_operador_id:   decisao.operadorId,
          vinculo_operador_nome: decisao.operadorNome,
        });

        // A troca de Extra é uma DECISÃO com autorização de líder por trás; as
        // triggers registram o delete e o insert que a executaram, mas não têm
        // como saber que os dois foram a mesma decisão, nem quem a autorizou.
        await registrarLog({
          acao: 'acordo_extra_trocado',
          categoria: 'acordo',
          severidade: 'aviso',
          descricao: `Assumiu o vínculo EXTRA do ${label} ${valorChave}, autorizado por ${auth.autorizador.nome}`,
          empresaId: empresa.id,
          tabela: 'acordos',
          registroId: decisao.extraAtualId,
          alvoTipo: 'acordo',
          alvoRotulo: `${label} ${valorChave}`,
          detalhes: {
            origem: 'edicao',
            aprovado_por: auth.autorizador.nome,
            aprovado_por_id: auth.autorizador.uid,
            operador_extra_anterior: decisao.extraAtualOpId,
            operador_extra_novo: perfil.id,
          },
        });

        if (decisao.extraAtualOpId) {
          await criarNotificacao({
            usuario_id: decisao.extraAtualOpId,
            titulo:     'Seu vínculo EXTRA foi transferido',
            mensagem:   `O ${label} "${valorChave}" (EXTRA) foi transferido para `
                      + `${perfil.nome ?? 'outro operador'}. Autorizado por ${auth.autorizador.nome}.`,
            empresa_id: empresa.id,
          });
        }
        toast.success('Troca de vínculo EXTRA autorizada!');
        setLiderEmail(''); setLiderSenha('');
        return;
      }

      // Transferência completa: o acordo do dono vai para a lixeira e a chave
      // fica livre para o acordo que estou editando assumir.
      const rt = await transferirAcordoNoServidor({
        acordoId:       decisao.acordoId,
        novoOperadorId: perfil.id,
        token:          auth.autorizador.token,
      });
      if (!rt.ok) { toast.error(mensagemErroTransferencia(rt.erro)); return; }

      setPendencia(null);
      await gravar(plano);

      await criarNotificacao({
        usuario_id: decisao.operadorId,
        titulo:     `Seu ${label} "${valorChave}" foi transferido`,
        mensagem:   `O ${label} "${valorChave}" foi transferido para ${perfil.nome ?? 'outro operador'} `
                  + `com autorização de ${auth.autorizador.nome}. Seu acordo foi movido para a lixeira.`,
        empresa_id: empresa.id,
      });
      toast.success('Transferência autorizada!');
      setLiderEmail(''); setLiderSenha('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro inesperado na autorização');
    } finally {
      setAutorizando(false);
    }
  }

  function cancelarPendencia() {
    setPendencia(null); setLiderEmail(''); setLiderSenha('');
  }

  // O modal de autorização fala a linguagem do cadastro novo (`ConflitNR`).
  // Aqui o "payload" só existe para ele mostrar a chave em conflito.
  const conflitoParaModal: ConflitNR | null =
    pendencia && (pendencia.decisao.caso === 'autorizacao_lider' || pendencia.decisao.caso === 'troca_extra')
      ? {
          acordoId:     pendencia.decisao.acordoId,
          operadorId:   pendencia.decisao.operadorId,
          operadorNome: pendencia.decisao.operadorNome,
          payload:      { [pendencia.campoChave]: pendencia.valorChave },
          modo:         pendencia.decisao.caso === 'troca_extra' ? 'troca_extra' : 'transferencia_completa',
          extraAtualId:     pendencia.decisao.caso === 'troca_extra' ? pendencia.decisao.extraAtualId : null,
          extraAtualOpId:   pendencia.decisao.caso === 'troca_extra' ? pendencia.decisao.extraAtualOpId : null,
          extraAtualOpNome: pendencia.decisao.caso === 'troca_extra' ? pendencia.decisao.extraAtualOpNome : null,
        }
      : null;

  return (
    <tr>
      <td colSpan={colSpan} className="p-0">
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={springPresets.gentle}
          className="overflow-hidden"
        >
            <div className="p-4 bg-primary/3 border-t border-b border-primary/20">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">

                {/* Nome */}
                <div className="space-y-1 sm:col-span-2 lg:col-span-2">
                  <Label className="text-xs font-medium">{isPaguePlay ? 'Nome do Profissional' : 'Nome do Cliente'}{!isPaguePlay && ' *'}</Label>
                  <Input
                    value={nomeCliente}
                    onChange={e => setNomeCliente(e.target.value)}
                    placeholder="Nome completo"
                    className="h-8 text-xs"
                  />
                </div>


                {/* Vencimento */}
                <DatePickerField
                  value={vencimento}
                  onChange={setVencimento}
                  label="Vencimento"
                  required
                  size="sm"
                />

                {/* Valor */}
                <div className="space-y-1">
                  <Label className="text-xs font-medium">
                    {entradaAtiva && ehLinhaDaEntrada ? 'Valor da entrada *' : 'Valor *'}
                  </Label>
                  <div className="relative">
                    <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                    <Input
                      value={valor}
                      onChange={e => setValor(e.target.value)}
                      placeholder="0.00"
                      className="h-8 text-xs pl-6 font-mono"
                    />
                  </div>
                </div>

                {/* Código [PP] / Instituição [BP] — o MESMO campo `instituicao`
                    servindo dois conceitos, e por isso dois controles.
                    Na PaguePlay é o código do acordo: texto livre.
                    Na BookPlay é a instituição, uma de quatro: lista fechada,
                    igual à da criação. Enquanto isto aqui era um <Input> nas
                    duas, a edição aceitava qualquer coisa num campo que o
                    cadastro restringe — e o valor digitado ainda virava chave
                    de NR, travando a categoria inteira (ver 20260810b). */}
                <div className="space-y-1">
                  <Label className="text-xs font-medium">{isPaguePlay ? 'Código' : 'Instituição'}</Label>
                  {isPaguePlay ? (
                    <div className="relative">
                      <Building2 className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                      <Input
                        value={instituicao}
                        onChange={e => setInstituicao(e.target.value)}
                        placeholder="Código (opcional)"
                        className="h-8 text-xs pl-6"
                      />
                    </div>
                  ) : (
                    <Select
                      value={instituicao.trim() || INSTITUICAO_NENHUMA}
                      onValueChange={v => setInstituicao(v === INSTITUICAO_NENHUMA ? '' : v)}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={INSTITUICAO_NENHUMA}>— Nenhuma —</SelectItem>
                        {instituicoesDisponiveis.map(inst => (
                          <SelectItem key={inst} value={inst}>{inst}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {/* WhatsApp / Número */}
                <div className="space-y-1">
                  <Label className="text-xs font-medium">{isPaguePlay ? 'Número' : 'WhatsApp'}</Label>
                  <div className="flex gap-1.5">
                    <div className="relative flex-1">
                      <Smartphone className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                      <Input
                        value={whatsapp}
                        onChange={e => setWhatsapp(e.target.value)}
                        placeholder="(89) 99999-9999"
                        className="h-8 text-xs pl-6 font-mono"
                      />
                    </div>
                    {isPaguePlay && whatsapp.replace(/\D/g, '').length >= 10 && (
                      <button
                        type="button"
                        title={perfil?.tampermonkey_configured ? 'Abrir no Chatplay' : 'Configure o Chatplay no topo da página'}
                        disabled={!perfil?.tampermonkey_configured}
                        className={cn(
                          'h-8 w-8 flex items-center justify-center rounded-md border text-xs flex-shrink-0 transition-colors',
                          perfil?.tampermonkey_configured
                            ? 'border-violet-500/40 text-violet-500 hover:bg-violet-500/10 cursor-pointer'
                            : 'border-muted text-muted-foreground opacity-50 cursor-not-allowed',
                        )}
                        onClick={() => abrirChatplay(whatsapp)}
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {isPaguePlay && (
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">Estado *</Label>
                    {/* Sem a opção "Nenhum": na PaguePlay o estado é
                        obrigatório e o banco recusa quem tenta apagá-lo
                        (migration 20260802c). Deixar a opção na tela seria
                        oferecer um caminho que termina em erro. */}
                    <Select value={estado} onValueChange={setEstado}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {ESTADOS_BRASIL.map(uf => (
                          <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Forma de Pagamento */}
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Forma de Pagamento</Label>
                  <Select value={tipo} onValueChange={v => setTipo(v as Acordo['tipo'])}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(isPaguePlay ? TIPO_LABELS_PAGUEPLAY : TIPO_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Parcelas */}
                <div className="space-y-1">
                  <Label className="text-xs font-medium">
                    Parcelas{isPaguePlay && !TIPOS_PARCELADOS_PP.includes(tipo) && (
                      <span className="text-muted-foreground/50 font-normal"> (não se aplica)</span>
                    )}
                  </Label>

                  {isPaguePlay ? (
                    <Select
                      value={parcelas}
                      onValueChange={setParcelas}
                      disabled={!TIPOS_PARCELADOS_PP.includes(tipo)}
                    >
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 12 }, (_, i) => i + 1).map(n => (
                          <SelectItem key={n} value={String(n)}>{n === 1 ? '1 (à vista)' : `${n}x`}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : jaParcelado && !editandoParcelas ? (
                    // Acordo que já é parcelamento: o número aparece escrito e
                    // só vira campo depois do botão. Ver `jaParcelado`.
                    <div className="h-8 flex items-center gap-2 px-2 rounded-md border border-input bg-muted/30">
                      <span className="text-xs font-mono font-semibold text-foreground">
                        {parcelas}x
                      </span>
                      <button
                        type="button"
                        onClick={() => setEditandoParcelas(true)}
                        disabled={saving}
                        title="Alterar a quantidade de parcelas deste acordo"
                        className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline cursor-pointer"
                      >
                        <Pencil className="w-3 h-3" /> Editar
                      </button>
                    </div>
                  ) : (
                    <Input
                      type="number" min={1} max={PARCELAS_MAX_DEFAULT} inputMode="numeric"
                      value={parcelas}
                      onChange={e => setParcelas(e.target.value.replace(/\D/g, '').slice(0, 2))}
                      placeholder="1"
                      className="h-8 text-xs font-mono"
                    />
                  )}

                  {/* Editar as parcelas em si (data, valor, forma de cada uma)
                      fica ao lado da quantidade: é onde o operador já está
                      olhando quando pensa em parcela. */}
                  {!isPaguePlay && jaParcelado && (
                    <button
                      type="button"
                      onClick={() => setModalParcelasOpen(true)}
                      disabled={saving}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline cursor-pointer"
                    >
                      <Layers className="w-3 h-3" /> Editar parcelas (data, valor, forma)
                    </button>
                  )}

                  {!isPaguePlay && editandoParcelas && parcelasNumAtual !== (acordo.parcelas ?? 1) && (
                    <p className="text-[10px] text-amber-700 dark:text-amber-400 leading-tight">
                      {parcelasNumAtual > (acordo.parcelas ?? 1)
                        ? 'Ao salvar, as parcelas que faltam são criadas seguindo as datas do acordo.'
                        : 'Ao salvar, as parcelas acima desse número são apagadas (com confirmação).'}
                    </p>
                  )}
                </div>

                {/* Status */}
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Status</Label>
                  <Select value={status} onValueChange={v => setStatus(v as Acordo['status'])}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(isPaguePlay ? STATUS_LABELS_PAGUEPLAY : STATUS_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Link do acordo */}
                <div className="space-y-1 sm:col-span-2 lg:col-span-3 xl:col-span-2">
                  <Label className="text-xs font-medium">{isPaguePlay ? 'Link do Acordo' : 'Observações'}</Label>
                  <div className="relative">
                    {isPaguePlay
                      ? <Link2 className="absolute left-2 top-2 w-3 h-3 text-muted-foreground" />
                      : <FileText className="absolute left-2 top-2 w-3 h-3 text-muted-foreground" />}
                    <Textarea
                      value={observacoes}
                      onChange={e => setObservacoes(e.target.value)}
                      placeholder={isPaguePlay ? 'Cole aqui o link do acordo...' : 'Observações do acordo...'}
                      className={cn('text-xs resize-none pl-6 pt-1.5', 'min-h-[2rem]')}
                      rows={1}
                    />
                  </div>
                </div>

              </div>

              {/* Aviso PP: forma de pagamento/parcelas alteradas → recálculo */}
              {parcelamentoAlterado && (
                <div className="mt-3 rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    O cálculo de parcelamento será feito a partir do{' '}
                    <strong>valor total</strong> que você colocou no campo Valor.
                    Verifique se o valor está correto antes de salvar.
                  </p>
                </div>
              )}

              {/* Acordo com entrada: a edição reconhece e mostra os três
                  números juntos, porque mexer em um muda os outros. */}
              {entradaAtiva && demaisAtual != null && (
                <div className="mt-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-3 flex items-start gap-2">
                  <Wallet className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-emerald-700 dark:text-emerald-400">
                    Acordo <strong>com entrada</strong>: a parcela <strong>1/{parcelasNumAtual}</strong> é a
                    entrada de <strong>{formatBRL(entradaPrevista)}</strong> e as outras{' '}
                    <strong>{Math.max(0, parcelasNumAtual - 1)}</strong> ficam em{' '}
                    <strong>{formatBRL(demaisAtual)}</strong> cada — total{' '}
                    <strong>{formatBRL(totalComEntrada(entradaPrevista, demaisAtual, parcelasNumAtual))}</strong>.
                    {ehLinhaDaEntrada
                      ? ' O campo Valor acima é o da entrada.'
                      : ` Esta linha é a parcela ${acordo.numero_parcela ?? 1}; o campo Valor edita só ela.`}
                    {' '}Para mudar o valor das demais, use <strong>Editar parcelas</strong> no detalhe do acordo.
                  </p>
                </div>
              )}

              {/* Tags visuais */}
              {empresaTags.length > 0 && (
                <div className="space-y-1 mt-3">
                  <Label className="text-xs font-medium">Tags</Label>
                  <TagsSelector
                    tags={empresaTags}
                    selectedIds={tagIds}
                    onChange={setTagIds}
                    disabled={saving}
                  />
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-primary/15">
                {usuarioTemLogicaDiretoExtra && (
                  <button
                    type="button"
                    onClick={() => setIsExtra(v => !v)}
                    disabled={saving}
                    title={isExtra ? 'Clique para marcar como Direto' : 'Clique para marcar como Extra'}
                    className={cn(
                      'h-8 flex items-center gap-2 px-3 rounded-md border text-xs font-medium transition-all cursor-pointer whitespace-nowrap',
                      isExtra
                        ? 'bg-amber-500/15 text-amber-700 border-amber-500/30 hover:bg-amber-500/25 dark:text-amber-400'
                        : 'bg-background text-foreground border-input hover:bg-accent/50',
                    )}
                  >
                    <Link2 className="w-3 h-3 shrink-0" />
                    {isExtra ? 'Extra' : 'Direto'}
                  </button>
                )}
                <div className="flex gap-2 ml-auto">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={onCancel}
                    disabled={saving}
                  >
                    <X className="w-3 h-3" /> Cancelar
                  </Button>
                  <Button
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => void handleSave()}
                    disabled={saving}
                  >
                    <Save className="w-3 h-3" />
                    {saving ? 'Salvando...' : 'Salvar'}
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Data, valor e forma de cada parcela. Grava direto e devolve as
              linhas — a área de edição continua aberta com o resto do que já
              estava digitado. */}
          {!isPaguePlay && jaParcelado && (
            <ModalEditarAcordoParcelado
              acordo={acordo}
              open={modalParcelasOpen}
              onClose={() => setModalParcelasOpen(false)}
              onSaved={(linhas) => {
                const minha = linhas.find(l => l.id === acordo.id);
                if (minha) {
                  setVencimento(minha.vencimento);
                  setValor(Number(minha.valor).toFixed(2).replace('.', ','));
                  setTipo(minha.tipo);
                }
                onParcelasAtualizadas?.(linhas);
              }}
            />
          )}

          {/* Reduzir parcelas apaga linha do banco: confirmação explícita,
              com os números que vão sumir escritos na frente. */}
          <AlertDialog
            open={!!remocaoPendente}
            onOpenChange={(aberto) => { if (!aberto) setRemocaoPendente(null); }}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reduzir para {remocaoPendente?.plano.novoTotal} parcelas?</AlertDialogTitle>
                <AlertDialogDescription>
                  {remocaoPendente ? descreverRemocao(remocaoPendente.plano) : ''}
                  {' '}Isso não pode ser desfeito — parcelas já pagas não são apagadas por aqui.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  disabled={saving}
                  onClick={() => { setRemocaoPendente(null); void handleSave(true); }}
                >
                  Apagar e salvar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Conflito de NR na edição — os mesmos modais do cadastro novo, para
              o operador não encontrar duas linguagens para a mesma regra. */}
          <ModalAvisoDiretoExtra
            aberto={pendencia?.decisao.caso === 'aviso_direto_extra'}
            operadorNome={
              pendencia?.decisao.caso === 'aviso_direto_extra' ? pendencia.decisao.operadorNome : ''
            }
            operadorSetor={
              pendencia?.decisao.caso === 'aviso_direto_extra'
                ? (pendencia.decisao.operadorSetor ?? undefined)
                : undefined
            }
            nrLabel={pendencia?.valorChave ?? ''}
            labelCampo={pendencia?.label ?? 'NR'}
            confirmando={confirmandoAviso}
            onConfirmar={() => { void confirmarAvisoDiretoExtra(); }}
            onCancel={cancelarPendencia}
          />

          <ModalAutorizacaoNR
            conflito={conflitoParaModal}
            liderEmail={liderEmail}
            liderSenha={liderSenha}
            autorizando={autorizando}
            onEmailChange={setLiderEmail}
            onSenhaChange={setLiderSenha}
            onAutorizar={() => { void autorizarComLider(); }}
            onCancel={cancelarPendencia}
          />
        </td>
      </tr>
    );
}
