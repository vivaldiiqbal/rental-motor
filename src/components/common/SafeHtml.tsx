import React, { useMemo } from 'react';
import DOMPurify from 'dompurify';

interface SafeHtmlProps {
  html: string;
  className?: string;
  as?: 'div' | 'article' | 'section' | 'span';
}

export const SafeHtml: React.FC<SafeHtmlProps> = ({
  html,
  className = '',
  as: Component = 'div',
}) => {
  const cleanHtml = useMemo(() => {
    if (!html) return '';
    return DOMPurify.sanitize(html, {
      USE_PROFILES: { html: true },
      ADD_ATTR: ['target', 'rel'],
    });
  }, [html]);

  return (
    <Component
      className={`prose prose-neutral max-w-none prose-headings:text-ink prose-a:text-primary-600 prose-a:underline ${className}`}
      dangerouslySetInnerHTML={{ __html: cleanHtml }}
    />
  );
};
