import type { Booking, Review, EmergencyContact } from '../types';
import type { AdminRole } from './permissions';

export type DocumentStatus = 'pending' | 'verified' | 'rejected' | 'not_uploaded';

export interface ApiResponse<T> {
  data: T;
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
    totalPages?: number;
    unreadCount?: number;
    pendingCount?: number;
    overdueCount?: number;
    [key: string]: unknown;
  };
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  address?: string;
  role: AdminRole;
  isActive: boolean;
  avatar?: string;
  createdAt: string;
  lastLoginAt?: string;
  documents?: {
    ktp: 'not_uploaded' | 'pending' | 'verified' | 'rejected';
    sim: 'not_uploaded' | 'pending' | 'verified' | 'rejected';
  };
  totalBookings?: number;
}

export interface TimelineEntry {
  status: string;
  title?: string;
  note?: string;
  actor?: string;
  timestamp?: string;
  at?: string;
  by?: string;
}

export type BookingTimelineEntry = TimelineEntry;

export interface AdminBooking extends Booking {
  // Convenience aliases to maintain dual compatibility
  bookingCode?: string;
  motorPlate?: string;
  motorName?: string;
  motorImage?: string;
  userName?: string;
  userPhone?: string;
  userEmail?: string;
  totalPrice?: number;
  pickupLocation?: string;
  returnLocation?: string;
  startFuelLevel?: string;
  endFuelLevel?: string;

  // Admin Operational Extensions
  paymentStatus: 'pending' | 'paid' | 'refunded' | 'failed';
  paymentMethod: 'transfer' | 'ewallet' | 'cash';
  paidAt?: string;
  cancelledAt?: string;
  cancelReason?: string;
  refundAmount?: number;
  actualReturnDate?: string;
  notes?: string;
  timeline: TimelineEntry[];
  pickupAddress?: string;
  returnAddress?: string;
  pickupTime?: string;
  addonsList?: { id: string; name: string; price: number }[];
  isOverdue?: boolean;

  // MVP Handover & Return Details
  emergencyContact?: EmergencyContact | null;
  lineItems?: {
    label: string;
    amount: number;
  }[];
  startOdometer?: number;
  endOdometer?: number;
  initialFuel?: string;
  finalFuel?: string;
  lateFee?: number;
  damageFee?: number;
  otherFee?: number;
  refundDeposit?: number;
  underpayment?: number;
  depositReturned?: boolean;
  depositRefundedAt?: string;
  handover?: {
    startOdometer: number;
    initialFuel: string;
    conditionNotes?: string;
    originalDocsChecked: boolean;
    depositReceived: boolean;
    at: string;
    by: string;
    photos?: string[];
  };
  returnInfo?: {
    endOdometer: number;
    finalFuel: string;
    notes?: string;
    returnTime: string;
    lateFee: number;
    damageFee: number;
    otherFee: number;
    totalDeduction: number;
    refundDeposit: number;
    underpayment: number;
    at: string;
    by: string;
  };
  source?: 'web' | 'walk_in' | 'whatsapp';
}

export interface AdminDocument {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  userPhone: string;
  type: 'ktp' | 'sim';
  idNumber?: string;
  fullName?: string;
  birthDate?: string;
  simExpiry?: string;
  storedName: string;
  filePath?: string;
  file_path?: string;
  fileUrl: string;
  status: 'pending' | 'verified' | 'rejected';
  reviewerNote?: string;
  notes?: string;
  uploadedAt: string;
  updatedAt?: string;
  updated_at?: string;
  verifiedAt?: string;
}

export interface MaintenanceBlock {
  id: string;
  motorId?: string;
  motorcycleId?: string;
  motorName?: string;
  motorcycleName?: string;
  motorPlate?: string;
  startDate: string;
  endDate: string;
  reason: string;
  cost?: number;
  status: 'scheduled' | 'in_progress' | 'completed';
  technician?: string;
  notes?: string;
  createdAt: string;
}

export interface AdminReview extends Partial<Review> {
  id: string;
  userId?: string;
  userName: string;
  userEmail?: string;
  motorcycleName?: string;
  motorName?: string;
  rating: number;
  comment: string;
  status: 'published' | 'hidden';
  createdAt: string;
}

export interface PromoItem {
  id: string;
  code: string;
  name?: string;
  discountType?: 'percent' | 'fixed';
  discountValue?: number;
  discountPercent?: number;
  maxDiscount?: number;
  minSpend?: number;
  minSubtotal?: number;
  quota?: number;
  usageLimit?: number;
  usedCount?: number;
  isActive: boolean;
  startDate: string;
  endDate?: string;
  expiresAt?: string;
}

export interface AddonItem {
  id: string;
  name: string;
  pricePerDay: number;
  description: string;
  stock?: number;
  isActive: boolean;
}

export interface LocationItem {
  id: string;
  name: string;
  address: string;
  type?: 'main_store' | 'hub' | 'delivery_point';
  deliveryFee: number;
  isActive: boolean;
  notes?: string;
}

export interface ContactMessage {
  id: string;
  name: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
  isRead: boolean;
  repliedAt?: string;
  replyNote?: string;
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actorId: string;
  actorName: string;
  actorRole: AdminRole;
  action: string;
  module: string;
  targetId?: string;
  targetName?: string;
  details: string;
  ipAddress?: string;
}

export interface SystemSettings {
  storeName: string;
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
  operationalHours: string;
  minRentalDays: number;
  maxRentalDays: number;
  defaultDeposit: number;
  lateFeePercentPerHour: number;
  requireVerifiedDocs: boolean;
  autoVerifyDocs: boolean;
  weekendSurcharge: boolean;
  bookingExpireMinutes: number;
  paymentGatewayActive: boolean;

  // Settings form aliases:
  depositAmount?: number;
  lateFeePerHour?: number;
  lateFeeToleranceMinutes?: number;
  cancellationThresholdHours?: number;
  cancellationRefundPercent?: number;
  brandName?: string;
  whatsappNumber?: string;
  contactEmail?: string;
  minRenterAge?: number;
  paymentExpiryMinutes?: number;
  cancellationPolicy?: Array<{ thresholdHours: number; refundPercent: number }>;
  bookingExpirationMinutes?: number;
  operationalHoursOpen?: string;
  operationalHoursClose?: string;
  contactWhatsapp?: string;
  officeAddress?: string;
}

export interface ReportSummary {
  revenueTotal: number;
  revenueThisMonth: number;
  revenueLastMonth?: number;
  revenueGrowthPercent: number;
  bookingsTotal: number;
  bookingsThisMonth: number;
  activeRentalsCount: number;
  occupancyRate: number;
  pendingDocsCount: number;
  overdueBookingsCount: number;
  pickupsTodayCount: number;
  returnsTodayCount: number;
  pendingPaymentCount: number;
  totalRevenue?: number;
  activeRentals?: number;
  totalMotors?: number;
  availableMotors?: number;
  rentedMotors?: number;
  maintenanceMotors?: number;
  pendingDocumentsCount?: number;
  monthlyRevenue: { month: string; revenue: number; bookings?: number }[];
  revenue30DaysTrend?: { date: string; revenue: number }[];
  bookingStatusCounts?: { status: string; label: string; count: number; color: string }[];
  statusDistribution?: { status: string; count: number; label: string; color: string }[];
  topMotors?: { id: string; name: string; brand?: string; rentalCount?: number; revenue: number }[];
  popularAddons?: { id: string; name: string; count?: number; revenue?: number }[];
  todayTasks?: {
    id: string;
    type: 'pickup' | 'return' | 'document' | 'overdue';
    title: string;
    subtitle: string;
    link: string;
    status: string;
    isUrgent?: boolean;
  }[];
}

export interface AdminPageItem {
  id: number;
  slug: string;
  title: string;
  bodyLength: number;
  version: number;
  isPublished: boolean;
  updatedAt?: string | null;
}

export interface AdminPageDetail {
  id: number;
  slug: string;
  title: string;
  body: string;
  version: number;
  isPublished: boolean;
  updatedAt?: string | null;
}

export interface AdminPageVersion {
  id: number;
  version: number;
  title: string;
  bodyLength: number;
  changeNote: string | null;
  createdBy?: number | null;
  createdAt: string;
}

export interface AdminFaqItem {
  id: number;
  question: string;
  answer: string;
  sortOrder: number;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface AdminBlockItem {
  key: string;
  value: any;
  isDefault: boolean;
  updatedAt: string | null;
}

export interface AdminPricingRule {
  id: number;
  name: string;
  ruleType: 'weekend' | 'seasonal' | 'holiday' | 'custom';
  rateType: 'multiplier' | 'fixed' | 'percentage';
  rateValue: number;
  startDate?: string | null;
  endDate?: string | null;
  scope: 'all' | 'motor_type' | 'motorcycle';
  scopeValue?: string | null;
  priority: number;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface AdminDiscountTier {
  id: number;
  minDays: number;
  discountPercent: number;
  description?: string | null;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}
