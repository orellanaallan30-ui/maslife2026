import React from 'react';
import { Composition } from 'remotion';
import { Anuncio, AnuncioV2 } from './Anuncio';

export const Root: React.FC = () => (
  <>
    <Composition id="Anuncio" component={Anuncio} durationInFrames={300} fps={30} width={1080} height={1920} />
    <Composition id="AnuncioV2" component={AnuncioV2} durationInFrames={300} fps={30} width={1080} height={1920}
      defaultProps={{ voz: 'voz.mp3', tiempos: [[0.05, 2.86], [3.21, 7.34], [7.64, 9.12]] as Array<[number, number]> }} />
  </>
);
