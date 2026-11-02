import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from './ui/Button';

interface Props {
  children: ReactNode;
  /** true = tampilan layar penuh (root); false = di dalam halaman */
  fullScreen?: boolean;
  /** Ganti nilai ini (mis. pathname) untuk mereset boundary saat navigasi */
  resetKey?: string;
}
interface State {
  hasError: boolean;
  prevResetKey?: string;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, prevResetKey: this.props.resetKey };

  static getDerivedStateFromError(): Partial<State> {
    return { hasError: true };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    if (props.resetKey !== state.prevResetKey) {
      return { hasError: false, prevResetKey: props.resetKey };
    }
    return null;
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Di produksi kirim ke layanan pelacakan error di sini.
    console.error('ErrorBoundary menangkap error:', error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div
        role="alert"
        className={
          this.props.fullScreen
            ? 'flex min-h-screen items-center justify-center bg-neutral-50 p-6'
            : 'flex items-center justify-center p-6 py-16'
        }
      >
        <div className="card max-w-md px-6 py-10 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-danger-50 text-danger-600">
            <AlertTriangle aria-hidden className="h-6 w-6" />
          </div>
          <h1 className="text-lg font-semibold text-ink">Terjadi kesalahan</h1>
          <p className="mt-1 text-sm text-neutral-500">Muat ulang halaman atau coba lagi.</p>
          <div className="mt-6 flex justify-center gap-3">
            <Button onClick={() => this.setState({ hasError: false })}>Coba lagi</Button>
            <Button variant="secondary" onClick={() => window.location.assign('/')}>
              Ke Beranda
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
