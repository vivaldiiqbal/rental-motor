import React, { useState } from 'react';
import { Trash2, Star, Image as ImageIcon, Link as LinkIcon, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminApi } from '../services/adminApi';

interface ImageUploaderProps {
  images: string[];
  onChange: (images: string[]) => void;
  maxImages?: number;
}

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 3 * 1024 * 1024; // 3 MB

export const ImageUploader: React.FC<ImageUploaderProps> = ({
  images,
  onChange,
  maxImages = 8,
}) => {
  const [urlInput, setUrlInput] = useState('');
  const [showInput, setShowInput] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleAddUrl = (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim()) return;

    if (images.length >= maxImages) {
      toast.error(`Maksimal ${maxImages} foto diperbolehkan.`);
      return;
    }

    onChange([...images, urlInput.trim()]);
    setUrlInput('');
    setShowInput(false);
    toast.success('Gambar berhasil ditambahkan.');
  };

  const handleRemove = (index: number) => {
    const updated = images.filter((_, i) => i !== index);
    onChange(updated);
    toast.success('Foto dihapus.');
  };

  const handleSetPrimary = (index: number) => {
    if (index === 0) return;
    const target = images[index];
    const remaining = images.filter((_, i) => i !== index);
    onChange([target, ...remaining]);
    toast.success('Foto utama berhasil ditentukan.');
  };

  const handleMove = (index: number, direction: 'left' | 'right') => {
    const newIndex = direction === 'left' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= images.length) return;
    const list = [...images];
    const temp = list[index];
    list[index] = list[newIndex];
    list[newIndex] = temp;
    onChange(list);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (images.length >= maxImages) {
      toast.error(`Maksimal ${maxImages} foto.`);
      e.target.value = '';
      return;
    }

    const file = files[0];

    // Validasi tipe file
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error('Format foto tidak valid. Gunakan format JPG, PNG, atau WebP.');
      e.target.value = '';
      return;
    }

    // Validasi ukuran file (maks 3 MB)
    if (file.size > MAX_FILE_SIZE) {
      toast.error('Ukuran foto terlalu besar. Maksimal 3 MB per foto.');
      e.target.value = '';
      return;
    }

    setIsUploading(true);
    const toastId = toast.loading('Mengunggah foto ke server...');
    try {
      const res = await adminApi.uploadMotorImage(file);
      onChange([...images, res.url]);
      toast.success('Foto armada berhasil diunggah ke server.', { id: toastId });
    } catch (err: unknown) {
      // Fallback ke FileReader jika terjadi kendala jaringan
      const errorMsg = (err as { response?: { data?: { message?: string } }; message?: string })?.response?.data?.message ||
        (err as { message?: string })?.message ||
        'Gagal mengunggah foto ke server.';
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          onChange([...images, reader.result]);
          toast.success('Foto disimpan secara lokal.', { id: toastId });
        }
      };
      reader.onerror = () => {
        toast.error(errorMsg, { id: toastId });
      };
      reader.readAsDataURL(file);
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === targetIndex) return;

    const list = [...images];
    const item = list.splice(draggedIndex, 1)[0];
    list.splice(targetIndex, 0, item);
    onChange(list);
    setDraggedIndex(null);
    toast.success('Urutan foto berhasil diperbarui.');
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>
          Foto terunggah: <strong className="text-gray-800">{images.length}</strong> / {maxImages} (JPG/PNG/WebP, maks 3 MB)
        </span>
        <span className="text-[11px] text-gray-400">Seret foto untuk mengatur urutan</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {images.map((img, idx) => (
          <div
            key={idx}
            draggable
            onDragStart={(e) => handleDragStart(e, idx)}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, idx)}
            className={`group relative aspect-video rounded-xl overflow-hidden border bg-gray-100 shadow-xs cursor-move transition-all ${
              draggedIndex === idx ? 'opacity-40 ring-2 ring-primary-500' : 'border-gray-200'
            }`}
          >
            <img
              src={img}
              alt={`Foto Unit ${idx + 1}`}
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).src =
                  'https://images.unsplash.com/photo-1558981403-c5f9899a28bc?auto=format&fit=crop&w=400&q=80';
              }}
            />

            {/* Badge foto utama */}
            {idx === 0 ? (
              <span className="absolute top-2 left-2 bg-primary-900 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow">
                ★ Foto Utama
              </span>
            ) : (
              <span className="absolute top-2 left-2 bg-black/60 text-white text-[10px] font-mono px-1.5 py-0.5 rounded shadow">
                #{idx + 1}
              </span>
            )}

            {/* Overlay Actions */}
            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-2">
              <div className="flex justify-between items-center">
                {idx > 0 && (
                  <button
                    type="button"
                    title="Pindahkan ke Kiri"
                    onClick={() => handleMove(idx, 'left')}
                    className="p-1 bg-white/90 text-gray-800 rounded hover:bg-white"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                )}
                <div className="flex items-center gap-1 ml-auto">
                  {idx !== 0 && (
                    <button
                      type="button"
                      title="Jadikan Foto Utama"
                      onClick={() => handleSetPrimary(idx)}
                      className="p-1 bg-amber-500 text-white rounded hover:bg-amber-600 shadow"
                    >
                      <Star className="w-3.5 h-3.5 fill-white" />
                    </button>
                  )}
                  <button
                    type="button"
                    title="Hapus Foto"
                    onClick={() => handleRemove(idx)}
                    className="p-1 bg-rose-600 text-white rounded hover:bg-rose-700 shadow"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                {idx < images.length - 1 && (
                  <button
                    type="button"
                    title="Pindahkan ke Kanan"
                    onClick={() => handleMove(idx, 'right')}
                    className="p-1 bg-white/90 text-gray-800 rounded hover:bg-white ml-1"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <span className="text-[10px] text-white/80 text-center font-medium">Seret untuk urut</span>
            </div>
          </div>
        ))}

        {/* Add Button */}
        {images.length < maxImages && (
          <div className="aspect-video rounded-xl border-2 border-dashed border-gray-300 hover:border-primary-400 bg-gray-50 flex flex-col items-center justify-center p-3 text-center transition-colors">
            <div className="flex gap-2 mb-2">
              <label className={`cursor-pointer p-2 bg-white rounded-lg border border-gray-200 hover:bg-gray-100 shadow-xs text-gray-700 transition-colors ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}>
                {isUploading ? <Loader2 className="w-4 h-4 animate-spin text-primary-600" /> : <ImageIcon className="w-4 h-4" />}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handleFileUpload}
                  disabled={isUploading}
                />
              </label>
              <button
                type="button"
                onClick={() => setShowInput(!showInput)}
                className="p-2 bg-white rounded-lg border border-gray-200 hover:bg-gray-100 shadow-xs text-gray-700 transition-colors"
                title="Tambah via URL Gambar"
              >
                <LinkIcon className="w-4 h-4" />
              </button>
            </div>
            <span className="text-[11px] text-gray-600 font-semibold">Unggah / URL</span>
            <span className="text-[9px] text-gray-400 mt-0.5">Maks 3 MB (JPG/PNG/WebP)</span>
          </div>
        )}
      </div>

      {showInput && (
        <form onSubmit={handleAddUrl} className="flex gap-2 mt-2">
          <input
            type="url"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="https://images.unsplash.com/... atau tautan gambar langsung"
            className="flex-1 text-xs py-2 px-3 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-900"
          />
          <button
            type="submit"
            className="px-4 py-2 bg-primary-900 text-white text-xs font-semibold rounded-lg hover:bg-primary-800"
          >
            Tambah URL
          </button>
        </form>
      )}
    </div>
  );
};
