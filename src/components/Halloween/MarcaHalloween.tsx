import { useEffect, type CSSProperties } from 'react';

/**
 * O nome do sistema no menu, com «Halloween» em cima — na mesma fonte da
 * prévia do tema (Creepster), em cor de abóbora.
 *
 * A fonte mora no próprio site (`public/fonts/creepster.woff2`, licença OFL),
 * e não no Google: um domínio a menos para a rede da operação liberar. Ela só
 * é declarada quando o tema está ligado — quem não vê o Halloween não baixa
 * nada. A declaração entra uma vez e fica: tirar ao desligar faria a fonte
 * piscar em cada troca de tela.
 */
const ID_FONTE = 'hw-fonte-creepster';
const FONTE = `@font-face {
  font-family: 'Creepster';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('/fonts/creepster.woff2') format('woff2');
}`;

function carregarFonte() {
  if (typeof document === 'undefined' || document.getElementById(ID_FONTE)) return;
  const estilo = document.createElement('style');
  estilo.id = ID_FONTE;
  estilo.textContent = FONTE;
  document.head.appendChild(estilo);
}

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
