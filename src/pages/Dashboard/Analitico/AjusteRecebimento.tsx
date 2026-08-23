/**
 * AjusteRecebimento — a correção manual do recebimento, no Painel Líder.
 *
 * ## O que esta aba é, e por quanto tempo
 *
 * Uma correção TEMPORÁRIA. O relatório analítico que vem do ERP está com erro, e
 * enquanto a origem não é consertada a liderança precisa somar ou tirar valor do
 * recebimento de um operador, com motivo registrado.
 *
 * A aba diz isso na cara, num aviso fixo. Ferramenta temporária que não avisa
 * que é temporária vira permanente em três meses — e esta mexe em número de
 * dinheiro.
 *
 * ## O valor entra por fora, e sobe sozinho
 *
 * Não é Pix e não é cartão: entra como "Ajuste manual" na quebra por forma. O
 * ajuste é somado na LEITURA do analítico (`ajusteManual.service.ts`), em dois
 * pontos, e de lá sobe para operador → equipe → setor sem que nenhuma tela
 * precise saber que ele existe.
 *
 * `analitico_recebimentos` não é tocado. Desligar a correção é parar de somar.
 *
 * ## Quem faz o quê
 *
 * • **Liderança** lança e vê o próprio histórico. Não edita e não cancela: para
 *   mudar, abre uma solicitação, e o administrador é notificado.
 * • **Administração** vê tudo, edita, cancela e responde as solicitações.
 *
 * Essa divisão não é decoração de tela — a RLS repete as duas regras. Esconder
 * botão é conforto; quem recusa é o banco.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, Check, Loader2, Minus, Plus, Search, History, Ban, Pencil,
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
  listarAjustes, listarSolicitacoes, lancarAjuste, editarAjuste, cancelarAjuste,
  abrirSolicitacao, responderSolicitacao, notificarQuemAdministra,
  type AjusteManual, type SolicitacaoAjuste,
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

  const podeLancar     = temPermissao('ajuste_recebimento_lancar');
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
    assinar: empresaId ? {
      topico: `rt-ajustes-${empresaId}`,
      escutas: [{ tabela: 'analitico_ajustes_manuais' }],
    } : undefined,
  });

  const carregarSolicitacoes = useCallback(
    () => (empresaId ? listarSolicitacoes(empresaId) : Promise.resolve([])),
    [empresaId],
  );

  const { dados: solicitacoes, recarregar: recarregarSolicitacoes } =
    useDadosVivos<SolicitacaoAjuste>({
      carregar: carregarSolicitacoes,
      chave: s => s.id,
      iguais: iguaisProfundo,
      ativo: !!empresaId,
      chaveCache: chaveDeCache('ajustes-solicitacoes', empresaId, meuId),
      assinar: empresaId ? {
        topico: `rt-ajustes-sol-${empresaId}`,
        escutas: [{ tabela: 'analitico_ajustes_solicitacoes' }],
      } : undefined,
    });

  // ── Formulário ────────────────────────────────────────────────────────────

  const [operadorId, setOperadorId] = useState<string | null>(null);
  const [sinal, setSinal] = useState<1 | -1>(1);
  const [valorTexto, setValorTexto] = useState('');
  const [motivo, setMotivo] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [seletorAberto, setSeletorAberto] = useState(false);

  const operadorEscolhido = useMemo(
    () => operadores.find(o => o.id === operadorId) ?? null,
    [operadores, operadorId],
  );

  const valorNumerico = valorDigitadoParaNumero(valorTexto);
  const podeEnviar = !!operadorEscolhido && valorNumerico !== null
    && motivo.trim().length >= 3 && !salvando;

  async function enviar() {
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
        criadoPorNome: perfil.nome ?? perfil.email ?? 'Sem nome',
      });
      if (r.erro) { toast.error(r.erro); return; }

      toast.success(
        `${sinal > 0 ? 'Somado' : 'Retirado'} ${formatBRL(valorNumerico)} `
        + `${sinal > 0 ? 'a' : 'de'} ${operadorEscolhido.nome}.`,
      );
      setValorTexto(''); setMotivo(''); setOperadorId(null);
      await recarregar();
    } finally { setSalvando(false); }
  }

  // ── Recortes da lista ─────────────────────────────────────────────────────

  const meusAjustes = useMemo(
    () => (podeAdministrar ? ajustes : ajustes.filter(a => a.criadoPor === meuId)),
    [ajustes, podeAdministrar, meuId],
  );

  const totalDoMes = useMemo(
    () => meusAjustes.filter(a => !a.cancelado).reduce((s, a) => s + a.valor, 0),
    [meusAjustes],
  );

  const solicitacoesAbertas = useMemo(
    () => solicitacoes.filter(s => s.status === 'aberta'),
    [solicitacoes],
  );

  // ── Diálogos ──────────────────────────────────────────────────────────────

  const [alvoEdicao, setAlvoEdicao] = useState<AjusteManual | null>(null);
  const [alvoCancelamento, setAlvoCancelamento] = useState<AjusteManual | null>(null);
  const [alvoSolicitacao, setAlvoSolicitacao] = useState<
    { ajuste: AjusteManual; tipo: 'editar' | 'cancelar' } | null
  >(null);

  if (!podeLancar && !podeAdministrar) {
    return (
      <p className="text-sm text-muted-foreground px-1 py-8 text-center">
        Você não tem permissão para lançar ajustes de recebimento.
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
            O que for lançado aqui soma no recebimento do operador — e, por
            consequência, no da equipe e no do setor. Entra como <strong>Ajuste
            manual</strong>, não como Pix nem cartão. O relatório importado não é
            alterado: o valor é somado na leitura, e some no dia em que esta aba
            for desligada.
          </p>
        </div>
      </div>

      {/* ── Lançamento ───────────────────────────────────────────────────── */}
      {podeLancar && (
        <div className="rounded-xl border border-border bg-card p-3 space-y-3">
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_10rem]">
            {/* Operador — digitável, como pedido. Uma lista de 60 pessoas num
                `<select>` é rolagem; com busca, são três letras. */}
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
                    <CommandEmpty>Ninguém com esse nome neste recorte.</CommandEmpty>
                    <CommandGroup>
                      {operadores.map(o => (
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
            placeholder="Motivo — fica registrado e aparece para o administrador"
            className="text-sm resize-none"
          />

          <div className="flex items-center gap-3">
            <p className="text-[11px] text-muted-foreground flex-1 min-w-0">
              {operadorEscolhido && valorNumerico !== null ? (
                <>
                  {sinal > 0 ? 'Somar ' : 'Tirar '}
                  <strong className={sinal > 0 ? 'text-emerald-600' : 'text-destructive'}>
                    {formatBRL(valorNumerico)}
                  </strong>
                  {sinal > 0 ? ' ao ' : ' do '}recebimento de{' '}
                  <strong className="text-foreground">{operadorEscolhido.nome}</strong>.
                </>
              ) : (
                'Escolha a pessoa, o valor e escreva o motivo.'
              )}
            </p>
            <Button size="sm" disabled={!podeEnviar} onClick={enviar}>
              {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Lançar'}
            </Button>
          </div>
        </div>
      )}

      {/* ── Pedidos de alteração (só quem administra) ─────────────────────── */}
      {podeAdministrar && solicitacoesAbertas.length > 0 && (
        <div className="rounded-xl border border-primary/40 bg-primary/5 p-3 space-y-2">
          <p className="text-xs font-semibold flex items-center gap-1.5">
            <History className="w-3.5 h-3.5" />
            {solicitacoesAbertas.length} pedido(s) de alteração aguardando você
          </p>
          {solicitacoesAbertas.map(s => {
            const ajuste = ajustes.find(a => a.id === s.ajusteId);
            return (
              <div key={s.id} className="rounded-lg border border-border bg-card px-3 py-2 text-xs space-y-1">
                <p>
                  <strong>{s.solicitadoPorNome ?? 'Alguém'}</strong> pediu para{' '}
                  {s.tipo === 'cancelar' ? 'cancelar' : 'editar'}
                  {ajuste && <> o ajuste de <strong>{formatBRL(ajuste.valor)}</strong> em {ajuste.operadorNome ?? '—'}</>}
                  {s.tipo === 'editar' && s.valorProposto !== null && (
                    <> para <strong>{formatBRL(s.valorProposto)}</strong></>
                  )}
                </p>
                <p className="text-muted-foreground">“{s.justificativa}”</p>
                <div className="flex gap-2 pt-0.5">
                  <Button size="sm" variant="outline" className="h-7 text-[11px]"
                    onClick={async () => {
                      if (!perfil?.id) return;
                      // Aprovar aplica o pedido e resolve a solicitação. Duas
                      // escritas, e a ordem importa: se a aplicação falhar, a
                      // solicitação continua aberta em vez de virar mentira.
                      if (ajuste) {
                        const r = s.tipo === 'cancelar'
                          ? await cancelarAjuste({
                              id: ajuste.id,
                              motivo: `Pedido de ${s.solicitadoPorNome ?? 'liderança'}: ${s.justificativa}`,
                              canceladoPor: perfil.id,
                              canceladoPorNome: perfil.nome ?? 'Administração',
                            })
                          : await editarAjuste({
                              id: ajuste.id,
                              valor: s.valorProposto ?? ajuste.valor,
                              motivo: s.motivoProposto ?? ajuste.motivo,
                              editadoPor: perfil.id,
                              editadoPorNome: perfil.nome ?? 'Administração',
                            });
                        if (r.erro) { toast.error(r.erro); return; }
                      }
                      const rr = await responderSolicitacao({
                        id: s.id, status: 'aprovada', resposta: 'Aplicado.',
                        resolvidoPor: perfil.id,
                        resolvidoPorNome: perfil.nome ?? 'Administração',
                      });
                      if (rr.erro) { toast.error(rr.erro); return; }
                      toast.success('Pedido aplicado.');
                      await Promise.all([recarregar(), recarregarSolicitacoes()]);
                    }}>
                    Aprovar
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-[11px]"
                    onClick={async () => {
                      if (!perfil?.id) return;
                      const r = await responderSolicitacao({
                        id: s.id, status: 'recusada', resposta: 'Recusado.',
                        resolvidoPor: perfil.id,
                        resolvidoPorNome: perfil.nome ?? 'Administração',
                      });
                      if (r.erro) { toast.error(r.erro); return; }
                      toast.success('Pedido recusado.');
                      await recarregarSolicitacoes();
                    }}>
                    Recusar
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Histórico ────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
          <p className="text-xs font-semibold">
            {podeAdministrar ? 'Todos os lançamentos do mês' : 'Seus lançamentos do mês'}
          </p>
          <span className={cn(
            'ml-auto text-xs font-mono tabular-nums font-semibold',
            totalDoMes > 0 ? 'text-emerald-600' : totalDoMes < 0 ? 'text-destructive' : 'text-muted-foreground',
          )}>
            {totalDoMes > 0 ? '+' : ''}{formatBRL(totalDoMes)}
          </span>
        </div>

        <div className="divide-y divide-border max-h-[26rem] overflow-y-auto">
          {carregando && (
            <p className="text-xs text-muted-foreground text-center py-6">Carregando…</p>
          )}

          {!carregando && meusAjustes.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-8">
              Nenhum ajuste lançado neste mês.
            </p>
          )}

          {meusAjustes.map(a => {
            const pendente = solicitacoes.some(s => s.ajusteId === a.id && s.status === 'aberta');
            return (
              <div key={a.id} className={cn('px-3 py-2.5 text-xs', a.cancelado && 'opacity-55')}>
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className={cn(
                    'font-mono tabular-nums font-semibold',
                    a.cancelado ? 'line-through text-muted-foreground'
                      : a.valor > 0 ? 'text-emerald-600' : 'text-destructive',
                  )}>
                    {a.valor > 0 ? '+' : ''}{formatBRL(a.valor)}
                  </span>
                  <span className="font-medium">{a.operadorNome ?? 'Operador'}</span>
                  {a.cancelado && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-border">
                      cancelado
                    </span>
                  )}
                  {pendente && !a.cancelado && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-primary/40 text-primary">
                      alteração pedida
                    </span>
                  )}

                  <span className="ml-auto text-[11px] text-muted-foreground">
                    {a.criadoPorNome ?? 'alguém'} · {quando(a.criadoEm)}
                  </span>
                </div>

                <p className="text-muted-foreground mt-0.5">“{a.motivo}”</p>

                {a.cancelado && a.motivoCancelamento && (
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Cancelado por {a.canceladoPorNome ?? 'alguém'}: “{a.motivoCancelamento}”
                  </p>
                )}
                {a.editadoPorNome && !a.cancelado && (
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Editado por {a.editadoPorNome}.
                  </p>
                )}

                {!a.cancelado && (
                  <div className="flex gap-1.5 mt-1.5">
                    {podeAdministrar ? (
                      <>
                        <Button size="sm" variant="ghost" className="h-6 text-[11px] gap-1"
                          onClick={() => setAlvoEdicao(a)}>
                          <Pencil className="w-3 h-3" /> Editar
                        </Button>
                        <Button size="sm" variant="ghost"
                          className="h-6 text-[11px] gap-1 text-destructive"
                          onClick={() => setAlvoCancelamento(a)}>
                          <Ban className="w-3 h-3" /> Cancelar
                        </Button>
                      </>
                    ) : a.criadoPor === meuId && !pendente ? (
                      // O líder não edita: ele PEDE. A frase explica por quê,
                      // porque um botão que só abre pedido sem dizer nada
                      // parece um botão quebrado.
                      <>
                        <Button size="sm" variant="ghost" className="h-6 text-[11px] gap-1"
                          onClick={() => setAlvoSolicitacao({ ajuste: a, tipo: 'editar' })}>
                          <Pencil className="w-3 h-3" /> Pedir alteração
                        </Button>
                        <Button size="sm" variant="ghost"
                          className="h-6 text-[11px] gap-1 text-destructive"
                          onClick={() => setAlvoSolicitacao({ ajuste: a, tipo: 'cancelar' })}>
                          <Ban className="w-3 h-3" /> Pedir cancelamento
                        </Button>
                      </>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {!podeAdministrar && (
          <p className="text-[11px] text-muted-foreground px-3 py-2 border-t border-border">
            Lançamento já registrado não é editado por aqui — peça a alteração e a
            administração aplica. É o que mantém a diferença entre “o valor estava
            errado” e “o valor mudou de ideia”.
          </p>
        )}
      </div>

      {/* ── Diálogos ─────────────────────────────────────────────────────── */}
      <DialogoEdicao
        alvo={alvoEdicao}
        onFechar={() => setAlvoEdicao(null)}
        onConfirmar={async (valor, motivoNovo) => {
          if (!alvoEdicao || !perfil?.id) return;
          const r = await editarAjuste({
            id: alvoEdicao.id, valor, motivo: motivoNovo,
            editadoPor: perfil.id, editadoPorNome: perfil.nome ?? 'Administração',
          });
          if (r.erro) { toast.error(r.erro); return; }
          toast.success('Ajuste editado.');
          setAlvoEdicao(null);
          await recarregar();
        }}
      />

      <DialogoMotivo
        aberto={!!alvoCancelamento}
        titulo="Cancelar ajuste"
        descricao="O lançamento para de somar imediatamente. Ele não é apagado — fica no histórico com o motivo."
        rotuloBotao="Cancelar ajuste"
        onFechar={() => setAlvoCancelamento(null)}
        onConfirmar={async (texto) => {
          if (!alvoCancelamento || !perfil?.id) return;
          const r = await cancelarAjuste({
            id: alvoCancelamento.id, motivo: texto,
            canceladoPor: perfil.id, canceladoPorNome: perfil.nome ?? 'Administração',
          });
          if (r.erro) { toast.error(r.erro); return; }
          toast.success('Ajuste cancelado.');
          setAlvoCancelamento(null);
          await recarregar();
        }}
      />

      <DialogoSolicitacao
        alvo={alvoSolicitacao}
        onFechar={() => setAlvoSolicitacao(null)}
        onConfirmar={async (valorProposto, justificativa) => {
          if (!alvoSolicitacao || !perfil?.id || !empresaId) return;
          const r = await abrirSolicitacao({
            ajusteId: alvoSolicitacao.ajuste.id,
            empresaId,
            tipo: alvoSolicitacao.tipo,
            valorProposto,
            motivoProposto: null,
            justificativa,
            solicitadoPor: perfil.id,
            solicitadoPorNome: perfil.nome ?? 'Liderança',
          });
          if (r.erro) { toast.error(r.erro); return; }

          await notificarQuemAdministra({
            empresaId,
            titulo: 'Pedido de alteração em ajuste de recebimento',
            mensagem: `${perfil.nome ?? 'Um líder'} pediu para `
              + `${alvoSolicitacao.tipo === 'cancelar' ? 'cancelar' : 'editar'} um ajuste `
              + `de ${formatBRL(alvoSolicitacao.ajuste.valor)} `
              + `em ${alvoSolicitacao.ajuste.operadorNome ?? 'um operador'}.`,
          });

          toast.success('Pedido enviado à administração.');
          setAlvoSolicitacao(null);
          await recarregarSolicitacoes();
        }}
      />
    </div>
  );
}

// ── Diálogos ─────────────────────────────────────────────────────────────────

function DialogoEdicao({
  alvo, onFechar, onConfirmar,
}: {
  alvo: AjusteManual | null;
  onFechar: () => void;
  onConfirmar: (valor: number, motivo: string) => Promise<void>;
}) {
  const [valorTexto, setValorTexto] = useState('');
  const [motivo, setMotivo] = useState('');
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
    setMotivo(alvo.motivo);
  }, [alvo]);

  const valor = valorDigitadoParaNumero(valorTexto);

  return (
    <Dialog open={!!alvo} onOpenChange={o => { if (!o) onFechar(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Editar ajuste</DialogTitle>
          <DialogDescription>
            {alvo?.operadorNome ?? 'Operador'} · lançado por {alvo?.criadoPorNome ?? 'alguém'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
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
          <Textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={2}
            className="text-sm resize-none" placeholder="Motivo" />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onFechar}>Fechar</Button>
          <Button
            disabled={valor === null || motivo.trim().length < 3 || ocupado}
            onClick={async () => {
              if (valor === null) return;
              setOcupado(true);
              try { await onConfirmar(valor * sinal, motivo); }
              finally { setOcupado(false); }
            }}
          >
            {ocupado ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DialogoMotivo({
  aberto, titulo, descricao, rotuloBotao, onFechar, onConfirmar,
}: {
  aberto: boolean;
  titulo: string;
  descricao: string;
  rotuloBotao: string;
  onFechar: () => void;
  onConfirmar: (motivo: string) => Promise<void>;
}) {
  const [texto, setTexto] = useState('');
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => { if (aberto) setTexto(''); }, [aberto]);

  return (
    <Dialog open={aberto} onOpenChange={o => { if (!o) onFechar(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>{descricao}</DialogDescription>
        </DialogHeader>
        <Textarea value={texto} onChange={e => setTexto(e.target.value)} rows={3}
          placeholder="Motivo — fica registrado" className="text-sm resize-none" />
        <DialogFooter>
          <Button variant="ghost" onClick={onFechar}>Voltar</Button>
          <Button
            variant="destructive"
            disabled={texto.trim().length < 3 || ocupado}
            onClick={async () => {
              setOcupado(true);
              try { await onConfirmar(texto); } finally { setOcupado(false); }
            }}
          >
            {ocupado ? <Loader2 className="w-4 h-4 animate-spin" /> : rotuloBotao}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DialogoSolicitacao({
  alvo, onFechar, onConfirmar,
}: {
  alvo: { ajuste: AjusteManual; tipo: 'editar' | 'cancelar' } | null;
  onFechar: () => void;
  onConfirmar: (valorProposto: number | null, justificativa: string) => Promise<void>;
}) {
  const [valorTexto, setValorTexto] = useState('');
  const [justificativa, setJustificativa] = useState('');
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (!alvo) return;
    setValorTexto(String(Math.abs(alvo.ajuste.valor)).replace('.', ','));
    setJustificativa('');
  }, [alvo]);

  const ehEdicao = alvo?.tipo === 'editar';
  const valor = valorDigitadoParaNumero(valorTexto);
  const sinal = (alvo?.ajuste.valor ?? 0) >= 0 ? 1 : -1;
  const valido = justificativa.trim().length >= 3 && (!ehEdicao || valor !== null);

  return (
    <Dialog open={!!alvo} onOpenChange={o => { if (!o) onFechar(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {ehEdicao ? 'Pedir alteração' : 'Pedir cancelamento'}
          </DialogTitle>
          <DialogDescription>
            A administração recebe o pedido e decide. O lançamento continua
            valendo até lá.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {ehEdicao && (
            <div>
              <p className="text-[11px] text-muted-foreground mb-1">
                Valor proposto (o sinal continua o mesmo: {sinal > 0 ? 'somar' : 'tirar'})
              </p>
              <Input value={valorTexto} onChange={e => setValorTexto(e.target.value)}
                inputMode="decimal" className="h-9 font-mono tabular-nums" />
            </div>
          )}
          <Textarea value={justificativa} onChange={e => setJustificativa(e.target.value)}
            rows={3} placeholder="Por que precisa mudar?" className="text-sm resize-none" />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onFechar}>Voltar</Button>
          <Button
            disabled={!valido || ocupado}
            onClick={async () => {
              setOcupado(true);
              try {
                await onConfirmar(ehEdicao && valor !== null ? valor * sinal : null, justificativa);
              } finally { setOcupado(false); }
            }}
          >
            {ocupado ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Enviar pedido'}
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

