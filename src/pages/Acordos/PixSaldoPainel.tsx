/**
 * PixSaldoPainel — a correção de valor divergente do Pix automático.
 *
 * O pagamento da comissão sai por fora do sistema: alguém confere a lista, soma
 * e manda o Pix. Quando esse alguém erra o valor, até aqui não havia onde
 * registrar — o acerto virava combinado verbal.
 *
 * Este painel é o "onde". A liderança anota quanto ficou faltando (ou sobrando)
 * para uma pessoa, e esse saldo passa a aparecer nos acordos APROVADOS e ainda
 * NÃO PAGOS dela como a ação «Corrigir valor». O saldo só é limpo quando o
 * acordo que levou a correção for marcado como pago — ver a migration
 * `20260823080000`, que é quem cumpre a regra.
 *
 * O sinal é escolhido em BOTÃO, não digitado: um menos perdido na frente do
 * número é a diferença entre devolver R$ 10,00 e cobrar R$ 10,00, e ninguém
 * revisa o sinal de um campo que já parece preenchido.
 */
import { useMemo, useState } from 'react';
import {
  Scale, Plus, Search, X, RefreshCw, ArrowUpCircle, ArrowDownCircle, Link2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { formatCurrency, parseCurrencyInput } from '@/lib/index';
import { sugerirOperadores, type OperadorInfo } from './pixAutomaticoView';
import {
  definirSaldoPix, type PixAutoSaldo,
} from '@/services/pix_automatico.service';

/** O que o sinal quer dizer, na frase que a operação usa. */
const SINAIS = {
  deve: {
    rotulo: 'A empresa deve',
    ajuda: 'O Pix saiu com valor a MENOS — este valor entra no próximo pagamento',
    icone: ArrowUpCircle,
    cls: 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10',
  },
  descontar: {
    rotulo: 'A empresa vai descontar',
    ajuda: 'O Pix saiu com valor a MAIS — este valor sai do próximo pagamento',
    icone: ArrowDownCircle,
    cls: 'text-amber-400 border-amber-500/40 bg-amber-500/10',
  },
} as const;

type Sinal = keyof typeof SINAIS;

export interface PixSaldoPainelProps {
  empresaId: string;
  /** Operadores do escopo de quem olha — a mesma lista do vínculo de registro. */
  operadores: OperadorInfo[];
  saldos: PixAutoSaldo[];
  /** NR do acordo onde cada saldo está reservado, para a etiqueta da lista. */
  nrPorAcordo: Record<string, string>;
  /** Relê saldos e acordos depois de qualquer gravação. */
  onMudou: () => void | Promise<void>;
}

export function PixSaldoPainel({
  empresaId, operadores, saldos, nrPorAcordo, onMudou,
}: PixSaldoPainelProps) {
  const [aberto, setAberto]   = useState(false);
  const [busca, setBusca]     = useState('');
  const [alvo, setAlvo]       = useState<OperadorInfo | null>(null);
  const [sinal, setSinal]     = useState<Sinal>('deve');
  const [valor, setValor]     = useState('');
  const [motivo, setMotivo]   = useState('');
  const [salvando, setSalvando] = useState(false);

  const sugestoes = useMemo(
    () => sugerirOperadores(operadores, busca),
    [operadores, busca],
  );

  /** O saldo que a pessoa escolhida já tem, se tiver. */
  const saldoDoAlvo = useMemo(
    () => (alvo ? saldos.find(s => s.operador_id === alvo.id) ?? null : null),
    [saldos, alvo],
  );

  const totalAberto = useMemo(
    () => saldos.reduce((s, x) => s + Number(x.valor || 0), 0),
    [saldos],
  );

  function limpar() {
    setAlvo(null); setBusca(''); setValor(''); setMotivo(''); setSinal('deve');
  }

  async function gravar(somar: boolean) {
    if (!alvo) { toast.error('Escolha a pessoa.'); return; }
    const bruto = parseCurrencyInput(valor);
    if (!Number.isFinite(bruto) || bruto <= 0) {
      toast.error('Informe um valor maior que zero — o sinal vem dos botões acima.');
      return;
    }
    // O sinal mora aqui, num lugar só: `deve` é positivo (entra no pagamento),
    // `descontar` é negativo (sai dele). É a mesma convenção da coluna do banco.
    const assinado = sinal === 'deve' ? bruto : -bruto;

    setSalvando(true);
    try {
      const { ok, error } = await definirSaldoPix({
        empresaId, operadorId: alvo.id, valor: assinado,
        motivo: motivo.trim() || null, somar,
      });
      if (!ok) { toast.error(error ?? 'Não foi possível gravar o saldo.'); return; }
      toast.success(
        somar
          ? `Saldo somado ao de ${alvo.nome}.`
          : `Saldo de ${formatCurrency(Math.abs(assinado))} anotado para ${alvo.nome}.`,
      );
      limpar();
      await onMudou();
    } finally {
      setSalvando(false);
    }
  }

  async function zerar(saldo: PixAutoSaldo) {
    setSalvando(true);
    try {
      // Valor 0 apaga a linha — ver `fn_pix_saldo_definir`. Saldo zerado e saldo
      // inexistente são a mesma coisa; manter a linha mostraria uma pendência
      // que não pende.
      const { ok, error } = await definirSaldoPix({
        empresaId, operadorId: saldo.operador_id, valor: 0,
      });
      if (!ok) { toast.error(error ?? 'Não foi possível remover o saldo.'); return; }
      toast.success(`Saldo de ${saldo.operador_nome ?? 'operador'} removido.`);
      await onMudou();
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Card className="border-border/60">
      <CardContent className="p-3 space-y-3">
        <button
          type="button"
          onClick={() => setAberto(a => !a)}
          className="w-full flex items-center justify-between gap-2 text-left"
          aria-expanded={aberto}
        >
          <span className="flex items-center gap-2 min-w-0">
            <Scale className="w-4 h-4 text-violet-400 shrink-0" />
            <span className="text-xs font-semibold text-foreground">Corrigir valor divergente</span>
            {saldos.length > 0 && (
              <Badge variant="outline" className="text-[10px] border-violet-500/30 bg-violet-500/10 text-violet-300">
                {saldos.length} em aberto · {formatCurrency(totalAberto)}
              </Badge>
            )}
          </span>
          <span className="text-[11px] text-muted-foreground shrink-0">
            {aberto ? 'ocultar' : 'abrir'}
          </span>
        </button>

        {aberto && (
          <div className="space-y-4 pt-1">
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Anote aqui quanto um Pix saiu a mais ou a menos. O valor fica pendente
              e aparece como <strong>Corrigir valor</strong> nos acordos aprovados e
              ainda não pagos da pessoa. Ele só é limpo quando o acordo que levou a
              correção for marcado como pago.
            </p>

            {/* ── Quem ── */}
            <div className="space-y-1.5">
              <Label className="text-[11px]">Pessoa</Label>
              {alvo ? (
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[11px] font-semibold">
                    {alvo.nome}
                  </Badge>
                  <button
                    type="button" onClick={limpar}
                    className="w-6 h-6 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent/60"
                    title="Trocar pessoa"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={busca} onChange={e => setBusca(e.target.value)}
                    placeholder="Buscar pelo nome…" className="h-8 pl-8 text-xs"
                    aria-label="Buscar operador para anotar saldo"
                  />
                  {sugestoes.length > 0 && (
                    <div className="absolute z-20 mt-1 w-full rounded-lg border border-border bg-popover shadow-lg overflow-hidden">
                      {sugestoes.map(o => (
                        <button
                          key={o.id} type="button"
                          onClick={() => { setAlvo(o); setBusca(''); }}
                          className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent/60"
                        >
                          {o.nome}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Já existe saldo: quem está anotando precisa saber ANTES de decidir
                entre substituir e somar. */}
            {saldoDoAlvo && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 space-y-0.5">
                <p className="text-[11px] text-amber-300 font-semibold">
                  {alvo?.nome} já tem saldo de {formatCurrency(saldoDoAlvo.valor)}
                  {saldoDoAlvo.valor > 0 ? ' a receber' : ' a descontar'}.
                </p>
                {saldoDoAlvo.acordo_id && (
                  <p className="text-[10px] text-muted-foreground">
                    Aplicado no NR {nrPorAcordo[saldoDoAlvo.acordo_id] ?? '—'} — retire a
                    correção de lá antes de alterar o valor.
                  </p>
                )}
              </div>
            )}

            {/* ── Sinal ── */}
            <div className="space-y-1.5">
              <Label className="text-[11px]">O que aconteceu</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {(Object.keys(SINAIS) as Sinal[]).map(k => {
                  const s = SINAIS[k];
                  const Icone = s.icone;
                  const ativo = sinal === k;
                  return (
                    <button
                      key={k} type="button" onClick={() => setSinal(k)}
                      className={cn(
                        'rounded-lg border px-3 py-2 text-left transition-colors',
                        ativo ? s.cls : 'border-border text-muted-foreground hover:bg-accent/40',
                      )}
                    >
                      <span className="flex items-center gap-1.5 text-[11px] font-semibold">
                        <Icone className="w-3.5 h-3.5 shrink-0" /> {s.rotulo}
                      </span>
                      <span className="block text-[10px] text-muted-foreground mt-0.5 leading-snug">
                        {s.ajuda}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ── Valor e motivo ── */}
            <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-2">
              <div className="space-y-1.5">
                <Label className="text-[11px]">Valor</Label>
                <Input
                  value={valor} onChange={e => setValor(e.target.value)}
                  placeholder="0,00" inputMode="decimal"
                  className="h-8 text-xs font-mono text-right"
                  aria-label="Valor da divergência"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px]">Motivo</Label>
                <Input
                  value={motivo} onChange={e => setMotivo(e.target.value)}
                  placeholder="Ex.: Pix de 12/08 saiu R$ 10,00 a menos"
                  className="h-8 text-xs"
                  aria-label="Motivo da divergência"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm" className="h-8 text-xs gap-1.5"
                disabled={salvando || !alvo || !!saldoDoAlvo?.acordo_id}
                onClick={() => gravar(false)}
              >
                {salvando ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                {saldoDoAlvo ? 'Substituir saldo' : 'Anotar saldo'}
              </Button>
              {/* Somar só faz sentido quando já existe algo a somar. */}
              {saldoDoAlvo && (
                <Button
                  size="sm" variant="outline" className="h-8 text-xs"
                  disabled={salvando || !!saldoDoAlvo.acordo_id}
                  onClick={() => gravar(true)}
                >
                  Somar ao existente
                </Button>
              )}
            </div>

            {/* ── Saldos em aberto ── */}
            <div className="space-y-1.5 pt-1">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Em aberto
              </p>
              {saldos.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  Nenhuma divergência anotada.
                </p>
              ) : (
                <ul className="space-y-1">
                  {saldos.map(s => (
                    <li
                      key={s.id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-border/60 px-2.5 py-1.5"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">
                          {s.operador_nome ?? '—'}
                        </p>
                        {s.motivo && (
                          <p className="text-[10px] text-muted-foreground truncate">{s.motivo}</p>
                        )}
                        {s.acordo_id && (
                          <p className="text-[10px] text-violet-300 inline-flex items-center gap-1">
                            <Link2 className="w-2.5 h-2.5 shrink-0" />
                            aplicado no NR {nrPorAcordo[s.acordo_id] ?? '—'} — aguardando pagamento
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={cn(
                          'font-mono text-xs font-bold',
                          s.valor > 0 ? 'text-emerald-400' : 'text-amber-400',
                        )}>
                          {s.valor > 0 ? '+' : '−'}{formatCurrency(Math.abs(s.valor))}
                        </span>
                        {/* Saldo reservado não some por aqui: ele está carimbado
                            num acordo, e apagá-lo deixaria a linha prometendo
                            uma correção que não existe mais. */}
                        {!s.acordo_id && (
                          <button
                            type="button" onClick={() => zerar(s)} disabled={salvando}
                            title="Remover este saldo"
                            className="w-6 h-6 rounded-lg flex items-center justify-center text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 disabled:opacity-50"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default PixSaldoPainel;
