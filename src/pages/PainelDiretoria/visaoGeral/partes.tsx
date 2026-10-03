/**
 * As peças da Visão geral: a fileira de cima (geral e cidades), o gráfico do
 * mês, as formas de pagamento, as carteiras sem cidade e o bloco Cofen.
 * Quem orquestra (cidade aberta, dia aberto) é `VisaoGeralPorCidade`.
 */
import { memo, useMemo, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatBRL } from '@/lib/money';
import { ValorAnimado } from '@/components/ValorAnimado';
import { agruparFormas, corDaForma } from '@/lib/formasPagamento';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { estimativaDeFechamento, type DiaDaSerie, type FormaDePagamento } from '@/services/mestre/diretoria.service';
import {
  classificarCarteira, type CarteiraDaCidade, type MesDoEscopo, type RegraDaCarteira,
} from '@/services/mestre/diretoriaCidades.service';
import { divisaoCofen, ehFimDeSemana, nomeDoMes, variacaoPct, type CidadeDaVisao } from './modelo';
import { corDaMarca, mil, milhoes, pct, sinal } from './formato';


/** O valor grande dos cartões: «R$» pequeno e o número rolando até o novo. */
function ValorGrande({ valor }: { valor: number }) {
  return (
    <>
      <small>R$</small>
      <ValorAnimado valor={valor} formatar={v => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} />
    </>
  );
}


// ── Geral ───────────────────────────────────────────────────────────────────

export const CartaoGeral = memo(function CartaoGeral({ mes, mesAnterior, diaCorte, diasNoMes, cidades, semCidade, recolhido }: {
  mes: MesDoEscopo; mesAnterior: string; diaCorte: number; diasNoMes: number;
  cidades: CidadeDaVisao[]; semCidade: number; recolhido: boolean;
}) {
  const v = variacaoPct(mes.valor, mes.valorAnterior);
  const fecha = estimativaDeFechamento(mes.valor, diaCorte, diasNoMes);
  const partes = [
    ...cidades.map(c => ({ chave: c.chave, nome: c.nome, valor: c.mes.valor, cor: corDaMarca(c.marca) })),
    ...(semCidade > 0 ? [{ chave: 'sem', nome: 'Sem cidade', valor: semCidade, cor: 'var(--warning)' }] : []),
  ];
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
          <div className="vg-divisao" aria-hidden="true">
            {partes.map(p => <i key={p.chave} style={{ width: `${(p.valor / mes.valor) * 100}%`, background: p.cor }} />)}
          </div>
          <div className="vg-legenda">
            {partes.map(p => (
              <span key={p.chave}><span className="vg-ponto" style={{ background: p.cor }} />{p.nome} {pct((p.valor / mes.valor) * 100)}</span>
            ))}
          </div>
        </>
      )}
    </div>
  );
});

// ── Cidade ──────────────────────────────────────────────────────────────────

export const CartaoCidade = memo(function CartaoCidade({ cidade, mesAnterior, diaCorte, diasNoMes, ho, aberta, recolhida, onAbrir, onFechar }: {
  cidade: CidadeDaVisao; mesAnterior: string; diaCorte: number; diasNoMes: number; ho: number;
  aberta: boolean; recolhida: boolean; onAbrir: () => void; onFechar: () => void;
}) {
  const m = cidade.mes;
  const v = variacaoPct(m.valor, m.valorAnterior);
  const fecha = estimativaDeFechamento(m.valor, diaCorte, diasNoMes);
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
          <div className="vg-rodape">
            <span><b>{cidade.setores.length}</b> setores</span>
            <span><b>{m.operadores}</b> operadores</span>
            {cidade.melhorSetor && <span>melhor: <b>{cidade.melhorSetor.nome}</b></span>}
          </div>
          {cidade.cofenBruto !== null && (
            <div className="vg-cofen-linha">
              <span className="vg-selo cofen">Regra Cofen</span>
              bruto <b>{mil(cidade.cofenBruto)}</b> · H.O. <b>{mil(cidade.cofenBruto * ho)}</b>
            </div>
          )}
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

/** A faixa H.O. / Coren / Cofen de um bruto. */
export function PilhaCofen({ bruto, ho, legenda }: { bruto: number; ho: number; legenda?: boolean }) {
  const d = divisaoCofen(bruto, ho);
  const resto = 1 - ho;
  return (
    <>
      <div className="vg-pilha" aria-hidden="true">
        <i style={{ width: `${ho * 100}%`, background: 'var(--vg-cofen)' }} />
        <i style={{ width: `${resto * 75}%`, background: COR_COREN }} />
        <i style={{ width: `${resto * 25}%`, background: COR_COFEN_REPASSE }} />
      </div>
      {legenda && (
        <div className="vg-pilha-leg">
          <span><span className="vg-ponto" style={{ background: 'var(--vg-cofen)' }} />H.O. <b>{mil(d.ho)}</b></span>
          <span><span className="vg-ponto" style={{ background: COR_COREN }} />Coren <b>{mil(d.coren)}</b></span>
          <span><span className="vg-ponto" style={{ background: COR_COFEN_REPASSE }} />Cofen <b>{mil(d.cofen)}</b></span>
        </div>
      )}
    </>
  );
}

// ── Carteiras sem cidade ────────────────────────────────────────────────────

const REGRAS: { valor: RegraDaCarteira; rotulo: string }[] = [
  { valor: 'nosso_produto', rotulo: 'Nosso produto' },
  { valor: 'cofen', rotulo: 'Cofen' },
];

/**
 * Cidade e regra de uma carteira sem setor, escolhidas ali mesmo. Grava ao
 * escolher; quem não tem a chave do painel vê o estado, sem os campos.
 */
export function EscolhaDaCarteira({ empresaId, carteira, cidades, podeDefinir, onGravou }: {
  empresaId: string; carteira: CarteiraDaCidade; cidades: { id: string; nome: string }[];
  podeDefinir: boolean; onGravou: () => void;
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
  if (!podeDefinir) {
    return <span className="vg-nota">Quem tem a permissão «cidade e regra de carteira» define.</span>;
  }
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

export function CarteirasSemCidade({ empresaId, valor, carteiras, cidades, podeDefinir, onGravou }: {
  empresaId: string; valor: number; carteiras: CarteiraDaCidade[]; cidades: { id: string; nome: string }[];
  podeDefinir: boolean; onGravou: () => void;
}) {
  return (
    <div className="vg-semcidade">
      <h3>{formatBRL(valor)} sem cidade definida</h3>
      <p>
        Carteiras do 59 que não estão em nenhum setor do sistema. Já contam no geral; escolha a cidade
        (e a regra, se for Cofen) uma vez e elas passam a contar no cartão da cidade, neste mês e nos próximos.
      </p>
      {carteiras.map(k => (
        <div key={k.cod} className="vg-carteira">
          <span>{k.nome} <span className="vg-nota" style={{ display: 'inline' }}>· cód. {k.cod} · {k.linhas} pgtos</span></span>
          <b>{formatBRL(k.valor)}</b>
          <EscolhaDaCarteira empresaId={empresaId} carteira={k} cidades={cidades} podeDefinir={podeDefinir} onGravou={onGravou} />
        </div>
      ))}
    </div>
  );
}
