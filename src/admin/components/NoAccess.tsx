import React from 'react';
import { ShieldAlert, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

interface NoAccessProps {
  message?: string;
}

export const NoAccess: React.FC<NoAccessProps> = ({
  message = 'Halaman ini hanya dapat diakses oleh Administrator utama. Peran Anda saat ini adalah Staff.',
}) => {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center max-w-lg mx-auto mt-10 shadow-sm">
      <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-4">
        <ShieldAlert className="w-8 h-8" />
      </div>
      <h2 className="text-lg font-bold text-gray-900">Tidak punya akses</h2>
      <p className="text-xs text-gray-500 mt-2 leading-relaxed">{message}</p>
      <div className="mt-6">
        <Link
          to="/admin"
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary-900 text-white text-xs font-semibold rounded-xl hover:bg-primary-800 transition-colors shadow-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          Kembali ke Dashboard
        </Link>
      </div>
    </div>
  );
};
