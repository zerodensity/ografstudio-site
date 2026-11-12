import {useCallback, useEffect, useRef, useState, type ReactNode} from 'react';
import BrowserOnly from '@docusaurus/BrowserOnly';
import useBaseUrl from '@docusaurus/useBaseUrl';
import graphics from '@site/src/data/graphics.json';
import {useMovableBar} from '../MovableBar';
import {BackdropCamera, BackdropPicker, useBackdropStyle} from '../PlayerBackdrop';
import type {OGrafPlayer} from './ograf-player';
import styles from './styles.module.css';

type PlayerModule = typeof import('./ograf-player');
export type FieldValue = string | number | boolean;
/** What a show does to the graphic: what the player's own buttons and form do. An action works only on air. */
export type ShowCue = 'next' | 'take-out' | {action: string} | {update: Record<string, FieldValue>};
/** One beat of a show: it waits `after` milliseconds from the beat before, then cues the graphic. */
export interface ShowBeat {
  after: number;
  cue: ShowCue;
}
/**
 * A show a graphic plays by itself, lap after lap. Each lap loads the graphic afresh and takes it in, then plays
 * the beats, and a moment after the last one the next lap starts. A graphic taken in again opens from where it
 * was, so only a fresh one opens cleanly, and a fresh one has its starting data and score too.
 */
export type Show = ShowBeat[];
/** The moment between one lap of a show and the next. */
const SHOW_LAP_GAP_MS = 1500;
/** `returning`: unmounted for being off screen, or on its way back, so nothing can be pressed yet. */
type Status = 'waiting' | 'loading' | 'returning' | 'off-air' | 'on-air' | 'busy' | 'error';

interface FieldSchema {
  type?: string;
  title?: string;
  description?: string;
  default?: unknown;
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  multipleOf?: number;
  maxLength?: number;
  gddType?: string;
  gddOptions?: {labels?: Record<string, string>};
  v_ografShaderParameter?: unknown;
}

interface OperatorAction {
  id: string;
  name: string;
  description?: string;
}

interface Props {
  /** Package name in graphics/, without .ograf.zip. */
  slug: keyof typeof graphics;
  /** Accessible description of the graphic. */
  label?: string;
  /** Take the graphic in as soon as it has loaded. Defaults to true. */
  autoPlay?: boolean;
  /** Show the operator data form. Defaults to true. */
  showData?: boolean;
  /** Keep room for a form with this many fields, for pages that switch `slug` in place. */
  reserveFields?: number;
  /** Keep room for this many action buttons, for the same pages. */
  reserveActions?: number;
  /** Which fields the form offers, when a package has fields a visitor shouldn't type into. */
  formFields?: string[];
  /**
   * Fields the form greys out while a switch is on, by switch, because the graphic changes them
   * itself then and the form can't follow: the weather tour picks its own outlook city.
   */
  lockedBy?: Record<string, string>;
  /** Keep the graphic supplied with live data while it's mounted. */
  feed?: 'markets' | 'weather';
  /** In fullscreen on a phone, show the graphic in landscape however the phone is held. */
  landscapeFullscreen?: boolean;
  /** Where a graphic's data comes from, under the player. */
  sources?: ReactNode;
  /**
   * A show the graphic plays by itself, so a visitor sees all it does without pressing anything. It takes the
   * graphic in as it loads, in place of `autoPlay`, and goes round and round until the visitor presses a
   * control, changes the form or presses on the picture. Autoplay starts it again.
   */
  show?: Show;
}

const STATUS_TEXT: Record<Status, string> = {
  waiting: 'Waiting',
  loading: 'Loading',
  returning: 'Playing…',
  'off-air': 'Off air',
  'on-air': 'On air',
  busy: 'Playing…',
  error: 'Unavailable',
};

/** Fields the form can edit: plain values, not objects or lists. */
function editableFields(schema: unknown): Array<[string, FieldSchema]> {
  const properties = (schema as {properties?: Record<string, FieldSchema>} | undefined)?.properties;
  if (!properties) return [];
  return Object.entries(properties).filter(([, field]) =>
    ['string', 'number', 'integer', 'boolean'].includes(field.type ?? ''),
  );
}

/**
 * The buttons a package offers. A clock's timer commands are always published but do nothing on a
 * running time-of-day clock, so its form leaves them out. Race telemetry's two timers are run by
 * its own rules, in step with its timeline, and pausing one by hand would only put the text out of step.
 */
function operatorActions(slug: string, all: OperatorAction[] | undefined): OperatorAction[] {
  if (slug === 'clock' || slug === 'race-telemetry' || !all) return [];
  const actions = slug === 'live-markets' ? all.filter((action) => !action.name.startsWith('Local clock: ')) : all;
  const prefix = actions[0]?.name.split(': ')[0];
  const shared = actions.length > 0 && actions.every((action) => action.name.startsWith(`${prefix}: `));
  // "Countdown timer: Start" reads as just "Start" when every button belongs to the same timer.
  return shared ? actions.map((action) => ({...action, name: action.name.slice(prefix!.length + 2)})) : actions;
}

/**
 * An action with the id `add:<field>:<step>` changes that field inside the graphic. It tells no one,
 * so the form moves its own copy to match.
 */
function fieldStep(actionId: string): [string, number] | null {
  const match = /^add:([^:]+):(-?\d+)$/.exec(actionId);
  return match ? [match[1]!, Number(match[2])] : null;
}

function isColor(field: FieldSchema): boolean {
  return field.type === 'string' && /^color/.test(field.gddType ?? '');
}

function FieldInput({
  id,
  field,
  value,
  onChange,
  disabled,
}: {
  id: string;
  field: FieldSchema;
  value: FieldValue;
  onChange: (value: FieldValue) => void;
  disabled?: boolean;
}): ReactNode {
  if (field.type === 'boolean') {
    return (
      <input id={id} type="checkbox" checked={Boolean(value)} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
    );
  }
  if (field.enum) {
    return (
      <select id={id} value={String(value)} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        {field.enum.map((option) => (
          <option key={String(option)} value={String(option)}>
            {field.gddOptions?.labels?.[String(option)] ?? String(option)}
          </option>
        ))}
      </select>
    );
  }
  if (isColor(field)) {
    // The colour picker edits #rrggbb; keep any alpha the field carries (#rrggbbaa).
    const text = String(value);
    const alpha = field.gddType === 'color-rrggbbaa' ? text.slice(7, 9) || 'ff' : '';
    return (
      <input
        id={id}
        type="color"
        value={text.slice(0, 7)}
        onChange={(e) => onChange(`${e.target.value.toLowerCase()}${alpha}`)}
      />
    );
  }
  if (field.type === 'number' || field.type === 'integer') {
    const step = field.type === 'integer' ? 1 : (field.multipleOf ?? 'any');
    const parse = (text: string) => (field.type === 'integer' ? parseInt(text, 10) : parseFloat(text));
    const ranged = field.minimum !== undefined && field.maximum !== undefined && field.maximum - field.minimum <= 100;
    return (
      <div className={styles.range}>
        {ranged && (
          <input
            type="range"
            aria-hidden="true"
            tabIndex={-1}
            min={field.minimum}
            max={field.maximum}
            step={step}
            value={Number(value)}
            onChange={(e) => onChange(parse(e.target.value))}
          />
        )}
        <input
          id={id}
          type="number"
          min={field.minimum}
          max={field.maximum}
          step={step}
          value={Number.isFinite(Number(value)) ? Number(value) : ''}
          onChange={(e) => {
            const next = parse(e.target.value);
            if (Number.isFinite(next)) onChange(next);
          }}
        />
      </div>
    );
  }
  return (
    <input
      id={id}
      type="text"
      value={String(value)}
      maxLength={field.maxLength}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

const DATA_LEGEND = 'Operator controls — changes update the graphic live';
const BAR_IDLE_MS = 2500;
/** Share of the frame on screen that loads the graphic without any scrolling. */
const LOAD_WHEN_SEEN = 0.25;
/** Share of the graphic and its form that counts as on screen. */
const ON_SCREEN = 0.1;
const PARK_AFTER_MS = 4000;
/** A graphic on a feed starts over after a failed function, but no more often than this. */
const RESTART_GAP_MS = 10_000;

function FullscreenIcon({exit}: {exit: boolean}): ReactNode {
  return (
    <svg className={styles.fullscreenIcon} viewBox="0 0 16 16" aria-hidden="true">
      <path
        d={
          exit
            ? 'M6 1v5H1M10 1v5h5M6 15v-5H1M10 15v-5h5'
            : 'M1 6V1h5M15 6V1h-5M1 10v5h5M15 10v5h-5'
        }
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}

const CONTROL_ICONS = {
  takeIn: <path d="M4.5 2.5v11l9-5.5z" fill="currentColor" />,
  takeOut: <rect x="3.5" y="3.5" width="9" height="9" rx="1" fill="currentColor" />,
  replay: (
    <path
      d="M12.9 9.6A5 5 0 1 1 11.5 4.4M12.5 1.5v3.4H9.1"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  next: <path d="M2.5 3v10l7-5zM9.5 3v10l5-5z" fill="currentColor" />,
  autoplay: (
    <path
      d="M2.5 7.5V6.5a2 2 0 0 1 2-2h8.5M10.5 2l2.5 2.5-2.5 2.5M13.5 8.5v1a2 2 0 0 1-2 2H3M5.5 14 3 11.5 5.5 9"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
};

function ControlIcon({kind, className}: {kind: keyof typeof CONTROL_ICONS; className?: string}): ReactNode {
  return (
    <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
      {CONTROL_ICONS[kind]}
    </svg>
  );
}

function SignalIcon(): ReactNode {
  return (
    <svg className={styles.signalIcon} viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="3.4" fill="currentColor" />
      <path
        d="M10.3 10.3a8 8 0 0 0 0 11.4M21.7 10.3a8 8 0 0 1 0 11.4M6 6a14.1 14.1 0 0 0 0 20M26 6a14.1 14.1 0 0 1 0 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function LivePlayer({
  slug,
  label,
  autoPlay = true,
  showData = true,
  reserveFields = 0,
  reserveActions = 0,
  formFields,
  lockedBy,
  feed,
  landscapeFullscreen = false,
  sources,
  show,
}: Props): ReactNode {
  const entry = graphics[slug];
  // A list written in a page is a new array on every render, so the mount follows its contents.
  const formFieldsKey = formFields ? formFields.join(',') || ' ' : '';
  const playerUrl = useBaseUrl('/player/ograf-player.js');
  const manifestUrl = useBaseUrl(entry.manifest);
  const downloadUrl = useBaseUrl(entry.download);
  const frameRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<OGrafPlayer | null>(null);
  const updateTimer = useRef<number | undefined>(undefined);
  const sentValues = useRef<Record<string, FieldValue>>({});
  const figureRef = useRef<HTMLElement>(null);
  /** The visitor changed this graphic, so it keeps running when it's off screen. */
  const touched = useRef(false);
  /** The next mount brings back a graphic that was on air before it went to sleep. */
  const waking = useRef(false);
  const [offscreen, setOffscreen] = useState(false);
  /** Unmounted for being off screen. */
  const [asleep, setAsleep] = useState(false);
  /** Counts the times the graphic has loaded again: on a feed, after a failed function, and for each lap of a show. */
  const [restarts, setRestarts] = useState(0);
  const lastRestart = useRef(0);
  const [visible, setVisible] = useState(false);
  const [status, setStatus] = useState<Status>('waiting');
  const [error, setError] = useState<string>();
  const [fields, setFields] = useState<Array<[string, FieldSchema]>>([]);
  const [values, setValues] = useState<Record<string, FieldValue>>({});
  const [actions, setActions] = useState<OperatorAction[]>([]);
  const [stepCount, setStepCount] = useState(1);
  const [step, setStep] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  /** iPhones can't put an element in fullscreen, so there the frame fills the window instead. */
  const [filling, setFilling] = useState(false);
  const expanded = fullscreen || filling;
  /** The browser couldn't turn the screen to landscape, so the picture turns instead. */
  const [turned, setTurned] = useState(false);
  const [barAwake, setBarAwake] = useState(true);
  const barTimer = useRef<number | undefined>(undefined);
  /** The mounted graphic, once it can be played. */
  const [player, setPlayer] = useState<OGrafPlayer | null>(null);
  /** The show plays: until the visitor takes over, and again from the top when they turn Autoplay on. */
  const [showOn, setShowOn] = useState(Boolean(show));
  const showOnRef = useRef(showOn);
  showOnRef.current = showOn;
  // The homepage switches graphics in the same player, and each one starts with its own show.
  const [showSlug, setShowSlug] = useState(slug);
  if (showSlug !== slug) {
    setShowSlug(slug);
    setShowOn(Boolean(show));
  }
  const sourceUrl = useBaseUrl(entry.source ?? '');
  const backdrop = useBackdropStyle();

  // Esc and the browser's own controls can leave fullscreen too, so follow the browser.
  useEffect(() => {
    const follow = () => {
      const entered = document.fullscreenElement === frameRef.current;
      setFullscreen(entered);
      if (!entered) setTurned(false);
    };
    document.addEventListener('fullscreenchange', follow);
    return () => {
      document.removeEventListener('fullscreenchange', follow);
      window.clearTimeout(barTimer.current);
    };
  }, []);

  // The bar gets out of the picture until the pointer moves.
  const wakeBar = useCallback(() => {
    setBarAwake(true);
    window.clearTimeout(barTimer.current);
    barTimer.current = window.setTimeout(() => setBarAwake(false), BAR_IDLE_MS);
  }, []);

  useEffect(() => {
    if (expanded) wakeBar();
  }, [expanded, wakeBar]);

  /** Phones and tablets: in fullscreen every graphic keeps its 16:9 landscape fit, however the device is held. */
  const touchScreen = window.matchMedia('(pointer: coarse)').matches;
  const onPhone = landscapeFullscreen && touchScreen;
  /**
   * An iPhone fills the window instead of going fullscreen, and its screen is too small for the bar of named
   * buttons, so these graphics get a slim row of round ones there. A tablet has room for the bar.
   * Android phones go really fullscreen and keep the bar they always had: only Exit, as these graphics
   * have their own controls.
   */
  const compact = filling && onPhone && window.matchMedia('(max-width: 500px), (max-height: 500px)').matches;
  /** In real fullscreen a phone's bar would cover half the graphic, so it only has Exit. */
  const fullBar = filling || !onPhone;

  /** Where the picture is in fullscreen: centred, and on its side when turned for a phone held upright. */
  const pictureOnScreen = () => {
    const {innerWidth: width, innerHeight: height} = window;
    const long = turned && height > width ? Math.min(height, (width * 16) / 9) : Math.min(width, (height * 16) / 9);
    const [w, h] = turned && height > width ? [(long * 9) / 16, long] : [long, (long * 9) / 16];
    return new DOMRect((width - w) / 2, (height - h) / 2, w, h);
  };
  // The controls start along the top of the picture and the visitor can drag them anywhere. Moved off the
  // picture, into a band beside it, they needn't get out of its way.
  const bar = useMovableBar(
    compact ? 'ografstudio.fullscreen-controls.example-phone' : 'ografstudio.fullscreen-controls.example',
    expanded,
    pictureOnScreen,
    turned,
  );

  // Android browsers can turn the screen during fullscreen, and give it back when fullscreen ends.
  const turnToLandscape = async () => {
    if (!touchScreen) return;
    try {
      await screen.orientation.lock('landscape');
    } catch {
      setTurned(true);
    }
  };

  const toggleFullscreen = () => {
    if (filling || !document.fullscreenEnabled) {
      setFilling(!filling);
      return;
    }
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => undefined);
      return;
    }
    // A browser that refuses fullscreen gets the frame filling the window instead.
    frameRef.current
      ?.requestFullscreen()
      .then(turnToLandscape)
      .catch(() => setFilling(true));
  };

  // Filling the window: the page behind stays still, Esc leaves, and a phone held upright gets the
  // picture on its side, since only fullscreen can turn the screen.
  useEffect(() => {
    if (!filling) return undefined;
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = 'hidden';
    if (touchScreen) setTurned(true);
    const leave = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFilling(false);
    };
    document.addEventListener('keydown', leave);
    return () => {
      root.style.overflow = overflow;
      document.removeEventListener('keydown', leave);
      setTurned(false);
    };
  }, [filling, touchScreen]);

  // Load the graphic once it's really on screen, or once the visitor scrolls towards it. On the homepage
  // it sits just under the fold, so being close doesn't count until they start to scroll.
  useEffect(() => {
    const frame = frameRef.current;
    if (visible) return undefined;
    if (!frame || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return undefined;
    }
    const seen = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.intersectionRatio >= LOAD_WHEN_SEEN)) setVisible(true);
      },
      {threshold: [0, LOAD_WHEN_SEEN]},
    );
    const nearby = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setVisible(true);
      },
      {rootMargin: '200px'},
    );
    const scrolled = () => nearby.observe(frame);
    seen.observe(frame);
    window.addEventListener('scroll', scrolled, {once: true, passive: true});
    return () => {
      seen.disconnect();
      nearby.disconnect();
      window.removeEventListener('scroll', scrolled);
    };
  }, [visible]);

  // Whether the graphic or its form is on screen. The form counts: nobody should type into a stopped graphic.
  useEffect(() => {
    const figure = figureRef.current;
    if (!visible || !figure || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => setOffscreen(entry!.intersectionRatio < ON_SCREEN),
      {threshold: [0, ON_SCREEN, 0.5]},
    );
    observer.observe(figure);
    return () => observer.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible || asleep || !viewportRef.current) return undefined;
    const container = viewportRef.current;
    const abort = new AbortController();
    let disposed = false;
    let mounted: OGrafPlayer | null = null;
    const wakingUp = waking.current;
    waking.current = false;
    touched.current = false;
    setStatus(wakingUp ? 'returning' : 'loading');
    // A failed function stays failed, and the graphic just stops changing with nothing to show for it. On
    // a feed the next update has everything back, so starting over loses nothing but the visitor's market.
    let restartTimer: number | undefined;
    const restart = () => {
      if (restartTimer !== undefined) return;
      restartTimer = window.setTimeout(
        () => {
          lastRestart.current = Date.now();
          waking.current = true;
          setRestarts((count) => count + 1);
        },
        Math.max(0, lastRestart.current + RESTART_GAP_MS - Date.now()),
      );
    };
    if (feed) container.addEventListener('ograf-function-error', restart);
    (async () => {
      try {
        // The player imports each graphic's main.js itself, so it must stay out of the bundle.
        const module = (await import(/* webpackIgnore: true */ playerUrl)) as PlayerModule;
        mounted = await module.mountOGrafGraphic({container, manifestUrl, signal: abort.signal});
        if (disposed) {
          await mounted.dispose();
          return;
        }
        playerRef.current = mounted;
        const editable = editableFields(mounted.manifest.schema).filter(
          ([key]) => !formFieldsKey || formFieldsKey.split(',').includes(key),
        );
        const defaults = (module.dataFromSchemaDefaults(mounted.manifest.schema) ?? {}) as Record<string, FieldValue>;
        sentValues.current = defaults;
        setFields(editable);
        setValues(defaults);
        setActions(operatorActions(slug, mounted.manifest.customActions));
        setStepCount(Number(mounted.manifest.stepCount ?? 1));
        setStep(0);
        if (!wakingUp) setStatus('off-air');
        if (feed === 'markets') {
          const {startMarketFeed} = await import('./marketFeed');
          // It ends with the mount, so a graphic parked off screen stops listening too.
          if (!abort.signal.aborted) startMarketFeed(mounted, abort.signal);
        } else if (feed === 'weather') {
          const {startWeatherFeed} = await import('./weatherFeed');
          if (!abort.signal.aborted) startWeatherFeed(mounted, abort.signal);
        }
        setPlayer(mounted);
        // A show takes the graphic in itself, with its first beats.
        if ((autoPlay || wakingUp) && !(show && showOnRef.current)) {
          setStatus('busy');
          await mounted.play();
          if (!disposed) setStatus('on-air');
        }
      } catch (cause) {
        if (disposed) return;
        setError(cause instanceof Error ? cause.message : String(cause));
        setStatus('error');
      }
    })();
    return () => {
      disposed = true;
      abort.abort();
      window.clearTimeout(restartTimer);
      container.removeEventListener('ograf-function-error', restart);
      window.clearTimeout(updateTimer.current);
      playerRef.current = null;
      setPlayer(null);
      void mounted?.dispose().catch(() => undefined);
    };
  }, [visible, asleep, restarts, playerUrl, manifestUrl, autoPlay, slug, feed, formFieldsKey, show]);

  /** Plays, takes or steps the graphic. False when it failed, and the player shows why. */
  const run = useCallback(async (action: (player: OGrafPlayer) => Promise<unknown>, after: Status) => {
    const current = playerRef.current;
    if (!current) return false;
    setStatus('busy');
    try {
      await action(current);
      // The homepage can switch to another package while this one is still finishing.
      if (playerRef.current === current) setStatus(after);
      return true;
    } catch (cause) {
      if (playerRef.current !== current) return false;
      setError(cause instanceof Error ? cause.message : String(cause));
      setStatus('error');
      return false;
    }
  }, []);

  const takeGraphicIn = () => {
    setStep(0);
    return run((p) => p.play(), 'on-air');
  };
  const replayGraphic = () => {
    setStep(0);
    return run(async (p) => {
      await p.stop({skipAnimation: true});
      await p.play();
    }, 'on-air');
  };
  const nextGraphicStep = () => {
    setStep((current) => current + 1);
    return run((p) => p.next(), 'on-air');
  };
  const takeGraphicOut = () => run((p) => p.stop(), 'off-air');
  /**
   * Sends an action. An `add:<field>:<step>` one changes that field inside the graphic, so the form follows,
   * counting from `from`: the form for a visitor, who may still be typing.
   */
  const sendAction = (id: string, from: Record<string, FieldValue> = sentValues.current) => {
    const stepped = fieldStep(id);
    if (stepped) {
      const [key, by] = stepped;
      const next = Number(from[key] ?? 0) + by;
      setValues((current) => ({...current, [key]: next}));
      sentValues.current = {...sentValues.current, [key]: next};
    }
    return playerRef.current?.action(id);
  };

  /** Loads the graphic afresh, quietly, as one coming back from off screen. */
  const reloadGraphic = () => {
    waking.current = true;
    setRestarts((count) => count + 1);
  };

  // The show cues the graphic as a visitor would, one lap for each graphic it loads. It stops when the visitor
  // takes over, when the graphic goes (off screen, or another one on the homepage), and when a cue fails.
  useEffect(() => {
    if (!show || !showOn || !player) return undefined;
    const stop = new AbortController();
    const gone = () => stop.signal.aborted || playerRef.current !== player;
    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        const timer = window.setTimeout(resolve, ms);
        stop.signal.addEventListener('abort', () => {
          window.clearTimeout(timer);
          resolve();
        });
      });
    const cue = async (beat: ShowCue): Promise<boolean> => {
      if (beat === 'next') return nextGraphicStep();
      if (beat === 'take-out') return takeGraphicOut();
      try {
        if ('action' in beat) {
          await sendAction(beat.action);
        } else {
          setValues((current) => ({...current, ...beat.update}));
          sentValues.current = {...sentValues.current, ...beat.update};
          await player.update(beat.update);
        }
        return true;
      } catch (cause) {
        if (gone()) return false;
        setError(cause instanceof Error ? cause.message : String(cause));
        setStatus('error');
        return false;
      }
    };
    void (async () => {
      if (gone()) return;
      let going = await takeGraphicIn();
      for (const beat of show) {
        if (!going) break;
        await wait(beat.after);
        going = !gone() && (await cue(beat.cue));
      }
      if (gone()) return;
      // A cue failed, and the player says why.
      if (!going) {
        setShowOn(false);
        return;
      }
      await wait(SHOW_LAP_GAP_MS);
      if (!gone()) reloadGraphic();
    })();
    return () => stop.abort();
    // The cue helpers are new each render, but they reach the player only through refs and setters.
  }, [show, showOn, player]);

  /** The visitor takes over from the show, which stops and leaves the graphic as it is. */
  const takeOver = () => setShowOn(false);
  const toggleShow = () => {
    if (showOn) {
      takeOver();
      return;
    }
    // The show starts over with the graphic loaded afresh, so what the visitor changed is gone, and no longer
    // keeps it on off screen.
    touched.current = false;
    setShowOn(true);
    reloadGraphic();
  };

  // Fullscreen lifts the frame out of the page, so where the figure sits says nothing then.
  const away = offscreen && !expanded;

  // Off screen a graphic only burns CPU, and its frame loop keeps going even off air, so after a moment it
  // unmounts and comes back in when the visitor does. Only one nobody has changed: starting over would
  // lose a running timer or a score.
  useEffect(() => {
    if (!away) {
      setAsleep(false);
      return undefined;
    }
    if (status !== 'on-air' || touched.current) return undefined;
    const timer = window.setTimeout(() => {
      waking.current = true;
      setAsleep(true);
      setStatus('returning');
    }, PARK_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [away, status]);

  /** `now` sends at once: only typing waits, so one update carries the whole word. */
  const change = (key: string, value: FieldValue, now = false) => {
    takeOver();
    touched.current = true;
    const next = {...values, [key]: value};
    setValues(next);
    window.clearTimeout(updateTimer.current);
    updateTimer.current = window.setTimeout(() => {
      // Only what changed: Studio's runtime transitions every bound layer named in an update, even
      // when its value is the same, so sending the whole form would blink the whole graphic.
      const changed = Object.entries(next).filter(([name, item]) => item !== sentValues.current[name]);
      if (changed.length === 0) return;
      sentValues.current = next;
      // A running shader just takes its new parameters, so a slider doesn't fade its panel in and out.
      const shaderOnly = changed.every(([name]) =>
        fields.some(([field, schema]) => field === name && schema.v_ografShaderParameter),
      );
      void playerRef.current
        ?.update(Object.fromEntries(changed), {skipAnimation: shaderOnly})
        .catch((cause: unknown) => {
          setError(cause instanceof Error ? cause.message : String(cause));
        });
    }, now ? 0 : 200);
  };

  const runAction = (id: string) => {
    takeOver();
    touched.current = true;
    sendAction(id, values)?.catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : String(cause));
    });
  };

  const sourcesLine = sources && (
    <p className={styles.sources}>
      <SignalIcon />
      <span>{sources}</span>
    </p>
  );
  const lastStep = step >= stepCount - 1;
  const ready = status === 'on-air' || status === 'off-air';
  const sizeMb = (entry.bytes / 1024 / 1024).toFixed(1);
  const sourceSize =
    entry.sourceBytes < 1024 * 1024
      ? `${Math.max(1, Math.round(entry.sourceBytes / 1024))} KB`
      : `${(entry.sourceBytes / 1024 / 1024).toFixed(1)} MB`;

  const takeIn = () => {
    takeOver();
    void takeGraphicIn();
  };
  const takeOut = () => {
    takeOver();
    void takeGraphicOut();
  };
  const replay = () => {
    takeOver();
    void replayGraphic();
  };
  const nextStep = () => {
    takeOver();
    touched.current = true;
    void nextGraphicStep();
  };
  const stepText = `${Math.min(step + 1, stepCount)}/${stepCount}`;

  const takeButtons = (
    <>
      <button type="button" className="button button--primary button--sm" disabled={status !== 'off-air'} onClick={takeIn}>
        ▶ Take in
      </button>
      <button type="button" className="button button--secondary button--sm" disabled={status !== 'on-air'} onClick={takeOut}>
        ■ Take out
      </button>
      <button type="button" className="button button--secondary button--sm" disabled={!ready} onClick={replay}>
        ↻ Replay
      </button>
    </>
  );

  const actionButtons = (
    <>
      {show && (
        <button
          type="button"
          className={`button button--sm ${showOn ? 'button--primary' : 'button--secondary'}`}
          aria-pressed={showOn}
          title="Plays the whole graphic by itself, round and round. Pressing anything else takes over."
          onClick={toggleShow}>
          <ControlIcon kind="autoplay" className={styles.buttonIcon} /> Autoplay
        </button>
      )}
      {stepCount > 1 && (
        <button
          type="button"
          className="button button--primary button--sm"
          disabled={status !== 'on-air' || lastStep}
          onClick={nextStep}>
          Next step ({stepText})
        </button>
      )}
      {actions.map((action) => (
        <button
          key={action.id}
          type="button"
          className="button button--secondary button--sm"
          disabled={status !== 'on-air'}
          title={action.description}
          onClick={() => runAction(action.id)}>
          {action.name}
        </button>
      ))}
    </>
  );

  return (
    <figure ref={figureRef} className={styles.example} aria-label={label ?? `${entry.name}, live OGraf graphic`}>
      <div
        ref={frameRef}
        className={styles.frame}
        style={backdrop}
        data-bar-awake={barAwake || bar.clearOfPicture}
        data-turned={turned}
        data-letterbox={landscapeFullscreen}
        data-filling={filling}
        onPointerDown={expanded ? wakeBar : undefined}
        onPointerMove={expanded ? wakeBar : undefined}>
        <BackdropCamera />
        {/* Pressing on the picture, such as on a button a graphic has inside it, takes over from the show. */}
        <div ref={viewportRef} className={styles.viewport} onPointerDown={showOn ? takeOver : undefined} />
        {status === 'loading' && (
          <div className={styles.overlay}>
            <p>Loading graphic…</p>
          </div>
        )}
        {status === 'error' && (
          <div className={styles.overlay}>
            <p>
              <strong>This graphic couldn't play in your browser.</strong>
              <br />
              {error}
            </p>
          </div>
        )}
        {expanded && compact && (
          // The actions these graphics publish are buttons in the picture too, so the row leaves them out.
          <div ref={bar.barRef} className={styles.phoneControls} style={bar.barStyle} role="group" aria-label="Controls">
            {bar.grip}
            <button type="button" aria-label="Take in" data-primary disabled={status !== 'off-air'} onClick={takeIn}>
              <ControlIcon kind="takeIn" />
            </button>
            <button type="button" aria-label="Take out" disabled={status !== 'on-air'} onClick={takeOut}>
              <ControlIcon kind="takeOut" />
            </button>
            <button type="button" aria-label="Replay" disabled={!ready} onClick={replay}>
              <ControlIcon kind="replay" />
            </button>
            {stepCount > 1 && (
              <button
                type="button"
                aria-label={`Next step (${stepText})`}
                data-primary
                disabled={status !== 'on-air' || lastStep}
                onClick={nextStep}>
                <ControlIcon kind="next" />
                <span>{stepText}</span>
              </button>
            )}
            {show && (
              <button type="button" aria-label="Autoplay" aria-pressed={showOn} data-primary={showOn || undefined} onClick={toggleShow}>
                <ControlIcon kind="autoplay" />
              </button>
            )}
            <button type="button" aria-label="Exit fullscreen" onClick={toggleFullscreen}>
              <FullscreenIcon exit />
            </button>
          </div>
        )}
        {expanded && !compact && (
          <div ref={bar.barRef} className={styles.fullscreenBar} style={bar.barStyle} role="group" aria-label="Controls">
            {bar.grip}
            {fullBar && takeButtons}
            {fullBar && actionButtons}
            <button
              type="button"
              className="button button--secondary button--sm"
              onClick={toggleFullscreen}>
              <FullscreenIcon exit /> Exit fullscreen
            </button>
          </div>
        )}
      </div>
      {reserveFields === 0 && sourcesLine}
      <div className={styles.controls}>
        <div className={styles.buttons}>
          {takeButtons}
          <button
            type="button"
            className="button button--secondary button--sm"
            onClick={toggleFullscreen}>
            <FullscreenIcon exit={false} /> Fullscreen
          </button>
        </div>
        <BackdropPicker />
        <span className={styles.status} data-status={status} role="status">
          {STATUS_TEXT[status]}
        </span>
      </div>
      {showData && (fields.length > 0 || actions.length > 0 || reserveFields > 0) && (
        <div className={styles.dataStack}>
          {/* Invisible, and only here to hold the height of the longest form. */}
          {reserveFields > 0 && (
            <fieldset className={`${styles.data} ${styles.dataSizer}`} aria-hidden="true" disabled>
              <legend>{DATA_LEGEND}</legend>
              {reserveActions > 0 && (
                <div className={styles.actions}>
                  {Array.from({length: reserveActions}, (_, index) => (
                    <button key={index} type="button" className="button button--secondary button--sm">
                      Match clock: Restart
                    </button>
                  ))}
                </div>
              )}
              {Array.from({length: reserveFields}, (_, index) => (
                <div key={index} className={styles.field}>
                  <label>Field</label>
                  <input type="text" />
                </div>
              ))}
            </fieldset>
          )}
          <fieldset className={styles.data} disabled={status === 'error' || status === 'loading' || status === 'returning'}>
            <legend>{DATA_LEGEND}</legend>
            {(actions.length > 0 || stepCount > 1 || show) && (
              <div className={styles.actions}>{actionButtons}</div>
            )}
            {fields.map(([key, field]) => {
              const id = `${slug}-${key}`;
              return (
                <div key={key} className={styles.field}>
                  <label htmlFor={id} title={field.description}>
                    {field.title ?? key}
                  </label>
                  <FieldInput
                    id={id}
                    field={field}
                    value={values[key] ?? ''}
                    disabled={Boolean(lockedBy?.[key] && values[lockedBy[key]!])}
                    onChange={(v) => change(key, v, field.type === 'boolean' || Boolean(field.enum))}
                  />
                </div>
              );
            })}
            {fields.length === 0 && actions.length === 0 && stepCount === 1 && (status === 'on-air' || status === 'off-air' || status === 'busy' || status === 'returning') && (
              <p className={styles.noData}>
                This graphic has no operator data. Use Take in and Take out to control it.
              </p>
            )}
            {/* Where the page keeps room for a form, this goes in that room, so switching doesn't move the page. */}
            {reserveFields > 0 && sourcesLine}
          </fieldset>
        </div>
      )}
      <figcaption className={styles.caption}>
        The exported OGraf package running in your browser with the OGraf web player.{' '}
        <a href={downloadUrl} download>
          Download .ograf.zip
        </a>{' '}
        ({sizeMb} MB)
        {entry.source && (
          <>
            {' · '}
            <a href={sourceUrl} download>
              Download .ogs
            </a>{' '}
            ({sourceSize}), the editable project. It needs OGraf Studio 0.30 or later.
          </>
        )}
      </figcaption>
    </figure>
  );
}

/** A live, interactive OGraf graphic from graphics/, played with the OGraf web player. */
export default function OGrafExample(props: Props): ReactNode {
  return (
    <BrowserOnly fallback={<div className={styles.frame} />}>{() => <LivePlayer {...props} />}</BrowserOnly>
  );
}
