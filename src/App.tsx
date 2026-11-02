import { Suspense, lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import toast, { Toaster } from 'react-hot-toast';
import { AuthProvider } from './context/AuthContext';

// Penghapusan duplikat toast untuk pesan identik dalam 3 detik (3000 ms)
const recentToasts = new Map<string, { time: number; id: string }>();
const DEDUPE_WINDOW_MS = 3000;
const origToastError = toast.error.bind(toast);
toast.error = ((message: any, options?: any) => {
  const key = typeof message === 'string' ? `err:${message.trim()}` : '';
  if (key) {
    const now = Date.now();
    const prev = recentToasts.get(key);
    if (prev && now - prev.time < DEDUPE_WINDOW_MS) {
      return prev.id;
    }
    const id = origToastError(message, options);
    recentToasts.set(key, { time: now, id });
    return id;
  }
  return origToastError(message, options);
}) as typeof toast.error;
import { RealtimeProvider } from './context/RealtimeContext';
import { FavoritesProvider } from './context/FavoritesContext';
import { CompareProvider } from './context/CompareContext';
import { SiteSettingsProvider } from './context/SiteSettingsContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Layout } from './components/layout/Layout';
import { RequireAuth } from './components/layout/RequireAuth';
import { Spinner } from './components/ui/Spinner';

// Halaman dimuat malas agar bundel awal kecil
const Home = lazy(() => import('./pages/Home'));
const Motors = lazy(() => import('./pages/Motors'));
const MotorDetail = lazy(() => import('./pages/MotorDetail'));
const Compare = lazy(() => import('./pages/Compare'));
const Booking = lazy(() => import('./pages/Booking'));
const Bookings = lazy(() => import('./pages/Bookings'));
const BookingDetail = lazy(() => import('./pages/BookingDetail'));
const Favorites = lazy(() => import('./pages/Favorites'));
const Profile = lazy(() => import('./pages/Profile'));
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const HowItWorks = lazy(() => import('./pages/HowItWorks'));
const About = lazy(() => import('./pages/About'));
const Contact = lazy(() => import('./pages/Contact'));
const Terms = lazy(() => import('./pages/Terms'));
const Privacy = lazy(() => import('./pages/Privacy'));
const NotFound = lazy(() => import('./pages/NotFound'));

// Halaman Admin (dimuat malas untuk menjaga performa bundel publik)
import { AdminOnlyGuard } from './admin/layout/AdminOnlyGuard';
const AdminLogin = lazy(() => import('./admin/pages/AdminLogin'));
const AdminLayout = lazy(() => import('./admin/layout/AdminLayout'));
const AdminDashboard = lazy(() => import('./admin/pages/Dashboard'));
const AdminBookings = lazy(() => import('./admin/pages/Bookings'));
const AdminBookingDetail = lazy(() => import('./admin/pages/BookingDetail'));
const AdminRentalHistory = lazy(() => import('./admin/pages/RentalHistory'));
const AdminDocuments = lazy(() => import('./admin/pages/Documents'));
const AdminMotors = lazy(() => import('./admin/pages/Motors'));
const AdminMotorForm = lazy(() => import('./admin/pages/MotorForm'));
const AdminCalendar = lazy(() => import('./admin/pages/Calendar'));
const AdminMaintenance = lazy(() => import('./admin/pages/Maintenance'));
const AdminUsers = lazy(() => import('./admin/pages/Users'));
const AdminUserDetail = lazy(() => import('./admin/pages/UserDetail'));
const AdminReviews = lazy(() => import('./admin/pages/Reviews'));
const AdminPromos = lazy(() => import('./admin/pages/Promos'));
const AdminAddons = lazy(() => import('./admin/pages/Addons'));
const AdminLocations = lazy(() => import('./admin/pages/Locations'));
const AdminMessages = lazy(() => import('./admin/pages/Messages'));
const AdminReports = lazy(() => import('./admin/pages/Reports'));
const AdminAuditLog = lazy(() => import('./admin/pages/AuditLog'));
const AdminSettings = lazy(() => import('./admin/pages/Settings'));
const AdminPricing = lazy(() => import('./admin/pages/PricingManagement'));
const AdminContent = lazy(() => import('./admin/pages/ContentManagement').then((m) => ({ default: m.ContentManagement })));
const AdminGpsTracking = lazy(() => import('./admin/pages/GpsTracking'));
const AdminNotFound = lazy(() => import('./admin/pages/NotFound'));

function PageLoader() {
  return (
    <div className="flex justify-center py-24">
      <Spinner className="h-8 w-8 text-primary-600" />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary fullScreen>
      <HelmetProvider>
        <AuthProvider>
          <RealtimeProvider>
            <SiteSettingsProvider>
              <FavoritesProvider>
                <CompareProvider>
                <Suspense fallback={<PageLoader />}>
                <Routes>
                  {/* Rute Publik */}
                  <Route element={<Layout />}>
                    <Route index element={<Home />} />
                    <Route path="motors" element={<Motors />} />
                    <Route path="motors/:slug" element={<MotorDetail />} />
                    <Route path="compare" element={<Compare />} />
                    <Route path="favorites" element={<Favorites />} />
                    <Route path="login" element={<Login />} />
                    <Route path="register" element={<Register />} />
                    <Route path="forgot-password" element={<ForgotPassword />} />
                    <Route path="how-it-works" element={<HowItWorks />} />
                    <Route path="about" element={<About />} />
                    <Route path="contact" element={<Contact />} />
                    <Route path="terms" element={<Terms />} />
                    <Route path="privacy" element={<Privacy />} />
                    <Route element={<RequireAuth />}>
                      <Route path="booking/:slug" element={<Booking />} />
                      <Route path="bookings" element={<Bookings />} />
                      <Route path="bookings/:code" element={<BookingDetail />} />
                      <Route path="profile" element={<Profile />} />
                    </Route>
                    <Route path="*" element={<NotFound />} />
                  </Route>

                  {/* Rute Login Admin (Terpisah dari AdminLayout/Guard) */}
                  <Route path="admin/login" element={<AdminLogin />} />

                  {/* Rute Panel Admin (Lazy Loaded) */}
                  <Route path="admin" element={<AdminLayout />}>
                    <Route index element={<AdminDashboard />} />
                    <Route path="bookings" element={<AdminBookings />} />
                    <Route path="bookings/:id" element={<AdminBookingDetail />} />
                    <Route path="rental-history" element={<AdminRentalHistory />} />
                    <Route path="documents" element={<AdminDocuments />} />
                    <Route path="calendar" element={<AdminCalendar />} />
                    <Route path="maintenance" element={<AdminMaintenance />} />
                    <Route path="gps" element={<AdminGpsTracking />} />
                    <Route path="messages" element={<AdminMessages />} />

                    {/* Rute Daftar Armada (Admin & Staf bisa melihat) */}
                    <Route path="motors" element={<AdminMotors />} />

                    {/* Rute Khusus Admin Utama */}
                    <Route path="motors/new" element={<AdminOnlyGuard><AdminMotorForm /></AdminOnlyGuard>} />
                    <Route path="motors/:id/edit" element={<AdminOnlyGuard><AdminMotorForm /></AdminOnlyGuard>} />
                    <Route path="users" element={<AdminOnlyGuard><AdminUsers /></AdminOnlyGuard>} />
                    <Route path="users/:id" element={<AdminOnlyGuard><AdminUserDetail /></AdminOnlyGuard>} />
                    <Route path="reviews" element={<AdminOnlyGuard><AdminReviews /></AdminOnlyGuard>} />
                    <Route path="promos" element={<AdminOnlyGuard><AdminPromos /></AdminOnlyGuard>} />
                    <Route path="addons" element={<AdminOnlyGuard><AdminAddons /></AdminOnlyGuard>} />
                    <Route path="pricing" element={<AdminOnlyGuard><AdminPricing /></AdminOnlyGuard>} />
                    <Route path="locations" element={<AdminOnlyGuard><AdminLocations /></AdminOnlyGuard>} />
                    <Route path="reports" element={<AdminOnlyGuard><AdminReports /></AdminOnlyGuard>} />
                    <Route path="audit" element={<AdminOnlyGuard><AdminAuditLog /></AdminOnlyGuard>} />
                    <Route path="settings" element={<AdminOnlyGuard><AdminSettings /></AdminOnlyGuard>} />
                    <Route path="content" element={<AdminOnlyGuard><AdminContent /></AdminOnlyGuard>} />
                    <Route path="*" element={<AdminNotFound />} />
                  </Route>
                </Routes>
              </Suspense>
              <Toaster position="top-center" toastOptions={{ duration: 3500 }} />
            </CompareProvider>
          </FavoritesProvider>
          </SiteSettingsProvider>
          </RealtimeProvider>
        </AuthProvider>
      </HelmetProvider>
    </ErrorBoundary>
  );
}
