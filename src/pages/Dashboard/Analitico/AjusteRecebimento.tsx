/**
 * AjusteRecebimento — a correção manual do recebimento, no Painel Líder.
 *
 * ## O que esta aba é, e por quanto tempo
 *
 * Uma correção TEMPORÁRIA. O relatório analítico que vem do ERP está com erro, e
 * enquanto a origem não é consertada a liderança precisa corrigir o recebimento
 * de um operador, com registro de quem mexeu.
 *
 * A aba diz isso na cara, num aviso fixo. Ferramenta temporária que não avisa
 * que é temporária vira permanente em três meses — e esta mexe em número de
 * dinheiro.
 *
 * ## Um card por pessoa, com o valor TOTAL
 *
 * O desenho anterior era um lançamento por vez: o líder somava «o que entrou
 * hoje» e a aba virava uma pilha de linhas da mesma pessoa. Duas coisas deram
 * errado com isso, e as duas estão consertadas aqui.
 *
 * A primeira é a rotina: ninguém sabe de cabeça o que entrou hoje, sabe-se o
 * TOTAL acumulado. Então o líder digita o total, e a diferença é o sistema que
 * calcula — «estava 5.000, ficou 6.000, entrou 1.000».
 *
 * A segunda é mais séria. A RLS antiga mostrava a cada líder só o que ele mesmo
 * tinha lançado, e em 25/08 dois líderes lançaram o mesmo recebimento para as
 * mesmas três pessoas, cada um sem ver o card do outro. Agora o card é ÚNICO por
 * operador e compartilhado com todo líder que enxerga aquela pessoa — clone
 * incluído. Quem chega depois abre o card que já existe em vez de criar outro.
 *
 * ## Quem faz o quê
 *
 * A liderança cria, edita e apaga os cards de quem supervisiona, sem pedir nada
 * a ninguém. Não há mais fila de aprovação. O que garante a rastreabilidade não
 * é o pedido, é o histórico: cada alteração vira um evento com autor, hora, o
 * valor de antes e o de depois — e ele é escrito por gatilho no banco, então
 * nenhum caminho de escrita consegue pular.
 *
 * Esconder botão é conforto; quem recusa é o banco. A RLS repete a mesma regra
 * de alcance (`fn_ajuste_no_meu_alcance`).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, Check, Loader2, Minus, Plus, Search, History,
  Trash2, Pencil, ChevronDown, Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { formatBRL } from '@/lib/money';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { useDadosVivos } from '@/hooks/useDadosVivos';
import { chaveDeCache } from '@/lib/cacheInstantaneo';
import { iguaisProfundo } from '@/lib/dadosVivos';
import { valorDigitadoParaNumero } from './ajusteValor';
import {
  listarAjustes, listarEventos, lancarAjuste, editarAjuste, cancelarAjuste,
  type AjusteManual, type EventoAjuste,
} from '@/services/analitico/ajusteManual.service';

export interface AjusteRecebimentoProps {
  /** Mês em análise, `yyyy-MM`. */
  mes: string;
  /** Operadores do recorte atual do painel — a lista do seletor. */
  operadores: { id: string; nome: string; setorId: string | null; equipeId: string | null }[];
}

export default function AjusteRecebimento({ mes, operadores }: AjusteRecebimentoProps) {
  const { perfil } = useAuth();
  const { empresa } = useEmpresa();
  const { temPermissao } = useCargoPermissoes();

  const empresaId = empresa?.id ?? null;
  const meuId = perfil?.id ?? null;
  const meuNome = perfil?.nome ?? perfil?.email ?? 'Sem nome';

  const podeLancar      = temPermissao('ajuste_recebimento_lancar');
  const podeAdministrar = temPermissao('ajuste_recebimento_administrar');

  // ── Dados ─────────────────────────────────────────────────────────────────

  const carregarAjustes = useCallback(
    () => (empresaId ? listarAjustes(empresaId, mes) : Promise.resolve([])),
    [empresaId, mes],
  );

  const {
    dados: ajustes, carregando, recarregar,
  } = useDadosVivos<AjusteManual>({
    carregar: carregarAjustes,
    chave: a => a.id,
    iguais: iguaisProfundo,
    ativo: !!empresaId,
    chaveCache: chaveDeCache('ajustes', empresaId, mes, meuId),
    // O card é compartilhado: quando a Brenda edita, a tela do Amauri precisa
    // mudar sozinha. Sem realtime, o card único só evita a duplicata depois de
    // um F5 — e o F5 é justamente o que ninguém dá antes de digitar.
    assinar: empresaId ? {
      topico: `rt-ajustes-${empresaId}`,
      escutas: [{ tabela: 'analitico_ajustes_manuais' }],
    } : undefined,
  });

  const cards = useMemo(
    () => ajustes.filter(a => !a.cancelado)
      .sort((a, b) => (a.operadorNome ?? '').localeCompare(b.operadorNome ?? '', 'pt-BR')),
    [ajustes],
  );

  const apagados = useMemo(
    () => ajustes.filter(a => a.cancelado)
      .sort((a, b) => String(b.canceladoEm ?? '').localeCompare(String(a.canceladoEm ?? ''))),
    [ajustes],
  );

  const totalDoMes = useMemo(
    () => cards.reduce((s, a) => s + a.valor, 0),
    [cards],
  );

  /**
   * O seletor só oferece quem AINDA não tem card.
   *
   * É a tradução na tela do índice único do banco: escolher alguém que já tem
   * card só levaria ao erro de chave duplicada. Quem já tem aparece na lista de
   * baixo, para ser editado.
   */
  const comCard = useMemo(() => new Set(cards.map(a => a.operadorId)), [cards]);
  const disponiveis = useMemo(
    () => operadores.filter(o => !comCard.has(o.id)),
    [operadores, comCard],
  );

  // ── Formulário do card novo ───────────────────────────────────────────────

  const [operadorId, setOperadorId] = useState<string | null>(null);
  const [sinal, setSinal] = useState<1 | -1>(1);
  const [valorTexto, setValorTexto] = useState('');
  const [motivo, setMotivo] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [seletorAberto, setSeletorAberto] = useState(false);

  const operadorEscolhido = useMemo(
    () => disponiveis.find(o => o.id === operadorId) ?? null,
    [disponiveis, operadorId],
  );

  const valorNumerico = valorDigitadoParaNumero(valorTexto);
  const podeEnviar = !!operadorEscolhido && valorNumerico !== null
    && motivo.trim().length >= 3 && !salvando;

  async function criarCard() {
    if (!podeEnviar || !empresaId || !perfil?.id || !operadorEscolhido || valorNumerico === null) return;
    setSalvando(true);
    try {
      const r = await lancarAjuste({
        empresaId,
        operadorId: operadorEscolhido.id,
        setorId:  operadorEscolhido.setorId,
        equipeId: operadorEscolhido.equipeId,
        mes,
        valor: valorNumerico * sinal,
        motivo,
        criadoPor: perfil.id,
        criadoPorNome: meuNome,
      });
      if (r.erro) { toast.error(r.erro); return; }

      toast.success(`Card de ${operadorEscolhido.nome} criado com ${formatBRL(valorNumerico * sinal)}.`);
      setValorTexto(''); setMotivo(''); setOperadorId(null);
      await recarregar();
    } finally { setSalvando(false); }
  }

  // ── Diálogos ──────────────────────────────────────────────────────────────

  const [alvoEdicao, setAlvoEdicao] = useState<AjusteManual | null>(null);
  const [alvoRemocao, setAlvoRemocao] = useState<AjusteManual | null>(null);
  const [verApagados, setVerApagados] = useState(false);

  if (!podeLancar && !podeAdministrar) {
    return (
      <p className="text-sm text-muted-foreground px-1 py-8 text-center">
        Você não tem permissão para ajustar recebimento.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── O aviso que impede isto de virar permanente ─────────────────── */}
      <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl border border-amber-500/40 bg-amber-500/10">
        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
        <div className="text-xs leading-relaxed">
          <p className="font-semibold text-foreground">Correção temporária do relatório</p>
          <p className="text-muted-foreground">
            O valor de cada card soma no recebimento do operador — e, por
            consequência, no da equipe e no do setor. Entra como <strong>Ajuste
            manual</strong>, não como Pix nem cartão. O relatório importado não é
            alterado: o valor é somado na leitura, e some no dia em que esta aba
            for desligada.
          </p>
        </div>
      </div>

      {/* ── Card novo — só para quem ainda não tem ────────────────────────── */}
      {podeLancar && (
        <div className="rounded-xl border border-border bg-card p-3 space-y-3">
          <p className="text-xs font-semibold flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Novo card
            <span className="font-normal text-muted-foreground">
              — quem já tem card aparece na lista abaixo, para editar
            </span>
          </p>

          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_10rem]">
            <Popover open={seletorAberto} onOpenChange={setSeletorAberto}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    'h-9 w-full rounded-md border border-input bg-background px-3 text-left text-sm',
                    'flex items-center gap-2 hover:bg-accent/40 transition-colors',
                    !operadorEscolhido && 'text-muted-foreground',
                  )}
                >
                  <Search className="w-3.5 h-3.5 shrink-0 opacity-60" />
                  <span className="truncate">
                    {operadorEscolhido?.nome ?? 'Escolha o operador — digite para buscar'}
                  </span>
                </button>
              </PopoverTrigger>
              <PopoverContent className="p-0 w-[min(22rem,90vw)]" align="start">
                <Command>
                  <CommandInput placeholder="Digite o nome…" />
                  <CommandList>
                    <CommandEmpty>
                      {disponiveis.length === 0
                        ? 'Todo mundo deste recorte já tem card.'
                        : 'Ninguém com esse nome neste recorte.'}
                    </CommandEmpty>
                    <CommandGroup>
                      {disponiveis.map(o => (
                        <CommandItem
                          key={o.id}
                          value={o.nome}
                          onSelect={() => { setOperadorId(o.id); setSeletorAberto(false); }}
                        >
                          <Check className={cn(
                            'mr-2 h-3.5 w-3.5',
                            operadorId === o.id ? 'opacity-100' : 'opacity-0',
                          )} />
                          {o.nome}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            {/* Somar ou tirar. Dois botões e não um sinal digitado: o sinal
                dentro do campo já se perdeu duas vezes em telas assim. */}
            <div className="flex rounded-md border border-input overflow-hidden">
              <button
                type="button"
                onClick={() => setSinal(1)}
                aria-pressed={sinal === 1}
                className={cn(
                  'px-3 flex items-center gap-1 text-xs font-medium transition-colors',
                  sinal === 1 ? 'bg-emerald-500 text-white' : 'hover:bg-accent',
                )}
              >
                <Plus className="w-3.5 h-3.5" /> Somar
              </button>
              <button
                type="button"
                onClick={() => setSinal(-1)}
                aria-pressed={sinal === -1}
                className={cn(
                  'px-3 flex items-center gap-1 text-xs font-medium transition-colors',
                  sinal === -1 ? 'bg-destructive text-destructive-foreground' : 'hover:bg-accent',
                )}
              >
                <Minus className="w-3.5 h-3.5" /> Tirar
              </button>
            </div>

            <Input
              value={valorTexto}
              onChange={e => setValorTexto(e.target.value)}
              placeholder="0,00"
              inputMode="decimal"
              className="h-9 text-sm font-mono tabular-nums"
            />
          </div>

          <Textarea
            value={motivo}
            onChange={e => setMotivo(e.target.value)}
            rows={2}
            placeholder="Motivo — fica registrado no histórico do card"
            className="text-sm resize-none"
          />

          <div className="flex items-center gap-3">
            <p className="text-[11px] text-muted-foreground flex-1 min-w-0">
              {operadorEscolhido && valorNumerico !== null ? (
                <>
                  Abrir o card de{' '}
                  <strong className="text-foreground">{operadorEscolhido.nome}</strong> com{' '}
                  <strong className={sinal > 0 ? 'text-emerald-600' : 'text-destructive'}>
                    {formatBRL(valorNumerico * sinal)}
                  </strong>.
                </>
              ) : (
                'Escolha a pessoa, o valor total e escreva o motivo.'
              )}
            </p>
            <Button size="sm" disabled={!podeEnviar} onClick={criarCard}>
              {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Criar card'}
            </Button>
          </div>
        </div>
      )}

      {/* ── Os cards do mês ──────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
          <p className="text-xs font-semibold flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" />
            Cards do mês
            <span className="font-normal text-muted-foreground">
              ({cards.length} {cards.length === 1 ? 'pessoa' : 'pessoas'})
            </span>
          </p>
          <span className={cn(
            'ml-auto text-xs font-mono tabular-nums font-semibold',
            totalDoMes > 0 ? 'text-emerald-600' : totalDoMes < 0 ? 'text-destructive' : 'text-muted-foreground',
          )}>
            {totalDoMes > 0 ? '+' : ''}{formatBRL(totalDoMes)}
          </span>
        </div>

        <div className="divide-y divide-border max-h-[30rem] overflow-y-auto">
          {carregando && (
            <p className="text-xs text-muted-foreground text-center py-6">Carregando…</p>
          )}

          {!carregando && cards.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-8">
              Nenhum card neste mês.
            </p>
          )}

          {cards.map(a => (
            <CardOperador
              key={a.id}
              ajuste={a}
              onEditar={() => setAlvoEdicao(a)}
              onApagar={() => setAlvoRemocao(a)}
            />
          ))}
        </div>

        {apagados.length > 0 && (
          <div className="border-t border-border">
            <button
              type="button"
              onClick={() => setVerApagados(v => !v)}
              className="w-full px-3 py-2 text-[11px] text-muted-foreground flex items-center gap-1.5 hover:bg-accent/40"
            >
              <ChevronDown className={cn('w-3 h-3 transition-transform', verApagados && 'rotate-180')} />
              {apagados.length} {apagados.length === 1 ? 'card apagado' : 'cards apagados'} neste mês
            </button>

            {/* Apagado não some do banco. Fica aqui, sem botão, porque um ajuste
                manual de valor é exatamente o registro que alguém audita depois
                — principalmente os que foram desfeitos. */}
            {verApagados && (
              <div className="divide-y divide-border">
                {apagados.map(a => (
                  <div key={a.id} className="px-3 py-2 text-xs opacity-60">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="font-mono tabular-nums line-through text-muted-foreground">
                        {formatBRL(a.valor)}
                      </span>
                      <span className="font-medium">{a.operadorNome ?? 'Operador'}</span>
                      <span className="ml-auto text-[11px] text-muted-foreground">
                        apagado por {a.canceladoPorNome ?? 'alguém'} · {quando(a.canceladoEm ?? a.atualizadoEm)}
                      </span>
                    </div>
                    {a.motivoCancelamento && (
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        “{a.motivoCancelamento}”
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Diálogos ─────────────────────────────────────────────────────── */}
      <DialogoNovoTotal
        alvo={alvoEdicao}
        onFechar={() => setAlvoEdicao(null)}
        onConfirmar={async (valor, anotacao) => {
          if (!alvoEdicao || !perfil?.id) return;
          const r = await editarAjuste({
            id: alvoEdicao.id, valor, motivo: anotacao,
            editadoPor: perfil.id, editadoPorNome: meuNome,
          });
          if (r.erro) { toast.error(r.erro); return; }
          const delta = valor - alvoEdicao.valor;
          toast.success(
            delta === 0
              ? 'Card salvo.'
              : `Total de ${alvoEdicao.operadorNome ?? 'operador'} agora é ${formatBRL(valor)} `
                + `(${delta > 0 ? '+' : ''}${formatBRL(delta)}).`,
          );
          setAlvoEdicao(null);
          await recarregar();
        }}
      />

      <DialogoApagar
        alvo={alvoRemocao}
        onFechar={() => setAlvoRemocao(null)}
        onConfirmar={async (texto) => {
          if (!alvoRemocao || !perfil?.id) return;
          const r = await cancelarAjuste({
            id: alvoRemocao.id, motivo: texto,
            canceladoPor: perfil.id, canceladoPorNome: meuNome,
          });
          if (r.erro) { toast.error(r.erro); return; }
          toast.success(`Card de ${alvoRemocao.operadorNome ?? 'operador'} apagado.`);
          setAlvoRemocao(null);
          await recarregar();
        }}
      />
    </div>
  );
}

// ── O card de uma pessoa ─────────────────────────────────────────────────────

/**
 * Uma pessoa, um valor total, e o histórico embaixo quando alguém abre.
 *
 * O histórico carrega SOB DEMANDA. Trazê-lo junto da lista seria uma consulta
 * por card em toda abertura da aba, para mostrar o que quase ninguém expande.
 */
function CardOperador({
  ajuste, onEditar, onApagar,
}: {
  ajuste: AjusteManual;
  onEditar: () => void;
  onApagar: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [eventos, setEventos] = useState<EventoAjuste[] | null>(null);
  const [carregandoHistorico, setCarregandoHistorico] = useState(false);

  // `atualizadoEm` na dependência: quando outro líder edita o card e o realtime
  // traz a linha nova, o histórico aberto precisa recarregar — senão ele mostra
  // um "valor atual" que não bate com o número logo acima.
  useEffect(() => {
    if (!aberto) return;
    let vivo = true;
    setCarregandoHistorico(true);
    listarEventos(ajuste.id)
      .then(lista => { if (vivo) setEventos(lista); })
      .finally(() => { if (vivo) setCarregandoHistorico(false); });
    return () => { vivo = false; };
  }, [aberto, ajuste.id, ajuste.atualizadoEm]);

  return (
    <div className="px-3 py-2.5 text-xs">
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className={cn(
          'font-mono tabular-nums font-semibold text-sm',
          ajuste.valor > 0 ? 'text-emerald-600' : ajuste.valor < 0 ? 'text-destructive' : 'text-muted-foreground',
        )}>
          {ajuste.valor > 0 ? '+' : ''}{formatBRL(ajuste.valor)}
        </span>
        <span className="font-medium">{ajuste.operadorNome ?? 'Operador'}</span>

        <span className="ml-auto text-[11px] text-muted-foreground">
          {ajuste.editadoPorNome
            ? <>atualizado por {ajuste.editadoPorNome} · {quando(ajuste.atualizadoEm)}</>
            : <>criado por {ajuste.criadoPorNome ?? 'alguém'} · {quando(ajuste.criadoEm)}</>}
        </span>
      </div>

      {ajuste.motivo && (
        <p className="text-muted-foreground mt-0.5">“{ajuste.motivo}”</p>
      )}

      <div className="flex items-center gap-1.5 mt-1.5">
        <Button size="sm" variant="ghost" className="h-6 text-[11px] gap-1" onClick={onEditar}>
          <Pencil className="w-3 h-3" /> Atualizar total
        </Button>
        <Button size="sm" variant="ghost" className="h-6 text-[11px] gap-1 text-destructive" onClick={onApagar}>
          <Trash2 className="w-3 h-3" /> Apagar
        </Button>
        <Button
          size="sm" variant="ghost"
          className="h-6 text-[11px] gap-1 ml-auto text-muted-foreground"
          onClick={() => setAberto(v => !v)}
        >
          <History className="w-3 h-3" />
          Histórico
          <ChevronDown className={cn('w-3 h-3 transition-transform', aberto && 'rotate-180')} />
        </Button>
      </div>

      {aberto && (
        <div className="mt-2 pl-2 border-l-2 border-border space-y-1.5">
          {carregandoHistorico && !eventos && (
            <p className="text-[11px] text-muted-foreground">Carregando…</p>
          )}
          {eventos?.length === 0 && (
            <p className="text-[11px] text-muted-foreground">Sem histórico.</p>
          )}
          {eventos?.map(e => (
            <div key={e.id} className="text-[11px]">
              <span className={cn(
                'font-mono tabular-nums font-semibold',
                e.delta > 0 ? 'text-emerald-600' : e.delta < 0 ? 'text-destructive' : 'text-muted-foreground',
              )}>
                {e.delta > 0 ? '+' : ''}{formatBRL(e.delta)}
              </span>
              <span className="text-muted-foreground">
                {' '}· {textoDoEvento(e)} · {e.autorNome ?? 'alguém'} · {quando(e.criadoEm)}
              </span>
              {e.observacao && (
                <p className="text-muted-foreground italic">“{e.observacao}”</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** A frase que explica o evento. `delta` já aparece em destaque ao lado. */
function textoDoEvento(e: EventoAjuste): string {
  if (e.tipo === 'criado')    return `card aberto com ${formatBRL(e.valorNovo)}`;
  if (e.tipo === 'cancelado') return `card apagado (estava ${formatBRL(e.valorAnterior ?? 0)})`;
  return `de ${formatBRL(e.valorAnterior ?? 0)} para ${formatBRL(e.valorNovo)}`;
}

// ── Diálogos ─────────────────────────────────────────────────────────────────

/**
 * O líder informa o TOTAL, não a diferença.
 *
 * O diálogo mostra a diferença enquanto ele digita — «entra +1.000,00 hoje» —
 * porque é essa a conta que ele fazia de cabeça no desenho anterior, e mostrá-la
 * é o que prova que o sistema entendeu o que ele quis dizer. Quem grava a
 * diferença de verdade é o gatilho, a partir do valor que já está na linha.
 */
function DialogoNovoTotal({
  alvo, onFechar, onConfirmar,
}: {
  alvo: AjusteManual | null;
  onFechar: () => void;
  onConfirmar: (valor: number, anotacao: string) => Promise<void>;
}) {
  const [valorTexto, setValorTexto] = useState('');
  const [anotacao, setAnotacao] = useState('');
  const [sinal, setSinal] = useState<1 | -1>(1);
  const [ocupado, setOcupado] = useState(false);

  // Reabrir o diálogo com outro alvo tem de recarregar os campos; sem isto, a
  // segunda edição abre com o valor da primeira.
  const ultimoId = useRef<string | null>(null);
  useEffect(() => {
    if (!alvo || alvo.id === ultimoId.current) return;
    ultimoId.current = alvo.id;
    setValorTexto(String(Math.abs(alvo.valor)).replace('.', ','));
    setSinal(alvo.valor >= 0 ? 1 : -1);
    setAnotacao('');
  }, [alvo]);

  const valor = valorDigitadoParaNumero(valorTexto);
  const novoTotal = valor === null ? null : valor * sinal;
  const delta = novoTotal === null || !alvo ? null : novoTotal - alvo.valor;

  return (
    <Dialog open={!!alvo} onOpenChange={o => { if (!o) onFechar(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Atualizar total</DialogTitle>
          <DialogDescription>
            {alvo?.operadorNome ?? 'Operador'} · hoje está em{' '}
            <strong>{formatBRL(alvo?.valor ?? 0)}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <p className="text-[11px] text-muted-foreground mb-1">
              Valor TOTAL da pessoa no mês — não o que entrou hoje.
            </p>
            <div className="flex gap-2">
              <div className="flex rounded-md border border-input overflow-hidden">
                <button type="button" onClick={() => setSinal(1)}
                  className={cn('px-3 text-xs font-medium',
                    sinal === 1 ? 'bg-emerald-500 text-white' : 'hover:bg-accent')}>
                  Somar
                </button>
                <button type="button" onClick={() => setSinal(-1)}
                  className={cn('px-3 text-xs font-medium',
                    sinal === -1 ? 'bg-destructive text-destructive-foreground' : 'hover:bg-accent')}>
                  Tirar
                </button>
              </div>
              <Input value={valorTexto} onChange={e => setValorTexto(e.target.value)}
                inputMode="decimal" className="h-9 font-mono tabular-nums" />
            </div>
          </div>

          {delta !== null && (
            <p className="text-xs px-2.5 py-2 rounded-md bg-muted/60">
              {delta === 0 ? (
                <span className="text-muted-foreground">O valor não muda.</span>
              ) : (
                <>
                  Entra{' '}
                  <strong className={delta > 0 ? 'text-emerald-600' : 'text-destructive'}>
                    {delta > 0 ? '+' : ''}{formatBRL(delta)}
                  </strong>{' '}
                  no histórico de hoje.
                </>
              )}
            </p>
          )}

          <Textarea value={anotacao} onChange={e => setAnotacao(e.target.value)} rows={2}
            className="text-sm resize-none"
            placeholder="Anotação (opcional) — aparece nesta linha do histórico" />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onFechar}>Fechar</Button>
          <Button
            disabled={novoTotal === null || ocupado}
            onClick={async () => {
              if (novoTotal === null) return;
              setOcupado(true);
              try { await onConfirmar(novoTotal, anotacao); }
              finally { setOcupado(false); }
            }}
          >
            {ocupado ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar total'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DialogoApagar({
  alvo, onFechar, onConfirmar,
}: {
  alvo: AjusteManual | null;
  onFechar: () => void;
  onConfirmar: (motivo: string) => Promise<void>;
}) {
  const [texto, setTexto] = useState('');
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => { if (alvo) setTexto(''); }, [alvo]);

  return (
    <Dialog open={!!alvo} onOpenChange={o => { if (!o) onFechar(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Apagar o card</DialogTitle>
          <DialogDescription>
            {alvo?.operadorNome ?? 'Operador'} perde {formatBRL(alvo?.valor ?? 0)} do
            recebimento, na hora. O card fica guardado no histórico da aba, com
            quem apagou — e a pessoa pode receber um card novo depois.
          </DialogDescription>
        </DialogHeader>

        <Textarea value={texto} onChange={e => setTexto(e.target.value)} rows={3}
          placeholder="Motivo (opcional) — fica registrado" className="text-sm resize-none" />

        <DialogFooter>
          <Button variant="ghost" onClick={onFechar}>Voltar</Button>
          <Button
            variant="destructive"
            disabled={ocupado}
            onClick={async () => {
              setOcupado(true);
              try { await onConfirmar(texto); } finally { setOcupado(false); }
            }}
          >
            {ocupado ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Apagar card'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function quando(iso: string): string {
  const d = new Date(iso);
  const hoje = new Date().toDateString() === d.toDateString();
  return hoje
    ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}
