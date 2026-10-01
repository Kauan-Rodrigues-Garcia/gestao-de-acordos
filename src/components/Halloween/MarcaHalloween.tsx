import { useEffect, type CSSProperties } from 'react';
import { carregarFonte } from './fonte';

/**
 * O nome do sistema no menu, com «Halloween» em cima — na mesma fonte da
 * prévia do tema (Creepster, ver `fonte.ts`), em cor de abóbora.
 */

/*
 * Estilo aqui, e não em `halloween.css`: o `Layout` importa este componente
 * direto, e levar a folha inteira do tema para o pacote principal faria todo
 * mundo baixar o Halloween.
 *
 * Cor de abóbora, que é cor de objeto: lê no menu claro e no escuro. Enquanto
 * a fonte não chega, a reserva é uma serifada — a linha não muda de altura.
 */
const TITULO: CSSProperties = {
  fontFamily: "'Creepster', Georgia, serif",
  fontSize: 22,
  lineHeight: 1,
  letterSpacing: '0.04em',
  color: 'oklch(0.7 0.19 48)',
  textShadow: '0 1px 0 oklch(0.35 0.12 35 / .55), 0 0 8px oklch(0.7 0.19 48 / .25)',
};

export function MarcaHalloween({ nome }: { nome: string }) {
  useEffect(carregarFonte, []);
  return (
    <div className="flex flex-col gap-[3px]">
      <span style={TITULO} aria-hidden="true">Halloween</span>
      <p className="font-bold text-sm text-sidebar-foreground leading-none">{nome}</p>
    </div>
  );
}
