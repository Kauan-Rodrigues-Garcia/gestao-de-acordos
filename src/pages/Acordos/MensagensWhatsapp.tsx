/**
 * MensagensWhatsapp — o editor das mensagens de WhatsApp da aba Acordos, e a
 * escolha de qual mandar quando o status tem mais de uma.
 *
 * Pedido de 28/09/2026: um botão pequeno ao lado de «Filtrar data» que abre
 * uma caixinha de edição, com mensagens separadas por Pendente, Pago e Não
 * pago — até 3, 2 e 5 — e «fórmulas» que puxam os dados do cliente. As regras
 * (grupos, limites, variáveis) moram em `@/lib/mensagensWhatsapp`; aqui só o
 * desenho.
 *
 * O editor trabalha num RASCUNHO e grava tudo no «Salvar»: mexer em três
 * mensagens e desistir não pode deixar metade gravada.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  MessageSquareText, Plus, Trash2, Star, RotateCcw, TriangleAlert, Loader2, Send,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  GRUPOS_MENSAGEM, ROTULO_DO_GRUPO, LIMITE_DO_GRUPO, VARIAVEIS_MENSAGEM, MENSAGEM_DO_SISTEMA,
  mensagensDoGrupo, preencherMensagem, valoresDeExemplo, variaveisDesconhecidas,
  type GrupoMensagem, type MensagemWhatsapp,
} from '@/lib/mensagensWhatsapp';
import type { MensagemEditada } from '@/services/mensagensWhatsapp.service';

/* ── O botão da barra de filtros ──────────────────────────────────────────── */

export function BotaoMensagensWhatsapp({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Editar as mensagens de WhatsApp que você manda aos clientes"
      className="h-8 inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
    >
      <MessageSquareText className="h-3.5 w-3.5 text-success" />
      Mensagens
    </button>
  );
}

/* ── O editor ─────────────────────────────────────────────────────────────── */

interface Rascunho extends MensagemEditada {
  /** Chave local e estável da linha — `id` é nulo nas novas. */
  chave: string;
}

let sequencia = 0;
const novaChave = () => `nova-${Date.now()}-${sequencia++}`;

function deMensagens(mensagens: readonly MensagemWhatsapp[]): Rascunho[] {
  return GRUPOS_MENSAGEM.flatMap(g => mensagensDoGrupo(mensagens, g).map(m => ({
    chave: m.id, id: m.id, status: m.status, titulo: m.titulo, conteudo: m.conteudo,
  })));
}

interface EditorProps {
  aberto: boolean;
  onFechar: () => void;
  mensagens: readonly MensagemWhatsapp[];
  /** false = a migration ainda não foi aplicada; o editor avisa e não salva. */
  disponivel: boolean;
  operador?: string | null;
  onSalvar: (editadas: MensagemEditada[]) => Promise<{ erro: string | null }>;
}

export function EditorMensagensWhatsapp({
  aberto, onFechar, mensagens, disponivel, operador, onSalvar,
}: EditorProps) {
  const [grupo, setGrupo] = useState<GrupoMensagem>('pendente');
  const [rascunho, setRascunho] = useState<Rascunho[]>([]);
  const [salvando, setSalvando] = useState(false);
  const campos = useRef(new Map<string, HTMLTextAreaElement>());
  const ultimoCampo = useRef<string | null>(null);

  // Abrir sempre parte do que está gravado — o rascunho anterior foi descartado.
  useEffect(() => {
    if (aberto) setRascunho(deMensagens(mensagens));
  }, [aberto, mensagens]);

  const doGrupo = rascunho.filter(r => r.status === grupo);
  const limite = LIMITE_DO_GRUPO[grupo];
  const exemplo = useMemo(() => valoresDeExemplo(operador), [operador]);

  const alterar = (chave: string, campo: 'titulo' | 'conteudo', valor: string) =>
    setRascunho(rs => rs.map(r => (r.chave === chave ? { ...r, [campo]: valor } : r)));

  function adicionar(conteudo = '') {
    if (doGrupo.length >= limite) return;
    const chave = novaChave();
    setRascunho(rs => [...rs, {
      chave, id: null, status: grupo,
      titulo: `${ROTULO_DO_GRUPO[grupo]} ${doGrupo.length + 1}`,
      conteudo,
    }]);
    ultimoCampo.current = chave;
    requestAnimationFrame(() => campos.current.get(chave)?.focus());
  }

  const remover = (chave: string) => setRascunho(rs => rs.filter(r => r.chave !== chave));

  /** A padrão é a primeira do grupo: tornar padrão é trazer para o topo. */
  function tornarPadrao(chave: string) {
    setRascunho(rs => {
      const alvo = rs.find(r => r.chave === chave);
      if (!alvo) return rs;
      return [alvo, ...rs.filter(r => r.chave !== chave)];
    });
  }

  /** Insere a variável onde está o cursor do último campo de texto usado. */
  function inserirVariavel(chaveVar: string) {
    const alvo = ultimoCampo.current && doGrupo.some(r => r.chave === ultimoCampo.current)
      ? ultimoCampo.current
      : doGrupo[0]?.chave;
    if (!alvo) return;
    const el = campos.current.get(alvo);
    const token = `{{${chaveVar}}}`;
    const atual = rascunho.find(r => r.chave === alvo)?.conteudo ?? '';
    const ini = el?.selectionStart ?? atual.length;
    const fim = el?.selectionEnd ?? atual.length;
    alterar(alvo, 'conteudo', atual.slice(0, ini) + token + atual.slice(fim));
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(ini + token.length, ini + token.length);
    });
  }

  const invalidas = rascunho.filter(r => !r.titulo.trim() || !r.conteudo.trim());

  async function salvar() {
    if (invalidas.length > 0) {
      const r = invalidas[0];
      setGrupo(r.status);
      toast.error(`Uma mensagem de «${ROTULO_DO_GRUPO[r.status]}» está sem ${r.titulo.trim() ? 'texto' : 'nome'}.`);
      return;
    }
    setSalvando(true);
    const { erro } = await onSalvar(rascunho.map(r => ({
      id: r.id, status: r.status, titulo: r.titulo, conteudo: r.conteudo,
    })));
    setSalvando(false);
    if (erro) { toast.error(`Não foi possível salvar: ${erro}`); return; }
    toast.success('Mensagens salvas. Valem em qualquer computador.');
    onFechar();
  }

  return (
    <Dialog open={aberto} onOpenChange={o => { if (!o) onFechar(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquareText className="h-4 w-4 text-success" /> Mensagens do WhatsApp
          </DialogTitle>
          <DialogDescription>
            Suas mensagens para os clientes, separadas pelo status do acordo. A primeira de cada status é a
            padrão — é a que vai no envio em lote. Com mais de uma, o botão do WhatsApp pergunta qual mandar.
          </DialogDescription>
        </DialogHeader>

        {!disponivel && (
          <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-[12px]">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            As mensagens personalizadas ainda não estão ativas neste banco (migration
            <code className="mx-1 rounded bg-muted px-1 text-[11px]">20260928160000</code>). Por enquanto vale o texto
            do sistema.
          </div>
        )}

        {/* ── Os três status ── */}
        <div className="flex gap-1 rounded-lg border border-border bg-muted/30 p-1" role="tablist">
          {GRUPOS_MENSAGEM.map(g => {
            const n = rascunho.filter(r => r.status === g).length;
            return (
              <button
                key={g} type="button" role="tab" aria-selected={grupo === g}
                onClick={() => setGrupo(g)}
                className={cn(
                  'flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                  grupo === g ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {ROTULO_DO_GRUPO[g]}
                <span className="ml-1.5 tabular-nums text-muted-foreground">{n}/{LIMITE_DO_GRUPO[g]}</span>
              </button>
            );
          })}
        </div>

        {/* ── As variáveis ── */}
        <div className="space-y-1.5">
          <p className="text-[11px] text-muted-foreground">
            Clique numa variável para colocá-la onde está o cursor. Na hora de enviar, ela vira o dado do cliente.
          </p>
          <div className="flex flex-wrap gap-1">
            {VARIAVEIS_MENSAGEM.map(v => (
              <button
                key={v.chave} type="button"
                disabled={doGrupo.length === 0}
                onClick={() => inserirVariavel(v.chave)}
                title={`{{${v.chave}}} — ex.: ${v.exemplo}`}
                className="rounded-md border border-border bg-background px-2 py-0.5 text-[11px] text-foreground hover:border-success/50 hover:bg-success/5 disabled:opacity-40"
              >
                {v.rotulo}
              </button>
            ))}
          </div>
        </div>

        {/* ── As mensagens do status ── */}
        <div className="space-y-3">
          {doGrupo.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-3 space-y-2">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                Mensagem do sistema (em uso)
              </p>
              <p className="whitespace-pre-wrap text-xs text-foreground/80">
                {preencherMensagem(MENSAGEM_DO_SISTEMA[grupo], exemplo)}
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" disabled={!disponivel}
                  onClick={() => adicionar(MENSAGEM_DO_SISTEMA[grupo])}>
                  <RotateCcw className="h-3 w-3" /> Personalizar esta
                </Button>
                <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" disabled={!disponivel}
                  onClick={() => adicionar()}>
                  <Plus className="h-3 w-3" /> Começar do zero
                </Button>
              </div>
            </div>
          ) : doGrupo.map((r, i) => {
            const desconhecidas = variaveisDesconhecidas(r.conteudo);
            return (
              <div key={r.chave} className="rounded-lg border border-border p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Input
                    value={r.titulo} maxLength={60}
                    onChange={e => alterar(r.chave, 'titulo', e.target.value)}
                    placeholder="Nome da mensagem" aria-label="Nome da mensagem"
                    className="h-7 flex-1 text-xs font-medium"
                  />
                  {i === 0 ? (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-success/40 bg-success/10 px-2 py-0.5 text-[10px] font-semibold text-success">
                      <Star className="h-3 w-3" /> Padrão
                    </span>
                  ) : (
                    <Button size="sm" variant="ghost" className="h-7 shrink-0 gap-1 px-2 text-[11px] text-muted-foreground"
                      onClick={() => tornarPadrao(r.chave)}>
                      <Star className="h-3 w-3" /> Tornar padrão
                    </Button>
                  )}
                  <Button size="icon" variant="ghost"
                    className="h-7 w-7 shrink-0 text-destructive/60 hover:bg-destructive/10 hover:text-destructive"
                    title="Apagar esta mensagem" aria-label={`Apagar a mensagem ${r.titulo}`}
                    onClick={() => remover(r.chave)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <Textarea
                  ref={el => { if (el) campos.current.set(r.chave, el); else campos.current.delete(r.chave); }}
                  value={r.conteudo} rows={4} maxLength={2000}
                  onFocus={() => { ultimoCampo.current = r.chave; }}
                  onChange={e => alterar(r.chave, 'conteudo', e.target.value)}
                  placeholder="Olá {{primeiro_nome}}, ..."
                  aria-label={`Texto da mensagem ${r.titulo}`}
                  className="text-xs"
                />
                {desconhecidas.length > 0 && (
                  <p className="flex items-center gap-1 text-[11px] text-warning">
                    <TriangleAlert className="h-3 w-3" />
                    Não existe: {desconhecidas.map(d => `{{${d}}}`).join(', ')} — vai sair escrito assim para o cliente.
                  </p>
                )}
                {r.conteudo.trim() && (
                  <div className="rounded-md bg-muted/40 px-2.5 py-2">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Prévia</p>
                    <p className="mt-0.5 whitespace-pre-wrap text-[11px] text-foreground/80">
                      {preencherMensagem(r.conteudo, exemplo)}
                    </p>
                  </div>
                )}
              </div>
            );
          })}

          {doGrupo.length > 0 && (
            <Button size="sm" variant="outline" className="h-8 w-full gap-1.5 text-xs"
              disabled={doGrupo.length >= limite} onClick={() => adicionar()}>
              <Plus className="h-3.5 w-3.5" />
              {doGrupo.length >= limite
                ? `Limite de ${limite} mensagens em ${ROTULO_DO_GRUPO[grupo]}`
                : `Nova mensagem de ${ROTULO_DO_GRUPO[grupo]} (${doGrupo.length}/${limite})`}
            </Button>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onFechar} disabled={salvando}>Cancelar</Button>
          <Button onClick={() => void salvar()} disabled={salvando || !disponivel} className="gap-1.5">
            {salvando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Salvar mensagens
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── A escolha na hora de enviar ──────────────────────────────────────────── */

export interface OpcaoDeMensagem {
  id: string;
  titulo: string;
  /** O texto já preenchido com os dados do cliente. */
  texto: string;
}

export function EscolherMensagemWhatsapp({
  cliente, opcoes, onEscolher, onFechar,
}: {
  /** Nome do cliente — `null` fecha a janela. */
  cliente: string | null;
  opcoes: readonly OpcaoDeMensagem[];
  onEscolher: (id: string) => void;
  onFechar: () => void;
}) {
  return (
    <Dialog open={cliente !== null} onOpenChange={o => { if (!o) onFechar(); }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-4 w-4 text-success" /> Qual mensagem mandar?
          </DialogTitle>
          <DialogDescription>Para {cliente}. O texto já está com os dados do cliente.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {opcoes.map((o, i) => (
            <button
              key={o.id} type="button" onClick={() => onEscolher(o.id)}
              className="w-full rounded-lg border border-border p-3 text-left transition-colors hover:border-success/50 hover:bg-success/5"
            >
              <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                {o.titulo}
                {i === 0 && <span className="text-[10px] font-medium text-success">· padrão</span>}
              </p>
              <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-[11px] text-muted-foreground">{o.texto}</p>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
