export type MotorType = 'matic' | 'manual' | 'sport' | 'trail';
export type Transmission = 'Otomatis' | 'Manual';
export type MotorStatus = 'available' | 'rented' | 'maintenance' | 'inactive' | 'active';

export interface MotorGpsSummary {
  hasDevice: boolean;
  status: 'no_device' | 'online' | 'offline' | 'alert';
  statusLabel?: string;
  deviceId: number | string | null;
  label: string | null;
  isOnline: boolean;
  hasAlert: boolean;
  openAlertsCount?: number;
  batteryPct: number | null;
  lastLat: number | null;
  lastLng: number | null;
  lastSeenAt: string | null;
}

export interface Motor {
  id: string;
  slug: string;
  name: string;
  brand: string;
  type: MotorType;
  cc: number;
  year: number;
  color: string;
  transmission: Transmission;
  fuelCapacity: number;
  pricePerDay: number;
  deposit: number;
  description: string;
  features: string[];
  images: string[];
  primaryImage?: string | null;
  status: MotorStatus;
  dataStatus?: 'active' | 'maintenance' | 'inactive';
  operationalStatus?: string;
  gpsStatus?: 'no_device' | 'online' | 'offline' | 'alert';
  gpsStatusLabel?: string;
  gps?: MotorGpsSummary;
  rating: number;
  reviewCount: number;
  plate: string;
  plateNumber?: string;
  /** Skor popularitas untuk pengurutan "Terpopuler" */
  popularity: number;
  /** Dihitung oleh api berdasarkan tanggal yang dipilih */
  available?: boolean;
}

export interface Review {
  id: string;
  motorId: string;
  author: string;
  rating: number;
  comment: string;
  date: string;
}

export type BookingStatus =
  | 'pending'
  | 'confirmed'
  | 'active'
  | 'return_requested'
  | 'completed'
  | 'cancelled'
  | 'expired';
export type PaymentMethod = 'transfer' | 'ewallet' | 'cash';
export type PickupMethod = 'store' | 'delivery';

export interface Renter {
  name: string;
  phone: string;
  email: string;
  idNumber: string;
  notes?: string;
}

export interface PublicAddon {
  id: string | number;
  addon_id?: string | number;
  code: string;
  name: string;
  pricePerDay: number;
  price_per_day?: number;
  description: string;
  isActive: boolean;
}

export interface CartAddonItem {
  addon_id: string | number;
  code: string;
  name: string;
  price_per_day: number;
  quantity: number;
  description?: string;
}

export interface BookingAddonLine {
  id?: string | number;
  addon_id?: string | number;
  code?: string;
  name: string;
  pricePerDay?: number;
  price_per_day?: number;
  days?: number;
  qty?: number;
  quantity?: number;
  total?: number;
  amount?: number;
  price?: number;
  description?: string;
}

export interface Booking {
  id: string;
  code: string;
  motorId: string;
  motorName?: string;
  motorImage?: string;
  userId: string;
  startDate: string;
  endDate: string;
  days: number;
  pricePerDay: number;
  subtotal: number;
  deposit: number;
  total: number;
  addOnsTotal?: number;
  addons?: BookingAddonLine[];
  selectedAddOns?: BookingAddonLine[];
  addonsList?: BookingAddonLine[];
  status: BookingStatus;
  createdAt: string;
  pickup: PickupMethod;
  pickupLocation?: string;
  payment: PaymentMethod;
  paymentMethod?: string;
  paymentStatus?: string;
  renter: Renter;
  emergencyContact?: EmergencyContact | null;
  renterSnapshot?: any;
  termsVersion?: number | null;
  pricingSnapshot?: any;
  handedAt?: string | null;
  handoverAt?: string | null;
  returnedAt?: string | null;
  dueAt?: string | null;
  handover?: any;
  returnInfo?: any;
  returnRequest?: {
    requestedAt: string;
    method: 'store' | 'pickup';
    notes?: string;
    customerNotes?: string;
    photoUrl?: string | null;
  } | null;
  returnRequestedAt?: string | null;
  returnMethod?: 'store' | 'pickup' | null;
  returnCustomerNotes?: string | null;
  returnPhotoUrl?: string | null;
  depositReturned?: boolean;
  lateFee?: number;
  capabilities?: any;
}

export interface PageContent {
  slug: string;
  title: string;
  bodyHtml: string;
  version: number;
  updatedAt?: string | null;
}

export interface FaqItem {
  id: number;
  question: string;
  answerHtml: string;
}

export interface AnnouncementBlock {
  text: string;
  linkUrl?: string;
  linkLabel?: string;
}

export interface ContentBlocks {
  heroTitle: string;
  heroSubtitle: string;
  ctaText: string;
  announcement: AnnouncementBlock | null;
}

export type DocStatus = 'none' | 'pending' | 'verified' | 'rejected';

export interface UserDocumentInfo {
  type: 'ktp' | 'sim';
  status: DocStatus;
  fileName: string | null;
  sizeBytes: number | null;
  uploadedAt: string | null;
  verifiedAt: string | null;
  reviewerNote: string | null;
  fileUrl: string | null;
}

export interface EmergencyContact {
  name: string;
  relation: string;
  phone: string;
}

export interface RenterProfile {
  userId: number | string;
  fullNameKtp: string;
  birthDate: string;
  nikLast4: string;
  nikMasked?: string;
  addressKtp: string;
  phoneE164: string;
  stayAddress: string;
  emergencyName: string;
  emergencyRelation: string;
  emergencyPhone: string;
  emergencyContact: EmergencyContact;
  termsVersionAccepted: number;
  privacyVersionAccepted: number;
  gpsConsentAt: string;
  completedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface RenterReadiness {
  isReady: boolean;
  status: 'complete' | 'incomplete' | 'pending_verification' | 'rejected';
  missingFields: string[];
  pendingDocuments: string[];
  issues: string[];
  profile: RenterProfile | null;
  documents: {
    ktp: string;
    sim: string;
    selfie?: string;
  };
  actionUrl: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  role?: 'customer' | 'admin' | 'staff';
  documents: { ktp: DocStatus; sim: DocStatus };
  preferences: { emailNotif: boolean; whatsappNotif: boolean; promo: boolean };
}

export interface MotorQuery {
  q?: string;
  types?: MotorType[];
  brands?: string[];
  transmission?: Transmission | '';
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  onlyAvailable?: boolean;
  sort?: SortKey;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}

export type SortKey = 'price-asc' | 'price-desc' | 'rating' | 'newest' | 'popular';

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageCount: number;
}

export interface QuoteLineItem {
  id: string;
  type: string;
  kind?: string;
  name: string;
  label?: string;
  unitPrice?: number;
  quantity?: number;
  days?: number;
  amount: number;
  ruleId?: number;
}

export interface QuoteSurcharge {
  ruleId?: number;
  name: string;
  ruleType: string;
  rateType?: string;
  rateValue?: number;
  matchingDays: number;
  dailyExtra?: number;
  amount: number;
}

export interface AppliedDiscountTier {
  id?: number;
  minDays: number;
  discountPercent: number;
  description?: string;
}

export interface BookingQuote {
  motor: {
    id: number | string;
    name: string;
    pricePerDay: number;
  };
  pricePerDay: number;
  days: number;
  subtotal: number;
  totalSurcharge: number;
  surcharges: QuoteSurcharge[];
  weekendDays?: number;
  weekendSurcharge?: number;
  durationDiscountPercent: number;
  durationDiscount: number;
  appliedTier?: AppliedDiscountTier | null;
  deliveryFee: number;
  deliveryBreakdown?: {
    pickup: number;
    dropoff: number;
    total?: number;
  };
  addOns?: BookingAddonLine[];
  selectedAddOns?: BookingAddonLine[];
  addOnsTotal?: number;
  discount: number;
  promoDiscount: number;
  totalRental: number;
  rentalTotal?: number;
  deposit: number;
  total: number;
  grandTotal: number;
  lineItems: QuoteLineItem[];
  promo?: {
    code: string;
    type: string;
    value: number;
    discount: number;
  } | null;
}

export type AddonInputItem =
  | string
  | number
  | CartAddonItem
  | {
      id?: string | number;
      addon_id?: string | number;
      code?: string;
      name?: string;
      price_per_day?: number;
      pricePerDay?: number;
      qty?: number;
      quantity?: number;
    };

export interface QuoteInput {
  motorId: number | string;
  start: string;
  end: string;
  addons?: AddonInputItem[];
  delivery?: {
    pickup?: boolean;
    dropoff?: boolean;
  };
  promoCode?: string;
}

