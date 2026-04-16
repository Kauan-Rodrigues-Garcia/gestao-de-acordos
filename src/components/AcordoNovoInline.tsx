/**
 * AcordoNovoInline.tsx — v4 (nr_registros realtime)
 *
 * Lógica de NR único — fonte da verdade: tabela `nr_registros`
 *  • PaguePay  → NR único = campo "Inscrição" (instituicao)
 *  • Bookplay  → NR único = campo "NR"         (nr_cliente)
 *
 *  Verificação ao salvar (usa cache local do useNrRegistros — zero latência):
 *    1. verificarConflito(nr, campo) — lê cache local em tempo real
 *    2. conflito === null            → inserir acordo + registrarNr na tabela
 *    3. conflito.operadorId === perfil.id
 *         → toast.error "NR já existe na sua lista"
 *    4. conflito.operadorId !== perfil.id
 *         → setConflito → modal de autorização
 *
 *  Ao autorizar transferência:
 *    1. Autenticar líder via fetch POST (Supabase Auth)
 *    2. Verificar perfil: lider | administrador | super_admin
 *    3. Buscar acordo anterior completo
 *    4. enviarParaLixeira (motivo: transferencia_nr)
 *    5. supabase.from('acordos').delete()
 *    6. executarSalvar + transferirNr (atualiza nr_registros)
 *    7. Log em logs_sistema + criarNotificacao ao operador anterior
 *
 * Exports:
 *   - AcordoNovoInline (nomeado + default)
 *   - ModalAutorizacaoNR (reutilizável no AcordoForm)
 *   - ConflitNR (interface)
 *   - ModalAutorizacaoNRProps (interface)
 */

import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { supabase, Acordo } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { toast } from 'sonner';
import {
  X, Save, User, Hash, DollarSign, FileText, Link2,
  CalendarIcon, Shield, AlertTriangle,
} from 'lucide-react';
import {
  ESTADOS_BRASIL, parseCurrencyInput, buildObservacoesComEstado, INSTITUICOES_OPTIONS,
} from '@/lib/index';
import { cn } from '@/lib/utils';
import { criarNotificacao }     from '@/services/notificacoes.service';
import { enviarParaLixeira }    from '@/services/lixeira.service';
// nr_registros é gerenciado pelo trigger trg_sync_nr_registros (v2) no banco
import { useNrRegistros }           from '@/hooks/useNrRegistros';
import { verificarNrRegistro }      from '@/services/nr_registros.service';

// ─── Tipos exportados ────────────────────────────────────────────────────────

export interface ConflitNR {
  acordoId:     string;
  operadorId:   string;
  operadorNome: string;
  payload:      Record<string, unknown>;
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

// ─── Constantes ──────────────────────────────────────────────────────────────

const TIPOS_PAGUEPLAY = [
  { value: 'boleto_pix', label: 'Boleto / PIX',       parcelado: true  },
  { value: 'cartao',     label: 'Cartão de Crédito',   parcelado: false },
];

const TIPOS_BOOKPLAY = [
  { value: 'boleto',            label: 'Boleto',            parcelado: true  },
  { value: 'pix_automatico',    label: 'PIX Automático',    parcelado: true  },
  { value: 'cartao_recorrente', label: 'Cartão Recorrente', parcelado: true  },
  { value: 'cartao',            label: 'Cartão de Crédito', parcelado: false },
  { value: 'pix',               label: 'PIX',               parcelado: false },
];

const STATUS_OPTIONS = [
  { value: 'verificar_pendente', label: 'Pendente' },
  { value: 'pago',               label: 'Pago'     },
  { value: 'nao_pago',           label: 'Não Pago' },
];

const PARCELAS_PP = Array.from({ length: 12 }, (_, i) => i + 1);

// ─── Props do componente principal ───────────────────────────────────────────

export interface AcordoNovoInlineProps {
  isPaguePlay: boolean;
  colSpan:     number;
  onSaved:     (inserido: Acordo) => void;
  onCancel:    () => void;
  /** Chamado com o id do acordo deletado quando uma transferência de NR é autorizada */
  onAcordoRemovido?: (id: string) => void;
}

// ─── DatePickerField (interno) ────────────────────────────────────────────────

function DatePickerField({
  value, onChange, label, required,
}: {
  value:    string;
  onChange: (v: string) => void;
  label:    string;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = value ? parseISO(value) : undefined;

  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}{required && ' *'}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              'w-full h-8 text-xs justify-start gap-2 font-mono px-2',
              !value && 'text-muted-foreground',
            )}
          >
            <CalendarIcon className="w-3 h-3 shrink-0 text-muted-foreground" />
            {selected ? format(selected, 'dd/MM/yyyy') : 'Selecionar data'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selected}
            onSelect={(day) => {
              if (day) { onChange(format(day, 'yyyy-MM-dd')); setOpen(false); }
            }}
            locale={ptBR}
            initialFocus
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

// ─── Modal de Autorização (exportado para reutilização) ──────────────────────

export function ModalAutorizacaoNR({
  conflito,
  liderEmail,
  liderSenha,
  autorizando,
  onEmailChange,
  onSenhaChange,
  onAutorizar,
  onCancel,
}: ModalAutorizacaoNRProps) {
  // Determina qual campo é o NR exibido:
  // PaguePay → instituicao; Bookplay → nr_cliente
  const nrLabel: string = conflito
    ? (
        (conflito.payload.instituicao as string | undefined)?.trim() ||
        (conflito.payload.nr_cliente  as string | undefined)?.trim() ||
        '—'
      )
    : '—';

  const operadorNome = conflito?.operadorNome ?? '—';

  return (
    <Dialog open={!!conflito} onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent className="max-w-md" aria-describedby="dlg-conflito-nr-desc">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-warning">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            NR já agendado por outro operador
          </DialogTitle>

          <DialogDescription id="dlg-conflito-nr-desc" asChild>
            <div className="space-y-3 pt-1">
              {/* Descrição principal */}
              <p className="text-sm text-foreground/80">
                O NR{' '}
                <strong className="font-mono text-foreground">{nrLabel}</strong>{' '}
                já possui um agendamento com o operador{' '}
                <strong className="text-foreground">{operadorNome}</strong>.{' '}
                Será possível registrar após autorização.
              </p>

              {/* Aviso vermelho/amarelo */}
              <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-3 space-y-1">
                <p className="text-xs font-semibold text-destructive flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  Atenção — ação irreversível
                </p>
                <p className="text-xs text-destructive/80">
                  O acordo atual de{' '}
                  <strong>{operadorNome}</strong>{' '}
                  será <strong>removido da lista</strong> e movido para a{' '}
                  <strong>lixeira temporária</strong>. O operador receberá uma
                  notificação com todos os detalhes da transferência.
                </p>
              </div>

              {/* Aviso amarelo secundário */}
              <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/30 p-3">
                <p className="text-xs text-yellow-700 dark:text-yellow-400">
                  Esta operação ficará registrada nos logs do sistema com o nome
                  do líder autorizador.
                </p>
              </div>
            </div>
          </DialogDescription>
        </DialogHeader>

        {/* Formulário de autorização */}
        <div className="space-y-3 pt-1">
          <div className="flex items-center gap-2 border-t border-border pt-3">
            <Shield className="w-4 h-4 text-primary shrink-0" />
            <p className="text-sm font-semibold">Autorização do Líder</p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">E-mail do Líder / Admin</Label>
            <Input
              type="email"
              placeholder="lider@empresa.com"
              value={liderEmail}
              onChange={(e) => onEmailChange(e.target.value)}
              className="h-9 text-sm"
              disabled={autorizando}
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Senha</Label>
            <Input
              type="password"
              placeholder="••••••••"
              value={liderSenha}
              onChange={(e) => onSenhaChange(e.target.value)}
              className="h-9 text-sm"
              disabled={autorizando}
              autoComplete="current-password"
              onKeyDown={(e) => { if (e.key === 'Enter' && liderEmail && liderSenha) onAutorizar(); }}
            />
          </div>

          <div className="flex gap-2 pt-1">
            <Button
              variant="outline"
              className="flex-1"
              onClick={onCancel}
              disabled={autorizando}
            >
              Cancelar
            </Button>
            <Button
              className="flex-1 gap-2"
              onClick={onAutorizar}
              disabled={autorizando || !liderEmail.trim() || !liderSenha.trim()}
            >
              <Shield className="w-4 h-4" />
              {autorizando ? 'Verificando...' : 'Autorizar Transferência'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Componente principal ────────────────────────────────────────────────────

export function AcordoNovoInline({
  isPaguePlay, colSpan, onSaved, onCancel, onAcordoRemovido,
}: AcordoNovoInlineProps) {
  const { perfil }  = useAuth();
  const { empresa } = useEmpresa();
  const { verificarConflito, loading: nrLoading, refetch: nrRefetch } = useNrRegistros();

  // Campos do formulário
  const [nomeCliente,  setNomeCliente]  = useState('');
  const [nrCliente,    setNrCliente]    = useState('');
  const [vencimento,   setVencimento]   = useState('');
  const [valorStr,     setValorStr]     = useState('');
  const [tipo,         setTipo]         = useState(isPaguePlay ? 'boleto_pix' : 'boleto');
  const [parcelasStr,  setParcelasStr]  = useState('1');
  const [whatsapp,     setWhatsapp]     = useState('');
  const [instituicao,  setInstituicao]  = useState('');
  const [status,       setStatus]       = useState('verificar_pendente');
  const [observacoes,  setObservacoes]  = useState('');
  const [estadoSel,    setEstadoSel]    = useState('');
  const [link,         setLink]         = useState('');
  const [salvando,     setSalvando]     = useState(false);

  // Estado do conflito de NR
  const [conflito,    setConflito]    = useState<ConflitNR | null>(null);
  const [liderEmail,  setLiderEmail]  = useState('');
  const [liderSenha,  setLiderSenha]  = useState('');
  const [autorizando, setAutorizando] = useState(false);

  const tipos      = isPaguePlay ? TIPOS_PAGUEPLAY : TIPOS_BOOKPLAY;
  const tipoAtual  = tipos.find((t) => t.value === tipo);
  const temParcelas = !!tipoAtual?.parcelado;
  const parcelas    = Math.max(1, parseInt(parcelasStr) || 1);

  function handleChangeTipo(t: string) {
    setTipo(t);
    if (!tipos.find((x) => x.value === t)?.parcelado) setParcelasStr('1');
  }

  function validar(): string | null {
    if (!vencimento)                        return 'Data de vencimento obrigatória';
    const v = parseCurrencyInput(valorStr);
    if (isNaN(v) || v <= 0)                 return 'Informe o valor do acordo';
    if (isPaguePlay && !instituicao.trim()) return 'Inscrição é obrigatória';
    return null;
  }

  // ── Inserção efetiva no banco (com fallback para colunas novas) ────────────
  async function executarSalvar(payload: Record<string, unknown>): Promise<Acordo | null> {
    const { data: inserido, error } = await supabase
      .from('acordos')
      .insert(payload)
      .select('*, perfis(id, nome, email, perfil, setor_id)')
      .single();

    if (error) {
      const isColErr =
        String(error.code) === '42703' ||
        String(error.code) === '400'   ||
        error.message?.toLowerCase().includes('column') ||
        error.message?.toLowerCase().includes('unknown');

      if (isColErr) {
        // Fallback: remover colunas novas que possam não existir ainda
        const { acordo_grupo_id: _g, numero_parcela: _n, ...payloadMin } = payload;
        const { data: inseridoMin, error: e2 } = await supabase
          .from('acordos')
          .insert(payloadMin)
          .select('*, perfis(id, nome, email, perfil, setor_id)')
          .single();
        if (e2) { toast.error(`Erro ao salvar: ${e2.message}`); return null; }
        return inseridoMin as Acordo;
      }

      toast.error(`Erro ao salvar: ${error.message}`);
      return null;
    }

    return inserido as Acordo;
  }

  // ── Construir payload e verificar NR antes de salvar ─────────────────────
  async function salvar() {
    const erro = validar();
    if (erro) { toast.error(erro); return; }
    if (!perfil?.id)  { toast.error('Usuário não autenticado'); return; }
    if (!empresa?.id) { toast.error('Empresa não identificada'); return; }

    setSalvando(true);
    try {
      const valorNum       = parseCurrencyInput(valorStr);
      const tipoParaSalvar = tipo === 'boleto_pix' ? 'boleto' : tipo;
      const grupoId        = crypto.randomUUID();

      const obsFinal = isPaguePlay
        ? (buildObservacoesComEstado(estadoSel || '', link.trim() || '') || null)
        : (observacoes.trim() || null);

      const payload: Record<string, unknown> = {
        nome_cliente:    nomeCliente.trim() || '',
        nr_cliente:      nrCliente.trim()   || '',
        vencimento,
        valor:           valorNum,
        tipo:            tipoParaSalvar,
        parcelas:        temParcelas ? parcelas : 1,
        whatsapp:        whatsapp.trim()    || null,
        instituicao:     instituicao.trim() || null,
        status,
        observacoes:     obsFinal,
        operador_id:     perfil.id,
        empresa_id:      empresa.id,
        data_cadastro:   new Date().toISOString().split('T')[0],
        acordo_grupo_id: grupoId,
        numero_parcela:  1,
      };

      // ── VERIFICAÇÃO DE NR ÚNICO ────────────────────────────────────────────
      // PaguePay → campo "Inscrição" (instituicao) | Bookplay → campo "NR" (nr_cliente)
      // FONTE DE VERDADE: sempre query direta ao banco (nr_registros).
      // O cache local (Realtime) é usado apenas para feedback visual enquanto digita.
      const campoCampo: 'nr_cliente' | 'instituicao' = isPaguePlay ? 'instituicao' : 'nr_cliente';
      const nrParaVerificar = isPaguePlay ? instituicao.trim() : nrCliente.trim();
      const label           = isPaguePlay ? 'Inscrição' : 'NR';

      if (nrParaVerificar && empresa?.id) {
        // 1. Verificar no banco (fonte de verdade garantida)
        const conflitoDb = await verificarNrRegistro(
          nrParaVerificar,
          empresa.id,
          campoCampo,
        );

        // 2. Se não achou no banco mas cache tem → usar cache (pode haver lag no trigger)
        const conflitoFinal = conflitoDb ?? verificarConflito(nrParaVerificar, campoCampo);

        if (conflitoFinal) {
          if (conflitoFinal.operadorId === perfil.id) {
            toast.error(`${label} "${nrParaVerificar}" já existe na sua lista de acordos ativos.`);
            return;
          }
          // Pertence a outro operador → exigir autorização do líder
          setConflito({
            acordoId:     conflitoFinal.acordoId,
            operadorId:   conflitoFinal.operadorId,
            operadorNome: conflitoFinal.operadorNome,
            payload,
          });
          return; // aguarda modal de autorização
        }
      }
      // Suprimir aviso lint para variáveis usadas indiretamente
      void nrLoading; void nrRefetch;

      // NR livre — salvar normalmente
      // ⚠ O trigger trg_sync_nr_registros (v2) registra o NR em nr_registros
      // automaticamente via INSERT — não precisamos chamar registrarNr() aqui.
      const inserido = await executarSalvar(payload);
      if (inserido) {
        onSaved(inserido);
        toast.success(
          parcelas > 1
            ? `Acordo criado! ${parcelas} parcelas gerenciadas pelo Reagendar.`
            : 'Acordo criado com sucesso!',
        );
      }
    } finally {
      setSalvando(false);
    }
  }

  // ── Autorizar transferência de NR (líder/admin) ───────────────────────────
  async function autorizarTransferencia() {
    if (!conflito || !perfil?.id || !empresa?.id) return;
    if (!liderEmail.trim() || !liderSenha.trim()) {
      toast.error('Informe o e-mail e a senha do líder');
      return;
    }

    setAutorizando(true);
    try {
      const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL  as string;
      const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

      // 1. Autenticar líder via Supabase Auth REST
      const authRes = await fetch(
        `${supabaseUrl}/auth/v1/token?grant_type=password`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', apikey: supabaseAnon },
          body:    JSON.stringify({ email: liderEmail.trim(), password: liderSenha }),
        },
      );

      if (!authRes.ok) {
        const s = authRes.status;
        toast.error(
          s === 400 || s === 401 || s === 422
            ? 'Credenciais do líder inválidas'
            : `Erro ao autenticar líder (${s})`,
        );
        return;
      }

      const authData   = await authRes.json() as { user?: { id: string }; access_token?: string };
      const liderUid   = authData.user?.id;
      const liderToken = authData.access_token;

      if (!liderUid || !liderToken) {
        toast.error('Credenciais do líder inválidas');
        return;
      }

      // 2. Verificar perfil do líder: deve ser lider | administrador | super_admin
      const perfilRes = await fetch(
        `${supabaseUrl}/rest/v1/perfis?id=eq.${liderUid}&select=perfil,nome`,
        {
          headers: {
            apikey:        supabaseAnon,
            Authorization: `Bearer ${liderToken}`,
          },
        },
      );

      if (!perfilRes.ok) {
        toast.error('Erro ao verificar perfil do líder');
        return;
      }

      const perfilArr   = await perfilRes.json() as Array<{ perfil: string; nome: string }>;
      const liderPerfil = Array.isArray(perfilArr) && perfilArr.length > 0 ? perfilArr[0] : null;

      if (
        !liderPerfil ||
        !['lider', 'administrador', 'super_admin'].includes(liderPerfil.perfil)
      ) {
        toast.error('O usuário informado não tem permissão de líder ou administrador');
        return;
      }

      // ── Campo NR correto por empresa ────────────────────────────────────────
      // PaguePay → NR único = instituicao | Bookplay → NR único = nr_cliente
      const campoNr: 'nr_cliente' | 'instituicao' = isPaguePlay ? 'instituicao' : 'nr_cliente';
      const nrLogLabel =
        ((isPaguePlay
          ? conflito.payload.instituicao
          : conflito.payload.nr_cliente) as string | undefined)?.trim() || '—';

      // 3. Buscar acordo anterior completo ANTES de qualquer delete
      // Usar maybeSingle() para não lançar erro se não encontrar (RLS ou já deletado)
      const { data: acordoAntData, error: errBusca } = await supabase
        .from('acordos')
        .select('id, nome_cliente, valor, vencimento, status, operador_id, empresa_id, nr_cliente, instituicao')
        .eq('id', conflito.acordoId)
        .maybeSingle();

      if (errBusca) {
        console.warn('[transferência] erro ao buscar acordo anterior:', errBusca.message);
      }

      // Guardar dados para notificação mesmo se o delete ocorrer
      const nomeClienteAnt  = acordoAntData?.nome_cliente ?? '—';
      const valorFmt        = acordoAntData?.valor != null
        ? `R$ ${Number(acordoAntData.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
        : '—';
      const vencimentoFmt   = acordoAntData?.vencimento
        ? format(parseISO(acordoAntData.vencimento), 'dd/MM/yyyy', { locale: ptBR })
        : '—';
      const statusAnt       = acordoAntData?.status ?? '—';
      const nomeNovoOp      = perfil.nome ?? 'Operador';

      // 4. Salvar acordo anterior na lixeira
      if (acordoAntData) {
        await enviarParaLixeira({
          acordo:              acordoAntData as Acordo,
          motivo:              'transferencia_nr',
          operadorNome:        conflito.operadorNome,
          autorizadoPorId:     liderUid,
          autorizadoPorNome:   liderPerfil.nome,
          transferidoParaId:   perfil.id,
          transferidoParaNome: nomeNovoOp,
        });
      }

      // 5. Deletar acordo anterior do banco
      //    ⚠ O trigger trg_sync_nr_registros cuida de remover o nr_registros
      //      vinculado a este acordo_id automaticamente via DELETE CASCADE
      const { error: errDelete } = await supabase
        .from('acordos')
        .delete()
        .eq('id', conflito.acordoId);

      if (errDelete) {
        toast.error(`Erro ao remover acordo anterior: ${errDelete.message}`);
        return;
      }

      // ── Remoção imediata/optimista da lista local do operador atual ─────────
      // Garante que o acordo desapareça da lista mesmo se o Realtime atrasar.
      onAcordoRemovido?.(conflito.acordoId);

      // 6. Inserir novo acordo
      //    ⚠ O trigger trg_sync_nr_registros fará o INSERT em nr_registros
      //      automaticamente com os dados corretos do novo operador.
      //    NÃO chamamos transferirNr() aqui para evitar duplicidade.
      const inserido = await executarSalvar(conflito.payload);
      if (!inserido) return;

      // 7. Log em logs_sistema
      await supabase.from('logs_sistema').insert({
        usuario_id:  perfil.id,
        acao:        'transferencia_nr',
        tabela:      'acordos',
        registro_id: conflito.acordoId,
        empresa_id:  empresa.id,
        detalhes: {
          nr:                nrLogLabel,
          nome_cliente:      nomeClienteAnt,
          valor:             valorFmt,
          vencimento:        vencimentoFmt,
          status_anterior:   statusAnt,
          aprovado_por:      liderPerfil.nome,
          aprovado_por_id:   liderUid,
          operador_anterior: conflito.operadorId,
          operador_anterior_nome: conflito.operadorNome,
          operador_novo:     perfil.id,
          operador_novo_nome: nomeNovoOp,
          empresa_id:        empresa.id,
        },
      });

      // 8. Notificar operador anterior com TODOS os detalhes do acordo removido
      await criarNotificacao({
        usuario_id: conflito.operadorId,
        titulo:     '⚠️ Seu acordo foi transferido pelo líder',
        mensagem:
          `O ${isPaguePlay ? 'Inscrição' : 'NR'} "${nrLogLabel}" ` +
          `(${nomeClienteAnt}) foi transferido para ${nomeNovoOp} ` +
          `com autorização de ${liderPerfil.nome}. ` +
          `Seu acordo foi movido para a lixeira. ` +
          `Detalhes do acordo removido: ` +
          `Valor ${valorFmt} | Vencimento ${vencimentoFmt} | Status: ${statusAnt}.`,
        empresa_id: empresa.id,
      });

      // Finalizar
      onSaved(inserido);
      toast.success('Transferência autorizada! Acordo registrado com sucesso.');
      setConflito(null);
      setLiderEmail('');
      setLiderSenha('');
      // Suprimir aviso lint: campoNr usado acima indiretamente via isPaguePlay
      void campoNr;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro inesperado na autorização');
    } finally {
      setAutorizando(false);
    }
  }

  // ── Helpers de reset do modal de conflito ─────────────────────────────────
  function cancelarConflito() {
    setConflito(null);
    setLiderEmail('');
    setLiderSenha('');
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  RENDER — PaguePay
  // ─────────────────────────────────────────────────────────────────────────
  if (isPaguePlay) {
    return (
      <>
        <tr className="bg-primary/5 border-b-2 border-primary/30">
          <td colSpan={colSpan} className="px-4 py-4">
            <div className="space-y-4">

              {/* Cabeçalho */}
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Save className="w-4 h-4 text-primary" /> Novo Acordo
                </p>
                <Button
                  variant="ghost" size="icon" className="w-7 h-7"
                  onClick={onCancel} disabled={salvando}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>

              {/* Dados Principais */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                  <DollarSign className="w-3 h-3" /> Dados Principais
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {/* Inscrição = NR único para PaguePay */}
                  <div className="space-y-1">
                    <Label className="text-xs">Inscrição *</Label>
                    <Input
                      value={instituicao}
                      onChange={(e) => setInstituicao(e.target.value)}
                      placeholder="Número de inscrição"
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Valor *</Label>
                    <Input
                      value={valorStr}
                      onChange={(e) => setValorStr(e.target.value)}
                      placeholder="0,00"
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                  <DatePickerField
                    label="Vencimento" required
                    value={vencimento} onChange={setVencimento}
                  />
                  <div className="space-y-1">
                    <Label className="text-xs">Estado</Label>
                    <Select value={estadoSel} onValueChange={setEstadoSel}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="UF" />
                      </SelectTrigger>
                      <SelectContent>
                        {([...ESTADOS_BRASIL] as string[]).map((uf) => (
                          <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Tipo e Status */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                  <FileText className="w-3 h-3" /> Tipo e Status
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Forma de Pagamento</Label>
                    <Select value={tipo} onValueChange={handleChangeTipo}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TIPOS_PAGUEPLAY.map((t) => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">
                      Parcelas{' '}
                      {!temParcelas && (
                        <span className="text-muted-foreground/50 font-normal">(não se aplica)</span>
                      )}
                    </Label>
                    <Select
                      value={parcelasStr}
                      onValueChange={setParcelasStr}
                      disabled={!temParcelas}
                    >
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PARCELAS_PP.map((n) => (
                          <SelectItem key={n} value={String(n)}>
                            {n === 1 ? '1 (à vista)' : `${n}x`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Status</Label>
                    <Select value={status} onValueChange={setStatus}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map((s) => (
                          <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Dados do Profissional */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                  <User className="w-3 h-3" /> Dados do Profissional
                  <span className="font-normal normal-case text-muted-foreground/50 ml-1">(opcional)</span>
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="space-y-1 sm:col-span-2">
                    <Label className="text-xs">Nome Completo</Label>
                    <Input
                      value={nomeCliente}
                      onChange={(e) => setNomeCliente(e.target.value)}
                      placeholder="Nome do profissional"
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">CPF</Label>
                    <Input
                      value={nrCliente}
                      onChange={(e) => setNrCliente(e.target.value)}
                      placeholder="000.000.000-00"
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Link do Acordo */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                  <Link2 className="w-3 h-3" /> Link do Acordo
                  <span className="font-normal normal-case text-muted-foreground/50 ml-1">(opcional)</span>
                </p>
                <Textarea
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  placeholder="Cole aqui o link do acordo..."
                  className="text-xs resize-none"
                  rows={2}
                />
              </div>

              {/* Ações */}
              <div className="flex items-center gap-2 pt-1">
                <Button
                  size="sm"
                  className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
                  onClick={salvar}
                  disabled={salvando}
                >
                  <Save className="w-3.5 h-3.5" />
                  {salvando ? 'Salvando...' : 'Salvar Acordo'}
                </Button>
                <Button
                  variant="outline" size="sm"
                  onClick={onCancel} disabled={salvando}
                >
                  Cancelar
                </Button>
              </div>

            </div>
          </td>
        </tr>

        <ModalAutorizacaoNR
          conflito={conflito}
          liderEmail={liderEmail}
          liderSenha={liderSenha}
          autorizando={autorizando}
          onEmailChange={setLiderEmail}
          onSenhaChange={setLiderSenha}
          onAutorizar={autorizarTransferencia}
          onCancel={cancelarConflito}
        />
      </>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  RENDER — Bookplay
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <>
      <tr className="bg-primary/5 border-b-2 border-primary/30">
        <td colSpan={colSpan} className="px-4 py-4">
          <div className="space-y-4">

            {/* Cabeçalho */}
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Save className="w-4 h-4 text-primary" /> Novo Acordo
              </p>
              <Button
                variant="ghost" size="icon" className="w-7 h-7"
                onClick={onCancel} disabled={salvando}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            {/* Dados Principais */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                <Hash className="w-3 h-3" /> Dados Principais
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {/* NR = NR único para Bookplay */}
                <div className="space-y-1">
                  <Label className="text-xs">NR</Label>
                  <Input
                    value={nrCliente}
                    onChange={(e) => setNrCliente(e.target.value)}
                    placeholder="Número NR"
                    className="h-8 text-xs font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Vencimento *</Label>
                  <input
                    type="date"
                    value={vencimento}
                    onChange={(e) => setVencimento(e.target.value)}
                    className="w-full h-8 text-xs bg-background border border-input rounded-md px-2 font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Valor *</Label>
                  <Input
                    value={valorStr}
                    onChange={(e) => setValorStr(e.target.value)}
                    placeholder="0,00"
                    className="h-8 text-xs font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Dados do Cliente */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                <User className="w-3 h-3" /> Dados do Cliente
                <span className="font-normal normal-case text-muted-foreground/50 ml-1">(opcional)</span>
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                <div className="space-y-1 col-span-2">
                  <Label className="text-xs">Nome do Cliente</Label>
                  <Input
                    value={nomeCliente}
                    onChange={(e) => setNomeCliente(e.target.value)}
                    placeholder="Nome completo"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">WhatsApp</Label>
                  <Input
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                    placeholder="(11) 99999-9999"
                    className="h-8 text-xs font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Instituição</Label>
                  <Select value={instituicao} onValueChange={setInstituicao}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      {(INSTITUICOES_OPTIONS as unknown as { value: string; label: string }[]).map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Tipo e Status */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                <FileText className="w-3 h-3" /> Tipo e Status
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Forma de Pagamento</Label>
                  <Select value={tipo} onValueChange={handleChangeTipo}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TIPOS_BOOKPLAY.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {temParcelas && (
                  <div className="space-y-1">
                    <Label className="text-xs">Parcelas</Label>
                    <Input
                      type="number" min={1} max={60}
                      value={parcelasStr}
                      onChange={(e) => setParcelasStr(e.target.value)}
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                )}
                <div className="space-y-1">
                  <Label className="text-xs">Status</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((s) => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Observações */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                <FileText className="w-3 h-3" /> Observações
                <span className="font-normal normal-case text-muted-foreground/50 ml-1">(opcional)</span>
              </p>
              <Textarea
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                placeholder="Observações opcionais..."
                className="text-xs resize-none"
                rows={2}
              />
            </div>

            {/* Ações */}
            <div className="flex items-center gap-2 pt-1">
              <Button
                size="sm"
                className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={salvar}
                disabled={salvando}
              >
                <Save className="w-3.5 h-3.5" />
                {salvando ? 'Salvando...' : 'Salvar Acordo'}
              </Button>
              <Button
                variant="outline" size="sm"
                onClick={onCancel} disabled={salvando}
              >
                Cancelar
              </Button>
            </div>

          </div>
        </td>
      </tr>

      <ModalAutorizacaoNR
        conflito={conflito}
        liderEmail={liderEmail}
        liderSenha={liderSenha}
        autorizando={autorizando}
        onEmailChange={setLiderEmail}
        onSenhaChange={setLiderSenha}
        onAutorizar={autorizarTransferencia}
        onCancel={cancelarConflito}
      />
    </>
  );
}

export default AcordoNovoInline;
