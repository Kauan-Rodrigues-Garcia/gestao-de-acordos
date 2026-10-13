import { useMemo } from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
import { Cena01Problema, emissores } from './cenas/Cena01Problema';
import { Cena02Virada, LOGO_AZUL, LOGO_VERDE, temposCena2 } from './cenas/Cena02Virada';
import { Cena12Fechamento } from './cenas/Cena12Fechamento';
import { SecaoApp } from './cenas/SecaoApp';
import { Fundo } from './componentes/Fundo';
import { logoSrc, Poeira, type LogoAlvo } from './componentes/Poeira';
import { ms } from './movimento';
import { Trilha } from './Trilha';

export const Video: React.FC = () => {
  const t2 = temposCena2();
  const logos = useMemo<LogoAlvo[]>(
    () => [
      { src: logoSrc('logo-pagueplay.png'), ...LOGO_VERDE, cor: [74, 222, 128], quantidade: 700 },
      { src: logoSrc('logo-bookplay.png'), ...LOGO_AZUL, cor: [92, 200, 245], quantidade: 700 },
    ],
    [],
  );
  const listaEmissores = useMemo(() => emissores(), []);
  const fimAbertura = t2.expandir + ms(400);

  return (
    <AbsoluteFill>
      <Fundo />

      <Sequence durationInFrames={fimAbertura} name="Cenas 1–2">
        <Cena01Problema />
        <Poeira
          emissores={listaEmissores}
          logos={logos}
          convergeEm={t2.convergeEm}
          viagem={t2.viagem}
          someEm={t2.logosNitidas}
          duracaoSumico={ms(450)}
        />
        <Cena02Virada />
      </Sequence>

      <SecaoApp />
      <Cena12Fechamento />

      <Trilha />
    </AbsoluteFill>
  );
};
