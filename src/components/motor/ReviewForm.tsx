import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import { RatingInput } from '../ui/RatingStars';
import { Textarea } from '../ui/Textarea';
import { Button } from '../ui/Button';
import { useAuth } from '../../context/AuthContext';
import * as api from '../../services/api';

export function ReviewForm({ motorId, onAdded }: { motorId: string; onAdded: () => void }) {
  const { user } = useAuth();
  const location = useLocation();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!user) {
    return (
      <p className="rounded-xl bg-neutral-100 p-4 text-sm text-neutral-700">
        <Link to="/login" state={{ from: location.pathname }} className="font-medium text-primary-600 underline">
          Masuk
        </Link>{' '}
        untuk menulis ulasan.
      </p>
    );
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (rating === 0) return setError('Pilih rating terlebih dahulu.');
    if (comment.trim().length < 10) return setError('Ulasan minimal 10 karakter.');
    setError('');
    setBusy(true);
    try {
      await api.addReview({ motorId, author: user.name, rating, comment: comment.trim() });
      toast.success('Terima kasih! Ulasan Anda telah dikirim.');
      setRating(0);
      setComment('');
      onAdded();
    } catch {
      toast.error('Gagal mengirim ulasan. Coba lagi.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-3">
      <div>
        <p className="mb-1 text-sm font-medium text-neutral-700">Rating Anda</p>
        <RatingInput value={rating} onChange={setRating} />
      </div>
      <Textarea
        label="Ulasan"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Ceritakan pengalaman Anda menyewa motor ini"
        maxLength={500}
        error={error}
      />
      <Button type="submit" loading={busy}>
        Kirim Ulasan
      </Button>
    </form>
  );
}
