/**
 * A abertura do Desafio do Vale (23/11/2026): a arte da campanha, viva, na
 * primeira vez que a pessoa abre a gaveta — o «ingresso» deste desafio.
 *
 * Não é a imagem: é a arte montada com o que está configurado (datas, médias,
 * faixas, quantos Pix por cupom). Assim ela não envelhece — o «HOJE» só
 * aparece no dia em que os cupons começam — e muda junto com a configuração.
 */
import { useEffect, useRef, useState } from 'react';
import { Megaphone, Sparkles, Ticket, Trophy } from 'lucide-react';
import type { DesafioVale } from '@/services/desafioVale/desafioVale.service';
import { faixasOrdenadas, premioDoRanking, reais, regraDoSetor, textoDaFaixa } from '@/services/desafioVale/regras';
import { dataCurta, medias as nMedias, semana } from '@/services/desafioCobranca/regras';
import { HotDog } from './HotDog';
import './abertura-vale.css';

/** A cor de cada faixa, da mais alta para a mais baixa: verde, ouro, coral. */
const CORES = ['dva-p1', 'dva-p2', 'dva-p3', 'dva-p3', 'dva-p3', 'dva-p3'];

export function AberturaVale({ d, hoje, onEntrar, paraLider = false, rotuloBotao, esperaSegundos = 0 }: {
  d: DesafioVale; hoje: string; onEntrar: () => void;
  /** O líder não faz as médias: o botão leva ao setor. */
  paraLider?: boolean;
  /** Troca o texto do botão (a arte obrigatória: «Bora pra cima!»). */
  rotuloBotao?: string;
  /** O botão só libera depois destes segundos — tempo para ler (23/11/2026). */
  esperaSegundos?: number;
}) {
  const botao = useRef<HTMLButtonElement>(null);
  const [falta, setFalta] = useState(esperaSegundos);
  useEffect(() => {
    if (falta <= 0) { const t = window.setTimeout(() => botao.current?.focus(), 300); return () => window.clearTimeout(t); }
    const t = window.setTimeout(() => setFalta(f => f - 1), 1000);
    return () => window.clearTimeout(t);
  }, [falta]);
  const texto = rotuloBotao ?? (paraLider ? 'Ver o meu setor' : 'Bora! Ver o meu desafio');
  const faixas = faixasOrdenadas(d.faixas);
  const maior = faixas[0]?.valor ?? 0;
  const comCupom = d.cupom_ativo && !!d.cupom_inicio && !!d.cupom_fim;
  const hojeEhOInicio = comCupom && hoje === d.cupom_inicio;
  const sorteioDeHotDog = !d.cupom_premio || /hot ?dog/i.test(d.cupom_premio);
  const n = d.medias.toLocaleString('pt-BR');
  const ranking = regraDoSetor(d.meu_setor) === 'ranking';

  return (
    <div className="dva">
      <div className="dva-brilhos" aria-hidden>
        {Array.from({ length: 18 }, (_, i) => (
          <span key={i} style={{ left: `${(i * 37 + 11) % 97}%`, top: `${(i * 23 + 7) % 92}%`, ['--i' as string]: i }} />
        ))}
      </div>

      <section className="dva-topo">
        <div className="dva-titulo-caixa">
          <h2 className="dva-titulo">
            <span className="dva-linha" style={{ ['--d' as string]: 0 }}>Fez <em>{n} médias</em>,</span>
            <span className="dva-linha" style={{ ['--d' as string]: 1 }}>garante um vale</span>
            <span className="dva-linha" style={{ ['--d' as string]: 2 }}>Bandeirante</span>
          </h2>
          <p className="dva-datas dva-entra" style={{ ['--d' as string]: 3 }}>
            <span className="dva-dia1">{dataCurta(d.inicio)}</span> a {dataCurta(d.fim)}
          </p>
        </div>
        <div className="dva-vale-caixa" aria-label={`Exemplo de vale de ${reais(maior)}`}>
          <div className="dva-vale-tras" />
          <div className="dva-vale">
            <span className="dva-vale-brilho" aria-hidden />
            <div className="dva-vale-cima">
              <span className="dva-vale-nome"><small>Vale</small><b>Bandeirante</b></span>
              <span className="dva-chip" aria-hidden />
            </div>
            <div className="dva-vale-valor"><em>até</em><span>R$</span>{maior.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
            <div className="dva-vale-pe"><span>Seu nome aqui</span></div>
          </div>
          <span className="dva-exemplo">exemplo ilustrativo</span>
        </div>
      </section>

      <ol className="dva-faixas" aria-label="Quanto vale o vale">
        {faixas.map((f, i) => (
          <li key={f.pct} className={i === 0 ? 'dva-faixa topo' : 'dva-faixa'} style={{ ['--d' as string]: 4 + i }}>
            <span className="dva-c1">Setor fechou</span>
            <span className={`dva-pct ${CORES[i]}`}>{textoDaFaixa(f, d.faixas).replace(/^de (\d+)% a (\d+)%$/, 'entre $1% e $2%')}</span>
            <span className="dva-c1">da meta · garante</span>
            <span className="dva-valor">{reais(f.valor)}</span>
            <span className="dva-c5">de vale Bandeirante</span>
          </li>
        ))}
      </ol>
      <p className="dva-regra dva-entra" style={{ ['--d' as string]: 7 }}>
        Bateu as <strong>{nMedias(d.medias)}</strong>, o vale é seu. <strong>Quanto melhor o setor fechar, maior o vale</strong> — puxe o time!
      </p>

      {comCupom && ranking && (
        <>
          <p className="dva-mais dva-entra" style={{ ['--d' as string]: 8 }}><span>e tem mais · {d.meu_setor?.nome ?? 'seu setor'}</span></p>
          <section className="dva-cupom dva-entra" style={{ ['--d' as string]: 9 }}>
            <div className="dva-canhoto">
              <b>{d.meu_setor?.cupom_ranking_qtd ?? 2}</b>
              <span>que mais receberem</span>
              <i><Trophy size={18} aria-hidden /></i>
              <strong>ganham</strong>
            </div>
            <div className="dva-cupom-texto">
              <p className="dva-cupom-titulo">Ranking do setor</p>
              <p className="dva-quando">
                {hojeEhOInicio ? <span className="dva-hoje">HOJE {dataCurta(d.cupom_inicio!)}</span> : <span>{dataCurta(d.cupom_inicio!)}</span>}
                {' '}até <strong>{semana(d.cupom_fim!)}, {dataCurta(d.cupom_fim!)}</strong>
              </p>
              <p className="dva-cupom-regra">
                Os <strong>{d.meu_setor?.cupom_ranking_qtd ?? 2} que mais receberem</strong> no período <strong>{premioDoRanking(d).texto}</strong>.
              </p>
              <p className="dva-cobre"><Megaphone size={16} aria-hidden /> Cada pagamento conta!</p>
            </div>
            {sorteioDeHotDog && (
              <div className="dva-sorteio">
                <span className="dva-sorteio-selo">Prêmio</span>
                <HotDog className="dva-hotdog" />
                <b>hot dog</b>
              </div>
            )}
          </section>
        </>
      )}

      {comCupom && !ranking && (
        <>
          <p className="dva-mais dva-entra" style={{ ['--d' as string]: 8 }}><span>e tem mais · Pix Automático</span></p>
          <section className="dva-cupom dva-entra" style={{ ['--d' as string]: 9 }}>
            <div className="dva-canhoto">
              <b>{d.cupom_pix}</b>
              <span>Pix automáticos aprovados</span>
              <i>=</i>
              <strong>1 cupom</strong>
            </div>
            <div className="dva-cupom-texto">
              <p className="dva-cupom-titulo">Cupons do Pix</p>
              <p className="dva-quando">
                {hojeEhOInicio ? <span className="dva-hoje">HOJE {dataCurta(d.cupom_inicio!)}</span> : <span>{dataCurta(d.cupom_inicio!)}</span>}
                {' '}até <strong>{dataCurta(d.cupom_fim!)}</strong>
              </p>
              <p className="dva-cupom-regra">
                Só vira cupom <strong>depois de aprovado pelo líder</strong>.
                {sorteioDeHotDog
                  ? (d.sorteio_por_cupom ? <> Cada cupom é <strong>uma chance no sorteio</strong>.</> : <> Com <strong>1 cupom você já concorre</strong> ao sorteio.</>)
                  : d.cupom_premio ? <> {d.cupom_premio}</> : null}
                {d.meu_setor?.sorteio_qtd ? <> No {d.meu_setor.nome}, <strong>{d.meu_setor.sorteio_qtd} {d.meu_setor.sorteio_qtd === 1 ? 'pessoa é sorteada' : 'pessoas são sorteadas'}</strong>.</> : null}
              </p>
              <p className="dva-cobre"><Megaphone size={16} aria-hidden /> Cobre o seu líder a aprovação!</p>
            </div>
            {sorteioDeHotDog && (
              <div className="dva-sorteio">
                <span className="dva-sorteio-selo">Sorteio</span>
                <HotDog className="dva-hotdog" />
                <b>de hot dog</b>
              </div>
            )}
          </section>
          <p className="dva-laranja dva-entra" style={{ ['--d' as string]: 10 }}>
            <span className="dva-tag"><Ticket size={11} aria-hidden /> cupom</span>
            Os Pix desses dias ficam em laranja na aba Pix Automático.
          </p>
        </>
      )}

      <button
        ref={botao} type="button" className={`dva-entrar dva-entra${falta > 0 ? ' esperando' : ''}`} style={{ ['--d' as string]: 11 }}
        onClick={onEntrar} disabled={falta > 0} aria-disabled={falta > 0}
        aria-label={falta > 0 ? `${texto} — libera em ${falta} segundos` : texto}
      >
        <Sparkles size={18} aria-hidden /> {texto}{falta > 0 ? <span className="dva-entrar-conta" aria-hidden>{falta}</span> : null}
      </button>
    </div>
  );
}
