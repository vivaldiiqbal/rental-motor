import { Helmet } from 'react-helmet-async';
import { site } from '../config/site';

/** Title dan meta description per halaman. */
export function Seo({ title, description }: { title?: string; description?: string }) {
  const full = title ? `${title} | ${site.name}` : `${site.name} - ${site.tagline}`;
  return (
    <Helmet>
      <title>{full}</title>
      {description && <meta name="description" content={description} />}
      <meta property="og:title" content={full} />
      {description && <meta property="og:description" content={description} />}
    </Helmet>
  );
}
