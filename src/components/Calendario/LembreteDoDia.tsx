/**
 * O lembrete que desce do botão do Calendário quando há algo marcado para hoje
 * no setor — «Hoje: Banco de horas até às 19:00», «Hoje é aniversário da
 * Maryana».
 *
 * Desce colado ao botão (que é de onde a informação vem), uma vez por dia:
 * «Ver calendário» abre o painel, «Ok, entendi» só fecha. As duas marcam o dia
 * como visto (`calendarioLembrete.ts`), e o botão para de chamar junto.
 *
 * Em gibi, como o botão (30/10/2026): um quadro com o desenho do tema e o
 * «Hoje tem 2 coisas!» em letra de gibi. As cores chegam do botão (`.gb-sys`).
 * Desce de leve, uma vez (`gb-desce`, em gibi.css), como o resto do calendário.
 */
import { X } from 'lucide-react';
import type { CSSProperties } from 'react';
import {
  INFO_TIPO, rotuloDoDia, type EventoCalendario, type PaletaGibi, type TemaCalendario,
} from '@/lib/calendarioSetor';
import { ICONE_TIPO } from './estiloTipo';
import { Motivo } from './gibi/desenhos';

interface Props {
  aberto: boolean;
  hojeISO: string;
  eventos: EventoCalendario[];
  tema: TemaCalendario;
  paleta: PaletaGibi;
  onVer: () => void;
  onDispensar: () => void;
}

export function LembreteDoDia({ aberto, hojeISO, eventos, tema, paleta, onVer, onDispensar }: Props) {
  const n = eventos.length;
  if (!aberto || n === 0) return null;
  return (
    <div role="status" aria-live="polite" className="gb-lb">
      {/* A setinha apontando para o botão. */}
      <span className="gb-lb-seta" aria-hidden />

      <div className="gb-lb-cab">
        <span className="gb-lb-ic" aria-hidden><Motivo id={tema.motivo} cores={paleta} /></span>
        <div className="gb-lb-tit">
          <p className="t">{n === 1 ? 'Hoje tem 1 coisa!' : `Hoje tem ${n} coisas!`}</p>
          <p className="s">{rotuloDoDia(hojeISO)}</p>
        </div>
        <button type="button" onClick={onDispensar} aria-label="Fechar lembrete" className="gb-lb-x">
          <X className="h-4 w-4" />
        </button>
      </div>

      <ul className="gb-lb-lista">
        {eventos.slice(0, 4).map(e => {
          const Icone = ICONE_TIPO[e.tipo];
          const aniversario = e.tipo === 'aniversario' && e.pessoa_nome;
          return (
            <li key={e.id} className="gb-item">
              <span className="gb-ic" style={{ '--tipo': INFO_TIPO[e.tipo].cor ?? paleta.ac } as CSSProperties}>
                <Icone aria-hidden />
              </span>
              <div>
                <b>{aniversario ? `Aniversário de ${e.pessoa_nome} 🎉` : e.titulo}</b>
                <span>{e.detalhe || INFO_TIPO[e.tipo].rotulo}</span>
              </div>
            </li>
          );
        })}
        {n > 4 && <li className="gb-lb-mais">e mais {n - 4} no calendário</li>}
      </ul>

      <div className="gb-lb-acoes">
        <button type="button" className="gb-lb-ver" onClick={onVer}>Ver calendário</button>
        <button type="button" className="gb-lb-ok" onClick={onDispensar}>Ok, entendi</button>
      </div>
    </div>
  );
}
