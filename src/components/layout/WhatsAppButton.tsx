import { MessageCircle } from 'lucide-react';
import { useSiteSettings } from '../../context/SiteSettingsContext';

export function WhatsAppButton() {
  const { settings } = useSiteSettings();
  const text = encodeURIComponent(`Halo ${settings.name}, saya ingin bertanya tentang sewa motor.`);
  return (
    <a
      href={`https://wa.me/${settings.whatsapp}?text=${text}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat WhatsApp"
      className="fixed bottom-5 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-success-600 text-white shadow-md transition-transform duration-150 hover:scale-105 sm:right-6"
    >
      <MessageCircle aria-hidden className="h-6 w-6" />
    </a>
  );
}
