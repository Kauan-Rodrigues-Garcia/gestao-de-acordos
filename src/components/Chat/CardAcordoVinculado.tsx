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
import { ArrowRightLeft, Link2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { rotaDoAcordo } from '@/lib/notificacoes-rota';
import { formatBRL } from '@/lib/money';
import { useTenant } from '@/lib/tenant-config';
import type { MensagemChat } from '@/services/chat/chat.service';
import { horaDoBalao } from './formatos';
import {
  acordoDoLeitor, descreverMudanca, ehCardDoAnalitico, fraseDoCard, frasesDoAnalitico, lerCardAcordo,
} from './cardAcordo';

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

  // Os avisos do Analítico (transferência e par pelo relatório, 20261116234244).
  if (ehCardDoAnalitico(dados)) {
    const { titulo, detalhe } = frasesDoAnalitico(dados, meuId);
    const transferido = dados.evento === 'transferido';
    const Icone = transferido ? ArrowRightLeft : Link2;
    return (
      <div className="flex justify-center py-1.5">
        <div className={`w-full max-w-[85%] rounded-xl border px-3 py-2.5 text-xs ${
          transferido ? 'border-amber-500/30 bg-amber-500/[0.07]' : 'border-primary/25 bg-primary/5'
        }`}>
          <div className="flex items-center gap-1.5 font-semibold text-foreground">
            <Icone
              className={`h-3.5 w-3.5 shrink-0 ${transferido ? 'text-amber-600 dark:text-amber-400' : 'text-primary'}`}
              aria-hidden="true"
            />
            <span>{titulo}</span>
          </div>
          {identificacao && (
            <p className="mt-0.5 text-[11px] text-muted-foreground">{identificacao}</p>
          )}
          <p className="mt-2 leading-snug">{detalhe}</p>
          {dados.valorRecebido !== null && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Recebido no relatório: <span className="font-mono text-foreground">{formatBRL(dados.valorRecebido)}</span>
            </p>
          )}
          <div className="mt-2 flex items-center justify-between gap-2">
            {acordoId ? (
              <Button
                size="sm" variant="outline" className="h-7 text-xs"
                onClick={() => navigate(rotaDoAcordo(acordoId))}
              >
                Ver acordo
              </Button>
            ) : <span />}
            <span className="text-[10px] text-muted-foreground">
              Pelo Analítico · {dados.feitoPor === meuId ? 'você confirmou' : `${dados.feitoPorNome} confirmou`} · {horaDoBalao(m.criado_em)}
            </span>
          </div>
        </div>
      </div>
    );
  }

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
              onClick={() => navigate(rotaDoAcordo(acordoId))}
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
