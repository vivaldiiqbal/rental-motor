import type { ReactNode } from 'react';
import { PageContainer } from './PageContainer';

/** Kartu putih di tengah untuk halaman login/daftar/lupa sandi. */
export function AuthCard({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <PageContainer>
      <div className="mx-auto max-w-md">
        <div className="card p-6 sm:p-8">
          <h1 className="text-2xl font-bold text-ink">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-neutral-500">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </PageContainer>
  );
}
