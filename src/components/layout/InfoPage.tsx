import type { ReactNode } from 'react';
import { Seo } from '../Seo';
import { PageContainer } from './PageContainer';
import { Breadcrumb } from './Breadcrumb';

export interface LegalSection {
  title: string;
  body: ReactNode;
}

/** Kerangka halaman teks panjang (syarat, privasi, dsb.) */
export function InfoPage({
  title,
  description,
  intro,
  sections,
  children,
}: {
  title: string;
  description: string;
  intro?: string;
  sections?: LegalSection[];
  children?: ReactNode;
}) {
  return (
    <PageContainer narrow>
      <Seo title={title} description={description} />
      <Breadcrumb items={[{ label: 'Beranda', to: '/' }, { label: title }]} />
      <h1 className="text-2xl font-bold text-ink sm:text-3xl">{title}</h1>
      {intro && <p className="mt-2 text-neutral-500">{intro}</p>}
      {children ? (
        <div className="mt-8">{children}</div>
      ) : (
        <div className="mt-8 space-y-8">
          {sections?.map((s, i) => (
            <section key={s.title}>
              <h2 className="text-lg font-semibold text-ink">
                {i + 1}. {s.title}
              </h2>
              <div className="mt-2 space-y-2 text-sm leading-relaxed text-neutral-700">{s.body}</div>
            </section>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
