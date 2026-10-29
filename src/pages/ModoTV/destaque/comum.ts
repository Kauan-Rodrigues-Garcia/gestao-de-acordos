/**
 * comum.ts — o que todos os estilos da cena «Destaque» usam: os textos já
 * prontos (título, data, nome, valor) e a carga das fontes. A foto com
 * reserva e as animações estão em `pecas.tsx`.
 *
 * Quem aparece sai de `destaqueDaTela` (`numeros.ts`); aqui só se prepara o
 * que cada estilo desenha. Os estilos ficam um por arquivo nesta pasta e o
 * `Destaque.tsx` escolhe pelo campo «Estilo» da tela.
 */
import { useEffect } from 'react';
import type { TelaDoPainel } from '../tipos';
import { opcao } from '../templates';
import { destaqueDaTela, iniciais, moedaTv, nomeCurto, type DestaqueNaTela, type VisaoTv } from '../numeros';

export interface PropsEstilo { v: VisaoTv; tela: TelaDoPainel }

export const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export interface DadosDestaque extends DestaqueNaTela {
  /** O do campo «Título», ou o automático do dia / do mês. */
  titulo: string;
  /** «quinta-feira, 29 de outubro» ou «outubro · até agora». */
  quando: string;
  /** Primeiro e último nome; «Quem será?» sem ninguém. */
  nome: string;
  /** `null` com «Mostrar o valor» desligado, ou sem ninguém. */
  valor: string | null;
  pagamentos: number;
}

export function dataPorExtenso(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
}

export function dadosDoDestaque(v: VisaoTv, tela: TelaDoPainel, tituloPadrao?: { dia: string; mes: string }): DadosDestaque {
  const d = destaqueDaTela(v, tela);
  const p = d.pessoa;
  const automatico = tituloPadrao ?? { dia: 'Destaque do dia', mes: 'Destaque do mês' };
  return {
    ...d,
    titulo: opcao<string>(tela, 'titulo') || (d.doMes ? automatico.mes : automatico.dia),
    quando: d.doMes
      ? `${MESES[Number(v.mesIso.slice(5, 7)) - 1] ?? ''} · até agora`
      : d.dia ? dataPorExtenso(d.dia) : '',
    nome: p ? nomeCurto(p.nome) : 'Quem será?',
    valor: p && opcao<boolean>(tela, 'mostrar_valor') ? moedaTv(p.valor) : null,
    pagamentos: p?.pagamentos ?? 0,
  };
}

/** «em 6 pagamentos». */
export const emPagamentos = (n: number) => (n > 0 ? `em ${n} ${n === 1 ? 'pagamento' : 'pagamentos'}` : '');

/** Corpo que cabe numa largura, para letra de ~`em` de largura por caractere. */
export const caber = (texto: string, largura: number, max: number, em = 0.55, min = 40) =>
  Math.max(min, Math.min(max, Math.floor(largura / (Math.max(1, texto.length) * em))));

/** Injeta o `<link>` de fonte uma vez (como `carregarFontesDoCard`). Sem a fonte, a reserva. */
export function useFonte(id: string, href: string): void {
  useEffect(() => {
    try {
      if (document.getElementById(id)) return;
      const link = document.createElement('link');
      link.id = id;
      link.rel = 'stylesheet';
      link.href = href;
      document.head.appendChild(link);
    } catch { /* a reserva serve */ }
  }, [id, href]);
}

export { iniciais };
