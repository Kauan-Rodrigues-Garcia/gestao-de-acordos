import type { Acordo } from '@/lib/supabase';

export interface ConflitNR {
  acordoId:          string;
  operadorId:        string;
  operadorNome:      string;
  payload:           Record<string, unknown>;
  modo:              'transferencia_completa' | 'troca_extra';
  extraAtualId?:     string | null;
  extraAtualOpId?:   string | null;
  extraAtualOpNome?: string | null;
}

export interface ModalAutorizacaoNRProps {
  conflito:    ConflitNR | null;
  /** true enquanto o pedido está sendo enviado. */
  autorizando: boolean;
  /** Cria o pedido e fecha a janela — ver o cabeçalho do modal. */
  onSolicitar: () => void;
  onCancel:    () => void;
}

export interface ModalAvisoDiretoExtraProps {
  aberto:          boolean;
  operadorNome:    string;
  operadorSetor?:  string;
  nrLabel:         string;
  labelCampo:      string;
  confirmando:     boolean;
  onConfirmar:     () => void;
  onCancel:        () => void;
}

export interface AcordoNovoInlineProps {
  isPaguePlay:        boolean;
  colSpan:            number;
  onSaved:            (inserido: Acordo) => void;
  onCancel:           () => void;
  onAcordoRemovido?:  (id: string) => void;
}

interface PendingAvisoDiretoExtra {
  operadorAntNome:  string;
  operadorAntSetor?: string;
  nrLabel:          string;
  labelCampo:       string;
}

export interface Tag { id: string; nome: string; cor: string; }

export interface SharedFormState {
  colSpan: number;
  isPaguePlay: boolean;
  salvando: boolean;
  salvar: () => Promise<void>;
  cancelar: () => void;
  // Main form fields
  nomeCliente: string; setNomeCliente: (v: string) => void;
  nrCliente: string; setNrCliente: (v: string) => void;
  vencimento: string; setVencimento: (v: string) => void;
  valorStr: string; setValorStr: (v: string) => void;
  tipo: string; handleChangeTipo: (v: string) => void;
  parcelasStr: string; setParcelasStr: (v: string) => void;
  whatsapp: string; setWhatsapp: (v: string) => void;
  instituicao: string; setInstituicao: (v: string) => void;
  status: string; setStatus: (v: string) => void;
  observacoes: string; setObservacoes: (v: string) => void;
  estadoSel: string; setEstadoSel: (v: string) => void;
  link: string; setLink: (v: string) => void;
  // Entrada (BookPlay): 1º pagamento com valor próprio. Ligado, `valorStr`
  // passa a ser o valor DA ENTRADA e `demaisStr` o das outras parcelas.
  temEntradaForm: boolean; setTemEntradaForm: (fn: (v: boolean) => boolean) => void;
  demaisStr: string; setDemaisStr: (v: string) => void;
  /** Total do acordo com entrada — só para mostrar na tela. 0 = não aplicável. */
  totalEntrada: number;
  // Derived
  temParcelas: boolean;
  parcelas: number;
  /** Fluxo analítico PP: qual parcela está sendo paga (1 = fluxo normal) */
  parcelaInicial: number;
  veioDoAnalitico: boolean;
  // Extra logic
  isExtra: boolean; setIsExtra: (fn: (v: boolean) => boolean) => void;
  usuarioTemLogicaDiretoExtra: boolean;
  tagIds: string[]; setTagIds: (ids: string[]) => void;
  quarentaPct: boolean; setQuarentaPct: (fn: (v: boolean) => boolean) => void;
  empresaTags: Tag[];
  // Conflict modal
  conflito: ConflitNR | null;


  autorizando: boolean;
  solicitarAutorizacaoConflito: () => Promise<void>;
  cancelarConflito: () => void;
  // Aviso Direto/Extra modal
  avisoDiretoExtra: PendingAvisoDiretoExtra | null;
  confirmandoDiretoExtra: boolean;
  confirmarDiretoExtra: () => Promise<void>;
  cancelarAvisoDiretoExtra: () => void;
  // Autocomplete profissional (PP only)
  profissionalLoading: boolean;
  profissionalEncontrado: boolean;
  // ── PIX Automático / Cartão Recorrente (BookPlay) ────────────────────────
  /** A forma escolhida é PIX Automático ou Cartão Recorrente? */
  formaRecorrente: boolean;
  /** Acordo recorrente recém-gravado, esperando o aviso. `null` = sem aviso. */
  avisoPixAutomatico: { nr: string; forma: string } | null;
  /** Abre a aba Pix Automático com o NR já preenchido. */
  irParaPixAutomatico: () => void;
  /** Fecha o aviso e segue o caminho normal de quem salvou. */
  dispensarAvisoPixAutomatico: () => void;
}

/**
 * Props do modal com senha — só a tela de EDIÇÃO ainda usa.
 *
 * A tela de novo acordo migrou para `ModalAutorizacaoNRProps`, sem senha. Ver o
 * cabeçalho de `ModalAutorizacaoNRSenha.tsx` para o motivo de a edição ter
 * ficado para trás.
 */
export interface ModalAutorizacaoNRSenhaProps {
  conflito:       ConflitNR | null;
  liderEmail:     string;
  liderSenha:     string;
  autorizando:    boolean;
  onEmailChange:  (v: string) => void;
  onSenhaChange:  (v: string) => void;
  onAutorizar:    () => void;
  onCancel:       () => void;
}
