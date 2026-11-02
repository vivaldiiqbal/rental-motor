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

/**
 * Sanitasi nilai sel CSV terhadap serangan CSV Formula Injection (CSV Injection).
 * Jika nilai diawali dengan '=', '+', '-', '@', tab (\t), atau carriage return (\r),
 * tambahkan tanda kutip tunggal (') di depannya.
 */
export function sanitizeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '""';
  let str = String(value);
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  const cleanStr = str.replace(/"/g, '""');
  return `"${cleanStr}"`;
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
      const headers = columns.map((c) => sanitizeCsvCell(c.header)).join(',');

      const rows = data.map((item) => {
        return columns
          .map((c) => sanitizeCsvCell(c.accessor(item)))
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
