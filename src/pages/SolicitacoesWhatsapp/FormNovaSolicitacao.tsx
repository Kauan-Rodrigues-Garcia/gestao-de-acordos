/**
 * FormNovaSolicitacao — abertura do pedido de mensagem no WhatsApp.
 *
 * O código do cliente puxa nome/estado/telefone da tabela `profissionais` — o
 * cadastro do cliente, do mesmo jeito que o formulário de novo acordo já fazia.
 * Existir acordo ou não é irrelevante aqui: nesta aba o operador normalmente
 * pede a mensagem ANTES de fechar acordo nenhum.
 *
 * Tudo continua editável: o auto-preenchimento é atalho, não verdade.
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { Loader2, Search, AlertTriangle, Send, X, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { formatarTelefonePP } from '@/lib/index';
import {
  buscarClientePorCodigo, CATEGORIA_LABEL, MAX_PENDENTES,
  type CategoriaSolicitacao,
} from '@/services/solicitacoesWhatsapp.service';

export interface DadosNovaSolicitacao {
  codigoCliente: string;
  nomeCliente:   string;
  estadoUf:      string;
  whatsapp:      string;
  categoria:     CategoriaSolicitacao;
  mensagem:      string;
}

const CATEGORIAS = Object.keys(CATEGORIA_LABEL) as CategoriaSolicitacao[];

/** Mesmo mínimo do `useProfissional`: abaixo disso a busca traria qualquer um. */
const MIN_CARACTERES_BUSCA = 4;

export function FormNovaSolicitacao({
  empresaId, pendentesAtuais, enviando, onSubmit, onCancelar,
}: {
  empresaId: string;
  /** Quantas o operador já tem pendentes — avisa antes de o trigger recusar. */
  pendentesAtuais: number;
  enviando: boolean;
  onSubmit: (dados: DadosNovaSolicitacao) => void;
  onCancelar: () => void;
}) {
  const [codigo, setCodigo]       = useState('');
  const [nome, setNome]           = useState('');
  const [estado, setEstado]       = useState('');
  const [whatsapp, setWhatsapp]   = useState('');
  const [categoria, setCategoria] = useState<CategoriaSolicitacao>('proposta');
  const [mensagem, setMensagem]   = useState('');

  const [buscando, setBuscando]   = useState(false);
  /** null = ainda não buscou; false = código não existe no cadastro. */
  const [encontrado, setEncontrado] = useState<boolean | null>(null);

  const noLimite = pendentesAtuais >= MAX_PENDENTES;

  // ── Busca do cliente pelo código ───────────────────────────────────────────
  // Mesma fonte e mesmo comportamento do formulário de novo acordo: a tabela
  // `profissionais`, com mínimo de 4 caracteres e debounce de 400 ms. Não tem
  // nada a ver com existir acordo — o cadastro do cliente é independente disso.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  const buscarCliente = useCallback(async (cod: string) => {
    const limpo = cod.trim();
    if (limpo.length < MIN_CARACTERES_BUSCA || !empresaId) { setEncontrado(null); return; }
    setBuscando(true);
    try {
      const achado = await buscarClientePorCodigo(limpo, empresaId);
      setEncontrado(!!achado);
      if (!achado) return;
      // Só preenche campo vazio — não sobrescreve o que a pessoa já digitou.
      setNome(atual => atual || (achado.nome_cliente ?? ''));
      setEstado(atual => atual || (achado.estado_uf ?? ''));
      setWhatsapp(atual => atual || (achado.whatsapp ?? ''));
    } finally {
      setBuscando(false);
    }
  }, [empresaId]);

  function aoDigitarCodigo(valor: string) {
    setCodigo(valor);
    setEncontrado(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { void buscarCliente(valor); }, 400);
  }

  const podeEnviar =
    !!codigo.trim() && !!whatsapp.trim() && !!mensagem.trim() && !enviando && !noLimite;

  function enviar() {
    if (!podeEnviar) return;
    onSubmit({
      codigoCliente: codigo,
      nomeCliente:   nome,
      estadoUf:      estado,
      whatsapp,
      categoria,
      mensagem,
    });
  }

  return (
    <div className="space-y-4">
      {noLimite && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <p>
            Você já tem <strong>{MAX_PENDENTES} solicitações pendentes</strong>.
            Aguarde o atendimento das atuais para abrir outra.
          </p>
        </div>
      )}

      {/* Código + nome */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="wpp-codigo">Código do cliente *</Label>
          <div className="relative">
            <Input
              id="wpp-codigo"
              autoFocus
              value={codigo}
              onChange={e => aoDigitarCodigo(e.target.value)}
              placeholder="Ex.: 123456"
              className="pr-8"
            />
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
              {buscando ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : encontrado ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                : <Search className="w-3.5 h-3.5" />}
            </span>
          </div>
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="wpp-nome">Nome do cliente</Label>
          <Input
            id="wpp-nome"
            value={nome}
            onChange={e => setNome(e.target.value)}
            placeholder="Preenchido pelo código, se estiver cadastrado"
          />
        </div>
      </div>

      {encontrado === false && !buscando && (
        <p className="text-[11px] text-muted-foreground">
          Código não encontrado no cadastro — preencha os dados à mão.
        </p>
      )}

      {/* Estado + WhatsApp */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="wpp-estado">Estado</Label>
          <Input
            id="wpp-estado"
            value={estado}
            onChange={e => setEstado(e.target.value.toUpperCase().slice(0, 2))}
            placeholder="UF"
            maxLength={2}
          />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="wpp-whatsapp">WhatsApp *</Label>
          <Input
            id="wpp-whatsapp"
            value={whatsapp}
            onChange={e => setWhatsapp(e.target.value)}
            placeholder="(00) 00000-0000"
          />
        </div>
      </div>

      {/* Aviso do WhatsApp — sempre visível: o número vem do cadastro e é o que
          mais envelhece sem ninguém perceber. */}
      <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <p>
            <strong>Confira o WhatsApp antes de enviar.</strong> O número vem do
            cadastro do cliente e pode estar desatualizado.
          </p>
          {whatsapp.trim() && (
            <p className="font-mono text-foreground pt-0.5">
              Vai para: {formatarTelefonePP(whatsapp) || whatsapp}
            </p>
          )}
        </div>
      </div>

      {/* Categoria */}
      <div className="space-y-1.5">
        <Label>Categoria *</Label>
        <Select value={categoria} onValueChange={v => setCategoria(v as CategoriaSolicitacao)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {CATEGORIAS.map(c => (
              <SelectItem key={c} value={c}>{CATEGORIA_LABEL[c]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Mensagem */}
      <div className="space-y-1.5">
        <Label htmlFor="wpp-mensagem">Mensagem a enviar *</Label>
        <Textarea
          id="wpp-mensagem"
          value={mensagem}
          onChange={e => setMensagem(e.target.value)}
          placeholder="Escreva exatamente o que o responsável deve mandar para o cliente."
          rows={6}
          className="resize-y"
        />
        <p className="text-[11px] text-muted-foreground">
          {mensagem.length} caracteres
        </p>
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        <Button variant="ghost" onClick={onCancelar} disabled={enviando}>
          <X className="w-4 h-4 mr-1.5" /> Cancelar
        </Button>
        <Button onClick={enviar} disabled={!podeEnviar}>
          {enviando
            ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            : <Send className="w-4 h-4 mr-1.5" />}
          Abrir solicitação
        </Button>
      </div>
    </div>
  );
}
