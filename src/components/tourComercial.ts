/**
 * tourComercial.ts — o tour do primeiro acesso, no Comercial.
 *
 * Tudo na aba Vendas (/vendas), refeita em 21/09/2026. Até aqui o Comercial
 * caía nos passos da BookPlay: o tour falava de acordo e navegava para
 * /acordos, rota que não existe no Comercial — o passo abria numa tela de
 * «sem acesso».
 *
 * Os alvos são os `data-tour` de `pages/Vendas/index.tsx`. Arquivo à parte de
 * `OnboardingTour.tsx` porque ele só pode exportar componente (fast refresh), e
 * a lista precisa ser testável sozinha.
 */
import type { ElementType } from 'react';
import {
  BarChart3, Filter, FileText, Plus, AlertTriangle, ClipboardPaste,
} from 'lucide-react';

export interface PassoDoTour {
  target:    string | null;
  placement: 'top' | 'bottom' | 'left' | 'right' | 'center';
  Icon:      ElementType | null;
  emoji?:    string;
  title:     string;
  body:      string;
  route?:    string;
  spotMaxH?: number;
  scrollPx?: number;
  /** Chave sem a qual o passo não tem o que mostrar. */
  chave?:    string;
}

const PASSOS: PassoDoTour[] = [
  {
    target: null, placement: 'center', Icon: null, emoji: '👋',
    title:  'Bem-vindo à Gestão Comercial!',
    body:   'Um tour rápido pela aba Vendas, onde você lança e acompanha as suas vendas. Leva menos de 1 minuto.',
  },
  {
    target: '[data-tour="vendas-metricas"]', placement: 'bottom', Icon: BarChart3, route: '/vendas',
    spotMaxH: 210, chave: 'ver_vendas',
    title: 'Números do mês',
    body:  'Vendas na meta, faturamento, vendas de hoje, pendências e o percentual de devolução e cancelamento. Na meta é a venda confirmada E com contrato assinado.',
  },
  {
    target: '[data-tour="nova-venda"]', placement: 'left', Icon: Plus, route: '/vendas',
    chave: 'criar_vendas',
    title: 'Lançar venda',
    body:  'Só NR e valor. Enter salva, e «continuar lançando» deixa o cursor pronto para a próxima. Situação, assinatura, estado e pagamento chegam pelo relatório.',
  },
  {
    target: '[data-tour="colar-vendas"]', placement: 'bottom', Icon: ClipboardPaste, route: '/vendas',
    chave: 'criar_vendas',
    title: 'Colar várias',
    body:  'Anotou o dia numa planilha ou no WhatsApp? Cole tudo de uma vez — uma venda por linha, NR e valor em qualquer ordem. Você confere antes de gravar.',
  },
  {
    target: '[data-tour="vendas-filtros"]', placement: 'bottom', Icon: Filter, route: '/vendas',
    chave: 'ver_vendas',
    title: 'Abas e busca',
    body:  'Todas, Na meta, Pendências e Perdas. Busque por NR, cliente ou vendedor. Pendências mostra o que ainda espera o relatório ou a assinatura, de qualquer mês.',
  },
  {
    target: '[data-tour="vendas-tabela"]', placement: 'top', Icon: FileText, route: '/vendas',
    spotMaxH: 140, scrollPx: 320, chave: 'ver_vendas',
    title: 'Suas vendas, dia a dia',
    body:  'Cada linha é uma venda. O status diz quem mexe agora: «Aguardando relatório», «Falta assinatura» ou «Na meta». Clique na linha para ver o detalhe.',
  },
  {
    target: null, placement: 'center', Icon: AlertTriangle, route: '/vendas',
    chave: 'ver_vendas',
    title: 'Confira o NR',
    body:  'Quando o relatório é importado e o NR que você lançou não aparece nele nem na prévia do setor, a venda ganha 1 dia de prazo e depois vai para a lixeira. Você é avisado quando o prazo começa e quando a venda sai.',
  },
];

/**
 * Os passos que esta pessoa consegue ver. Sem `ver_vendas` o tour não tem
 * para onde ir além das boas-vindas — navegar para /vendas cairia na tela de
 * «sem acesso». Sem `criar_vendas`, os botões de lançar nem estão na tela.
 */
export function passosDoComercial(temPermissao: (chave: string) => boolean): PassoDoTour[] {
  return PASSOS.filter(p => !p.chave || temPermissao(p.chave));
}

/** Chave própria: quem já viu (ou pulou) o tour de acordos vê este uma vez. */
export const ONBOARDING_COMERCIAL_KEY = (uid: string) => `onboarding_comercial_v1_${uid}`;
