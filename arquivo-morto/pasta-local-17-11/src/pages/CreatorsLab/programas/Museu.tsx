/**
 * Programa: Museu — uma visita pela história do Gestão, em salas por época.
 * ─────────────────────────────────────────────────────────────────────────────
 * Este arquivo é só a casca da visita: a lista de épocas e salas de um lado, a
 * sala aberta do outro, e os botões de sala anterior e próxima. **Todo o
 * conteúdo vem de `museu/museu.config.ts`** — nome, período, texto, marcos,
 * fontes, qual arte e qual peça. Incluir um evento é acrescentar um objeto lá.
 *
 * ## O que fica guardado
 *
 * Abrir uma sala a marca como visitada em `Progresso.museuVisto`, o mesmo
 * objeto das conquistas (jsonb em `creators_lab_progresso`, com o navegador de
 * reserva). Não há conquista nem prêmio por visitar tudo — é só a marca na
 * lista e a contagem, para a pessoa saber o que falta ver.
 *
 * ## Lacunas
 *
 * Data ou motivo que não deu para confirmar chega aqui como `PENDENTE(...)` e
 * é desenhado como lacuna marcada, nunca como texto.
 */
import { useEffect, useRef, useState } from 'react';
import { Pendente } from '../components/SecaoLab';
import { estaPendente, textoPendente } from '../creators.config';
import { ArteDaSala } from '../museu/ArteDaSala';
import { PecaDaSala } from '../museu/PecaDaSala';
import {
  EPOCAS, SALAS, ordemDaVisita, salasDaEpoca, salasVisitadas, vizinhas,
  type SalaMuseu,
} from '../museu/museu.config';
import { useCreators } from '../theme/CreatorsProvider';
import { useJanela } from '../desktop/contexto';

/** Um texto do Museu, ou a lacuna dele. */
function Fato({ valor }: { valor: string }) {
  return estaPendente(valor) ? <Pendente oQue={textoPendente(valor)} /> : <>{valor}</>;
}

function Sala({ sala, aoIr }: { sala: SalaMuseu; aoIr: (id: string) => void }) {
  const { tokens } = useCreators();
  const c = tokens.cores;
  const epoca = EPOCAS.find(e => e.id === sala.epoca);
  const { anterior, proxima } = vizinhas(sala.id);

  return (
    <article className="creators-lab__sala" aria-labelledby={`sala-${sala.id}`}>
      <header>
        <p className="creators-lab__rotulo" style={{ color: c.secundaria }}>
          {tokens.vocab.rotuloSecao(epoca ? `${epoca.nome} · ${epoca.periodo}` : 'museu')}
        </p>
        <h2 id={`sala-${sala.id}`} className="mt-1 text-xl font-bold sm:text-2xl" style={{ color: c.primaria }}>
          {sala.nome}
        </h2>

        <p className="creators-lab__mono mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs" style={{ color: c.textoSuave }}>
          <span><Fato valor={sala.inicio} /></span>
          <span aria-hidden="true">→</span>
          <span>{sala.fim === null ? 'hoje' : <Fato valor={sala.fim} />}</span>
          <span
            className="creators-lab__etiqueta"
            style={{ color: sala.situacao === 'vivo' ? c.primaria : c.textoSuave }}
          >
            {sala.situacao === 'vivo' ? 'no código vivo' : 'arquivado'}
          </span>
        </p>
      </header>

      <figure className="mt-4">
        <ArteDaSala id={sala.arte} />
        <figcaption className="creators-lab__mono mt-1 text-[.62rem]" style={{ color: c.textoSuave }}>
          {sala.origemDaArte === 'da-epoca'
            ? 'Arte da época: os desenhos originais.'
            : 'Reconstituição: placa feita para o Museu, não é o desenho original.'}
        </figcaption>
      </figure>

      <p className="mt-4 text-sm leading-relaxed" style={{ color: c.texto }}>{sala.texto}</p>

      {sala.marcos && sala.marcos.length > 0 && (
        <ol className="creators-lab__marcos mt-4">
          {sala.marcos.map((m, i) => (
            <li key={i}>
              <span className="creators-lab__mono" style={{ color: c.acento }}><Fato valor={m.data} /></span>
              <span style={{ color: c.textoSuave }}>{m.oQue}</span>
            </li>
          ))}
        </ol>
      )}

      {sala.porQueSaiu && (
        <div className="mt-4">
          <p className="creators-lab__rotulo" style={{ color: c.acento }}>por que saiu</p>
          <p className="mt-1 text-sm leading-relaxed" style={{ color: c.textoSuave }}>
            <Fato valor={sala.porQueSaiu} />
          </p>
        </div>
      )}

      {sala.peca && (
        <div className="creators-lab__painel creators-lab__painel--reto mt-5 p-4">
          <p className="creators-lab__rotulo mb-3" style={{ color: c.secundaria }}>
            peça para mexer · encenação com dados fictícios
          </p>
          <PecaDaSala id={sala.peca} />
        </div>
      )}

      <p className="creators-lab__mono mt-5 text-[.62rem] leading-relaxed" style={{ color: c.textoSuave }}>
        De onde vem: {sala.fontes.join(' · ')}
      </p>

      <nav className="mt-5 flex flex-wrap justify-between gap-2" aria-label="Visita">
        <button
          type="button"
          className="creators-lab__btn"
          onClick={() => anterior && aoIr(anterior.id)}
          disabled={!anterior}
        >
          ← {anterior ? anterior.nome : 'início da visita'}
        </button>
        <button
          type="button"
          className="creators-lab__btn"
          onClick={() => proxima && aoIr(proxima.id)}
          disabled={!proxima}
        >
          {proxima ? proxima.nome : 'fim da visita'} →
        </button>
      </nav>
    </article>
  );
}

export default function ProgramaMuseu() {
  const { tokens, progresso, registrar } = useCreators();
  const c = tokens.cores;

  // Abre na primeira sala ainda não visitada — quem volta continua de onde parou.
  const [aberta, setAberta] = useState(() => {
    const vistas = new Set(progresso.museuVisto ?? []);
    const ordem = ordemDaVisita();
    return (ordem.find(s => !vistas.has(s.id)) ?? ordem[0]).id;
  });

  const sala = SALAS.find(s => s.id === aberta) ?? ordemDaVisita()[0];
  const vistas = new Set(progresso.museuVisto ?? []);

  // Estar numa sala é tê-la visitado.
  useEffect(() => { registrar({ museuVisto: [sala.id] }); }, [sala.id, registrar]);

  /*
   * Trocar de sala leva a vista até a sala.
   *
   * Com a janela larga, mapa e sala ficam lado a lado e isto é só "voltar ao
   * alto". Com a janela estreita (e no celular) o mapa fica EM CIMA da sala:
   * sem isto, tocar numa sala do mapa não mostraria nada mudando, e tocar em
   * «próxima» lá embaixo abriria a sala seguinte já no rodapé dela.
   *
   * Não roda na abertura do programa — quem acabou de abrir o Museu vê o mapa.
   */
  const janela = useJanela();
  const salaRef = useRef<HTMLDivElement | null>(null);
  const primeiraVez = useRef(true);
  useEffect(() => {
    if (primeiraVez.current) { primeiraVez.current = false; return; }
    const rolagem = janela?.rolagemRef.current;
    const alvo = salaRef.current;
    if (!rolagem || !alvo) return;
    const topo = alvo.getBoundingClientRect().top - rolagem.getBoundingClientRect().top + rolagem.scrollTop;
    rolagem.scrollTo({ top: Math.max(topo - 12, 0) });
  }, [sala.id, janela]);

  return (
    <div className="creators-lab__museu">
      <div className="creators-lab__museu-grade">
      <nav className="creators-lab__museu-mapa" aria-label="Salas do Museu">
        <p className="creators-lab__mono text-[.66rem]" style={{ color: c.textoSuave }}>
          {salasVisitadas(progresso.museuVisto ?? [])} de {SALAS.length} salas visitadas
        </p>

        {EPOCAS.map(e => (
          <section key={e.id} className="creators-lab__museu-epoca">
            <h3 style={{ color: c.primaria }}>{e.nome}</h3>
            <p className="creators-lab__mono" style={{ color: c.textoSuave }}>{e.periodo}</p>
            <ul>
              {salasDaEpoca(e.id).map(s => (
                <li key={s.id}>
                  <button
                    type="button"
                    className="creators-lab__museu-sala"
                    aria-current={s.id === sala.id}
                    onClick={() => setAberta(s.id)}
                  >
                    <span aria-hidden="true">{vistas.has(s.id) ? '■' : '□'}</span>
                    <span>{s.nome}</span>
                    <span className="sr-only">{vistas.has(s.id) ? ' (visitada)' : ' (não visitada)'}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </nav>

      {/* `key`: trocar de sala remonta a peça, para ela não levar o estado de uma sala para a outra. */}
      <div ref={salaRef}>
        <Sala key={sala.id} sala={sala} aoIr={setAberta} />
      </div>
      </div>
    </div>
  );
}
