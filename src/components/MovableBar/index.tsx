import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import styles from './styles.module.css';

/**
 * Fullscreen controls a visitor can drag anywhere on screen with a grip. They start where their CSS puts
 * them, along the top of the picture. The move is the last translate in the bar's transform, as
 * `--bar-x` and `--bar-y`, so it's measured along the picture, which may be turned on its side, and the
 * bar keeps its place on the picture when the phone turns. The move is remembered in this browser.
 */

type Offset = {x: number; y: number};

const HOME: Offset = {x: 0, y: 0};
/** How far an arrow key moves the controls, in pixels on screen. */
const KEY_STEP_PX = 24;

function readOffset(key: string): Offset {
  try {
    const stored = JSON.parse(window.localStorage.getItem(key) ?? 'null') as Offset | null;
    if (stored && Number.isFinite(stored.x) && Number.isFinite(stored.y)) return {x: stored.x, y: stored.y};
  } catch {
    // No storage: the controls start at home.
  }
  return HOME;
}

function saveOffset(key: string, offset: Offset): void {
  try {
    if (offset.x === 0 && offset.y === 0) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(offset));
  } catch {
    // No storage: the move lasts until the page closes.
  }
}

/** A move on screen as a move along the bar's own axes, which turn with the picture. */
function toBarAxes(bar: HTMLElement, dx: number, dy: number): Offset {
  const transform = getComputedStyle(bar).transform;
  const {a, b, c, d} = new DOMMatrixReadOnly(transform === 'none' ? undefined : transform);
  const det = a * d - b * c || 1;
  return {x: (d * dx - c * dy) / det, y: (a * dy - b * dx) / det};
}

/** The part of a move along one axis that keeps the bar on screen; a bar bigger than the screen is centred. */
function keepOn(start: number, end: number, size: number, move: number): number {
  if (end - start > size) return (size - (end - start)) / 2 - start;
  return Math.min(Math.max(move, -start), size - end);
}

function keepOnScreen(rect: DOMRect, dx: number, dy: number): Offset {
  return {
    x: keepOn(rect.left, rect.right, window.innerWidth, dx),
    y: keepOn(rect.top, rect.bottom, window.innerHeight, dy),
  };
}

type Drag = {id: number; x: number; y: number; rect: DOMRect; from: Offset; to: Offset};

export type MovableBar = {
  barRef: RefObject<HTMLDivElement | null>;
  barStyle: CSSProperties;
  /** The controls are clear of the picture, so they needn't fade out of its way. */
  clearOfPicture: boolean;
  grip: ReactNode;
};

/**
 * @param key where this browser remembers the move
 * @param shown the controls are on screen
 * @param picture where the picture is on screen
 * @param layout changes when the bar's home moves, such as when the picture turns
 */
export function useMovableBar(
  key: string,
  shown: boolean,
  picture: () => DOMRect | null,
  layout?: unknown,
): MovableBar {
  const barRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState<Offset>(() => readOffset(key));
  const [clearOfPicture, setClearOfPicture] = useState(false);
  const offsetRef = useRef(offset);
  offsetRef.current = offset;
  const pictureRef = useRef(picture);
  pictureRef.current = picture;
  const drag = useRef<Drag | null>(null);

  useEffect(() => setOffset(readOffset(key)), [key]);

  // Keeps the bar whole on screen when the screen changes, without forgetting where the visitor put it,
  // and notes whether it's clear of the picture.
  const settle = useCallback(() => {
    const bar = barRef.current;
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    const fix = keepOnScreen(rect, 0, 0);
    if (Math.abs(fix.x) > 0.5 || Math.abs(fix.y) > 0.5) {
      const move = toBarAxes(bar, fix.x, fix.y);
      setOffset((current) => ({x: Math.round(current.x + move.x), y: Math.round(current.y + move.y)}));
      return;
    }
    const area = pictureRef.current();
    setClearOfPicture(
      !!area &&
        (rect.right <= area.left || rect.left >= area.right || rect.bottom <= area.top || rect.top >= area.bottom),
    );
  }, []);

  useEffect(() => {
    if (!shown) {
      setClearOfPicture(false);
      return undefined;
    }
    const frame = window.requestAnimationFrame(settle);
    window.addEventListener('resize', settle);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', settle);
    };
  }, [shown, offset, layout, settle]);

  const moveBy = (dx: number, dy: number) => {
    const bar = barRef.current;
    if (!bar) return;
    const allowed = keepOnScreen(bar.getBoundingClientRect(), dx, dy);
    const move = toBarAxes(bar, allowed.x, allowed.y);
    const next = {x: Math.round(offsetRef.current.x + move.x), y: Math.round(offsetRef.current.y + move.y)};
    setOffset(next);
    saveOffset(key, next);
  };

  const goHome = () => {
    setOffset(HOME);
    saveOffset(key, HOME);
  };

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    const bar = barRef.current;
    if (!bar || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const from = offsetRef.current;
    drag.current = {id: event.pointerId, x: event.clientX, y: event.clientY, rect: bar.getBoundingClientRect(), from, to: from};
  };

  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const current = drag.current;
    const bar = barRef.current;
    if (!current || current.id !== event.pointerId || !bar) return;
    const allowed = keepOnScreen(current.rect, event.clientX - current.x, event.clientY - current.y);
    const move = toBarAxes(bar, allowed.x, allowed.y);
    current.to = {x: Math.round(current.from.x + move.x), y: Math.round(current.from.y + move.y)};
    setOffset(current.to);
  };

  const endDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    drag.current = null;
    saveOffset(key, current.to);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-KEY_STEP_PX, 0],
      ArrowRight: [KEY_STEP_PX, 0],
      ArrowUp: [0, -KEY_STEP_PX],
      ArrowDown: [0, KEY_STEP_PX],
    };
    if (event.key === 'Home') {
      event.preventDefault();
      goHome();
    } else if (moves[event.key]) {
      event.preventDefault();
      moveBy(...moves[event.key]);
    }
  };

  const grip = (
    <button
      type="button"
      className={styles.grip}
      data-grip=""
      aria-label="Move the controls: drag, or use the arrow keys. Home puts them back."
      title="Drag to move the controls. Double-click puts them back."
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
      onDoubleClick={goHome}
      onKeyDown={onKeyDown}>
      <svg viewBox="0 0 10 16" aria-hidden="true">
        {[3, 7].flatMap((cx) => [3, 8, 13].map((cy) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.4" />))}
      </svg>
    </button>
  );

  return {
    barRef,
    barStyle: {'--bar-x': `${offset.x}px`, '--bar-y': `${offset.y}px`} as CSSProperties,
    clearOfPicture,
    grip,
  };
}
