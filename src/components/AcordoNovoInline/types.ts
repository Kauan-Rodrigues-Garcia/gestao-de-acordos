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
  conflito:       ConflitNR | null;
  liderEmail:     string;
  liderSenha:     string;
  autorizando:    boolean;
  onEmailChange:  (v: string) => void;
  onSenhaChange:  (v: string) => void;
  onAutorizar:    () => void;
  onCancel:       () => void;
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
  // Derived
  temParcelas: boolean;
  parcelas: number;
  // Extra logic
  isExtra: boolean; setIsExtra: (fn: (v: boolean) => boolean) => void;
  usuarioTemLogicaDiretoExtra: boolean;
  tagIds: string[]; setTagIds: (ids: string[]) => void;
  quarentaPct: boolean; setQuarentaPct: (fn: (v: boolean) => boolean) => void;
  empresaTags: Tag[];
  // Conflict modal
  conflito: ConflitNR | null;
  liderEmail: string; setLiderEmail: (v: string) => void;
  liderSenha: string; setLiderSenha: (v: string) => void;
  autorizando: boolean;
  autorizarTransferencia: () => Promise<void>;
  cancelarConflito: () => void;
  // Aviso Direto/Extra modal
  avisoDiretoExtra: PendingAvisoDiretoExtra | null;
  confirmandoDiretoExtra: boolean;
  confirmarDiretoExtra: () => Promise<void>;
  cancelarAvisoDiretoExtra: () => void;
}
