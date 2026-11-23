/**
 * As cores da gaveta do Desafio do Vale (23/11/2026), pelo Gestão de quem olha
 * (pedido do usuário):
 *
 *   Natal ligado, tema claro ...... «Natal claro»: a gaveta clara e limpa; o
 *                                    Natal vem SÓ dos enfeites (pisca-pisca,
 *                                    sincelos, neve caindo na abertura)
 *   Natal ligado, tema escuro ..... «Noite de Natal» (o mesmo do Desafio
 *                                    Cobrança), com os enfeites
 *   sem o Natal ................... «Campanha»: as cores da arte (azul-marinho,
 *                                    dourado, a laranja do cupom), sem enfeites
 *
 * «Natal ligado» é o do resto do app (`useTemaNatal`, que desconta quem
 * desligou no menu de temas); escuro é `ehTemaEscuro`. As variáveis são as
 * `--dc-*` da gaveta do Desafio Cobrança (`temas.ts`), postas no `style`.
 */
import { useTheme } from 'next-themes';
import { useTemaNatal } from '@/components/Natal/tema';
import { ehTemaEscuro } from '@/lib/temas';
import { TEMAS, type CoresDoDesafio, type TemaDoDesafio } from '@/components/DesafioCobranca/temas';

/** A arte da campanha: a base de «Campanha» e o que os outros não trocam. */
const CAMPANHA: CoresDoDesafio = {
  noite: '#0b1024', noite2: '#141a3a', noite3: '#1d1f45',
  brilho1: 'rgba(251, 146, 60, 0.22)', brilho2: 'rgba(255, 192, 77, 0.16)',
  veu: '#ffffff', cartao: 'rgba(255, 255, 255, 0.06)', cartaoBorda: 'rgba(255, 255, 255, 0.14)',
  texto: '#f7f4ee', suave: '#c4c8da',
  ouro: '#ffc04d', coral: '#ff9a5c', sobreOuro: '#2b1400', verde: '#45e0a0', vermelho: '#ff8a8a', foco: '#8ec5ff',
  quente1: '#ffd36b', quente2: '#ff9a5c', quente3: '#ff6f61', claro1: '#ffe4a3', claro2: '#ffc27a',
  tinta: '#2b1400', tintaOk: '#052a1a',
  canhoto: 'rgba(43, 20, 0, 0.88)', canhotoTexto: '#ffe7a8',
  verso: '#1b2150', trilho: 'rgba(255, 255, 255, 0.12)', marca: 'rgba(255, 255, 255, 0.7)', estrela: '#ffffff', sol: '#fff3c4',
  minha: '#8ec5ff', minha2: '#7dd3fc', minhaTexto: '#cfe6ff',
};

export const TEMA_VALE_CAMPANHA: TemaDoDesafio = {
  id: 'vale-campanha', nome: 'Campanha', sobre: 'As cores da arte: azul-marinho, dourado e a laranja do cupom.',
  cores: CAMPANHA,
};

/**
 * Claro e limpo, como o Gestão no tema claro. O destaque é o dourado da
 * campanha escurecido (o claro some no branco); o Natal fica por conta dos
 * enfeites. Contraste do texto ≥ 7:1 sobre o fundo.
 */
export const TEMA_VALE_NATAL_CLARO: TemaDoDesafio = {
  id: 'vale-natal-claro', nome: 'Natal claro', neve: true, enfeites: true,
  sobre: 'Claro e limpo; o Natal vem só dos enfeites.',
  cores: {
    ...CAMPANHA,
    noite: '#ffffff', noite2: '#fbfaf7', noite3: '#f3f1ec',
    brilho1: 'rgba(251, 146, 60, 0.08)', brilho2: 'rgba(255, 255, 255, 0)',
    veu: '#0f172a', cartao: 'rgba(255, 255, 255, 0.92)', cartaoBorda: 'rgba(15, 23, 42, 0.1)',
    texto: '#0f172a', suave: '#475569',
    ouro: '#b45309', coral: '#ea580c', sobreOuro: '#ffffff',
    verde: '#047857', vermelho: '#b91c1c', foco: '#b45309',
    verso: '#f1f5f9', trilho: 'rgba(15, 23, 42, 0.1)', marca: 'rgba(15, 23, 42, 0.45)',
    // A neve: um cinza-azulado que aparece no branco.
    estrela: 'rgba(100, 116, 139, 0.45)', sol: '#ffffff',
    minha: '#1d4ed8', minha2: '#0ea5e9', minhaTexto: '#1e3a8a',
  },
};

export const TEMA_VALE_NOITE_DE_NATAL: TemaDoDesafio = TEMAS.find(t => t.id === 'noite-de-natal')!;

export type EscolhaDeTema = 'auto' | 'natal-claro' | 'natal-escuro' | 'sem-natal';

/** A regra (23/11/2026): sem Natal, «Campanha»; com Natal, claro ou noite pelo tema do Gestão. */
export function temaDoVale(natal: boolean, escuro: boolean): TemaDoDesafio {
  if (!natal) return TEMA_VALE_CAMPANHA;
  return escuro ? TEMA_VALE_NOITE_DE_NATAL : TEMA_VALE_NATAL_CLARO;
}

/** O tema de quem olha (ou o forçado pela visão de teste do super_admin). */
export function useTemaDoVale(forcado: EscolhaDeTema = 'auto'): TemaDoDesafio {
  const natal = useTemaNatal() !== null;
  // O forçado do app vem antes: o app do celular força o claro.
  const { resolvedTheme, forcedTheme } = useTheme();
  if (forcado === 'natal-claro') return TEMA_VALE_NATAL_CLARO;
  if (forcado === 'natal-escuro') return TEMA_VALE_NOITE_DE_NATAL;
  if (forcado === 'sem-natal') return TEMA_VALE_CAMPANHA;
  return temaDoVale(natal, ehTemaEscuro(forcedTheme ?? resolvedTheme));
}
