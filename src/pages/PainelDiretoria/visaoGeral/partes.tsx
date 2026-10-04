/**
 * As peças da Visão geral: a fileira de cima (geral e cidades), o gráfico do
 * mês, as formas de pagamento, o que está fora da conta, o disjuntor do Cofen
 * e a faixa H.O./Coren/Cofen. Quem orquestra (cidade aberta, dia aberto, modo
 * do Cofen) é `VisaoGeralPorCidade`.
 */
import { memo, useId, useMemo, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatBRL } from '@/lib/money';
import { ValorAnimado } from '@/components/ValorAnimado';
import { Switch } from '@/components/ui/switch';
import { agruparFormas, corDaForma } from '@/lib/formasPagamento';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { estimativaDeFechamento, type DiaDaSerie, type FormaDePagamento } from '@/services/mestre/diretoria.service';
import {
  classificarCarteira, type CarteiraDaCidade, type MotivoDeNaoContar, type RegraDaCarteira,
} from '@/services/mestre/diretoriaCidades.service';
import {
  ehFimDeSemana, nomeDoMes, variacaoPct, type CidadeDaVisao, type EscopoDaVisao, type ModoCofen, type ParteDoGeral,
} from './modelo';
import { corDaMarca, mil, milhoes, pct, rotuloModo, sinal } from './formato';


/** O valor grande dos cartões: «R$» pequeno e o número rolando até o novo. */
function ValorGrande({ valor }: { valor: number }) {
  return (
    <>
      <small>R$</small>
      <ValorAnimado valor={valor} formatar={v => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} />
    </>
  );
}

// ── O disjuntor do Cofen ────────────────────────────────────────────────────

/**
 * H.O. ⇄ bruto para tudo que é Cofen. Começa sempre em H.O. — o número que a
 * operação acompanha — e troca cada valor da tela que tem Cofen dentro.
 */
export function DisjuntorCofen({ modo, onTrocar }: { modo: ModoCofen; onTrocar: (m: ModoCofen) => void }) {
  const id = useId();
  return (
    <div className="vg-disjuntor" title="Os valores Cofen em H.O. (o que fica com a operação) ou em bruto (o que entrou)">
      <span className="vg-disjuntor-rot">Cofen</span>
      <label htmlFor={id} className={cn(modo === 'ho' && 'vg-on')}>H.O.</label>
      <Switch id={id} checked={modo === 'bruto'} onCheckedChange={v => onTrocar(v ? 'bruto' : 'ho')}
        aria-label="Mostrar os valores Cofen em bruto" className="vg-disjuntor-chave" />
      <label htmlFor={id} className={cn(modo === 'bruto' && 'vg-on')}>Bruto</label>
    </div>
  );
}

// ── Geral ───────────────────────────────────────────────────────────────────

const COR_DA_CARTEIRA_NO_ESCURO: Record<ParteDoGeral['chave'], string> = {
  nosso_produto: 'rgb(255 255 255 / .82)',
  cofen: 'var(--vg-cofen)',
};

export const CartaoGeral = memo(function CartaoGeral({ mes, carteiras, modo, mesAnterior, diaCorte, diasNoMes, recolhido }: {
  mes: EscopoDaVisao; carteiras: ParteDoGeral[]; modo: ModoCofen; mesAnterior: string; diaCorte: number; diasNoMes: number;
  recolhido: boolean;
}) {
  const v = variacaoPct(mes.valor, mes.valorAnterior);
  const fecha = estimativaDeFechamento(mes.valor, diaCorte, diasNoMes);
  return (
    <div className={cn('vg-geral', recolhido && 'vg-recolhe')} aria-hidden={recolhido}>
      <span className="vg-rot">Recebido no mês · geral</span>
      <div className="vg-valor"><ValorGrande valor={mes.valor} /></div>
      <div className="vg-linhas">
        <div><span>Mesmo dia de {nomeDoMes(mesAnterior)}</span>
          <b>{formatBRL(mes.valorAnterior)} {v !== null && <span className={v >= 0 ? 'vg-sobe' : 'vg-desce'}>{sinal(v)}</span>}</b></div>
        {fecha !== null && diaCorte < diasNoMes && <div><span>No ritmo de hoje, fecha o mês em</span><b>{milhoes(fecha)}</b></div>}
        <div><span>Pagamentos · operadores</span><b>{mes.linhas.toLocaleString('pt-BR')} · {mes.operadores}</b></div>
      </div>
      {mes.valor > 0 && (
        <>
          {/* De qual carteira vem o dinheiro. */}
          <div className="vg-divisao" aria-hidden="true">
            {carteiras.map(p => <i key={p.chave} style={{ width: `${(p.valor / mes.valor) * 100}%`, background: COR_DA_CARTEIRA_NO_ESCURO[p.chave] }} />)}
          </div>
          <div className="vg-legenda">
            {carteiras.map(p => (
              <span key={p.chave}>
                <span className="vg-ponto" style={{ background: COR_DA_CARTEIRA_NO_ESCURO[p.chave] }} />
                {p.nome}{p.chave === 'cofen' ? ` (${rotuloModo(modo)})` : ''} <b>{pct((p.valor / mes.valor) * 100)}</b>
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
});

// ── Cidade ──────────────────────────────────────────────────────────────────

/** As duas carteiras da cidade, quando ela tem Cofen: cada uma com o seu valor. */
function CarteirasDaCidade({ cidade, modo }: { cidade: CidadeDaVisao; modo: ModoCofen }) {
  const c = cidade.cofen;
  if (!c) return null;
  const total = Math.max(1e-9, cidade.mes.valor);
  return (
    <div className="vg-carteiras-cid">
      <div className="vg-barra2" aria-hidden="true">
        <i style={{ width: `${(cidade.mes.nossoProduto / total) * 100}%`, background: 'var(--cc)' }} />
        <i style={{ width: `${(c.valor / total) * 100}%`, background: 'var(--vg-cofen)' }} />
      </div>
      <div className="vg-carteira-l"><span><span className="vg-ponto" style={{ background: 'var(--cc)' }} />Nosso produto</span>
        <b><ValorAnimado valor={cidade.mes.nossoProduto} formatar={formatBRL} /></b></div>
      <div className="vg-carteira-l vg-c"><span><span className="vg-ponto" style={{ background: 'var(--vg-cofen)' }} />{c.nome} · Cofen <small>{rotuloModo(modo)}</small></span>
        <b><ValorAnimado valor={c.valor} formatar={formatBRL} /></b></div>
    </div>
  );
}

export const CartaoCidade = memo(function CartaoCidade({ cidade, modo, mesAnterior, diaCorte, diasNoMes, aberta, recolhida, onAbrir, onFechar }: {
  cidade: CidadeDaVisao; modo: ModoCofen; mesAnterior: string; diaCorte: number; diasNoMes: number;
  aberta: boolean; recolhida: boolean; onAbrir: () => void; onFechar: () => void;
}) {
  const m = cidade.mes;
  const v = variacaoPct(m.valor, m.valorAnterior);
  const fecha = estimativaDeFechamento(m.valor, diaCorte, diasNoMes);
  const nSetores = cidade.setores.length + (cidade.cofen ? 1 : 0);
  const abrirPorTecla = (e: KeyboardEvent<HTMLDivElement>) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); onAbrir(); }
  };
  return (
    <div
      className={cn('vg-cidade', cidade.marca, aberta && 'vg-aberta', recolhida && 'vg-recolhe')}
      role="button" tabIndex={recolhida ? -1 : 0} aria-expanded={aberta} aria-hidden={recolhida}
      aria-label={aberta ? undefined : `Abrir ${cidade.nome}`}
      onClick={() => { if (!aberta) onAbrir(); }} onKeyDown={abrirPorTecla}
      style={{ ['--parte' as string]: cidade.participacao } as CSSProperties}
    >
      <span className="vg-abrir">Abrir →</span>
      <button type="button" className="vg-fechar" aria-label="Voltar ao geral" tabIndex={aberta ? 0 : -1}
        onClick={e => { e.stopPropagation(); onFechar(); }}>
        <X className="w-4 h-4" />
      </button>
      <div className="vg-corpo">
        <div>
          <span className="vg-rot"><span className="vg-ponto" style={{ background: corDaMarca(cidade.marca) }} />
            {cidade.nome}{cidade.rotuloMarca ? ` · ${cidade.rotuloMarca}` : ''}</span>
          <div className="vg-valor"><ValorGrande valor={m.valor} /></div>
          {v !== null && <span className="vg-var">{sinal(v)} sobre {nomeDoMes(mesAnterior)}</span>}
          <CarteirasDaCidade cidade={cidade} modo={modo} />
          <div className="vg-rodape">
            <span><b>{nSetores}</b> setores</span>
            <span><b>{m.operadores}</b> operadores</span>
            {cidade.melhorSetor && <span>melhor: <b>{cidade.melhorSetor.nome}</b></span>}
          </div>
        </div>
        <div className="vg-extra" aria-hidden={!aberta}>
          <div className="vg-participa"><span>Participação no geral</span><b>{pct(cidade.participacao * 100)}</b></div>
          <div className="vg-trilho"><i /></div>
          <div className="vg-mini">
            <div><small>Mesmo dia {nomeDoMes(mesAnterior).slice(0, 3)}.</small><b>{mil(m.valorAnterior)}</b></div>
            <div><small>{diaCorte < diasNoMes ? 'Fecha em' : 'Fechou em'}</small><b>{fecha !== null ? milhoes(fecha) : '—'}</b></div>
            <div><small>Pagamentos</small><b>{m.linhas.toLocaleString('pt-BR')}</b></div>
          </div>
        </div>
      </div>
    </div>
  );
});

// ── O gráfico do mês ────────────────────────────────────────────────────────

export const GraficoDoMes = memo(function GraficoDoMes({ mes, serie, diaCorte, diasNoMes, mediaAnterior, mesAnterior, diaAberto, onDia }: {
  mes: string; serie: DiaDaSerie[]; diaCorte: number; diasNoMes: number;
  mediaAnterior: number; mesAnterior: string; diaAberto: number | null; onDia?: (dia: number) => void;
}) {
  const maior = Math.max(1, mediaAnterior, ...serie.filter(d => d.dentroDoCorte).map(d => d.valor)) * 1.08;
  return (
    <>
      <div className="vg-barras" role="group" aria-label="Recebido por dia">
        {mediaAnterior > 0 && (
          <div className="vg-media" style={{ bottom: `${(mediaAnterior / maior) * 100}%` }}>
            <span>média {nomeDoMes(mesAnterior).slice(0, 3)}. {mil(mediaAnterior)}</span>
          </div>
        )}
        {Array.from({ length: diasNoMes }, (_, i) => {
          const dia = i + 1;
          const d = serie[i];
          const futuro = dia > diaCorte;
          const valor = d?.valor ?? 0;
          return (
            <button
              key={dia}
              type="button"
              disabled={futuro || !onDia}
              tabIndex={futuro || !onDia ? -1 : 0}
              className={cn('vg-col', futuro && 'vg-futuro', !futuro && ehFimDeSemana(mes, dia) && 'vg-fds',
                dia === diaCorte && 'vg-hoje', dia === diaAberto && 'vg-sel')}
              style={{ height: futuro ? '4%' : `${Math.max(2, (valor / maior) * 100)}%` }}
              data-dica={futuro ? undefined : `${dia}/${mes.slice(5)} · ${mil(valor)}`}
              aria-label={futuro ? undefined : `Dia ${dia}: ${formatBRL(valor)}${onDia ? '. Ver o resumo do dia' : ''}`}
              aria-pressed={onDia ? dia === diaAberto : undefined}
              onClick={() => onDia?.(dia)}
            />
          );
        })}
      </div>
      <div className="vg-eixo"><span>1/{mes.slice(5)}</span><span>{diaCorte < diasNoMes ? `hoje · ${diaCorte}/${mes.slice(5)}` : 'mês fechado'}</span><span>{diasNoMes}/{mes.slice(5)}</span></div>
    </>
  );
});

// ── Formas de pagamento ─────────────────────────────────────────────────────

export const FormasDoEscopo = memo(function FormasDoEscopo({ formas }: { formas: FormaDePagamento[] }) {
  const grupos = useMemo(() => agruparFormas(formas), [formas]);
  const maior = Math.max(1, ...grupos.map(g => g.valor));
  if (!grupos.length) return <p className="vg-nota">Nenhum pagamento no período.</p>;
  return (
    <div className="vg-formas">
      {grupos.map(g => (
        <div key={g.chave} className="vg-forma">
          <span title={g.rotulo}>{g.rotulo}</span>
          <div className="vg-tr"><i style={{ background: corDaForma(g.rotulo), transform: `scaleX(${g.valor / maior})` }} /></div>
          <b>{mil(g.valor)}</b>
        </div>
      ))}
    </div>
  );
});

/** As formas como uma faixa só, com legenda — no resumo do dia. */
export function PilhaDeFormas({ formas }: { formas: FormaDePagamento[] }) {
  const grupos = useMemo(() => agruparFormas(formas), [formas]);
  const total = grupos.reduce((a, g) => a + g.valor, 0);
  if (!total) return <p className="vg-nota">Nenhum pagamento no dia.</p>;
  return (
    <>
      <div className="vg-pilha">{grupos.map(g => <i key={g.chave} style={{ width: `${(g.valor / total) * 100}%`, background: corDaForma(g.rotulo) }} />)}</div>
      <div className="vg-pilha-leg">
        {grupos.map(g => <span key={g.chave}><span className="vg-ponto" style={{ background: corDaForma(g.rotulo) }} />{g.rotulo} <b>{mil(g.valor)}</b></span>)}
      </div>
    </>
  );
}

// ── Cofen ───────────────────────────────────────────────────────────────────

const COR_COREN = 'color-mix(in srgb, var(--muted-foreground) 55%, transparent)';
const COR_COFEN_REPASSE = 'color-mix(in srgb, var(--muted-foreground) 28%, transparent)';

/**
 * A faixa H.O. / Coren / Cofen — os valores das colunas do relatório de
 * conciliação, sem percentual fixo.
 */
export function PilhaCofen({ v, legenda }: { v: { bruto: number; ho: number; coren: number; cofen: number }; legenda?: boolean }) {
  const t = Math.max(1e-9, v.ho + v.coren + v.cofen);
  return (
    <>
      <div className="vg-pilha" aria-hidden="true">
        <i style={{ width: `${(v.ho / t) * 100}%`, background: 'var(--vg-cofen)' }} />
        <i style={{ width: `${(v.coren / t) * 100}%`, background: COR_COREN }} />
        <i style={{ width: `${(v.cofen / t) * 100}%`, background: COR_COFEN_REPASSE }} />
      </div>
      {legenda && (
        <div className="vg-pilha-leg">
          <span><span className="vg-ponto" style={{ background: 'var(--vg-cofen)' }} />H.O. <b>{mil(v.ho)}</b></span>
          <span><span className="vg-ponto" style={{ background: COR_COREN }} />Coren <b>{mil(v.coren)}</b></span>
          <span><span className="vg-ponto" style={{ background: COR_COFEN_REPASSE }} />Cofen <b>{mil(v.cofen)}</b></span>
        </div>
      )}
    </>
  );
}

// ── Fora da conta ───────────────────────────────────────────────────────────

const REGRAS: { valor: RegraDaCarteira; rotulo: string }[] = [
  { valor: 'nosso_produto', rotulo: 'Nosso produto' },
  { valor: 'cofen', rotulo: 'Cofen' },
];

const MOTIVO: Record<MotivoDeNaoContar, string> = {
  sem_cidade: 'sem cidade',
  setor_sem_cidade: 'setor sem cidade',
  cofen: 'regra Cofen',
};

/**
 * Cidade e regra de uma carteira sem setor, escolhidas ali mesmo — só pelo
 * super admin (20261004120000). Grava ao escolher.
 */
export function EscolhaDaCarteira({ empresaId, carteira, cidades, superAdmin, onGravou }: {
  empresaId: string; carteira: CarteiraDaCidade; cidades: { id: string; nome: string }[];
  superAdmin: boolean; onGravou: () => void;
}) {
  const [gravando, setGravando] = useState(false);
  const gravar = async (cidadeId: string | null, regra: RegraDaCarteira | null) => {
    setGravando(true);
    try {
      await classificarCarteira(empresaId, carteira.cod, cidadeId, regra);
      toast.success(`${carteira.nome}: ${cidades.find(c => c.id === cidadeId)?.nome ?? 'sem cidade'} · ${regra === 'cofen' ? 'Cofen' : 'Nosso produto'}`);
      onGravou();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível gravar.');
    } finally {
      setGravando(false);
    }
  };
  if (!superAdmin) return null;
  return (
    <div className="vg-escolha">
      <Select value={carteira.cidadeId ?? ''} disabled={gravando}
        onValueChange={v => void gravar(v || null, carteira.regra ?? 'nosso_produto')}>
        <SelectTrigger className="h-8 w-[150px] text-xs" aria-label={`Cidade da carteira ${carteira.nome}`}><SelectValue placeholder="Escolher cidade…" /></SelectTrigger>
        <SelectContent>{cidades.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
      </Select>
      <Select value={carteira.regra ?? 'nosso_produto'} disabled={gravando || !carteira.cidadeId}
        onValueChange={v => void gravar(carteira.cidadeId, v as RegraDaCarteira)}>
        <SelectTrigger className="h-8 w-[140px] text-xs" aria-label={`Regra da carteira ${carteira.nome}`}><SelectValue /></SelectTrigger>
        <SelectContent>{REGRAS.map(r => <SelectItem key={r.valor} value={r.valor}>{r.rotulo}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}

/**
 * O que do 59 não está contando, nem no geral: carteira sem cidade, setor sem
 * cidade, ou regra Cofen (o Cofen vem da conciliação). E o aviso do Cofen,
 * quando ele não pode contar.
 */
export function ForaDaConta({ empresaId, valor, carteiras, avisoCofen, cidades, superAdmin, onGravou }: {
  empresaId: string; valor: number; carteiras: CarteiraDaCidade[]; avisoCofen: string | null;
  cidades: { id: string; nome: string }[]; superAdmin: boolean; onGravou: () => void;
}) {
  return (
    <div className="vg-semcidade">
      <h3>{valor > 0 ? `${formatBRL(valor)} do 59 fora da conta` : 'Fora da conta'}</h3>
      <p>
        Só conta o que tem cidade definida. Estas carteiras do 59 não entram em lugar nenhum, nem no geral, até
        terem cidade. A regra Cofen também não conta pelo 59: o dinheiro Cofen vem do relatório de conciliação.
        {!superAdmin && ' Quem define a cidade e a regra de uma carteira é o super admin.'}
      </p>
      {avisoCofen && <p className="vg-aviso-cofen"><span className="vg-selo cofen">Cofen</span> {avisoCofen}</p>}
      {carteiras.map(k => (
        <div key={k.cod} className="vg-carteira">
          <span>
            {k.nome}{' '}
            <span className={cn('vg-selo', k.motivo === 'cofen' ? 'cofen' : 'alerta')}>{MOTIVO[k.motivo ?? 'sem_cidade']}</span>
            <span className="vg-nota" style={{ display: 'block', marginTop: 2 }}>
              cód. {k.cod} · {k.linhas} pgtos{k.motivo === 'setor_sem_cidade' && k.setorNome ? ` · o setor ${k.setorNome} está sem cidade` : ''}
            </span>
          </span>
          <b>{formatBRL(k.valor)}</b>
          {!k.setorId
            ? <EscolhaDaCarteira empresaId={empresaId} carteira={k} cidades={cidades} superAdmin={superAdmin} onGravou={onGravou} />
            : <span />}
        </div>
      ))}
    </div>
  );
}
