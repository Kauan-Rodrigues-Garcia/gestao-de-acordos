/**
 * AcordoTags.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Chips das tags visuais de um acordo (`acordos.tag_ids` → `tags`).
 *
 * Renderizador ÚNICO. A marcação vivia solta dentro da tabela do Dashboard,
 * que é PaguePlay-only (`{isPP && ...}`): a BookPlay salvava a tag e não tinha
 * onde vê-la, porque a tela dela é `/acordos`. Quem precisar mostrar tag
 * importa daqui em vez de repetir o `map`.
 *
 * `tag_ids` guarda só o id; nome e cor vêm de `useEmpresaTags`. Id sem tag
 * correspondente (tag excluída depois de aplicada) é ignorado em silêncio.
 */
type TagVisual = { id: string; nome: string; cor: string };

type Props = {
  tagIds: string[] | null | undefined;
  tags: TagVisual[];
  size?: 'xs' | 'sm';
};

const TAG_BASE =
  'inline-flex items-center font-bold uppercase rounded-full border px-1.5 py-0.5 whitespace-nowrap';

export function AcordoTags({ tagIds, tags, size = 'xs' }: Props) {
  const sizeClasses = size === 'sm' ? 'text-[10px]' : 'text-[9px]';

  return (
    <>
      {(tagIds ?? []).map(tid => {
        const tag = tags.find(t => t.id === tid);
        if (!tag) return null;
        return (
          <span
            key={tid}
            className={`${TAG_BASE} ${sizeClasses}`}
            style={{
              backgroundColor: `${tag.cor}22`,
              color: tag.cor,
              borderColor: `${tag.cor}55`,
            }}
            title={tag.nome}
          >
            {tag.nome}
          </span>
        );
      })}
    </>
  );
}

export default AcordoTags;
