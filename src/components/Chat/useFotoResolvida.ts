import { useEffect, useState } from 'react';
import { urlDoAnexo, urlDoAnexoEmCache } from '@/services/chat/chat.service';

/**
 * A foto pronta para o `<img>`, venha ela de onde vier.
 *
 * Foto de PESSOA é uma URL pública inteira (`https://…/object/public/perfis/…`)
 * e vai direto para a tag. Foto de GRUPO é um CAMINHO dentro do balde `chat`,
 * que é privado — o mesmo balde dos anexos, e pelo mesmo motivo: conversa
 * interna não fica em endereço público adivinhável.
 *
 * A primeira versão dos grupos gravou `getPublicUrl()` do balde privado, que
 * devolve um endereço bem-formado e morto: o navegador desenhava o ícone de
 * imagem quebrada, sem erro em lugar nenhum. Caminho que não começa com `http`
 * passa a ser assinado aqui, com o mesmo cache de `urlDoAnexo`.
 */
export function useFotoResolvida(foto: string | null): string | null {
  const [resolvida, setResolvida] = useState<{ caminho: string; url: string | null } | null>(null);
  const publica = foto && /^(https?:|data:|blob:)/i.test(foto) ? foto : null;
  useEffect(() => {
    if (!foto || publica) return;
    let vivo = true;
    void urlDoAnexo(foto).then(url => { if (vivo) setResolvida({ caminho: foto, url }); });
    return () => { vivo = false; };
  }, [foto, publica]);
  if (!foto) return null;
  return publica ?? urlDoAnexoEmCache(foto) ?? (resolvida?.caminho === foto ? resolvida.url : null);
}
