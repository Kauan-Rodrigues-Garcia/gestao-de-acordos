/**
 * Peças da Visão geral: as formas de pagamento, a faixa H.O./Coren/Cofen, o
 * disjuntor do Cofen e o bloco do que está fora da conta. O pulso está em
 * `Pulso.tsx`; o placar, em `PlacarDeSetores.tsx`.
 */
import { memo, useId, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatBRL } from '@/lib/money';
import { Switch } from '@/components/ui/switch';
import { agruparFormas, corDaForma } from '@/lib/formasPagamento';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { FormaDePagamento } from '@/services/mestre/diretoria.service';
import {
  classificarCarteira, type CarteiraDaCidade, type MotivoDeNaoContar, type RegraDaCarteira,
} from '@/services/mestre/diretoriaCidades.service';
import type { ModoCofen } from './modelo';
import { mil } from './formato';


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
