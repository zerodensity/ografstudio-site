import type {ComponentProps} from 'react';
import type OGrafExample from './index';

/**
 * How the Pixel Art Dinosaur Animation plays. The cartoon has its whole scene in its first frame, so that frame
 * stands in as a picture until the graphic has loaded.
 */
export const DINO_RUN: Partial<ComponentProps<typeof OGrafExample>> = {
  poster: '/img/examples/dino-run-first.webp',
  landscapeFullscreen: true,
};
