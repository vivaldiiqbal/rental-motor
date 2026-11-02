import { useState } from 'react';
import type { Review } from '../../types';
import { RatingStars } from '../ui/RatingStars';
import { EmptyState } from '../ui/EmptyState';
import { Button } from '../ui/Button';
import { formatDate } from '../../lib/format';
import { MessageSquare } from 'lucide-react';

const PAGE = 5;

export function ReviewList({ reviews }: { reviews: Review[] }) {
  const [shown, setShown] = useState(PAGE);

  if (reviews.length === 0) {
    return (
      <EmptyState
        icon={<MessageSquare aria-hidden className="h-6 w-6" />}
        title="Belum ada ulasan"
        description="Jadilah yang pertama memberikan ulasan untuk motor ini."
      />
    );
  }

  return (
    <div>
      <ul className="divide-y divide-neutral-200">
        {reviews.slice(0, shown).map((r) => (
          <li key={r.id} className="py-4">
            <div className="flex items-center justify-between gap-3">
              <p className="font-medium text-ink">{r.author}</p>
              <time dateTime={r.date} className="text-xs text-neutral-500">
                {formatDate(r.date)}
              </time>
            </div>
            <div className="mt-1">
              <RatingStars value={r.rating} size={14} />
            </div>
            <p className="mt-2 text-sm text-neutral-700">{r.comment}</p>
          </li>
        ))}
      </ul>
      {shown < reviews.length && (
        <div className="mt-2 text-center">
          <Button variant="secondary" onClick={() => setShown((s) => s + PAGE)}>
            Tampilkan lebih banyak
          </Button>
        </div>
      )}
    </div>
  );
}
