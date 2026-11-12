import type {ComponentProps} from 'react';
import type OGrafExample from './index';
import type {ShowBeat, ShowCue} from './index';

const VOTE: ShowCue = {action: 'vote.next'};

/**
 * One jury in the show: its low scores land by themselves, one a second, and a press after the last of them
 * brings the top score, which holds for a moment before the name. `after` is the wait before the jury starts.
 */
const jury = (after: number): ShowBeat[] => [
  {after, cue: VOTE},
  {after: 10500, cue: VOTE},
];

/**
 * How Rankings plays: its show votes the five juries through to the winner, holds the result, and takes the
 * board out. The next lap starts on a fresh board, with the low scores landing by themselves.
 */
export const RANKINGS: Partial<ComponentProps<typeof OGrafExample>> = {
  show: [...jury(2500), ...jury(5500), ...jury(5500), ...jury(5500), ...jury(5500), {after: 10000, cue: 'take-out'}],
};
