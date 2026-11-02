import { Download } from 'lucide-react';
import toast from 'react-hot-toast';

interface CsvColumn<T> {
  header: string;
  accessor: (item: T) => string | number | boolean | null | undefined;
}

interface CsvButtonProps<T> {
  data: T[];
  columns: CsvColumn<T>[];
  filename?: string;
  label?: string;
  className?: string;
}

export function CsvButton<T>({
  data,
  columns,
  filename = 'export-data.csv',
  label = 'Export CSV',
  className = '',
}: CsvButtonProps<T>) {
  const handleExport = () => {
    if (!data || data.length === 0) {
      toast.error('Tidak ada data untuk diexport.');
      return;
    }

    try {
      const headers = columns.map((c) => `"${c.header.replace(/"/g, '""')}"`).join(',');

      const rows = data.map((item) => {
        return columns
          .map((c) => {
            const val = c.accessor(item);
            if (val === null || val === undefined) return '""';
            const cleanStr = String(val).replace(/"/g, '""');
            return `"${cleanStr}"`;
          })
          .join(',');
      });

      const csvContent = '\uFEFF' + [headers, ...rows].join('\r\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success(`Berhasil mengunduh ${data.length} baris CSV.`);
    } catch (err: any) {
      toast.error('Gagal mengekspor data: ' + err.message);
    }
  };

  return (
    <button
      type="button"
      onClick={handleExport}
      className={`inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-xs font-semibold rounded-lg shadow-sm transition-colors ${className}`}
    >
      <Download className="w-3.5 h-3.5 text-gray-500" />
      {label}
    </button>
  );
}
