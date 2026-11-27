import type {ReactNode} from 'react';
import Head from '@docusaurus/Head';
import {useLocation} from '@docusaurus/router';
import LightboxProvider from '@site/src/theme/Lightbox';

/**
 * Lists of posts by tag, author, year or page (the same lists the sitemap leaves out). A search should
 * land on the post, so these ask not to be listed; their links are still followed.
 */
const LIST_PAGE = /^\/(?:announcements|releases)\/(?:tags|authors|archive|page)(?:\/|$)/;

/** Wraps every page. Holds the one lightbox that Markdown images open when clicked. */
export default function Root({children}: {children: ReactNode}): ReactNode {
  const {pathname} = useLocation();
  return (
    <LightboxProvider>
      {LIST_PAGE.test(pathname) && (
        <Head>
          <meta name="robots" content="noindex, follow" />
        </Head>
      )}
      {children}
    </LightboxProvider>
  );
}
