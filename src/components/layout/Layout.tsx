import { Suspense } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Navbar } from './Navbar';
import { Footer } from './Footer';
import { ScrollToTop } from './ScrollToTop';
import { WhatsAppButton } from './WhatsAppButton';
import { CompareBar } from '../motor/CompareBar';
import { ErrorBoundary } from '../ErrorBoundary';
import { Spinner } from '../ui/Spinner';

import { AnnouncementBanner } from '../common/AnnouncementBanner';

/** Kerangka halaman: skip link, navbar, konten (dengan ErrorBoundary per halaman), footer. */
export function Layout() {
  const { pathname } = useLocation();
  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#konten"
        className="sr-only z-50 rounded-xl bg-white px-4 py-2 font-medium text-primary-700 shadow-md focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Lompat ke konten
      </a>
      <ScrollToTop />
      <AnnouncementBanner />
      <Navbar />
      <main id="konten" tabIndex={-1} className="flex-1 outline-none">
        <ErrorBoundary resetKey={pathname}>
          <Suspense
            fallback={
              <div className="flex justify-center py-24">
                <Spinner className="h-8 w-8 text-primary-600" />
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>
      <Footer />
      <CompareBar />
      <WhatsAppButton />
    </div>
  );
}
