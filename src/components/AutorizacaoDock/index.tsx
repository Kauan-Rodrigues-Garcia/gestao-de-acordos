/**
 * AutorizacaoDock — a etiqueta no canto inferior direito, em qualquer tela.
 *
 * ## Por que não é uma página
 *
 * Autorizar é uma interrupção: o operador está parado esperando. Uma rota
 * própria obrigaria o líder a sair do que estava fazendo, decidir e voltar —
 * e é exatamente esse ir-e-voltar que o fluxo antigo (levantar e ir até a
 * máquina do operador) já custava. A gaveta abre por cima, decide e fecha.
 *
 * ## Quem vê
 *
 * Ninguém decide isso aqui: a gaveta mostra o que `autorizacoes_pedidos`
 * devolver, e a policy da tabela já recorta — líder, elite e gerência veem o
 * próprio setor; diretoria, administrador e super_admin veem a empresa.
 * O solicitante vê o próprio pedido, e para ele a gaveta é o acompanhamento.
 *
 * Sem nada para mostrar, o componente não renderiza: uma etiqueta permanente
 * com "0" ocuparia o canto da tela de todo operador para nunca dizer nada.
 *
 * ## Aprovar não tem desfazer
 *
 * Aprovar apaga o acordo de alguém e cria outro no lugar. Por isso o botão de
 * aprovar exige uma segunda confirmação NA PRÓPRIA LINHA, com o nome de quem
 * perde o acordo escrito nela — e não um `confirm()`, que a pessoa fecha no
 * automático sem ler.
 */

import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ShieldQuestion, X, Check, Ban, Loader2, Clock, AlertTriangle,
  ArrowRightLeft, UserCheck, ChevronDown,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatBRL } from '@/lib/money';
import { useAuth } from '@/hooks/useAuth';
import { useAutorizacaoPedidos } from '@/hooks/useAutorizacaoPedidos';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { useEstadoLembrado } from '@/hooks/useEstadoLembrado';
import { chaveDeCache } from '@/lib/cacheInstantaneo';
import {
  decidirAutorizacao, cancelarAutorizacao, type PedidoAutorizacao,
} from '@/services/autorizacaoPedidos.service';

/** "há 3 min", "há 2 h" — a idade do pedido importa mais que a hora exata. */
function idade(iso: string): string {
  const seg = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seg < 60) return 'agora';
  if (seg < 3600) return `há ${Math.round(seg / 60)} min`;
  if (seg < 86400) return `há ${Math.round(seg / 3600)} h`;
  return `há ${Math.round(seg / 86400)} d`;
}

/** Quanto falta para o pedido expirar. Vazio quando ainda sobra muito tempo. */
function restante(iso: string): string | null {
  const min = Math.round((new Date(iso).getTime() - Date.now()) / 60000);
  if (min <= 0) return 'expirado';
  if (min <= 60) return `expira em ${min} min`;
  if (min <= 240) return `expira em ${Math.round(min / 60)} h`;
  return null;
}

function Campo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[9px] uppercase tracking-wide text-muted-foreground">{rotulo}</p>
      <p className="text-[11px] font-medium truncate" title={valor}>{valor}</p>
    </div>
  );
}

interface CartaoProps {
  pedido: PedidoAutorizacao;
  /** Quem olha pode decidir, ou é o solicitante acompanhando? */
  souAutorizador: boolean;
  meuId: string | null;
  onDecidido: () => void;
}

function Cartao({ pedido, souAutorizador, meuId, onDecidido }: CartaoProps) {
  // 'confirmar' é o estado entre clicar em Aprovar e aprovar de verdade.
  const [fase, setFase] = useState<'normal' | 'confirmar' | 'recusar'>('normal');
  const [motivo, setMotivo] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const r = pedido.resumo ?? {};
  const ehTrocaExtra = pedido.modo === 'troca_extra';
  const perde = ehTrocaExtra ? pedido.extra_atual_op_nome : pedido.dono_nome;
  const souSolicitante = meuId !== null && pedido.solicitante_id === meuId;
  const expira = restante(pedido.expira_em);

  async function decidir(aprovar: boolean) {
    setOcupado(true);
    const res = await decidirAutorizacao({ id: pedido.id, aprovar, motivo });
    setOcupado(false);
    if ('erro' in res) { toast.error(res.erro); onDecidido(); return; }
    toast.success(
      res.status === 'aprovado'
        ? `Autorizado. O acordo foi tabulado para ${pedido.solicitante_nome}.`
        : 'Pedido recusado. O operador foi avisado.',
    );
    setFase('normal'); setMotivo('');
    onDecidido();
  }

  async function cancelar() {
    setOcupado(true);
    const ok = await cancelarAutorizacao(pedido.id);
    setOcupado(false);
    toast[ok ? 'success' : 'error'](
      ok ? 'Pedido cancelado.' : 'Não foi possível cancelar — talvez já tenha sido decidido.',
    );
    onDecidido();
  }

  return (
    <div className={cn(
      'rounded-xl border p-3 space-y-2',
      pedido.status === 'pendente' ? 'border-border bg-card' : 'border-border/60 bg-muted/30',
    )}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold truncate">
            {pedido.solicitante_nome}
            <span className="font-normal text-muted-foreground"> quer registrar</span>
          </p>
          <p className="text-sm font-mono font-bold truncate" title={pedido.nr_valor}>
            {pedido.nr_label} {pedido.nr_valor}
          </p>
        </div>
        <span className={cn(
          'shrink-0 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide',
          ehTrocaExtra ? 'bg-amber-500/15 text-amber-600' : 'bg-destructive/15 text-destructive',
        )}>
          {ehTrocaExtra ? <ArrowRightLeft className="w-3 h-3" /> : <UserCheck className="w-3 h-3" />}
          {ehTrocaExtra ? 'troca extra' : 'transferência'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Campo rotulo="Cliente" valor={r.cliente || '—'} />
        <Campo rotulo="Valor" valor={r.valor != null ? formatBRL(Number(r.valor)) : '—'} />
        <Campo rotulo="Vencimento"
          valor={r.vencimento ? new Date(`${r.vencimento}T12:00:00`).toLocaleDateString('pt-BR') : '—'} />
        <Campo rotulo={ehTrocaExtra ? 'EXTRA hoje de' : 'Hoje é de'} valor={perde || '—'} />
      </div>

      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
        <Clock className="w-3 h-3 shrink-0" />
        {idade(pedido.criado_em)}
        {r.setorNome && <> · {r.setorNome}</>}
        {pedido.status === 'pendente' && expira && (
          <span className="text-warning font-medium">· {expira}</span>
        )}
      </div>

      {/* ── Já decidido: o registro fica até a virada do dia ───────────────
          Não é enfeite: é o que impede duas pessoas de perguntarem a mesma
          coisa, e o que mostra ao solicitante que já foi resolvido. À
          meia-noite a faxina apaga a linha e a lista amanhece só com
          pendentes. */}
      {pedido.status !== 'pendente' && (
        <div className="rounded-lg bg-muted/50 px-2 py-1.5">
          <p className="text-[11px]">
            {pedido.status === 'aprovado' && <strong className="text-success">Autorizado</strong>}
            {pedido.status === 'recusado' && <strong className="text-destructive">Recusado</strong>}
            {pedido.status === 'cancelado' && <strong className="text-muted-foreground">Cancelado</strong>}
            {pedido.status === 'falhou' && <strong className="text-destructive">Falhou</strong>}
            {pedido.decidido_por_nome && <> por <strong>{pedido.decidido_por_nome}</strong></>}
            {pedido.decidido_em && <> · {idade(pedido.decidido_em)}</>}
          </p>
          {pedido.motivo_recusa && (
            <p className="text-[10px] text-muted-foreground mt-0.5">{pedido.motivo_recusa}</p>
          )}
          {pedido.erro && (
            <p className="text-[10px] text-destructive mt-0.5">Erro técnico: {pedido.erro}</p>
          )}
        </div>
      )}

      {/* ── Pendente, e quem olha decide ──────────────────────────────────── */}
      {pedido.status === 'pendente' && souAutorizador && !souSolicitante && (
        <>
          {fase === 'normal' && (
            <div className="flex gap-2">
              <button
                onClick={() => setFase('recusar')} disabled={ocupado}
                className="flex-1 h-8 rounded-lg border border-border text-[11px] font-medium hover:bg-muted transition-colors disabled:opacity-50"
              >
                Recusar
              </button>
              <button
                onClick={() => setFase('confirmar')} disabled={ocupado}
                className="flex-1 h-8 rounded-lg bg-primary text-primary-foreground text-[11px] font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                Aprovar
              </button>
            </div>
          )}

          {/* Segunda confirmação: o nome de quem perde o acordo fica escrito no
              próprio aviso. Um `confirm()` genérico seria fechado no automático. */}
          {fase === 'confirmar' && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-2 space-y-2">
              <p className="text-[11px] flex items-start gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />
                <span>
                  <strong className="text-destructive">Não tem como desfazer.</strong>{' '}
                  O acordo de <strong>{perde || 'outro operador'}</strong> vai para a
                  lixeira e o {pedido.nr_label} passa para{' '}
                  <strong>{pedido.solicitante_nome}</strong>. Os dois são notificados.
                </span>
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setFase('normal')} disabled={ocupado}
                  className="flex-1 h-8 rounded-lg border border-border bg-background text-[11px] font-medium disabled:opacity-50"
                >
                  Voltar
                </button>
                <button
                  onClick={() => decidir(true)} disabled={ocupado}
                  className="flex-1 h-8 rounded-lg bg-destructive text-destructive-foreground text-[11px] font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {ocupado ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  Confirmar autorização
                </button>
              </div>
            </div>
          )}

          {fase === 'recusar' && (
            <div className="rounded-lg border border-border bg-muted/40 p-2 space-y-2">
              <input
                value={motivo} onChange={e => setMotivo(e.target.value)} maxLength={160}
                placeholder="Motivo (opcional) — o operador vai ler"
                className="w-full h-8 rounded-md border border-border bg-background px-2 text-[11px]"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => { setFase('normal'); setMotivo(''); }} disabled={ocupado}
                  className="flex-1 h-8 rounded-lg border border-border bg-background text-[11px] font-medium disabled:opacity-50"
                >
                  Voltar
                </button>
                <button
                  onClick={() => decidir(false)} disabled={ocupado}
                  className="flex-1 h-8 rounded-lg bg-foreground text-background text-[11px] font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {ocupado ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />}
                  Recusar
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Um pedido PRÓPRIO aparece aqui só quando quem olha também autoriza —
          e sem botão nenhum: ninguém decide o próprio pedido. Para o operador
          comum a gaveta não existe; ele acompanha por notificação. */}
      {souSolicitante && (
        <p className="text-[11px] text-muted-foreground">
          Seu pedido. A decisão é de outro autorizador.
        </p>
      )}
    </div>
  );
}

interface PropsDock {
  /**
   * Quanto recuar da esquerda, em pixels, para não invadir o menu lateral.
   *
   * Só o `Layout` sabe a largura do momento — o menu recolhe e expande, e o
   * dock é `fixed`, fora do fluxo. Vale só a partir de `md`: abaixo disso o
   * menu não ocupa espaço.
   */
  recuoEsquerda?: number;
}

export function AutorizacaoDock({ recuoEsquerda = 16 }: PropsDock = {}) {
  const { perfil } = useAuth();
  const { temPermissao } = useCargoPermissoes();
  // Pergunta ao painel, e não ao cargo. `autorizacao_lider.service` confere a
  // MESMA chave com o token de quem digita a senha, e o servidor a confere de
  // novo em `fn_transferir_acordo_nr` — três checagens, uma fonte.
  const souAutorizador = temPermissao('acordos_autorizar_tabulacao');
  /**
   * A gaveta é só de quem decide.
   *
   * O operador não vê etiqueta nenhuma: ele solicita, a janela fecha, e a
   * resposta chega por notificação — que é o caminho que já existe e não ocupa
   * o canto da tela dele o dia inteiro. Nada aqui seria acionável para ele.
   *
   * O hook fica desligado, e não apenas escondido: sem isso, todo operador
   * manteria um canal de realtime e uma consulta a cada evento para desenhar
   * uma janela que ele nunca abre.
   */
  const { pedidos, pendentes, recarregar } = useAutorizacaoPedidos(
    souAutorizador && !!perfil?.id,
  );
  /*
   * Fechada por padrão, e do jeito que a pessoa deixou.
   *
   * A gaveta abria sozinha a cada montagem: como ela vive no `Layout`, isso
   * significava toda navegação entre telas. Quem tinha acabado de fechá-la para
   * ler a tabela por baixo a via reaparecer no clique seguinte, tela após tela.
   *
   * Agora ela obedece a um clique só — o da pessoa —, e o estado atravessa a
   * navegação por `useEstadoLembrado`. O aviso de que há algo esperando não se
   * perde: continua no contador da etiqueta e no ponto pulsando ao lado dele.
   */
  const [aberta, setAberta] = useEstadoLembrado(
    chaveDeCache('autorizacao-dock', perfil?.id), false,
  );

  /**
   * Pendentes primeiro; dentro de cada grupo, o mais novo no topo.
   *
   * O decidido continua na lista **até a virada do dia** — é o registro de que
   * aquilo já foi resolvido e por quem. Quem apaga é a faxina de 00:00
   * (`fn_autorizacao_faxina`), não esta tela: uma segunda régua de tempo aqui
   * divergiria da do servidor no primeiro ajuste de horário.
   */
  const ordenados = useMemo(() => {
    const peso = (p: PedidoAutorizacao) => (p.status === 'pendente' ? 0 : 1);
    return [...pedidos].sort((a, b) =>
      peso(a) - peso(b)
      || new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime());
  }, [pedidos]);

  // O contador da etiqueta conta só o que ainda EXIGE ação. Somar os decididos
  // faria o número subir a cada decisão, que é o oposto do que ele significa.
  const qtd = pendentes.length;

  /*
   * A gaveta NÃO abre sozinha — retirado a pedido em 02/09/2026.
   *
   * O efeito que morava aqui abria a gaveta sempre que houvesse pendência, e
   * como ele dependia de `qtd` (não de «chegou algo novo»), ele disparava de
   * novo em toda montagem do componente. O componente vive no `Layout`: era uma
   * abertura por navegação, com a gaveta cobrindo o canto da tela de quem tinha
   * acabado de fechá-la.
   *
   * O aviso continua existindo, e sem tapar nada: o contador na etiqueta e o
   * ponto pulsando ao lado dele. Quem decide quando abrir é quem vai decidir.
   */
  // Nada para mostrar, nada na tela. Ver o cabeçalho.
  if (ordenados.length === 0) return null;

  return (
    /*
     * Canto ESQUERDO desde 25/08/2026, mas AO LADO do menu, nunca por cima.
     *
     * Era o direito, e passou a dividir a quina com o botão do chat — duas
     * coisas que aparecem sozinhas, uma em cima da outra, e a de baixo some.
     * Autorizar e conversar são interrupções diferentes e merecem cantos
     * diferentes.
     *
     * O recuo vem de fora porque só o `Layout` sabe se o menu está aberto (240
     * px) ou recolhido (64). Abaixo de `md` o menu não existe, e aí o `left-4`
     * da classe vale — por isso o recuo entra como variável usada só no
     * `md:`, e não como `style.left`, que valeria em qualquer largura.
     */
    <div
      className="fixed bottom-4 left-4 md:left-[var(--recuo-dock)] z-50 flex flex-col items-start gap-2 print:hidden transition-[left] duration-300"
      style={{ '--recuo-dock': `${recuoEsquerda}px` } as React.CSSProperties}
    >
      <AnimatePresence>
        {aberta && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="w-[min(92vw,380px)] max-h-[min(70vh,560px)] rounded-2xl border border-border bg-background shadow-2xl overflow-hidden flex flex-col"
          >
            <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-border bg-muted/40">
              <p className="text-xs font-bold flex items-center gap-1.5">
                <ShieldQuestion className="w-4 h-4 text-primary shrink-0" />
                Autorizações
                {qtd > 0 && (
                  <span className="rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                    {qtd}
                  </span>
                )}
              </p>
              <button
                onClick={() => setAberta(false)} aria-label="Fechar autorizações"
                className="p-1 rounded-md hover:bg-muted transition-colors"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5">
              {ordenados.map(p => (
                <Cartao
                  key={p.id} pedido={p}
                  souAutorizador={souAutorizador}
                  meuId={perfil?.id ?? null}
                  onDecidido={recarregar}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* A etiqueta. Fica sempre — é por ela que a gaveta volta depois de fechada. */}
      <button
        onClick={() => setAberta(v => !v)}
        aria-expanded={aberta}
        className={cn(
          'inline-flex items-center gap-2 rounded-full pl-3 pr-3.5 py-2 shadow-lg border transition-colors',
          qtd > 0
            ? 'bg-primary text-primary-foreground border-primary hover:opacity-90'
            : 'bg-background text-muted-foreground border-border hover:bg-muted',
        )}
      >
        {aberta ? <X className="w-4 h-4" /> : <ShieldQuestion className="w-4 h-4" />}
        <span className="text-xs font-semibold">
          {qtd > 0 ? `${qtd} ${qtd > 1 ? 'autorizações' : 'autorização'}` : 'Autorizações'}
        </span>
        {qtd > 0 && !aberta && (
          <span className="w-2 h-2 rounded-full bg-primary-foreground animate-pulse" />
        )}
      </button>
    </div>
  );
}
