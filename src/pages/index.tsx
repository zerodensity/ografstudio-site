import {useState, type ComponentProps, type ReactNode} from 'react';
import Head from '@docusaurus/Head';
import Link from '@docusaurus/Link';
import useBaseUrl from '@docusaurus/useBaseUrl';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import {LevelTag} from '@site/src/components/ExampleTags';
import HeroReel from '@site/src/components/HeroReel';
import OGrafExample from '@site/src/components/OGrafExample';
import {DINO_RUN} from '@site/src/components/OGrafExample/dinoRun';
import {LIVE_MARKETS} from '@site/src/components/OGrafExample/liveMarkets';
import {RACE_TELEMETRY} from '@site/src/components/OGrafExample/raceTelemetry';
import {RANKINGS} from '@site/src/components/OGrafExample/rankings';
import {WEATHER, WEATHER_STRAP} from '@site/src/components/OGrafExample/weather';
import {examples} from '@site/src/data/examples';
import graphics from '@site/src/data/graphics.json';
import {LINUX_ARM64, LINUX_X64, WINDOWS_X64} from '@site/src/data/downloads';
import info from '@site/src/data/importInfo.json';
import styles from './index.module.css';

const REPOSITORY_URL = 'https://github.com/zerodensity/ograf-studio';

const FEATURES = [
  {
    title: 'Visual authoring',
    text: 'Compose text, images, shapes, editable vector paths and Lottie animations in a dockable workspace with multi-monitor support.',
  },
  {
    title: 'Animation and effects',
    text: 'Independent property tracks, easing, seamless loops, gradients, masks and composable effects, including GPU shaders.',
  },
  {
    title: 'Live data',
    text: 'Bind text, images and colours to operator fields, with structured GDD objects, arrays and runtime collections.',
  },
  {
    title: 'AI with operator control',
    text: 'The built-in assistant and external MCP agents use revision-checked operations. You review each proposal, and the result stays editable.',
  },
  {
    title: 'Reusable designs',
    text: 'Brand Kits, style packs, components and procedural patterns keep every graphic in a package consistent.',
  },
  {
    title: 'Template sets',
    text: 'Save one template or a whole package as .ogs, with shared controls and assets, inherited canvas defaults and a scene explorer.',
  },
  {
    title: 'Cropping',
    text: 'Trim layers, image and video sources, and output canvases while keeping assets and animation editable.',
  },
  {
    title: 'Portable OGraf output',
    text: 'Export standard OGraf packages with realtime playback and deterministic non-realtime seeking, checked before every save and export.',
  },
];

// Studio's own lifecycle: every graphic runs Start, Step, End.
const STEPS = [
  {
    marker: 'Start',
    title: 'Design',
    text: 'Start from a recipe or a blank canvas. Lay out text, shapes, images and shaders, and animate them on the timeline.',
    link: '/guides/first-lower-third',
    label: 'Make a lower third',
  },
  {
    marker: 'Step',
    title: 'Connect data',
    text: 'Add the fields operators fill in at playout, and bind them to text, images and colours.',
    link: '/guides/bind-data',
    label: 'Connect operator data',
  },
  {
    marker: 'End',
    title: 'Play out',
    text: 'Export a checked .ograf.zip and play it in any OGraf-compatible renderer, in realtime or frame by frame.',
    link: '/guides/export',
    label: 'Export a package',
  },
];

/**
 * Studio's download for Windows as the button, with the version (linked to its notes) and the Linux files in a
 * line under it. Each download link is the file itself, from the newest release.
 */
function Downloads({children}: {children: ReactNode}): ReactNode {
  const version = info.latestRelease;
  return (
    <div className={styles.downloads}>
      <div className={styles.actions}>
        <Link className={styles.buttonPrimary} href={WINDOWS_X64.url} title={WINDOWS_X64.file}>
          Download for Windows
        </Link>
        {children}
      </div>
      <p className={styles.otherDownloads}>
        {version && (
          <>
            <Link to={`/releases/${version}`} title={`What's new in ${version}`}>
              Version {version}
            </Link>{' '}
            ·{' '}
          </>
        )}
        Also for{' '}
        <Link href={LINUX_X64.url} title={LINUX_X64.file}>
          Linux x64
        </Link>{' '}
        and{' '}
        <Link href={LINUX_ARM64.url} title={LINUX_ARM64.file}>
          Linux ARM64
        </Link>
      </p>
    </div>
  );
}

function Hero(): ReactNode {
  return (
    <header className={styles.hero}>
      <div className={styles.heroInner}>
        <div className={styles.heroHead}>
          {/* One heading in two lines: the small line carries the product's name, so a search
              engine reads the name in the page's main heading and not only in its title. */}
          <Heading as="h1" className={styles.heroHeading}>
            {/* As long as the line it replaced, so it still fits one line on a 360px phone. */}
            <span className={styles.eyebrow}>OGraf Studio, the open-source editor</span>{' '}
            <span className={styles.heroTitle}>
              Broadcast graphics, designed for EBU's OGraf Standard
            </span>
          </Heading>
          <div>
            <p className={styles.heroLead}>
              Animated, data-driven lower thirds, scoreboards, tickers and full-screen graphics,
              built visually or with AI and exported as portable OGraf packages.
            </p>
            <Downloads>
              <Link className={styles.buttonGhost} to="/guides/install">
                Get started
              </Link>
            </Downloads>
          </div>
        </div>
        <HeroReel />
      </div>
    </header>
  );
}

function Proof(): ReactNode {
  return (
    <section className={styles.proof} aria-label="At a glance">
      <div className={styles.proofInner}>
        <Link to="/announcements/best-of-show-ibc-2026" className={styles.proofAward}>
          {/* Twice the size it is shown at; the full-size badge is on the announcement's page. */}
          <img
            src={useBaseUrl('/img/tvbeurope-best-of-show-ibc-2026-128.webp')}
            alt="TVBEurope Best of Show award, IBC 2026"
            width={64}
            height={56}
            loading="lazy"
          />
          <span>
            <strong>Winner</strong>
            TVBEurope Best of Show, IBC 2026
          </span>
        </Link>
        <p>
          <strong>Standard output</strong>
          EBU OGraf packages
        </p>
        <p>
          <strong>Free</strong>
          Open source under AGPL-3.0
        </p>
        <p>
          <strong>One file</strong>
          Windows and Linux, nothing to install
        </p>
      </div>
    </section>
  );
}

function SectionHead({
  label,
  title,
  children,
}: {
  label: string;
  title: string;
  children?: ReactNode;
}): ReactNode {
  return (
    <div>
      <p className={styles.sectionLabel}>{label}</p>
      <Heading as="h2" className={styles.sectionTitle}>
        {title}
      </Heading>
      {children && <p className={styles.sectionLead}>{children}</p>}
    </div>
  );
}

/** The name leads, as a search result's title is cut from its end. */
const HOME_TITLE = 'OGraf Studio: open-source editor for EBU OGraf broadcast graphics';
/** Google takes the name it shows beside the site's results from this, on the home page only. */
const WEBSITE = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'OGraf Studio',
  alternateName: 'ografstudio.org',
  url: 'https://ografstudio.org/',
};

// An unlisted example is reached only by its link, so the homepage doesn't offer it either.
const controls = examples.filter((item) => !item.notOnHomepage && !item.unlisted);
/** What an example needs from its player beyond its name. */
const PLAYER_PROPS: Record<string, Partial<ComponentProps<typeof OGrafExample>>> = {
  'dino-run': DINO_RUN,
  'live-markets': LIVE_MARKETS,
  'race-telemetry': RACE_TELEMETRY,
  rankings: RANKINGS,
  weather: WEATHER,
  'weather-strap': WEATHER_STRAP,
};
/**
 * The longest example's form, so switching examples doesn't change the page's height. One that picks its
 * own form shows far less than its package offers, and fits in the room the others need.
 */
const sizedByForm = controls.filter((item) => !PLAYER_PROPS[item.slug]?.formFields);
const MOST_ACTIONS = Math.max(
  ...sizedByForm.map((item) => graphics[item.slug as keyof typeof graphics].actions),
);
const LONGEST_FORM = Math.max(
  ...sizedByForm.map((item) => graphics[item.slug as keyof typeof graphics].fields),
);

function LiveDemo(): ReactNode {
  const [example, setExample] = useState(controls[0]);
  return (
    <section className={`${styles.section} ${styles.sectionTight} ${styles.sectionDark}`}>
      <div className={`${styles.container} ${styles.live}`}>
        <div>
          <SectionHead label="Your turn" title="Take the controls">
            Each of these was exported from Studio and it's running in your browser. Pick one, take
            it in and out like an operator, then change its data and watch it update on air.
          </SectionHead>
          {/* Every summary is laid out, so the longest holds the height when the layout is stacked. */}
          <div className={styles.liveNowStack}>
            {controls.map((item) => (
              <p
                key={item.slug}
                className={item === example ? styles.liveNow : `${styles.liveNow} ${styles.liveNowSizer}`}>
                <strong>{item.title}</strong> <LevelTag level={item.level} /> {item.summary}
              </p>
            ))}
          </div>
          <Link className={styles.textLink} to={`/examples/${example.slug}`}>
            Make this one yours →
          </Link>
        </div>
        <div>
          <div className={styles.sources} role="group" aria-label="Choose an example">
            {controls.map((item) => (
              <button
                key={item.slug}
                type="button"
                className={styles.source}
                aria-pressed={item === example}
                onClick={() => setExample(item)}>
                <i aria-hidden="true" />
                {item.title}
              </button>
            ))}
          </div>
          <OGrafExample
            slug={example.slug as ComponentProps<typeof OGrafExample>['slug']}
            reserveFields={LONGEST_FORM}
            reserveActions={MOST_ACTIONS}
            {...PLAYER_PROPS[example.slug]}
          />
        </div>
      </div>
    </section>
  );
}

function Features(): ReactNode {
  return (
    <section className={styles.section}>
      <div className={`${styles.container} ${styles.spec}`}>
        <div className={styles.specHead}>
          <SectionHead label="Running order" title="Everything a package needs">
            From a single strap to a full channel package, with the data model, reuse and checks
            that playout depends on.
          </SectionHead>
          <Link className={styles.textLink} to="/docs">
            Read the documentation →
          </Link>
        </div>
        <ol className={styles.specList}>
          {FEATURES.map((feature, index) => (
            <li key={feature.title}>
              <span className={styles.specNumber}>{String(index + 1).padStart(2, '0')}</span>
              <Heading as="h3">{feature.title}</Heading>
              <p>{feature.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Workflow(): ReactNode {
  return (
    <section className={`${styles.section} ${styles.sectionDark}`}>
      <div className={styles.container}>
        <SectionHead label="Timeline" title="From design to playout" />
        <ol className={styles.timeline}>
          {STEPS.map((step) => (
            <li key={step.title}>
              <span className={styles.timelineKey}>
                <i aria-hidden="true" />
                {step.marker}
              </span>
              <Heading as="h3">{step.title}</Heading>
              <p>{step.text}</p>
              <Link className={styles.textLink} to={step.link}>
                {step.label} →
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function News(): ReactNode {
  const items = [
    {
      kicker: 'Latest release',
      title: `OGraf Studio ${info.latestPrerelease ?? info.latestRelease}`,
      to: `/releases/${info.latestPrerelease ?? info.latestRelease}`,
    },
    {
      kicker: 'Award',
      title: 'Best of Show at IBC 2026',
      to: '/announcements/best-of-show-ibc-2026',
    },
    {kicker: 'History', title: 'Every release since 0.01', to: '/releases'},
  ];
  return (
    <section className={styles.section}>
      <div className={styles.container}>
        <SectionHead label="Newsroom" title="What's new" />
        <ul className={styles.news}>
          {items.map((item) => (
            <li key={item.to}>
              <Link to={item.to}>
                <span className={styles.newsKicker}>{item.kicker}</span>
                <strong>{item.title}</strong>
                <span aria-hidden="true">→</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function CallToAction(): ReactNode {
  return (
    <section className={styles.cta}>
      <div className={styles.container}>
        <Heading as="h2" className={styles.ctaTitle}>
          Make your first graphic in minutes
        </Heading>
        <p>Download one file, run it, and open Studio in your browser.</p>
        <Downloads>
          <Link className={styles.buttonGhost} href={REPOSITORY_URL}>
            View on GitHub
          </Link>
        </Downloads>
      </div>
    </section>
  );
}

export default function Home(): ReactNode {
  return (
    <Layout description="OGraf Studio is an open-source, browser-based editor for EBU OGraf-compatible broadcast graphics: lower thirds, scoreboards, tickers and full-screen graphics.">
      <Head>
        <title>{HOME_TITLE}</title>
        <meta property="og:title" content={HOME_TITLE} />
        <script type="application/ld+json">{JSON.stringify(WEBSITE)}</script>
      </Head>
      <div className={styles.home}>
        <Hero />
        <main>
          <Proof />
          <LiveDemo />
          <Features />
          <Workflow />
          <News />
          <CallToAction />
        </main>
      </div>
    </Layout>
  );
}
