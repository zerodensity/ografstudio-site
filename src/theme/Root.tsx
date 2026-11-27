import type {ReactNode} from 'react';
import Head from '@docusaurus/Head';
import {useLocation} from '@docusaurus/router';
import LightboxProvider from '@site/src/theme/Lightbox';
import bodyFont from '@fontsource/plus-jakarta-sans/files/plus-jakarta-sans-latin-400-normal.woff2';
import headingFont from '@fontsource/plus-jakarta-sans/files/plus-jakarta-sans-latin-800-normal.woff2';

/**
 * Lists of posts by tag, author, year or page (the same lists the sitemap leaves out). A search should
 * land on the post, so these ask not to be listed; their links are still followed.
 */
const LIST_PAGE = /^\/(?:announcements|releases)\/(?:tags|authors|archive|page)(?:\/|$)/;

/**
 * The fonts of the headings and the body text, fetched with the page and not when the stylesheet asks for
 * them. A page painted before they arrived drew its text in the fallback font and then moved everything
 * below when the real one changed the line breaks.
 */
const FIRST_FONTS = [headingFont, bodyFont];

/** Wraps every page. Holds the one lightbox that Markdown images open when clicked. */
export default function Root({children}: {children: ReactNode}): ReactNode {
  const {pathname} = useLocation();
  return (
    <LightboxProvider>
      <Head>
        {FIRST_FONTS.map((href) => (
          <link key={href} rel="preload" as="font" type="font/woff2" href={href} crossOrigin="anonymous" />
        ))}
      </Head>
      {LIST_PAGE.test(pathname) && (
        <Head>
          <meta name="robots" content="noindex, follow" />
        </Head>
      )}
      {children}
    </LightboxProvider>
  );
}
