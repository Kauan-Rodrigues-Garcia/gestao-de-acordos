/**
 * PixRegistroForm — o formulário «Registrar Acordo Pix», da sub-aba Registros.
 *
 * Os campos são estado DAQUI, e não da tela: cada letra digitada redesenhava
 * as 100 linhas da tabela, os painéis e os filtros (até 30/10/2026).
 *
 * ## O que foi digitado sobrevive a sair da sub-aba (04/11/2026)
 *
 * Quando os campos moravam na tela, trocar para «NRs divergentes» e voltar
 * mantinha o NR e o valor digitados — a tela não desmontava, só a sub-aba. Aqui
 * o formulário desmonta junto com Registros, então o rascunho fica no depósito
 * do `useEstadoLembrado`, só em memória (`persistir: false`): atravessa a troca
 * de sub-aba e a ida a outra tela, some no F5 e no logout. A chave é a da aba
 * (empresa + perfil): o rascunho de uma pessoa nunca aparece para outra.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { DollarSign, Hash, Plus, RefreshCw, Sparkles, User, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { DatePickerField } from '@/components/DatePickerField';
import { formatCurrency, parseCurrencyInput } from '@/lib/index';
import { cn } from '@/lib/utils';
import { ehSoNumeros, propsSoNumeros } from '@/lib/soNumeros';
import {
  conflitoDeNrPix, criarAcordoPix, pedirAutorizacaoNr, MSG_NR_MESMO_OPERADOR,
} from '@/services/pix_automatico.service';
import { useEstadoLembrado } from '@/hooks/useEstadoLembrado';
import { setorDoRegistroPix, sugerirOperadores, type OperadorInfo } from './pixAutomaticoView';
import type { PixTela } from './usePixAutomatico';
import { SO_MEMORIA } from './pixTelaComum';

export function PixRegistroForm({ pix }: { pix: PixTela }) {
  const {
    empresa, perfil, fechamento, donosDeNr, podeAgirSobreOutros, podeVerDeOutros, mes,
    podeRegistrar, setorFoco, clonesRef, noMesAtual, diaNovo, setDiaNovo, inicioDoMes,
    fimDoMes, pctDoMeuSetor, operadoresFiltro, carregar, nrDeFora, consumirNrDeFora, chaveAba,
  } = pix;
  // O rascunho: ver «O que foi digitado sobrevive a sair da sub-aba», no topo.
  const rascunho = `${chaveAba}|form`;
  const [nrNovo, setNrNovo]       = useEstadoLembrado(`${rascunho}|nr`, '', SO_MEMORIA);
  const [valorNovo, setValorNovo] = useEstadoLembrado(`${rascunho}|valor`, '', SO_MEMORIA);
  /** O campo de valor, para receber o cursor quando o NR chega pronto. */
  const valorNovoRef = useRef<HTMLInputElement>(null);
  /** Etiqueta EXTRA do proximo registro. Some depois de registrar. */
  const [extraNovo, setExtraNovo] = useEstadoLembrado(`${rascunho}|extra`, false, SO_MEMORIA);
  const [salvando, setSalvando]   = useState(false);

  // Vínculo do acordo a um operador (líder+): busca por nome
  const [vinculoBusca, setVinculoBusca] = useEstadoLembrado(`${rascunho}|vinculo-busca`, '', SO_MEMORIA);
  const [vinculoOp, setVinculoOp]       = useEstadoLembrado<OperadorInfo | null>(`${rascunho}|vinculo-op`, null, SO_MEMORIA);
  const [vinculoAberto, setVinculoAberto] = useState(false);

  // Sugestões do vínculo (líder+ registra em nome de um operador)
  const sugestoesVinculo = useMemo(
    () => sugerirOperadores(operadoresFiltro, vinculoBusca),
    [operadoresFiltro, vinculoBusca],
  );

  // O NR que chegou pela URL (ver `nrDeFora` em `usePixAutomatico`): preenche,
  // limpa o valor e leva o cursor ao campo que falta.
  useEffect(() => {
    if (!nrDeFora) return;
    setNrNovo(nrDeFora);
    setValorNovo('');
    consumirNrDeFora();
    requestAnimationFrame(() => valorNovoRef.current?.focus());
  }, [nrDeFora, consumirNrDeFora, setNrNovo, setValorNovo]);

  async function registrar() {
    if (!empresa?.id || !perfil?.id) return;
    if (fechamento.impedir('registrar Pix neste mês')) return;
    const nr = nrNovo.trim();
    const valor = parseCurrencyInput(valorNovo);
    if (!nr) { toast.error('Informe o NR do acordo'); return; }
    if (!ehSoNumeros(nr)) { toast.error('O NR só aceita números'); return; }
    if (isNaN(valor) || valor <= 0) { toast.error('Valor inválido'); return; }
    /*
     * NR já registrado: dois caminhos, e a diferença é de QUEM ele é.
     *
     * Do próprio dono do registro que se está tentando criar, é engano — a
     * mesma linha duas vezes, em qualquer mês. Não vai para a fila: o líder não
     * tem o que decidir, e aprovar contaria o mesmo dinheiro duas vezes na
     * comissão e na dobra.
     *
     * De outra pessoa NO MESMO MÊS, é o pedido dos líderes dos dois setores.
     * De outra pessoa em outro mês, não é nada (26/10/2026): o NR de agosto
     * não pede autorização para um registro de outubro. Ver `conflitoDeNrPix`.
     */
    const donoPretendido = podeAgirSobreOutros && vinculoOp ? vinculoOp.id : perfil.id;
    const conflito = conflitoDeNrPix(donosDeNr, nr, donoPretendido, mes);
    if (conflito?.tipo === 'mesma_pessoa') {
      toast.error(MSG_NR_MESMO_OPERADOR, { duration: 7000 });
      return;
    }
    if (conflito?.tipo === 'outra_pessoa') {
      await pedirAutorizacao(nr, valor);
      return;
    }
    if (!podeRegistrar) {
      toast.error('O registro manual está desativado para o seu setor.');
      return;
    }
    // Líder+ pode vincular o acordo a um operador; sem vínculo, registra em nome próprio
    const dono = podeAgirSobreOutros && vinculoOp ? vinculoOp : null;
    setSalvando(true);
    try {
      const { ok, error, nrDuplicado, nrMesmoOperador } = await criarAcordoPix({
        empresaId:    empresa.id,
        operadorId:   dono ? dono.id : perfil.id,
        operadorNome: dono ? dono.nome : (perfil.nome ?? perfil.email ?? '—'),
        setorId:      dono
          ? setorDoRegistroPix(dono, setorFoco, clonesRef.current)
          : (perfil.setor_id ?? null),
        nrCliente:    nr,
        valor,
        extra:        extraNovo,
        // Só quando a aba está fora do mês corrente. No mês de hoje o padrão
        // da coluna (`now()`) continua sendo a verdade.
        dia:          noMesAtual ? null : diaNovo,
      });
      if (!ok) {
        /*
         * A lista local de NRs bloqueados pode estar velha — outra pessoa
         * registrou o mesmo NR depois do último carregamento. O trigger é quem
         * tem a verdade, e quando ele recusa por duplicidade o caminho é o
         * mesmo do bloqueio antecipado: pedir autorização.
         */
        if (nrMesmoOperador) { toast.error(MSG_NR_MESMO_OPERADOR, { duration: 7000 }); return; }
        if (nrDuplicado) { await pedirAutorizacao(nr, valor); return; }
        toast.error('Erro ao registrar: ' + error);
        return;
      }
      const emOutroMes = noMesAtual ? '' : ` em ${new Date(diaNovo + 'T12:00:00').toLocaleDateString('pt-BR')}`;
      toast.success(dono
        ? `Acordo Pix registrado para ${dono.nome}${emOutroMes} — aguardando verificação.`
        : `Acordo Pix registrado${emOutroMes} — aguardando verificação do líder.`);
      setNrNovo('');
      setValorNovo('');
      setExtraNovo(false);
      setVinculoOp(null);
      setVinculoBusca('');
      await carregar();
    } finally {
      setSalvando(false);
    }
  }

  /**
   * O NR já está com outra pessoa: em vez de recusar, pede a transferência.
   *
   * Quem decide é quem já decide Pix (`aprovar_pix_automatico`). Autorizado, o
   * NR sai de quem tinha e o acordo nasce PENDENTE para quem pediu —
   * transferir não é aprovar a comissão. Ver 20260928190000.
   */
  async function pedirAutorizacao(nr: string, valor: number) {
    if (!perfil?.id) return;
    const dono = podeAgirSobreOutros && vinculoOp ? vinculoOp : null;
    const { ok, error } = await pedirAutorizacaoNr({
      operadorId: dono ? dono.id : perfil.id,
      nrCliente:  nr,
      valor,
      extra:      extraNovo,
    });
    if (!ok) { toast.error(error ?? 'Não foi possível pedir autorização.'); return; }

    toast.success(
      `O NR ${nr} já está com outra pessoa. Pedido de transferência enviado aos líderes — `
        + `se autorizarem, ele passa para ${dono ? dono.nome : 'você'}.`,
      { duration: 7000 },
    );
    setNrNovo('');
    setValorNovo('');
    setExtraNovo(false);
    await carregar();
  }

  return (
    <Card className="border-primary/20 bg-primary/[0.03]">
      <CardContent className="p-4">
        <div className="flex flex-col sm:flex-row sm:items-end gap-3 flex-wrap">
          <div className="space-y-1 flex-1 max-w-[220px]">
            <Label className="text-xs font-medium flex items-center gap-1"><Hash className="w-3 h-3" /> NR do acordo *</Label>
            <Input value={nrNovo} {...propsSoNumeros(setNrNovo, 'NR')}
              placeholder="Só números" className="h-9 text-sm font-mono" />
          </div>
          <div className="space-y-1 flex-1 max-w-[220px]">
            <Label className="text-xs font-medium flex items-center gap-1"><DollarSign className="w-3 h-3" /> Valor total do acordo *</Label>
            <Input ref={valorNovoRef} value={valorNovo} onChange={e => setValorNovo(e.target.value)}
              placeholder="0,00" className="h-9 text-sm font-mono"
              onKeyDown={e => { if (e.key === 'Enter') registrar(); }} />
          </div>
          {/* Só fora do mês corrente. No mês de hoje a data é agora, e um
              campo a mais só daria chance de errá-la. O calendário é preso ao
              mês olhado: escolher outro mês criaria um acordo que sumiria da
              tela no instante seguinte. */}
          {!noMesAtual && (
            <div className="space-y-1 flex-1 max-w-[200px]">
              <DatePickerField
                label="Data do registro *"
                labelClassName="text-xs font-medium"
                triggerClassName="h-9 text-sm"
                size="md"
                value={diaNovo}
                onChange={setDiaNovo}
                minDate={inicioDoMes}
                maxDate={fimDoMes}
              />
            </div>
          )}
          {podeVerDeOutros && (
            <div className="space-y-1 flex-1 max-w-[260px] relative">
              <Label className="text-xs font-medium flex items-center gap-1">
                <User className="w-3 h-3" /> Vincular a um operador
              </Label>
              {vinculoOp ? (
                <div className="h-9 flex items-center justify-between gap-2 rounded-md border border-primary/40 bg-primary/10 px-3">
                  <span className="text-xs font-medium truncate">{vinculoOp.nome}</span>
                  <button onClick={() => { setVinculoOp(null); setVinculoBusca(''); }}
                    className="text-muted-foreground hover:text-foreground" title="Remover vínculo">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <>
                  <Input value={vinculoBusca}
                    onChange={e => { setVinculoBusca(e.target.value); setVinculoAberto(true); }}
                    onFocus={() => setVinculoAberto(true)}
                    onBlur={() => setTimeout(() => setVinculoAberto(false), 150)}
                    placeholder="Digite o nome do operador…" className="h-9 text-sm" />
                  {vinculoAberto && sugestoesVinculo.length > 0 && (
                    <div className="absolute z-20 top-full left-0 right-0 mt-1 rounded-lg border border-border bg-popover shadow-lg overflow-hidden">
                      {sugestoesVinculo.map(o => (
                        <button key={o.id}
                          onMouseDown={e => e.preventDefault()}
                          onClick={() => { setVinculoOp(o); setVinculoAberto(false); }}
                          className="w-full text-left px-3 py-2 text-xs hover:bg-accent/60 flex items-center gap-2">
                          <User className="w-3 h-3 text-muted-foreground shrink-0" />
                          <span className="truncate">{o.nome}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
          {/*
            A etiqueta EXTRA, antes de registrar.
            ─────────────────────────────────────────────────────────────────
            Ela é SÓ visual: não muda comissão, não libera NR duplicado e não
            pula a autorização do líder. Existe porque o mesmo Pix às vezes é
            lançado pelo operador, pelo Receptivo e por um terceiro setor —
            três registros, um dinheiro — e quem confere precisa saber que
            este é candidato a esse enredo.

            Está aqui e não num menu escondido porque a decisão é de quem
            lança, no momento em que ele lança.
          */}
          <label className="flex cursor-pointer select-none items-center gap-1.5 pb-2.5 text-xs">
            <input
              type="checkbox"
              checked={extraNovo}
              onChange={e => setExtraNovo(e.target.checked)}
              className="h-3.5 w-3.5 accent-[hsl(var(--primary))]"
            />
            <span className={cn(
              'flex items-center gap-1 font-medium',
              extraNovo ? 'text-fuchsia-500' : 'text-muted-foreground',
            )}>
              <Sparkles className="h-3 w-3" /> Marcar como Extra
            </span>
            <span className="text-muted-foreground/70" title="A etiqueta só chama a atenção do líder na conferência — não altera nenhuma regra.">
              (aviso ao líder)
            </span>
          </label>

          {valorNovo && !isNaN(parseCurrencyInput(valorNovo)) && parseCurrencyInput(valorNovo) > 0 && (
            <p className="text-[11px] text-muted-foreground pb-2.5">
              Comissão estimada:{' '}
              <span className="font-mono font-semibold text-primary">
                {formatCurrency(Math.round(parseCurrencyInput(valorNovo) * pctDoMeuSetor) / 100)}
              </span>
            </p>
          )}
          <Button size="sm" onClick={registrar} disabled={salvando}
            className="h-9 gap-1.5 text-xs sm:ml-auto">
            {salvando ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Registrar Acordo Pix
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground mt-2">
          Todo registro entra como <strong>verificação pendente</strong> — o líder aprova ou desaprova.
          Cada NR só pode registrar <strong>um</strong> acordo no Pix automático.
          {podeAgirSobreOutros && ' Sem vínculo, o acordo é registrado em seu próprio nome.'}
        </p>
      </CardContent>
    </Card>
  );
}
