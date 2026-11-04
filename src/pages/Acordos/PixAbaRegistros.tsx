/**
 * PixAbaRegistros — a sub-aba Registros: o formulário, os totais, as metas,
 * os filtros, a configuração do setor e a tabela.
 */
import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertTriangle, Banknote, CheckCircle2, Clock, Layers, Lock, Scale, Search, User, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { DatePickerField } from '@/components/DatePickerField';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ValorAnimado } from '@/components/ValorAnimado';
import { formatCurrency, parseCurrencyInput } from '@/lib/index';
import { partesDoMes } from '@/lib/mesReferencia';
import { cn } from '@/lib/utils';
import {
  PIX_DIAS_UTEIS_EXPURGO, upsertMetaPixEquipe,
} from '@/services/pix_automatico.service';
import type { FiltroPagamento } from './pixAutomaticoView';
import { PixMetaPainel } from './PixMetaPainel';
import { PixComissaoDobrada } from './PixComissaoDobrada';
import { PixBonusPainel } from './PixBonusPainel';
import { PixRegistroForm } from './PixRegistroForm';
import { PixConfigSetor } from './PixConfigSetor';
import { PixBarraLote } from './PixBarraLote';
import { PixTabelaRegistros } from './PixTabelaRegistros';
import type { PixTela } from './usePixAutomatico';

export function PixAbaRegistros({ pix }: { pix: PixTela }) {
  const {
    empresa, perfil, mes, loading, podeRegistrar, podeVerDeOutros, podeVerTodosSetores,
    podeEditarConfig, podeAjustarSaldo, totais, pagamento, blocosMetaPix, dobra, bonusMeta,
    saldos, meusDesaprovados, busca, setBusca, filtroStatus, setFiltroStatus,
    filtroPagamento, setFiltroPagamento, dataDe, setDataDe, dataAte, setDataAte,
    filtroEquipe, setFiltroEquipe, filtroOperador, setFiltroOperador, equipesDoFoco,
    operadoresDoSeletor, setoresDoFiltro, setorFoco, meuSetor, pctPorSetor, setorConfig,
    carregar, carregarMetaPix,
  } = pix;
  const [salvandoMetaPix, setSalvandoMetaPix] = useState(false);

  // ── Meta de Pix do setor (líder+) ─────────────────────────────────────────
  // Parâmetros não se chamam `metaValor`: esse nome já é o estado da meta de
  // RECEBIMENTO do operador (card de bônus), e sombreá-lo aqui é convite a erro.
  /*
   * O setor vem por parâmetro, e não de `setorConfig`.
   *
   * Com «Todos os setores» a tela desenha um bloco por setor, e cada bloco tem
   * de gravar no SEU. Lendo `setorConfig` aqui, salvar a meta da equipe do Play
   * 3 gravaria no setor do cadastro de quem clicou.
   */
  async function salvarMetaPix(
    setorId: string, equipeId: string, valorAlvo: number, acordosAlvo: number,
  ) {
    if (!empresa?.id || !perfil?.id || !setorId) return;
    const { ano, mes: mesNum } = partesDoMes(mes);
    setSalvandoMetaPix(true);
    try {
      const { ok, error } = await upsertMetaPixEquipe({
        empresaId: empresa.id,
        setorId,
        equipeId,
        mes: mesNum,
        ano,
        metaValor: valorAlvo,
        metaAcordos: acordosAlvo,
        atualizadoPor: perfil.id,
        atualizadoPorNome: perfil.nome ?? perfil.email ?? '—',
      });
      if (!ok) { toast.error('Erro ao salvar a meta: ' + error); return; }
      toast.success('Meta de Pix automático atualizada.');
      await carregarMetaPix();
    } finally {
      setSalvandoMetaPix(false);
    }
  }

  const statsCards = [
    {
      label: 'Pendente', qtd: totais.pendente.qtd,
      valor: totais.pendente.valor, comissao: totais.pendente.comissao,
      cls: 'from-sky-500/15 to-sky-600/5 border-sky-500/25', icon: <Clock className="w-4 h-4 text-sky-700 dark:text-sky-400" />,
      comissaoCls: 'text-sky-700 dark:text-sky-400',
      rodape: null as string | null,
    },
    {
      label: 'Aprovado', qtd: totais.aprovado.qtd,
      valor: totais.aprovado.valor, comissao: totais.aprovado.comissao,
      cls: 'from-emerald-500/15 to-emerald-600/5 border-emerald-500/25', icon: <CheckCircle2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />,
      comissaoCls: 'text-emerald-700 dark:text-emerald-400',
      rodape: null as string | null,
    },
    // Pago é o que SAIU, não o que é devido. Aprovado R$ 105,49 com R$ 50,00
    // pagos são dois fatos verdadeiros ao mesmo tempo — faltava o segundo.
    {
      label: 'Pago', qtd: pagamento.pago.qtd,
      valor: pagamento.pago.valor, comissao: pagamento.pago.comissao,
      cls: 'from-teal-500/15 to-teal-600/5 border-teal-500/25', icon: <Banknote className="w-4 h-4 text-teal-700 dark:text-teal-400" />,
      comissaoCls: 'text-teal-700 dark:text-teal-400',
      rodape: pagamento.aPagar.comissao > 0
        ? `Ainda a receber: ${formatCurrency(pagamento.aPagar.comissao)}`
        : null,
    },
  ];

  return (
    <>
      {/* ── Registrar novo ── */}
      {podeRegistrar ? (
      <PixRegistroForm pix={pix} />
      ) : (
      <Card className="border-amber-500/25 bg-amber-500/[0.04]">
        <CardContent className="p-4 flex items-center gap-3">
          <Lock className="w-4 h-4 text-amber-700 dark:text-amber-500 shrink-0" />
          <p className="text-xs text-muted-foreground">
            O registro manual de acordos está <strong className="text-amber-700 dark:text-amber-500">desativado</strong> para
            o seu setor. Você pode acompanhar seus acordos pendentes, aprovados e desaprovados abaixo.
          </p>
        </CardContent>
      </Card>
      )}

      {/* ── Totais pendente × aprovado ── */}
      {!loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {statsCards.map((s, i) => (
            <motion.div key={s.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06, duration: 0.3 }}>
              <div className={cn('rounded-xl border bg-gradient-to-br p-4 h-full', s.cls)}>
                {/* Quebra de linha quando o card estreita (zoom de 125%, três
                    cards lado a lado): a comissão desce em vez de vazar pela
                    borda — os valores, em fonte mono, não encolhem (19/10/2026). */}
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                  <div className="flex min-w-0 items-center gap-3">
                    {s.icon}
                    <div className="min-w-0">
                      <p className="text-[11px] text-muted-foreground">{s.label} · {s.qtd} acordo{s.qtd !== 1 ? 's' : ''}</p>
                      {/* Sem o piscar da tela inteira, um total que muda
                          passaria despercebido. A animacao e o aviso. */}
                      <ValorAnimado
                        valor={s.valor} formatar={formatCurrency}
                        className="block text-lg font-bold font-mono text-foreground leading-tight" />
                    </div>
                  </div>
                  <div className="ml-auto text-right">
                    <p className="text-[11px] text-muted-foreground">Comissão Pix</p>
                    <ValorAnimado
                      valor={s.comissao} formatar={formatCurrency}
                      className={cn('block text-lg font-bold font-mono leading-tight', s.comissaoCls)} />
                  </div>
                </div>
                {s.rodape && (
                  <p className="text-[10.5px] text-muted-foreground mt-2 pt-2 border-t border-border/40">
                    {s.rodape}
                  </p>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* ── Meta de Pix do setor (líder+): quanto falta e projeção ──
          Não se mistura com a meta de recebimento: o valor do Pix já entra no
          recebimento pelo analítico, e somar de novo contaria duas vezes. */}
      {!loading && podeVerDeOutros && blocosMetaPix.map(b => (
        <PixMetaPainel
          key={b.setorId}
          consolidado={b.consolidado}
          nomeSetor={b.nome}
          equipes={b.equipes}
          metasAtuais={b.metasAtuais}
          podeEditar={podeEditarConfig}
          salvando={salvandoMetaPix}
          onSalvar={(equipeId, valor, acordos) =>
            salvarMetaPix(b.setorId, equipeId, valor, acordos)}
          parseValor={parseCurrencyInput}
        />
      ))}

      {/* ── Comissão dobrada do operador ──
          O lugar dela para o operador (16/10/2026): ele abre a tela para
          registrar, e os dois requisitos ficam à vista junto dos totais, como
          eram antes das sub-abas. A sub-aba «Premiação dobrada» só repetia
          este card e saiu da lista dele. Para quem vê o Pix dos outros, o
          lugar continua sendo a sub-aba da premiação. */}
      {!loading && !podeVerDeOutros && (
        <PixComissaoDobrada dobra={dobra} projecao={bonusMeta?.projecao ?? null} />
      )}

      {/* O operador não anota saldo, mas precisa saber que há um no nome dele —
          senão o próximo Pix chega com valor diferente e ninguém explicou. */}
      {!loading && !podeAjustarSaldo && saldos.length > 0 && (
        <Card className="border-primary/25 bg-primary/5">
          <CardContent className="p-3 flex items-start gap-2">
            <Scale className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <div className="space-y-0.5 min-w-0">
              <p className="text-xs font-semibold text-foreground">
                Há correção de valor pendente para você
              </p>
              {saldos.map(s => (
                <p key={s.id} className="text-[11px] text-muted-foreground">
                  {s.valor > 0
                    ? `A empresa vai somar ${formatCurrency(s.valor)} num próximo pagamento`
                    : `A empresa vai descontar ${formatCurrency(Math.abs(s.valor))} num próximo pagamento`}
                  {s.motivo ? ` — ${s.motivo}` : ''}
                </p>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Aviso do prazo dos desaprovados ──
          O operador é notificado na hora da desaprovação; aqui fica o lembrete
          de que a linha some sozinha, para ele não achar que sumiu por engano. */}
      {!loading && meusDesaprovados > 0 && (
        <div className="rounded-lg border border-red-500/25 bg-red-500/[0.05] px-3 py-2 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-red-700 dark:text-red-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-muted-foreground">
            Você tem <strong className="text-red-700 dark:text-red-400">{meusDesaprovados}</strong> registro
            {meusDesaprovados !== 1 ? 's' : ''} desaprovado{meusDesaprovados !== 1 ? 's' : ''}.
            Registro desaprovado é excluído automaticamente{' '}
            <strong className="text-foreground">{PIX_DIAS_UTEIS_EXPURGO} dias úteis</strong>{' '}
            depois da avaliação — confira o motivo com o líder antes disso. Depois de
            excluído, o NR volta a ficar livre para ser registrado de novo.
          </p>
        </div>
      )}

      {/* ── Filtros ── */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/70 pointer-events-none" />
          <Input placeholder={podeVerDeOutros ? 'Buscar por NR ou operador...' : 'Buscar por NR...'}
            value={busca} onChange={e => setBusca(e.target.value)}
            className="pl-9 pr-8 h-9 text-sm rounded-lg" />
          {busca && (
            <button className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setBusca('')}>
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <Select value={filtroStatus} onValueChange={v => setFiltroStatus(v as typeof filtroStatus)}>
          <SelectTrigger className="h-9 w-36 text-xs rounded-lg"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            <SelectItem value="pendente">Pendentes</SelectItem>
            <SelectItem value="aprovado">Aprovados</SelectItem>
            <SelectItem value="desaprovado">Desaprovados</SelectItem>
          </SelectContent>
        </Select>

        {/* Pagamento: também para o operador — é a pergunta "o que já caiu?". */}
        <Select value={filtroPagamento} onValueChange={v => setFiltroPagamento(v as FiltroPagamento)}>
          <SelectTrigger className="h-9 w-36 text-xs rounded-lg">
            <Banknote className="w-3 h-3 mr-1 shrink-0" /><SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Pago e a pagar</SelectItem>
            <SelectItem value="pago">Já pagos</SelectItem>
            <SelectItem value="a_pagar">A pagar</SelectItem>
          </SelectContent>
        </Select>

        {/* Período de registro. Vazio = sem recorte, que é o padrão de sempre.
            Usa o MESMO `DatePickerField` da lista de acordos (o calendário em
            popover, com os meses em português) em vez do `input type="date"`
            nativo: são duas datas na mesma tela e a operação já conhece aquele.
            `minDate` na data final impede escolher um fim antes do começo —
            período invertido só devolveria lista vazia sem dizer por quê. */}
        <div className="flex items-center gap-1">
          <DatePickerField
            value={dataDe}
            onChange={setDataDe}
            triggerClassName="h-9 w-36 rounded-lg"
            placeholder="Data inicial"
          />
          <span className="text-[11px] text-muted-foreground px-0.5">até</span>
          <DatePickerField
            value={dataAte}
            onChange={setDataAte}
            minDate={dataDe || undefined}
            triggerClassName="h-9 w-36 rounded-lg"
            placeholder="Data final"
          />
          {(dataDe || dataAte) && (
            <button
              type="button"
              onClick={() => { setDataDe(''); setDataAte(''); }}
              title="Limpar o período"
              className="h-9 w-9 flex items-center justify-center rounded-lg border border-input text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {podeVerDeOutros && (
          <>
            {/* O setor saiu daqui e virou a barra do topo (`PixBarraSetores`):
                ele rege painéis, fila de NRs e tabela, e dois controles para o
                mesmo estado é pior que um mal colocado. */}
            <Select value={filtroEquipe || '__todas__'}
              onValueChange={v => setFiltroEquipe(v === '__todas__' ? '' : v)}>
              <SelectTrigger className="h-9 w-40 text-xs rounded-lg">
                <Layers className="w-3 h-3 mr-1 shrink-0" /><SelectValue />
              </SelectTrigger>
              {/* Só as equipes do setor em foco — escolher «Play 3» e continuar
                  vendo as equipes de todos os setores era o defeito relatado. */}
              <SelectContent>
                <SelectItem value="__todas__">Todas as equipes</SelectItem>
                {equipesDoFoco.map(eq => <SelectItem key={eq.id} value={eq.id}>{eq.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filtroOperador || '__todos__'}
              onValueChange={v => setFiltroOperador(v === '__todos__' ? '' : v)}>
              <SelectTrigger className="h-9 w-44 text-xs rounded-lg">
                <User className="w-3 h-3 mr-1 shrink-0" /><SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__todos__">Todos os operadores</SelectItem>
                {operadoresDoSeletor.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </>
        )}
      </div>

      {/* ── Bônus do período: aviso para todos, gestão para quem configura ── */}
      {empresa?.id && perfil?.id && (
        <PixBonusPainel
          empresaId={empresa.id}
          setores={setoresDoFiltro}
          setoresDoAviso={setorFoco
            ? [setorFoco]
            : (podeVerTodosSetores ? setoresDoFiltro.map(s => s.id) : (meuSetor ? [meuSetor] : []))}
          pctPorSetor={pctPorSetor}
          podeEditar={podeEditarConfig}
          autorId={perfil.id}
          autorNome={perfil.nome ?? perfil.email ?? '—'}
          onMudou={carregar}
        />
      )}

      {/* ── Configuração do setor (líder+): % de comissão + registro manual ── */}
      {podeEditarConfig && setorConfig && <PixConfigSetor pix={pix} />}

      {/* ── Barra de ação em lote (líder) ── */}
      <PixBarraLote pix={pix} />

      <PixTabelaRegistros pix={pix} />
    </>
  );
}
