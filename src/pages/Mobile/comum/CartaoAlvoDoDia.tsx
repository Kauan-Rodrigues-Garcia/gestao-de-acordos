/**
 * «Onde precisa estar» — hoje e no próximo dia útil (13/10/2026). O mesmo
 * cartão no operador, no líder (aba Equipe) e na gerência (aba Setor): quanto
 * tem que ter recebido até hoje e até amanhã para seguir no ritmo da meta.
 * A conta é `alvoDoDia` (lib/mobile).
 */
import type { AlvoDoDia } from '@/lib/mobile/alvoDoDia';
import './comum.css';

const inteiro = (v: number) => `R$ ${Math.round(v).toLocaleString('pt-BR')}`;

export function CartaoAlvoDoDia({ alvo, titulo = 'Onde precisa estar', unidadeHO }: {
  alvo: AlvoDoDia;
  /** «Onde você precisa estar», «Onde a equipe precisa estar»… */
  titulo?: string;
  unidadeHO: boolean;
}) {
  const { hoje, diferencaHoje, amanha } = alvo;
  const aFrente = diferencaHoje >= 0;
  return (
    <section className="v-cartao v-alvo" aria-label={titulo}>
      <div className="v-rotulo">{titulo}{unidadeHO ? ' · H.O.' : ''}</div>
      <div className="v-alvo-grade">
        <div>
          <small>Hoje</small>
          <b>{inteiro(hoje)}</b>
          <i className={aFrente ? 'v-alvo-ok' : 'v-alvo-atras'}>
            {aFrente ? `${inteiro(diferencaHoje)} à frente` : `faltam ${inteiro(-diferencaHoje)}`}
          </i>
        </div>
        <div>
          <small>{amanha ? (amanha.rotulo === 'amanhã' ? 'Amanhã' : amanha.rotulo) : 'Amanhã'}</small>
          {amanha ? (
            <>
              <b>{inteiro(amanha.alvo)}</b>
              <i className={amanha.falta === 0 ? 'v-alvo-ok' : undefined}>
                {amanha.falta === 0 ? 'já garantido' : `faltam ${inteiro(amanha.falta)}`}
              </i>
            </>
          ) : (
            <><b>—</b><i>hoje é o último dia útil</i></>
          )}
        </div>
      </div>
    </section>
  );
}
