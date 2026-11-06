/**
 * O botão do Calendário no topo e o lembrete do dia, só o desenho: quem lê o
 * banco e guarda o «já vi hoje» é o `BotaoCalendario`. Separado para o
 * laboratório (`lab-calendario.html`) usar sem login e sem banco.
 */
import type { CSSProperties } from 'react';
import { rotuloDoMesLongo, type EventoCalendario, type PaletaGibi, type TemaCalendario } from '@/lib/calendarioSetor';
import { primeiroNome, varsDaPaleta } from '@/lib/calendarioGibi';
import { LembreteDoDia } from '../LembreteDoDia';
import { PersonagemDoTempo } from '../clima/personagens';
import type { CondicaoClima, Estacao } from '@/lib/clima';
import { Motivo } from './desenhos';
import './gibi.css';

/** O tempo de agora no botão (06/11/2026): o personagem e a temperatura. */
export interface ClimaDoBotao {
  condicao: CondicaoClima;
  noite: boolean;
  temp: number;
  estacao: Estacao;
  variante: number;
  /** «Birigui: 31°, sol, máx 34° mín 21°», para o título e o leitor de tela. */
  resumo: string;
}

export function BotaoDoMes({ tema, paleta, hojeISO, eventosHoje, chamando, rascunhoParaPublicar, clima, onAbrir, onDispensar }: {
  tema: TemaCalendario;
  paleta: PaletaGibi;
  hojeISO: string;
  eventosHoje: EventoCalendario[];
  chamando: boolean;
  rascunhoParaPublicar: boolean;
  /** Sem previsão (ainda não chegou, ou falhou): o botão fica só com o mês. */
  clima?: ClimaDoBotao | null;
  onAbrir: () => void;
  onDispensar: () => void;
}) {
  const temHoje = eventosHoje.length > 0;
  const nomeDoMes = rotuloDoMesLongo(hojeISO.slice(0, 7)).split(' ')[0];
  const primeiro = eventosHoje[0];
  const hoje = primeiro
    ? (primeiro.tipo === 'aniversario' && primeiro.pessoa_nome ? `Aniversário de ${primeiroNome(primeiro.pessoa_nome)}` : primeiro.titulo)
    : null;

  const titulo = [
    `Calendário de ${nomeDoMes.toLowerCase()}`,
    clima?.resumo ?? null,
    hoje ? `Hoje: ${hoje}${primeiro?.detalhe ? ` · ${primeiro.detalhe}` : ''}${eventosHoje.length > 1 ? ` +${eventosHoje.length - 1}` : ''}` : null,
    rascunhoParaPublicar ? 'O mês está em rascunho: a operação ainda não vê' : null,
  ].filter(Boolean).join(' — ');

  return (
    <div className="gb-sys min-w-0 shrink" style={varsDaPaleta(paleta) as CSSProperties}>
      <button
        type="button"
        onClick={onAbrir}
        title={titulo}
        aria-label={titulo}
        className="gb-bt"
        data-chamando={chamando ? '' : undefined}
      >
        <span className="gb-bt-ic" aria-hidden><Motivo id={tema.motivo} cores={paleta} /></span>
        <span className="gb-bt-mes hidden sm:inline">{nomeDoMes}</span>
        {clima && (
          <span className="gb-bt-clima" aria-hidden>
            <i />
            <span className="gb-bt-clima-ic">
              <PersonagemDoTempo
                condicao={clima.condicao}
                noite={clima.noite}
                estacao={clima.estacao}
                variante={clima.variante}
                temp={clima.temp}
                cores={paleta}
              />
            </span>
            <b>{clima.temp}°</b>
          </span>
        )}
        {hoje && (
          <span className="gb-bt-hoje">
            <i aria-hidden />
            <span>Hoje:</span>
            <b>{hoje}</b>
          </span>
        )}
        {temHoje && <span className="gb-bt-qtd" aria-hidden>{eventosHoje.length}</span>}
        {rascunhoParaPublicar && <span className="gb-bt-rascunho" aria-hidden />}
      </button>

      <LembreteDoDia
        aberto={chamando}
        hojeISO={hojeISO}
        eventos={eventosHoje}
        tema={tema}
        paleta={paleta}
        onVer={onAbrir}
        onDispensar={onDispensar}
      />
    </div>
  );
}
