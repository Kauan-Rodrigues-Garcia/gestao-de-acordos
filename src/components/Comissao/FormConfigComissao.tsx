/**
 * FormConfigComissao — uma configuração de comissão (padrão do setor ou exceção).
 *
 * ## Grava sozinho
 *
 * Como o resto da tela de Metas: campo de número grava ao perder o foco; escolha
 * de opção grava 800 ms depois da última mexida. A unidade de gravação é a
 * configuração inteira — `fn_comissao_salvar` substitui as faixas de uma vez.
 *
 * O que decide SE grava mora em `rascunhoConfig.ts`, testado: faixa sem
 * percentual não vai, exceção nunca leva a regra do setor, e reformatar um campo
 * não escreve nada.
 *
 * ## Prêmio em reais (26/10/2026)
 *
 * Na faixa em que todo mundo da configuração tem a mesma meta, digita-se o
 * prêmio na meta (R$ 300,00) e grava-se o percentual que o paga (0,333333%) —
 * a conta mora em `premio.ts`. O percentual aparece ao lado, curto.
 *
 * «Preencher por: Valor (R$) | Porcentagem (%)» é a escolha de quem configura,
 * lembrada entre as telas. Sem meta comum em faixa nenhuma, só a porcentagem
 * faz sentido, e o valor fica desligado com o porquê.
 *
 * ## Outra pessoa salvou
 *
 * As configurações chegam em tempo real. Se o servidor mudar e este formulário
 * não tiver edição pendente, ele acompanha; com edição pendente, a edição local
 * fica — sobrescrever o que alguém está digitando seria pior que gravar por cima
 * depois.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, Loader2, Plus, TriangleAlert, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useEstadoLembrado } from '@/hooks/useEstadoLembrado';
import { chaveDeCache } from '@/lib/cacheInstantaneo';
import { formatBRL } from '@/lib/money';
import { cn } from '@/lib/utils';
import type { ConfigComissao, ModoIndireta, RegraSetor } from '@/services/comissao/comissao';
import { salvarConfig } from '@/services/comissao/comissao.service';
import { formatarPct, lerPct, lerReais, mascararReais, paraCampo, reaisParaCampo } from './formato';
import { pctDoPremio, premioDoPct } from './premio';
import {
  assinaturaDo, comFaixaNova, faixasSemPct, payloadDe, rascunhoDe, semFaixa,
  type AlvoConfig, type RascunhoConfig, type RascunhoFaixa,
} from './rascunhoConfig';

type Estado = 'salvando' | 'salvo' | 'erro' | null;

interface FormConfigComissaoProps {
  /** A configuração gravada. `null` = ainda não existe. */
  config: ConfigComissao | null;
  alvo: AlvoConfig;
  ehPadrao: boolean;
  isPaguePlay: boolean;
  /** A regra da linha do setor — decide se o % especial aparece nas exceções. */
  regraDoSetor: RegraSetor;
  desabilitado: boolean;
  /**
   * A meta de cada faixa, quando é a mesma para todos da configuração; `null`
   * na faixa em que diverge. Ausente = sem prêmio em reais (ver `premio.ts`).
   */
  metasReferencia?: readonly (number | null)[];
  onSalvo?: () => void;
}

function SeloEstado({ estado }: { estado: Estado }) {
  if (!estado) return null;
  return (
    <span className={cn(
      'inline-flex items-center gap-1 text-[11px]',
      estado === 'erro' ? 'text-destructive' : 'text-muted-foreground',
    )}>
      {estado === 'salvando' && (<><Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> salvando…</>)}
      {estado === 'salvo' && (<><Check className="h-3 w-3 text-emerald-600 dark:text-emerald-500" aria-hidden="true" /> salvo</>)}
      {estado === 'erro' && (<><TriangleAlert className="h-3 w-3" aria-hidden="true" /> não salvo</>)}
    </span>
  );
}

function CampoPct({ rotulo, valor, invalido, desabilitado, visivel, onMudar, onSair }: {
  rotulo: string;
  valor: string;
  invalido?: boolean;
  desabilitado: boolean;
  /** Mostra o rótulo ao lado; na tabela o cabeçalho da coluna já rotula. */
  visivel?: boolean;
  onMudar: (v: string) => void;
  onSair: () => void;
}) {
  return (
    <label className="inline-flex items-center gap-1.5">
      {visivel && <span className="text-xs text-muted-foreground">{rotulo}</span>}
      <Input
        inputMode="decimal"
        placeholder="0,00"
        aria-label={visivel ? undefined : rotulo}
        aria-invalid={invalido || undefined}
        className={cn('h-8 w-24 text-right text-sm tabular-nums', invalido && 'border-amber-500')}
        value={valor}
        disabled={desabilitado}
        onChange={e => onMudar(e.target.value)}
        onBlur={onSair}
      />
      <span className="text-xs text-muted-foreground" aria-hidden="true">%</span>
    </label>
  );
}

/** O prêmio na meta, em reais; o percentual que ele vira aparece ao lado. */
function CampoPremio({ rotulo, valor, pct, desabilitado, onMudar, onSair }: {
  rotulo: string;
  valor: string;
  /** O percentual gravado — o que de fato vai para o banco. */
  pct: number | null;
  desabilitado: boolean;
  onMudar: (v: string) => void;
  onSair: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-xs text-muted-foreground" aria-hidden="true">R$</span>
      <Input
        inputMode="numeric"
        placeholder="0,00"
        aria-label={rotulo}
        className="h-8 w-28 text-right text-sm tabular-nums"
        value={valor}
        disabled={desabilitado}
        onChange={e => onMudar(e.target.value)}
        onBlur={onSair}
      />
      <span className="w-16 text-[11px] tabular-nums text-muted-foreground">{pct === null ? '' : formatarPct(pct)}</span>
    </span>
  );
}

type PreencherPor = 'reais' | 'pct';

/** «Preencher por»: o valor do prêmio ou a porcentagem. */
function EscolhaPreenchimento({ valor, reaisDesligado, onEscolher }: {
  valor: PreencherPor;
  /** Sem meta comum: o motivo, mostrado no botão desligado. */
  reaisDesligado: string | null;
  onEscolher: (v: PreencherPor) => void;
}) {
  const botao = (v: PreencherPor, rotulo: string, desligado: boolean, titulo?: string) => (
    <button
      type="button"
      aria-pressed={valor === v}
      disabled={desligado}
      title={titulo}
      onClick={() => onEscolher(v)}
      className={cn(
        'h-7 rounded-md px-2.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        valor === v ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {rotulo}
    </button>
  );
  return (
    <div className="inline-flex items-center gap-2">
      <span className="text-xs text-muted-foreground">Preencher por</span>
      <div role="group" aria-label="Preencher por" className="inline-flex rounded-lg bg-muted p-0.5">
        {botao('reais', 'Valor (R$)', reaisDesligado !== null, reaisDesligado ?? undefined)}
        {botao('pct', 'Porcentagem (%)', false)}
      </div>
    </div>
  );
}

function Opcao<T extends string>({ nome, valor, atual, rotulo, onEscolher }: {
  nome: string; valor: T; atual: T; rotulo: string; onEscolher: (v: T) => void;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-1.5">
      <input
        type="radio"
        name={nome}
        value={valor}
        checked={atual === valor}
        onChange={() => onEscolher(valor)}
        className="h-3.5 w-3.5 cursor-pointer accent-primary disabled:cursor-not-allowed"
      />
      <span>{rotulo}</span>
    </label>
  );
}

export function FormConfigComissao({
  config, alvo, ehPadrao, isPaguePlay, regraDoSetor, desabilitado, metasReferencia, onSalvo,
}: FormConfigComissaoProps) {
  const id = useId();
  const doServidor = useMemo(() => (config ? rascunhoDe(config) : null), [config]);

  const [rascunho, setRascunho] = useState<RascunhoConfig>(() => doServidor ?? rascunhoDe(null));
  const [estado, setEstado] = useState<Estado>(null);

  /** O que o banco tem desta configuração, como assinatura. */
  const assinaturaSalva = useRef<string | null>(doServidor ? assinaturaDo(doServidor) : null);
  /** O rascunho mais recente — gravar lê daqui, e não da versão de quando o blur foi montado. */
  const ultimo = useRef(rascunho);
  ultimo.current = rascunho;

  useEffect(() => {
    if (!doServidor) return;
    const nova = assinaturaDo(doServidor);
    if (nova === assinaturaSalva.current) return;
    const temEdicaoPendente = assinaturaDo(ultimo.current) !== assinaturaSalva.current;
    assinaturaSalva.current = nova;
    if (!temEdicaoPendente) setRascunho(doServidor);
  }, [doServidor]);

  const gravar = useCallback(async () => {
    if (desabilitado) return;
    const atual = ultimo.current;
    const assinatura = assinaturaDo(atual);
    if (assinatura === assinaturaSalva.current) return;

    // Faixa sem percentual: o aviso abaixo da tabela diz qual.
    const payload = payloadDe(atual, alvo);
    if (!payload) return;

    setEstado('salvando');
    const r = await salvarConfig(payload);
    if (!r.ok) {
      setEstado('erro');
      toast.error('A comissão não foi salva', { description: r.erro });
      return;
    }
    assinaturaSalva.current = assinatura;
    setEstado('salvo');
    onSalvo?.();
  }, [desabilitado, alvo, onSalvo]);

  const temporizador = useRef<number | null>(null);
  const agendar = useCallback(() => {
    if (temporizador.current) window.clearTimeout(temporizador.current);
    temporizador.current = window.setTimeout(() => { void gravar(); }, 800);
  }, [gravar]);
  useEffect(() => () => {
    if (temporizador.current) window.clearTimeout(temporizador.current);
  }, []);

  // O «salvo» confirma e some; não fica de enfeite.
  useEffect(() => {
    if (estado !== 'salvo') return;
    const t = window.setTimeout(() => setEstado(e => (e === 'salvo' ? null : e)), 2_500);
    return () => window.clearTimeout(t);
  }, [estado]);

  const mudar = (patch: Partial<RascunhoConfig>) => setRascunho(r => ({ ...r, ...patch }));
  const mudarFaixa = (indice: number, patch: Partial<RascunhoFaixa>) =>
    setRascunho(r => ({ ...r, faixas: r.faixas.map((f, i) => (i === indice ? { ...f, ...patch } : f)) }));

  const regraVigente = ehPadrao ? rascunho.regraSetor : regraDoSetor;
  const mostraEspecial = regraVigente === 'percentual_especial';
  const semPct = faixasSemPct(rascunho);

  // ── Prêmio em reais ──────────────────────────────────────────────────────
  const temReferencia = (metasReferencia ?? []).some(m => m !== null);
  const [preencherPor, setPreencherPor] = useEstadoLembrado<PreencherPor>(
    chaveDeCache('comissao', 'preencher-por'), 'reais',
  );
  const usaReais = temReferencia && preencherPor === 'reais';
  const reaisDesligado = temReferencia ? null
    : metasReferencia && metasReferencia.length > 0
      ? 'As pessoas desta configuração têm metas diferentes, e o mesmo % pagaria um prêmio diferente para cada uma: preencha pela porcentagem.'
      : 'Ninguém desta configuração tem uma meta comum neste mês para converter o valor: preencha pela porcentagem.';
  /** O texto do campo de reais enquanto se digita — `índice:campo`. Fora disso, vem do percentual. */
  const [digitando, setDigitando] = useState<Record<string, string>>({});
  const metaDaFaixa = (i: number) => (usaReais ? metasReferencia?.[i] ?? null : null);

  const campoPremio = (i: number, f: RascunhoFaixa, campo: 'pct' | 'pctEspecial', meta: number, rotulo: string) => {
    const chave = `${i}:${campo}`;
    const pct = lerPct(f[campo]);
    return (
      <CampoPremio
        rotulo={rotulo}
        valor={digitando[chave] ?? reaisParaCampo(premioDoPct(pct, meta))}
        pct={pct}
        desabilitado={desabilitado}
        onMudar={texto => {
          const mascarado = mascararReais(texto);
          setDigitando(d => ({ ...d, [chave]: mascarado }));
          const premio = lerReais(mascarado);
          mudarFaixa(i, { [campo]: premio === null ? '' : paraCampo(pctDoPremio(premio, meta)) });
        }}
        onSair={() => {
          setDigitando(({ [chave]: _, ...resto }) => resto);
          void gravar();
        }}
      />
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <EscolhaPreenchimento
          valor={usaReais ? 'reais' : 'pct'}
          reaisDesligado={reaisDesligado}
          onEscolher={setPreencherPor}
        />
        <SeloEstado estado={estado} />
      </div>
      <p className="text-xs text-muted-foreground">
        {usaReais
          ? 'Digite o valor do prêmio em cada meta; a porcentagem sai dele (prêmio ÷ meta).'
          : reaisDesligado
            ? `Valor (R$) indisponível aqui. ${reaisDesligado}`
            : 'O valor de cada faixa é a meta do operador; aqui fica a porcentagem.'}
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="py-1 pr-3 font-medium">Faixa</th>
              {usaReais && <th className="py-1 pr-3 font-medium">Meta</th>}
              <th className="py-1 pr-3 font-medium">{usaReais ? 'Prêmio' : '% normal'}</th>
              {mostraEspecial && (
                <th className="py-1 pr-3 font-medium">
                  {usaReais ? 'Prêmio quando o setor bate a meta' : '% quando o setor bate a meta'}
                </th>
              )}
              <th className="py-1"><span className="sr-only">Remover</span></th>
            </tr>
          </thead>
          <tbody>
            {rascunho.faixas.map((f, i) => {
              const meta = metaDaFaixa(i);
              return (
                <tr key={f.ordem} className="border-t border-border/60">
                  <td className="whitespace-nowrap py-1.5 pr-3 font-medium">{f.ordem}ª Meta</td>
                  {usaReais && (
                    <td className="whitespace-nowrap py-1.5 pr-3 text-xs tabular-nums text-muted-foreground">
                      {meta === null ? 'metas diferentes' : formatBRL(meta)}
                    </td>
                  )}
                  <td className="py-1.5 pr-3">
                    {meta !== null
                      ? campoPremio(i, f, 'pct', meta, `Prêmio da ${f.ordem}ª Meta`)
                      : (
                        <CampoPct
                          rotulo={`% normal da ${f.ordem}ª Meta`}
                          valor={f.pct}
                          invalido={semPct.includes(f.ordem)}
                          desabilitado={desabilitado}
                          onMudar={v => mudarFaixa(i, { pct: v })}
                          onSair={() => void gravar()}
                        />
                      )}
                  </td>
                  {mostraEspecial && (
                    <td className="py-1.5 pr-3">
                      {meta !== null
                        ? campoPremio(i, f, 'pctEspecial', meta, `Prêmio da ${f.ordem}ª Meta quando o setor bate a meta`)
                        : (
                          <CampoPct
                            rotulo={`% especial da ${f.ordem}ª Meta`}
                            valor={f.pctEspecial}
                            desabilitado={desabilitado}
                            onMudar={v => mudarFaixa(i, { pctEspecial: v })}
                            onSair={() => void gravar()}
                          />
                        )}
                    </td>
                  )}
                  <td className="py-1.5 text-right">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      aria-label={`Remover a ${f.ordem}ª Meta`}
                      disabled={desabilitado || rascunho.faixas.length <= 1}
                      onClick={() => { setRascunho(r => semFaixa(r, i)); agendar(); }}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 gap-1 text-xs"
          disabled={desabilitado || rascunho.faixas.length >= 20}
          onClick={() => setRascunho(r => comFaixaNova(r))}
        >
          <Plus className="h-3.5 w-3.5" /> {`Adicionar ${rascunho.faixas.length + 1}ª Meta`}
        </Button>
        {semPct.length > 0 && (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            {`Preencha ${usaReais ? 'o prêmio ou o %' : 'o %'} da ${semPct.map(o => `${o}ª`).join(', ')} Meta para salvar.`}
          </p>
        )}
      </div>

      {ehPadrao && (
        <fieldset disabled={desabilitado} className="space-y-2">
          <legend className="text-xs font-semibold">Quando o setor bate a meta</legend>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <Opcao<RegraSetor>
              nome={`regra-${id}`} valor="nenhuma" atual={rascunho.regraSetor} rotulo="Nada muda"
              onEscolher={v => { mudar({ regraSetor: v }); agendar(); }}
            />
            <Opcao<RegraSetor>
              nome={`regra-${id}`} valor="percentual_especial" atual={rascunho.regraSetor} rotulo="% especial por faixa"
              onEscolher={v => { mudar({ regraSetor: v }); agendar(); }}
            />
            <Opcao<RegraSetor>
              nome={`regra-${id}`} valor="multiplicador" atual={rascunho.regraSetor} rotulo="Multiplicador"
              onEscolher={v => { mudar({ regraSetor: v }); agendar(); }}
            />
            {rascunho.regraSetor === 'multiplicador' && (
              <label className="inline-flex items-center gap-1.5">
                <Input
                  inputMode="decimal"
                  placeholder="2"
                  aria-label="Multiplicador"
                  className="h-8 w-16 text-right text-sm tabular-nums"
                  value={rascunho.multiplicador}
                  onChange={e => mudar({ multiplicador: e.target.value })}
                  onBlur={() => void gravar()}
                />
                <span className="text-xs text-muted-foreground" aria-hidden="true">×</span>
              </label>
            )}
          </div>
        </fieldset>
      )}

      {isPaguePlay && (
        <fieldset disabled={desabilitado} className="space-y-2">
          <legend className="text-xs font-semibold">Operador com meta direta e indireta</legend>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <Opcao<ModoIndireta>
              nome={`indireta-${id}`} valor="junto" atual={rascunho.modoIndireta}
              rotulo="Junto — as faixas medem direta + indireta"
              onEscolher={v => { mudar({ modoIndireta: v }); agendar(); }}
            />
            <Opcao<ModoIndireta>
              nome={`indireta-${id}`} valor="separado" atual={rascunho.modoIndireta}
              rotulo="Separado — a indireta paga à parte"
              onEscolher={v => { mudar({ modoIndireta: v }); agendar(); }}
            />
          </div>
          {rascunho.modoIndireta === 'separado' && (
            <div className="flex flex-wrap items-center gap-4">
              <CampoPct
                visivel rotulo="% da indireta" valor={rascunho.pctIndireta} desabilitado={desabilitado}
                onMudar={v => mudar({ pctIndireta: v })} onSair={() => void gravar()}
              />
              {mostraEspecial && (
                <CampoPct
                  visivel rotulo="% especial da indireta" valor={rascunho.pctIndiretaEspecial}
                  desabilitado={desabilitado}
                  onMudar={v => mudar({ pctIndiretaEspecial: v })} onSair={() => void gravar()}
                />
              )}
            </div>
          )}
        </fieldset>
      )}
    </div>
  );
}
