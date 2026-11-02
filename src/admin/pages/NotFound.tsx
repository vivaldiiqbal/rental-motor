import React from 'react';
import { Link } from 'react-router-dom';
import { HelpCircle, ArrowLeft } from 'lucide-react';

export const NotFound: React.FC = () => {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-6">
      <div className="w-16 h-16 rounded-2xl bg-gray-100 text-gray-500 flex items-center justify-center mb-4 shadow-sm">
        <HelpCircle className="w-8 h-8" />
      </div>
      <h1 className="text-2xl font-bold text-gray-900 tracking-tight">404 - Halaman Tidak Ditemukan</h1>
      <p className="mt-2 text-xs text-gray-500 max-w-sm">
        Halaman panel admin yang Anda tuju tidak tersedia atau tautan telah dipindahkan.
      </p>
      <Link
        to="/admin"
        className="mt-6 inline-flex items-center gap-2 px-4 py-2.5 bg-primary-900 text-white rounded-xl text-xs font-semibold hover:bg-primary-800 transition-colors shadow-sm"
      >
        <ArrowLeft className="w-4 h-4" />
        Kembali ke Dashboard Admin
      </Link>
    </div>
  );
};
export default NotFound;
