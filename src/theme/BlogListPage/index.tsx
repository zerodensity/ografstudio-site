import type {ReactNode} from 'react';
import clsx from 'clsx';
import {PageMetadata, HtmlClassNameProvider, ThemeClassNames} from '@docusaurus/theme-common';
import BlogLayout from '@theme/BlogLayout';
import BlogListPaginator from '@theme/BlogListPaginator';
import type {Props} from '@theme/BlogListPage';
import BlogListPageStructuredData from '@theme/BlogListPage/StructuredData';
import BlogPostItems from '@theme/BlogPostItems';
import Heading from '@theme/Heading';
import SearchMetadata from '@theme/SearchMetadata';
import styles from './styles.module.css';

/**
 * The list of announcements or release notes. The theme's own page has no heading of its own, only the
 * posts' headings, so a search engine took the title of the page from one of the posts.
 */
export default function BlogListPage(props: Props): ReactNode {
  const {metadata, items, sidebar} = props;
  return (
    <HtmlClassNameProvider className={clsx(ThemeClassNames.wrapper.blogPages, ThemeClassNames.page.blogListPage)}>
      <PageMetadata title={metadata.blogTitle} description={metadata.blogDescription} />
      <SearchMetadata tag="blog_posts_list" />
      <BlogListPageStructuredData {...props} />
      <BlogLayout sidebar={sidebar}>
        <header className={styles.head}>
          <Heading as="h1">{metadata.blogTitle}</Heading>
          <p>{metadata.blogDescription}</p>
        </header>
        <BlogPostItems items={items} />
        <BlogListPaginator metadata={metadata} />
      </BlogLayout>
    </HtmlClassNameProvider>
  );
}
