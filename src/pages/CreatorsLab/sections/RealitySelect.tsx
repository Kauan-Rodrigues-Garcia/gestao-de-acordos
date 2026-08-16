/**
 * RealitySelect — a escolha entre os dois mundos.
 *
 * Cada cartão é uma amostra do tema que representa: usa as cores, a tipografia,
 * o raio de canto e a sombra daquele tema, não os do tema ativo. A pessoa vê a
 * diferença antes de escolher, em vez de ler dois nomes.
 */
import { motion } from 'framer-motion';
import { LISTA_TEMAS, type TemaCreators, type TokensTema } from '../theme/themes';

function CartaoRealidade({
  t, aoEscolher, indice, movimentoReduzido,
}: {
  t: TokensTema;
  aoEscolher: (id: TemaCreators) => void;
  indice: number;
  movimentoReduzido: boolean;
}) {
  const cyber = t.id === 'cyberpunk';

  return (
    <motion.button
      type="button"
      onClick={() => aoEscolher(t.id)}
      initial={movimentoReduzido ? false : { opacity: 0, y: 34 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.45 + indice * 0.28, duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
      whileHover={movimentoReduzido ? undefined : { y: -6, scale: 1.015 }}
      whileTap={{ scale: 0.985 }}
      className="group relative w-full max-w-sm overflow-hidden text-left"
      style={{
        background: t.cores.fundo,
        border: `${t.bordaLargura} solid ${t.cores.borda}`,
        borderRadius: t.raio,
        boxShadow: t.sombra,
        padding: '1.75rem',
        minHeight: '15rem',
        color: t.cores.texto,
        /* O canto chanfrado é do Cyberpunk; o Arcade é bloco inteiro. A
           diferença precisa aparecer ANTES da escolha, senão os dois cartões
           são o mesmo retângulo com texto trocado. */
        clipPath: cyber
          ? 'polygon(0 0, calc(100% - 22px) 0, 100% 22px, 100% 100%, 22px 100%, 0 calc(100% - 22px))'
          : undefined,
      }}
      aria-label={`Entrar na realidade ${t.nome}: ${t.descricao}`}
    >
      {/* Textura própria de cada tema, para o cartão já parecer o mundo dele:
          varredura fina no Cyberpunk, tubo abaulado no Arcade. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: cyber
            ? 'repeating-linear-gradient(0deg, rgba(0,0,0,.3) 0 1px, transparent 1px 3px)'
            : 'radial-gradient(ellipse 130% 110% at 50% 50%, transparent 55%, rgba(0,0,0,.6) 100%),'
              + 'repeating-linear-gradient(0deg, rgba(0,0,0,.24) 0 2px, transparent 2px 4px)',
          opacity: cyber ? 0.5 : 0.75,
        }}
      />

      {/* A assinatura de cada mundo: fita de perigo no Cyberpunk, fita de neon
          no Arcade. Mesma faixa, dois significados. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0"
        style={{
          height: cyber ? 8 : 5,
          background: cyber
            ? `repeating-linear-gradient(45deg, ${t.cores.primaria} 0 10px, #000 10px 20px)`
            : `repeating-linear-gradient(90deg, ${t.cores.primaria} 0 10px, ${t.cores.secundaria} 10px 20px)`,
        }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: `radial-gradient(300px circle at 50% 0%, ${t.cores.brilho}, transparent 70%)` }}
      />

      <span className="relative block">
        <span
          className="block text-[.62rem] tracking-[.3em] uppercase"
          style={{ color: t.cores.secundaria, fontFamily: t.fontes.mono }}
        >
          {cyber ? 'protocol_01' : 'cabinet 01'}
        </span>

        <span
          className="mt-3 block text-3xl font-bold"
          style={{
            fontFamily: t.fontes.display,
            color: t.cores.primaria,
            letterSpacing: cyber ? '.12em' : '.06em',
            textShadow: cyber ? `0 0 22px ${t.cores.brilho}` : '3px 3px 0 rgba(0,0,0,.6)',
          }}
        >
          {t.nome}
        </span>

        <span
          className="mt-3 block text-sm leading-relaxed"
          style={{ color: t.cores.textoSuave, fontFamily: t.fontes.corpo }}
        >
          {t.descricao}
        </span>

        {/* Amostra do vocabulário: a mesma seção, com o nome de cada mundo. */}
        <span className="mt-5 block space-y-1" style={{ fontFamily: t.fontes.mono, fontSize: '.66rem' }}>
          {([['perfis', t.vocab.perfis], ['projetos', t.vocab.projetos], ['contato', t.vocab.contato]] as const)
            .map(([de, para]) => (
              <span key={de} className="flex items-center gap-2">
                <span style={{ color: t.cores.textoSuave }}>{de}</span>
                <span style={{ color: t.cores.borda }}>→</span>
                <span style={{ color: t.cores.acento }}>{para}</span>
              </span>
            ))}
        </span>

        <span
          className="mt-6 inline-block px-4 py-2 text-[.7rem] tracking-[.2em] uppercase"
          style={{
            fontFamily: t.fontes.mono,
            border: `${t.bordaLargura} solid ${t.cores.primaria}`,
            borderRadius: t.raio,
            color: t.cores.primaria,
          }}
        >
          {cyber ? '[ conectar ]' : '▶ insert coin'}
        </span>
      </span>
    </motion.button>
  );
}

export function RealitySelect({
  aoEscolher, movimentoReduzido,
}: {
  aoEscolher: (t: TemaCreators) => void;
  movimentoReduzido: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[90] flex flex-col items-center justify-center gap-8 bg-black px-5 py-10 overflow-y-auto">
      <motion.div
        initial={movimentoReduzido ? false : { opacity: 0, y: -14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        className="text-center"
      >
        <p className="font-mono text-[.65rem] uppercase tracking-[.35em] text-[#FCEE0A]">
          escolha uma
        </p>
        <h1 className="mt-2 font-mono text-2xl font-bold tracking-[.2em] text-white sm:text-4xl">
          SELECT YOUR REALITY
        </h1>
        <p className="mt-3 font-mono text-xs text-white/40">
          mesmo conteúdo · duas experiências · dá para trocar depois
        </p>
      </motion.div>

      <div className="flex flex-col md:flex-row items-stretch justify-center gap-6 w-full max-w-3xl">
        {LISTA_TEMAS.map((t, i) => (
          <CartaoRealidade
            key={t.id} t={t} indice={i}
            aoEscolher={aoEscolher}
            movimentoReduzido={movimentoReduzido}
          />
        ))}
      </div>
    </div>
  );
}
