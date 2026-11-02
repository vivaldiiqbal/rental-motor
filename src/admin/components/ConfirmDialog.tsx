import React from 'react';
import { AlertTriangle, AlertCircle, Info, X } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'primary';
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmText = 'Konfirmasi',
  cancelText = 'Batal',
  variant = 'primary',
  loading = false,
  onConfirm,
  onClose,
}) => {
  if (!isOpen) return null;

  const variantStyles = {
    danger: {
      icon: AlertTriangle,
      iconBg: 'bg-rose-100 text-rose-600',
      btn: 'bg-rose-600 hover:bg-rose-700 focus:ring-rose-500 text-white',
    },
    warning: {
      icon: AlertCircle,
      iconBg: 'bg-amber-100 text-amber-600',
      btn: 'bg-amber-600 hover:bg-amber-700 focus:ring-amber-500 text-white',
    },
    primary: {
      icon: Info,
      iconBg: 'bg-primary-100 text-primary-900',
      btn: 'bg-primary-900 hover:bg-primary-800 focus:ring-primary-900 text-white',
    },
  }[variant];

  const Icon = variantStyles.icon;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
        onClick={loading ? undefined : onClose}
      />

      {/* Modal Dialog */}
      <div className="flex min-h-full items-center justify-center p-4 text-center sm:p-0">
        <div className="relative transform overflow-hidden rounded-2xl bg-white text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg border border-gray-100 p-6">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-500 focus:outline-none"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="sm:flex sm:items-start">
            <div
              className={`mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl sm:mx-0 sm:h-10 sm:w-10 ${variantStyles.iconBg}`}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
            </div>

            <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left flex-1">
              <h3 className="text-base font-semibold leading-6 text-gray-900">{title}</h3>
              <div className="mt-2 text-sm text-gray-600 leading-relaxed">{message}</div>
            </div>
          </div>

          <div className="mt-6 sm:mt-5 sm:flex sm:flex-row-reverse gap-3">
            <button
              type="button"
              disabled={loading}
              onClick={(e) => {
                e.preventDefault();
                if (loading) return;
                onConfirm();
              }}
              className={`inline-flex w-full justify-center rounded-lg px-4 py-2.5 text-sm font-semibold shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 sm:w-auto transition-colors ${variantStyles.btn}`}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Memproses...
                </span>
              ) : (
                confirmText
              )}
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={onClose}
              className="mt-3 inline-flex w-full justify-center rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 sm:mt-0 sm:w-auto transition-colors"
            >
              {cancelText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
