/**
 * O card «acordo vinculado alterado» no meio da conversa.
 *
 * Nasce no banco (`fn_acordo_par_avisar`, migration 20261030235500): quando uma
 * das duas pessoas de um par Direto/Extra mexe no acordo, o outro lado é
 * sincronizado e a conversa direta das duas recebe esta mensagem de sistema
 * (`sistema = 'acordo_vinculo'`). Pedido do Cleber, 30/10/2026 — no lugar de
 * uma notificação, um card na conversa de quem divide o acordo.
 *
 * Como o resto dos avisos de sistema, a frase é montada aqui a partir de
 * `sistema_dados`: rótulos de situação e forma de pagamento são do tenant de
 * quem lê, e o valor cru envelhece melhor que uma frase pronta.
 */
import { Link2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { rotaDoAcordo } from '@/lib/notificacoes-rota';
import { useTenant } from '@/lib/tenant-config';
import type { MensagemChat } from '@/services/chat/chat.service';
import { horaDoBalao } from './formatos';
import { acordoDoLeitor, descreverMudanca, fraseDoCard, lerCardAcordo } from './cardAcordo';

export function CardAcordoVinculado({ m, meuId }: { m: MensagemChat; meuId: string | null | undefined }) {
  const tenant   = useTenant();
  const navigate = useNavigate();
  const dados    = lerCardAcordo(m.sistema_dados);
  const rotulos  = { status: tenant.statusLabels, tipo: tenant.tipoLabels };
  const acordoId = acordoDoLeitor(dados, meuId);

  const identificacao = [
    dados.chave ? `${dados.rotulo} ${dados.chave}` : null,
    dados.cliente,
    dados.parcela && (dados.parcelas ?? 1) > 1 ? `parcela ${dados.parcela}/${dados.parcelas}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <div className="flex justify-center py-1.5">
      <div className="w-full max-w-[85%] rounded-xl border border-primary/25 bg-primary/5 px-3 py-2.5 text-xs">
        <div className="flex items-center gap-1.5 font-semibold text-foreground">
          <Link2 className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
          <span>{fraseDoCard(dados, meuId, rotulos.status)}</span>
        </div>
        {identificacao && (
          <p className="mt-0.5 text-[11px] text-muted-foreground">{identificacao}</p>
        )}

        {dados.evento === 'alterado' && dados.mudancas.length > 0 && (
          <ul className="mt-2 space-y-0.5">
            {dados.mudancas.map(mud => {
              const d = descreverMudanca(mud, rotulos);
              return (
                <li key={mud.campo} className="leading-snug">
                  <span className="text-muted-foreground">{d.campo}:</span>{' '}
                  {d.de === null
                    ? <span>alterado</span>
                    : <><span className="line-through opacity-60">{d.de}</span> → <strong>{d.para}</strong></>}
                </li>
              );
            })}
          </ul>
        )}

        {dados.evento === 'excluido' && dados.resultado && (
          <p className="mt-2 leading-snug">
            {dados.resultado === 'virou_direto'
              ? 'O acordo que ficou passou a ser DIRETO.'
              : 'O acordo que ficou não tem mais vínculo.'}
          </p>
        )}

        {!dados.sincronizado && (
          <p className="mt-2 leading-snug text-destructive">
            O outro lado não pôde ser atualizado. Confira o acordo ou chame o líder.
          </p>
        )}

        <div className="mt-2 flex items-center justify-between gap-2">
          {acordoId ? (
            <Button
              size="sm" variant="outline" className="h-7 text-xs"
              onClick={() => navigate(rotaDoAcordo(acordoId, tenant.isPaguePlay))}
            >
              Ver acordo
            </Button>
          ) : <span />}
          <span className="text-[10px] text-muted-foreground">{horaDoBalao(m.criado_em)}</span>
        </div>
      </div>
    </div>
  );
}
