/**
 * Aba Plantão — o Plantão Elite no app, para a gerência do Receptivo
 * (13/10/2026: «para conseguirem verificar e copiar e mandar também»).
 *
 * O quadro é o mesmo da aba do Painel Líder (`usePlantaoElite` e
 * `FolhaPlantaoElite`): a dupla do dia, faixa a faixa. A folha aparece na
 * largura do celular, rolando de lado; a imagem sai de uma cópia de largura
 * fixa, fora da tela, para não ir cortada. «Enviar» abre a folha de
 * compartilhar do aparelho (WhatsApp); «Copiar imagem» é a reserva.
 *
 * Quem vê: a chave `painel_lider_sub_elite`, a mesma da web e a que o banco
 * cobra em `fn_elite_plantao_hora` — na gerência, ligada por exceção em quem é
 * do Receptivo.
 */
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { FolhaPlantaoElite } from '@/pages/Dashboard/Analitico/PlantaoElite';
import { usePlantaoElite } from '@/pages/Dashboard/Analitico/usePlantaoElite';
import {
  compartilharPng, copiarImagemDoElemento, gerarPngDoElemento, podeCompartilharImagem,
} from '@/lib/copiarImagem';
import { plantaoDoDia } from '@/services/plantaoElite/plantaoElite';

const ROTULO_PLANTAO = { impar: 'Ímpar', par: 'Par' } as const;

/** «Sexta, 09/10». Meio-dia UTC: a data não anda com o fuso do aparelho. */
function diaCurto(data: string): string {
  const semana = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', timeZone: 'UTC' })
    .format(new Date(`${data}T12:00:00Z`)).replace('-feira', '');
  return `${semana.charAt(0).toUpperCase()}${semana.slice(1)}, ${data.slice(8, 10)}/${data.slice(5, 7)}`;
}

export function AbaPlantao({ empresaId, rodape }: { empresaId: string; rodape: React.ReactNode }) {
  const p = usePlantaoElite(empresaId);
  const { resposta, quadro, data } = p;
  const copiaRef = useRef<HTMLDivElement>(null);
  const [compartilhavel] = useState(podeCompartilharImagem);
  const [ocupado, setOcupado] = useState(false);
  const temFolha = !!quadro && !!resposta && quadro.membros.length > 0;

  // O PNG fica pronto assim que o quadro assenta (ver `compartilharPng`): o
  // toque em «Enviar» só abre a folha do aparelho. A chave segura a imagem do
  // quadro que está na tela — dia, última chegada e total.
  const chave = temFolha ? `${data}|${resposta!.ultima_chegada ?? ''}|${quadro!.totalPlantao}` : null;
  const [png, setPng] = useState<{ chave: string; blob: Blob } | null>(null);
  useEffect(() => {
    if (!compartilhavel || !chave || p.carregando) return;
    let cancelado = false;
    const id = window.setTimeout(() => {
      if (!copiaRef.current) return;
      void gerarPngDoElemento(copiaRef.current).then(
        blob => { if (!cancelado) setPng({ chave, blob }); },
        () => { /* sem imagem pronta, «Enviar» cai na cópia */ },
      );
    }, 300);
    return () => { cancelado = true; window.clearTimeout(id); };
  }, [compartilhavel, chave, p.carregando]);
  const pngPronto = png && png.chave === chave ? png.blob : null;

  const copiar = async () => {
    if (!copiaRef.current) return;
    setOcupado(true);
    try {
      const r = await copiarImagemDoElemento(copiaRef.current, p.nomeArquivo);
      toast.success(r === 'copiado' ? 'Imagem copiada. É só colar no WhatsApp.' : 'A imagem foi salva no aparelho.');
    } catch (e) {
      toast.error(`Não foi possível gerar a imagem: ${e instanceof Error ? e.message : 'erro desconhecido'}`);
    } finally {
      setOcupado(false);
    }
  };

  const enviar = async () => {
    if (!pngPronto) return;
    try {
      await compartilharPng(pngPronto, p.nomeArquivo, 'Plantão Elite');
    } catch {
      // O aparelho recusou a folha (permissão, tempo do toque): copia.
      await copiar();
    }
  };

  const foraDoPlantao = !!resposta && plantaoDoDia(data) !== resposta.plantao;

  return (
    <>
      <div className="s-plantao-nav" role="group" aria-label="Dia do plantão">
        <button type="button" aria-label={p.plantaoFixo ? 'Plantão anterior' : 'Dia anterior'}
          onClick={() => p.setData(p.anterior)}>‹</button>
        <div className="s-plantao-dia">
          <b>{diaCurto(data)}</b>
          <span>{resposta ? `Plantão ${ROTULO_PLANTAO[resposta.plantao]}` : ' '}{foraDoPlantao ? ' · fora do dia' : ''}</span>
        </div>
        <button type="button" aria-label={p.plantaoFixo ? 'Próximo plantão' : 'Próximo dia'}
          disabled={p.seguinte > p.hoje} onClick={() => p.setData(p.seguinte)}>›</button>
      </div>
      {data !== p.diaDeEntrada && (
        <button type="button" className="s-plantao-hoje" onClick={() => p.setData(p.diaDeEntrada)}>
          {p.plantaoFixo ? 'Voltar ao último plantão' : 'Voltar para hoje'}
        </button>
      )}

      {p.erro && (
        <p className="e-vazio"><b>Não foi possível ler o plantão</b>{p.erro}</p>
      )}
      {!quadro && p.carregando && (
        <div className="e-esq" style={{ margin: '0 16px', height: 420, borderRadius: 20 }} aria-busy="true" aria-label="Lendo o plantão" />
      )}
      {quadro && resposta && quadro.membros.length === 0 && (
        <p className="e-vazio">
          <b>Sem dupla neste plantão</b>
          Nenhuma dupla cadastrada para o plantão {ROTULO_PLANTAO[resposta.plantao].toLowerCase()}.
        </p>
      )}

      {temFolha && (
        <>
          <div className="s-plantao-folha">
            <FolhaPlantaoElite resposta={resposta!} quadro={quadro!} data={data}
              foraDoPlantao={foraDoPlantao} carregando={p.carregando} />
          </div>

          {compartilhavel && (
            <button type="button" className="e-btn" disabled={!pngPronto || ocupado} onClick={() => void enviar()}>
              {pngPronto ? 'Enviar no WhatsApp' : 'Preparando a imagem…'}
            </button>
          )}
          <button type="button" className={compartilhavel ? 'e-btn e-sec-btn' : 'e-btn'}
            disabled={ocupado || p.carregando} onClick={() => void copiar()}>
            {ocupado ? 'Gerando a imagem…' : 'Copiar imagem'}
          </button>

          {/* A cópia que vira imagem: largura fixa, fora da tela. */}
          <div className="s-plantao-copia" aria-hidden="true">
            <FolhaPlantaoElite folhaRef={copiaRef} resposta={resposta!} quadro={quadro!} data={data}
              foraDoPlantao={foraDoPlantao} larguraFixa />
          </div>
        </>
      )}
      {rodape}
    </>
  );
}
