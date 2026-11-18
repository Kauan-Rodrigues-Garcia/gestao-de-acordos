/**
 * conteudo.ts — os textos do livro, como vêm do banco.
 *
 * O texto é escrito no banco, mas entra na página como HTML dentro do livro:
 * por isso tudo passa por `escapar`. O único destaque aceito é `**assim**`.
 */
export interface ConteudoDoLivro {
  era: string;
  titulo_capa: string;
  subtitulo_capa: string;
  capitulo: string;
  titulo: string;
  paragrafos: string[];
  assinatura: string;
  recado_titulo: string;
  sugestoes: string[];
  alt_foto: string;
}

const PADRAO: ConteudoDoLivro = {
  era: 'Era uma vez…', titulo_capa: 'Uma nova história', subtitulo_capa: '', capitulo: 'Capítulo 1',
  titulo: 'Bem-vindo ao mundo', paragrafos: [], assinatura: '', recado_titulo: 'Deixe um recadinho',
  sugestoes: [], alt_foto: 'Foto do bebê',
};

const texto = (v: unknown, padrao: string) => (typeof v === 'string' && v.trim() ? v.trim() : padrao);
const lista = (v: unknown, maximo: number) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()).slice(0, maximo) : []);

export function conteudoDoBanco(bruto: unknown): ConteudoDoLivro {
  const c = (bruto && typeof bruto === 'object' ? bruto : {}) as Record<string, unknown>;
  return {
    era: texto(c.era, PADRAO.era),
    titulo_capa: texto(c.titulo_capa, PADRAO.titulo_capa),
    subtitulo_capa: texto(c.subtitulo_capa, PADRAO.subtitulo_capa),
    capitulo: texto(c.capitulo, PADRAO.capitulo),
    titulo: texto(c.titulo, PADRAO.titulo),
    paragrafos: lista(c.paragrafos, 8),
    assinatura: texto(c.assinatura, PADRAO.assinatura),
    recado_titulo: texto(c.recado_titulo, PADRAO.recado_titulo),
    sugestoes: lista(c.sugestoes, 4),
    alt_foto: texto(c.alt_foto, PADRAO.alt_foto),
  };
}

export const escapar = (s: string) => s
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Escapa e só então transforma `**destaque**` em `<strong>`. */
export const comDestaque = (s: string) => escapar(s).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
