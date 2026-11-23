/**
 * A carteira de cupons do operador (23/11/2026) — no lugar das bolinhas, que
 * não diziam nada: um BILHETE laranja para cada cupom já garantido, e o
 * bilhete «em construção» do próximo, com uma casa por Pix: aprovado (✓),
 * esperando o líder (relógio) e o que falta.
 */
import { Check, Clock, Megaphone, Plus, Ticket } from 'lucide-react';
import { cn } from '@/lib/utils';
import { casasDoProximoCupom, cupons as nCupons, type CuponsDoPix } from '@/services/desafioVale/regras';

const MOSTRAR_ATE = 15;

export function CarteiraDeCupons({ c, porCupom, encerrado, chancePorCupom = false }: {
  c: CuponsDoPix; porCupom: number; encerrado: boolean;
  /** true = cada cupom é uma chance; false (o padrão, 23/11) = com 1 cupom já concorre. */
  chancePorCupom?: boolean;
}) {
  const casas = casasDoProximoCupom(c, porCupom);
  const vistos = Math.min(c.cupons, MOSTRAR_ATE);
  const aMais = c.cupons - vistos;
  const esperaNoProximo = casas.filter(x => x === 'espera').length;
  const faltaNoProximo = casas.filter(x => x === 'falta').length;

  return (
    <div className="dv-carteira">
      <div className="dv-carteira-topo">
        <p className="dv-carteira-total">
          <strong>{c.cupons}</strong>
          <span>{c.cupons === 1 ? 'cupom garantido' : 'cupons garantidos'}</span>
        </p>
        <p className="dv-carteira-chances">
          {c.cupons === 0 ? 'ainda fora do sorteio'
            : chancePorCupom ? <>{c.cupons} {c.cupons === 1 ? 'chance' : 'chances'} no sorteio</> : '✓ concorrendo ao sorteio'}
        </p>
      </div>

      <ul className="dv-bilhetes" aria-label="Seus cupons">
        {Array.from({ length: vistos }, (_, i) => (
          <li key={i} className="dv-bilhete" style={{ ['--i' as string]: i }}>
            <Ticket size={14} aria-hidden />
            <b>#{i + 1}</b>
            <span className="dv-bilhete-furo" aria-hidden />
            <em>cupom</em>
          </li>
        ))}
        {aMais > 0 && (
          <li className="dv-bilhete mais" aria-label={`e mais ${aMais}`}>
            <Plus size={16} aria-hidden /><b>{aMais}</b><em>cupons</em>
          </li>
        )}
        {!encerrado && (
          <li className="dv-bilhete construindo" aria-label={`Próximo cupom: ${c.sobra} de ${porCupom} Pix aprovados`}>
            <b>Cupom {c.cupons + 1}</b>
            <span className="dv-casas">
              {casas.map((x, i) => (
                <i key={i} className={cn('dv-casa', x)} aria-hidden>
                  {x === 'ok' ? <Check size={12} strokeWidth={3.5} /> : x === 'espera' ? <Clock size={11} strokeWidth={3} /> : null}
                </i>
              ))}
            </span>
            <span className="dv-bilhete-furo" aria-hidden />
            <em>{faltaNoProximo === 0 && esperaNoProximo > 0 ? 'falta o líder aprovar' : `${c.sobra} de ${porCupom}`}</em>
          </li>
        )}
      </ul>

      {!encerrado && (
        <p className="dv-proximo">
          <strong>Próximo cupom:</strong>{' '}
          {faltaNoProximo === 0 && esperaNoProximo > 0
            ? <>já tem os {porCupom} Pix — só falta o líder aprovar {esperaNoProximo === 1 ? 'o pendente' : `os ${esperaNoProximo} pendentes`}.</>
            : faltaNoProximo === porCupom
              ? <>lance {porCupom} Pix automáticos e peça a aprovação.</>
              : <>
                  {c.sobra > 0 && <>{c.sobra} aprovado{c.sobra === 1 ? '' : 's'}</>}
                  {c.sobra > 0 && esperaNoProximo > 0 && ', '}
                  {esperaNoProximo > 0 && <>{esperaNoProximo} esperando o líder</>}
                  {(c.sobra > 0 || esperaNoProximo > 0) && ' — '}
                  falta{faltaNoProximo === 1 ? '' : 'm'} <b>{faltaNoProximo} Pix</b>.
                </>}
        </p>
      )}
      {encerrado && c.sobra > 0 && (
        <p className="dv-proximo">Período encerrado: {c.sobra} Pix aprovado{c.sobra === 1 ? '' : 's'} não chegou a fechar um cupom.</p>
      )}

      <div className="dv-legenda" aria-hidden>
        <span><i className="dv-casa ok"><Check size={10} strokeWidth={3.5} /></i> aprovado ({c.aprovados})</span>
        <span><i className="dv-casa espera"><Clock size={9} strokeWidth={3} /></i> esperando o líder ({c.pendentes})</span>
        <span><i className="dv-casa falta" /> falta</span>
        {c.desaprovados > 0 && <span className="nao">{c.desaprovados} desaprovado{c.desaprovados === 1 ? '' : 's'} (não conta)</span>}
      </div>

      {c.pendentes > 0 && (
        <p className="dv-cobre">
          <Megaphone size={16} aria-hidden />
          <span>
            <strong>Cobre o seu líder!</strong> Pix pendente não vira cupom.
            {' '}{c.pendentes === 1 ? 'Aprovando o pendente' : `Aprovando os ${c.pendentes}`}, você fica com <strong>{nCupons(c.cuponsSeAprovar)}</strong>.
          </span>
        </p>
      )}
    </div>
  );
}
