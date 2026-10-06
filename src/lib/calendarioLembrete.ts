/**
 * calendarioLembrete.ts — a pessoa já viu o lembrete do calendário hoje?
 *
 * Quando há algo marcado para hoje no setor (o banco de horas do dia 12, um
 * aniversário), o botão do topo pisca e um lembrete desce ao lado dele. Os dois
 * param quando a pessoa abre o calendário ou dispensa o lembrete — e não voltam
 * no mesmo dia, nem ao trocar de tela.
 *
 * Fica no navegador (localStorage), por pessoa e por dia: é conveniência de
 * quem está olhando, não dado do sistema. Navegador que recusa o armazenamento
 * (janela anônima, bloqueio) mostra o lembrete de novo a cada carga — nunca
 * quebra a tela.
 */

const PREFIXO = 'calendario-lembrete-visto';

export function chaveDoLembrete(perfilId: string, diaISO: string): string {
  return `${PREFIXO}:${perfilId}:${diaISO}`;
}

export function lembreteVisto(perfilId: string | null | undefined, diaISO: string): boolean {
  if (!perfilId) return false;
  try {
    return localStorage.getItem(chaveDoLembrete(perfilId, diaISO)) === '1';
  } catch {
    return false;
  }
}

export function marcarLembreteVisto(perfilId: string | null | undefined, diaISO: string): void {
  if (!perfilId) return;
  try {
    localStorage.setItem(chaveDoLembrete(perfilId, diaISO), '1');
    // Os dias anteriores não servem mais: apaga para não acumular.
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k?.startsWith(`${PREFIXO}:${perfilId}:`) && k !== chaveDoLembrete(perfilId, diaISO)) {
        localStorage.removeItem(k);
      }
    }
  } catch {
    /* sem armazenamento: o lembrete volta na próxima carga, e só isso */
  }
}
