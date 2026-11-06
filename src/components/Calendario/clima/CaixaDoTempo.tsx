/**
 * A caixa do tempo, no alto da coluna do lado do Calendário em gibi
 * (06/11/2026): o cenário do dia com o personagem do tempo, a temperatura de
 * agora, a máxima e a mínima, chuva, umidade e vento, e os cinco dias
 * seguintes, cada um com o seu personagem.
 *
 * Só desenha: quem lê a previsão é `TempoDoSetor` (o painel), e o laboratório
 * passa uma previsão de exemplo. Fica fora do «Copiar imagem»
 * (`data-html2canvas-ignore`): a imagem é o mês, e a previsão envelhece.
 */
import { CloudSun, MapPin } from 'lucide-react';
import {
  NOME_DA_CIDADE, estacaoDoDia, horaDeBrasilia, rotuloDaCondicao, semanaCurta, varianteDoDia,
  type CidadeClima, type Estacao, type Previsao,
} from '@/lib/clima';
import { CHAOS, CenarioDoTempo, type Chao } from './cenarios';
import { PersonagemDoTempo, VARIACOES_DO_SOL, type CoresClima } from './personagens';

export interface PropsCaixaDoTempo {
  cidade: CidadeClima | null;
  /** Só o laboratório força estes; o normal é pelo dia. */
  forcar?: { estacao?: Estacao; chao?: Chao; variante?: number };
  previsao: Previsao | null;
  geradoEm: string | null;
  carregando: boolean;
  hojeISO: string;
  cores: CoresClima;
}

/** Quantos dias depois de hoje a faixa mostra. */
const DIAS_NA_FAIXA = 5;

export function CaixaDoTempo({ cidade, previsao, geradoEm, carregando, hojeISO, cores, forcar }: PropsCaixaDoTempo) {
  const nome = cidade ? NOME_DA_CIDADE[cidade] : null;

  // A previsão guardada pode ser de antes da meia-noite: «hoje» é pelo relógio.
  const dias = previsao?.dias ?? [];
  const iHoje = dias.findIndex(d => d.data === hojeISO);
  const hoje = iHoje >= 0 ? dias[iHoje] : null;
  const seguintes = dias.filter(d => d.data > hojeISO).slice(0, DIAS_NA_FAIXA);

  const estacao = forcar?.estacao ?? estacaoDoDia(hojeISO);
  const semente = cidade ?? 'birigui';
  const variante = forcar?.variante ?? varianteDoDia(hojeISO, `sol-${semente}`, VARIACOES_DO_SOL);
  const chao = forcar?.chao ?? CHAOS[varianteDoDia(hojeISO, `chao-${semente}`, CHAOS.length)];

  return (
    <section className="gb-box cl-box" data-html2canvas-ignore aria-label={nome ? `Previsão do tempo em ${nome}` : 'Previsão do tempo'}>
      <div className="gb-box-topo">
        <h4><CloudSun className="h-4 w-4" aria-hidden />O tempo</h4>
        {nome && <span className="cl-cidade"><MapPin aria-hidden />{nome}</span>}
      </div>

      {previsao ? (
        <>
          <div className="cl-cena">
            <CenarioDoTempo
              condicao={previsao.agora.condicao}
              noite={previsao.agora.noite}
              estacao={estacao}
              chao={chao}
              variante={variante}
              temp={previsao.agora.temp}
              cores={cores}
            />
            <div className="cl-agora-num">
              <b>{previsao.agora.temp}°</b>
              <span>{rotuloDaCondicao(previsao.agora.condicao, previsao.agora.noite)}</span>
              {hoje && <small>máx {hoje.max}° · mín {hoje.min}°</small>}
            </div>
          </div>

          <dl className="cl-dados">
            <div><dt>Sensação</dt><dd>{previsao.agora.sensacao}°</dd></div>
            <div><dt>Chuva hoje</dt><dd>{hoje ? (hoje.chuvaMm > 0 ? `${String(hoje.chuvaMm).replace('.', ',')} mm` : 'Sem chuva') : '—'}</dd></div>
            <div><dt>Umidade</dt><dd>{previsao.agora.umidade !== null ? `${previsao.agora.umidade}%` : '—'}</dd></div>
            <div><dt>Vento</dt><dd>{previsao.agora.vento !== null ? `${previsao.agora.vento} km/h` : '—'}</dd></div>
          </dl>

          {seguintes.length > 0 && (
            <ol className="cl-dias" aria-label="Próximos dias">
              {seguintes.map(d => (
                <li key={d.data} title={`${rotuloDaCondicao(d.condicao, false)} · máx ${d.max}° mín ${d.min}°`}>
                  <span>{semanaCurta(d.data)}</span>
                  <PersonagemDoTempo
                    condicao={d.condicao}
                    noite={false}
                    estacao={estacaoDoDia(d.data)}
                    variante={varianteDoDia(d.data, `sol-${semente}`, VARIACOES_DO_SOL)}
                    temp={d.max}
                    cores={cores}
                    titulo={rotuloDaCondicao(d.condicao, false)}
                  />
                  <b>{d.max}°</b>
                  <small>{d.min}°</small>
                </li>
              ))}
            </ol>
          )}

          <p className="cl-rodape">
            {geradoEm ? `Atualizado às ${horaDeBrasilia(geradoEm)} · ` : ''}Dados: MET Norway
          </p>
        </>
      ) : carregando ? (
        <div className="cl-cena cl-esperando">Olhando o céu…</div>
      ) : (
        <p className="gb-vazio">A previsão não chegou agora. Ela tenta de novo sozinha daqui a pouco.</p>
      )}
    </section>
  );
}
