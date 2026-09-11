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
import { cn } from '@/lib/utils';
import type { ConfigComissao, ModoIndireta, RegraSetor } from '@/services/comissao/comissao';
import { salvarConfig } from '@/services/comissao/comissao.service';
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
      {estado === 'salvo' && (<><Check className="h-3 w-3 text-emerald-500" aria-hidden="true" /> salvo</>)}
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
        className={cn('h-8 w-20 text-right text-sm tabular-nums', invalido && 'border-amber-500')}
        value={valor}
        disabled={desabilitado}
        onChange={e => onMudar(e.target.value)}
        onBlur={onSair}
      />
      <span className="text-xs text-muted-foreground" aria-hidden="true">%</span>
    </label>
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
  config, alvo, ehPadrao, isPaguePlay, regraDoSetor, desabilitado, onSalvo,
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          O valor de cada faixa é a meta do operador; aqui fica o percentual.
        </p>
        <SeloEstado estado={estado} />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="py-1 pr-3 font-medium">Faixa</th>
              <th className="py-1 pr-3 font-medium">% normal</th>
              {mostraEspecial && <th className="py-1 pr-3 font-medium">% quando o setor bate a meta</th>}
              <th className="py-1"><span className="sr-only">Remover</span></th>
            </tr>
          </thead>
          <tbody>
            {rascunho.faixas.map((f, i) => (
              <tr key={f.ordem} className="border-t border-border/60">
                <td className="whitespace-nowrap py-1.5 pr-3 font-medium">{f.ordem}ª Meta</td>
                <td className="py-1.5 pr-3">
                  <CampoPct
                    rotulo={`% normal da ${f.ordem}ª Meta`}
                    valor={f.pct}
                    invalido={semPct.includes(f.ordem)}
                    desabilitado={desabilitado}
                    onMudar={v => mudarFaixa(i, { pct: v })}
                    onSair={() => void gravar()}
                  />
                </td>
                {mostraEspecial && (
                  <td className="py-1.5 pr-3">
                    <CampoPct
                      rotulo={`% especial da ${f.ordem}ª Meta`}
                      valor={f.pctEspecial}
                      desabilitado={desabilitado}
                      onMudar={v => mudarFaixa(i, { pctEspecial: v })}
                      onSair={() => void gravar()}
                    />
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
            ))}
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
            {`Preencha o % da ${semPct.map(o => `${o}ª`).join(', ')} Meta para salvar.`}
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
