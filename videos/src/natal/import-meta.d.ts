// Os módulos do app que o vídeo importa (os desenhos do Halloween) passam, só
// como TIPO, pelo `src/lib/supabase.ts`, que lê `import.meta.env` — o tipo que
// o Vite declara. No vídeo nada disso roda; isto só deixa o typecheck passar.
interface ImportMeta {
  readonly env: Record<string, string | undefined>;
}
