/**
 * Pemetaan Baris Database PostgreSQL (snake_case) ke Domain Entities (camelCase).
 * Menjamin konversi tipe data yang akurat (Integer, Date ISO string, JSON).
 */

const { computeDocsStatus } = require('../../utils/docsStatus');

function toISODate(d) {
  if (!d) return null;
  if (typeof d === 'string') return d.slice(0, 10);
  if (d instanceof Date) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return String(d).slice(0, 10);
}

function toISOString(d) {
  if (!d) return null;
  if (typeof d === 'string') return d;
  if (d instanceof Date) return d.toISOString();
  return new Date(d).toISOString();
}

function mapUser(row, documents = {}, documentPaths = {}) {
  if (!row) return null;
  const docs = documents || { ktp: 'not_uploaded', sim: 'not_uploaded' };
  const overallDocsStatus = computeDocsStatus(docs);

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    address: row.address || '',
    role: row.role || 'customer',
    passwordHash: row.password_hash,
    emergencyContact: {
      name: row.emergency_contact_name || '',
      phone: row.emergency_contact_phone || '',
    },
    preferences: { emailNotif: true, whatsappNotif: true, promo: false },
    isActive: row.is_active !== false,
    documents: docs,
    docsStatus: overallDocsStatus,
    documentPaths: documentPaths || {},
    createdAt: toISOString(row.created_at),
    updatedAt: toISOString(row.updated_at),
  };
}

function mapDocument(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    storedName: row.stored_name,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes),
    filePath: row.stored_name ? `uploads/${row.stored_name}` : null,
    status: row.status,
    reviewerNote: row.reviewer_note || null,
    uploadedAt: toISOString(row.uploaded_at),
    verifiedAt: toISOString(row.verified_at),
  };
}

function mapMotorcycle(row) {
  if (!row) return null;
  const images = Array.isArray(row.images)
    ? row.images
    : (typeof row.images === 'string' ? JSON.parse(row.images) : []);
  const features = Array.isArray(row.features)
    ? row.features
    : (typeof row.features === 'string' ? JSON.parse(row.features) : []);

  const ratingAvg = Number(row.rating_avg || 0);
  const ratingCount = Number(row.rating_count || 0);

  // Status mapping: active di DB -> available di domain layer untuk kompatibilitas frontend
  const domainStatus = row.status === 'active' ? 'available' : row.status;

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    brand: row.brand,
    type: row.type,
    cc: Number(row.cc),
    year: Number(row.year),
    color: row.color,
    transmission: row.transmission,
    fuelCapacity: Number(row.fuel_capacity),
    pricePerDay: Number(row.price_per_day),
    deposit: Number(row.deposit),
    description: row.description || '',
    odometer: Number(row.odometer_km || 0),
    odometerKm: Number(row.odometer_km || 0),
    plate: row.plate_number,
    plateNumber: row.plate_number,
    status: domainStatus,
    popularity: Number(row.rental_count ? row.rental_count * 10 + 50 : 80),
    rating: ratingAvg || 5.0,
    ratingAvg,
    ratingCount,
    reviewCount: ratingCount,
    ratingDistribution: {
      1: Number(row.rating_1 || 0),
      2: Number(row.rating_2 || 0),
      3: Number(row.rating_3 || 0),
      4: Number(row.rating_4 || 0),
      5: Number(row.rating_5 || 0),
    },
    rentalCount: Number(row.rental_count || 0),
    features,
    images,
    primaryImage: row.primary_image || images[0] || null,
    createdAt: toISOString(row.created_at),
    updatedAt: toISOString(row.updated_at),
  };
}

function computeMaintenanceStatus(startDate, endDate, completedAt, explicitStatus = null) {
  if (completedAt || explicitStatus === 'completed') {
    return 'completed'; // Selesai
  }
  const clock = require('../../utils/clock');
  const todayWIB = toISODate(clock.now());
  const start = toISODate(startDate);
  const end = toISODate(endDate);

  if (todayWIB < start) {
    return 'scheduled'; // Terjadwal (belum mulai)
  }
  if (todayWIB >= start && todayWIB <= end) {
    return 'in_progress'; // Sedang berlangsung (hari ini di dalam rentang)
  }
  return 'completed'; // Selesai (rentang berakhir)
}

function mapMaintenanceBlock(row) {
  if (!row) return null;
  const computedStatus = computeMaintenanceStatus(row.start_date, row.end_date, row.completed_at, row.status);
  return {
    id: row.id,
    motorId: row.motorcycle_id,
    motorcycleId: row.motorcycle_id,
    motorName: row.motor_name || row.motorcycle_name || '',
    motorPlate: row.motor_plate || row.plate_number || '',
    reason: row.reason,
    startDate: toISODate(row.start_date),
    endDate: toISODate(row.end_date),
    cost: Number(row.cost || 0),
    technician: row.technician || 'Bengkel Rekanan',
    status: computedStatus,
    completedAt: toISOString(row.completed_at),
    completedBy: row.completed_by || null,
    completionNotes: row.completion_notes || null,
    createdBy: row.created_by || null,
    createdAt: toISOString(row.created_at),
    updatedAt: toISOString(row.updated_at || row.created_at),
  };
}

function mapBooking(row, items = [], timeline = []) {
  if (!row) return null;

  const totalDays = Number(row.total_days);
  const pricePerDay = Number(row.price_per_day);
  const subtotal = Number(row.subtotal);
  const durationDiscount = Number(row.duration_discount || 0);
  const promoDiscount = Number(row.promo_discount || 0);
  const addOnsTotal = Number(row.addons_total || 0);
  const addonsTotal = addOnsTotal;
  const deliveryTotal = Number(row.delivery_total || 0);
  const rentalTotal = Number(row.rental_total);
  const deposit = Number(row.deposit || 0);
  const grandTotal = Number(row.grand_total);
  const refundAmount = Number(row.refund_amount || 0);

  const deliveryPickup = Boolean(row.delivery_pickup);
  const deliveryDropoff = Boolean(row.delivery_dropoff);
  const isDelivery = deliveryPickup || deliveryDropoff;

  // Persiapkan lineItems jika belum dioper
  const lineItems = items && items.length > 0 ? items : [
    {
      id: 'rental',
      type: 'rental',
      name: `Sewa Motor (${totalDays} hari)`,
      unitPrice: pricePerDay,
      quantity: totalDays,
      amount: subtotal,
    },
    ...(deposit > 0 ? [{
      id: 'deposit',
      type: 'deposit',
      name: 'Deposit Jaminan',
      amount: deposit,
    }] : []),
  ];

  const handover = (row.handover_odometer_start !== undefined && row.handover_odometer_start !== null) ? {
    id: row.id,
    bookingId: row.id,
    odometerStart: row.handover_odometer_start,
    startOdometer: row.handover_odometer_start,
    fuelStart: row.handover_fuel_start,
    initialFuel: row.handover_fuel_start,
    notes: row.handover_notes || '',
    conditionNotes: row.handover_notes || '',
    documentsChecked: Boolean(row.handover_documents_checked),
    originalDocsChecked: Boolean(row.handover_documents_checked),
    depositReceived: Boolean(row.handover_deposit_received),
    handedOverAt: toISOString(row.handover_handed_over_at),
    handedAt: toISOString(row.handover_handed_over_at),
    handedOverBy: row.handover_handed_over_by,
    handedBy: row.handover_handed_by_name || 'Staf',
  } : null;

  const returnInfo = (row.return_returned_at !== undefined && row.return_returned_at !== null) ? {
    id: row.id,
    bookingId: row.id,
    returnedAt: toISOString(row.return_returned_at),
    actualReturn: toISOString(row.return_returned_at),
    odometerEnd: Number(row.return_odometer_end || 0),
    endOdometer: Number(row.return_odometer_end || 0),
    fuelEnd: row.return_fuel_end,
    finalFuel: row.return_fuel_end,
    notes: row.return_notes || '',
    lateMinutes: Number(row.return_late_minutes || 0),
    lateHours: Math.ceil(Number(row.return_late_minutes || 0) / 60),
    lateFee: Number(row.return_late_fee || 0),
    damageFee: Number(row.return_damage_fee || 0),
    otherFee: Number(row.return_other_fee || 0),
    totalDeduction: Number(row.return_late_fee || 0) + Number(row.return_damage_fee || 0) + Number(row.return_other_fee || 0),
    depositSnapshot: Number(row.return_deposit_snapshot || deposit || 200000),
    deposit: Number(row.return_deposit_snapshot || deposit || 200000),
    depositRefund: Number(row.return_deposit_refund || 0),
    amountDue: Number(row.return_amount_due || 0),
    depositRefundedAt: toISOString(row.return_deposit_refunded_at),
    depositRefundedBy: row.return_deposit_refunded_by,
    receivedBy: row.return_received_by_name || 'Staf',
    receivedById: row.return_received_by,
  } : null;

  const paymentStatus = row.payment_status || (row.paid_at ? 'paid' : (['confirmed', 'active', 'completed'].includes(row.status) ? 'paid' : (row.status === 'cancelled' && refundAmount > 0 ? 'refunded' : 'pending')));
  const paymentMethod = row.payment_method || (row.paid_at ? 'cash' : 'bank_transfer');

  return {
    id: row.id,
    version: Number(row.version || 1),
    code: row.booking_code,
    bookingCode: row.booking_code,
    userId: row.user_id,
    cancelledBy: row.cancelled_by || null,
    motorId: row.motorcycle_id,
    motorcycleId: row.motorcycle_id,
    startDate: toISODate(row.start_date),
    endDate: toISODate(row.end_date),
    pickupTime: row.pickup_time ? String(row.pickup_time).slice(0, 5) : '09:00',
    days: totalDays,
    totalDays,
    pricePerDay,
    subtotal,
    discount: promoDiscount,
    durationDiscount,
    promoDiscount,
    promoCodeId: row.promo_code_id || null,
    promoCode: row.promo_code || null,
    weekendSurcharge: 0,
    deliveryFee: deliveryTotal,
    deliveryTotal,
    addOnsTotal,
    rentalTotal,
    deposit,
    total: grandTotal,
    grandTotal,
    status: row.status,
    paymentStatus,
    paymentMethod,
    pickup: isDelivery ? 'delivery' : 'store',
    pickupLocationId: row.pickup_location_id || null,
    pickupLocationText: row.pickup_location_text || '',
    delivery: {
      pickup: deliveryPickup,
      dropoff: deliveryDropoff,
    },
    addons: [],
    renterSnapshot: row.renter_snapshot || null,
    renter: {
      name: row.renter_snapshot?.fullNameKtp || row.renter_name,
      phone: row.renter_snapshot?.phone || row.renter_phone,
      email: row.renter_email,
      emergencyContact: row.renter_snapshot?.emergencyContact || {
        name: row.emergency_contact_name || '',
        relation: '',
        phone: row.emergency_contact_phone || '',
      },
      notes: row.notes || '',
    },
    emergencyContact: row.renter_snapshot?.emergencyContact || (row.emergency_contact_name ? {
      name: row.emergency_contact_name,
      relation: '',
      phone: row.emergency_contact_phone || '',
    } : null),
    notes: row.notes || '',
    pricing: {
      lineItems,
      subtotal,
      durationDiscount,
      promoDiscount,
      addonsTotal,
      deliveryTotal,
      rentalTotal,
      deposit,
      total: grandTotal,
    },
    timeline: timeline || [],
    items: lineItems,
    paidAt: toISOString(row.paid_at),
    completedAt: row.status === 'completed' ? toISOString(row.updated_at) : null,
    cancelledAt: toISOString(row.cancelled_at),
    cancelReason: row.cancel_reason || null,
    cancellationReason: row.cancel_reason || null,
    refundAmount,
    refundPercentage: rentalTotal > 0 ? Math.round((refundAmount / rentalTotal) * 100) : 0,
    cancellationFee: Math.max(0, rentalTotal - refundAmount),
    expiresAt: toISOString(row.expires_at),
    handover,
    returnInfo,
    startOdometer: handover?.startOdometer || null,
    initialFuel: handover?.initialFuel || null,
    handedAt: handover?.handedAt || null,
    endOdometer: returnInfo?.endOdometer || null,
    finalFuel: returnInfo?.finalFuel || null,
    actualReturnDate: returnInfo?.returnedAt || null,
    lateFee: returnInfo?.lateFee || 0,
    damageFee: returnInfo?.damageFee || 0,
    otherFee: returnInfo?.otherFee || 0,
    depositRefund: returnInfo?.depositRefund || 0,
    amountDue: returnInfo?.amountDue || 0,
    depositReturned: Boolean(returnInfo?.depositRefundedAt),
    depositRefundStatus: returnInfo?.depositRefundedAt ? 'refunded' : 'pending',
    policySnapshot: row.policy_snapshot || null,
    pricingSnapshot: row.pricing_snapshot || null,
    termsVersion: row.terms_version ?? null,
    createdAt: toISOString(row.created_at),
    updatedAt: toISOString(row.updated_at),
  };
}

function mapPayment(row) {
  if (!row) return null;
  const inst = typeof row.instructions === 'object' && row.instructions ? row.instructions : {};
  return {
    id: row.id,
    bookingId: row.booking_id,
    amount: Number(row.amount),
    deposit: Number(inst.deposit || 0),
    method: row.method,
    status: row.status,
    provider: row.provider,
    gatewayRef: row.gateway_ref || null,
    transactionId: row.gateway_ref || null,
    instructions: inst,
    paymentDetails: inst,
    paidAt: toISOString(row.paid_at),
    proofPath: row.proof_path || null,
    proofUploadedAt: toISOString(row.proof_uploaded_at),
    proofVerifiedAt: toISOString(row.proof_verified_at),
    proofVerifiedBy: row.proof_verified_by || null,
    proofRejectionReason: row.proof_rejection_reason || null,
    createdAt: toISOString(row.created_at),
    updatedAt: toISOString(row.updated_at),
  };
}

function mapReview(row) {
  if (!row) return null;
  return {
    id: row.id,
    bookingId: row.booking_id || null,
    motorId: row.motorcycle_id,
    motorcycleId: row.motorcycle_id,
    motorcycleName: row.motorcycle_name || 'Motor',
    motorName: row.motorcycle_name || 'Motor',
    userId: row.user_id,
    userName: row.user_name || 'Pelanggan RodaKita',
    userAvatar: null,
    rating: Number(row.rating),
    comment: row.comment,
    date: toISODate(row.created_at),
    status: row.is_hidden ? 'hidden' : 'published',
    isVisible: !Boolean(row.is_hidden),
    isHidden: Boolean(row.is_hidden),
    hiddenBy: row.hidden_by,
    hiddenAt: toISOString(row.hidden_at),
    hiddenReason: row.hidden_reason || null,
    moderatedAt: toISOString(row.hidden_at),
    createdAt: toISOString(row.created_at),
  };
}

function mapPromo(row) {
  if (!row) return null;
  const usageLimit = row.usage_limit !== null ? Number(row.usage_limit) : null;
  const usedCount = Number(row.used_count || 0);
  const quota = usageLimit !== null ? Math.max(0, usageLimit - usedCount) : 999;

  return {
    id: row.id,
    code: row.code,
    type: row.type,
    value: Number(row.value),
    maxDiscount: row.max_discount ? Number(row.max_discount) : null,
    minDays: Number(row.min_days || 1),
    minSubtotal: 0,
    weekendOnly: Boolean(row.weekend_only),
    requiresWeekend: Boolean(row.weekend_only),
    validFrom: toISODate(row.valid_from),
    validUntil: toISODate(row.valid_until),
    usageLimit,
    usedCount,
    quota,
    description: `Diskon ${row.type === 'percent' ? `${row.value}%` : `Rp ${row.value.toLocaleString('id-ID')}`}`,
    isActive: Boolean(row.is_active),
    createdAt: toISOString(row.created_at),
    updatedAt: toISOString(row.updated_at),
  };
}

function mapFavorite(row) {
  if (!row) return null;
  return {
    userId: row.user_id,
    motorId: row.motorcycle_id,
    motorcycleId: row.motorcycle_id,
    createdAt: toISOString(row.created_at),
  };
}

function mapContact(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: '',
    subject: row.subject || '',
    message: row.message,
    ip: row.ip || null,
    read: Boolean(row.is_read),
    isRead: Boolean(row.is_read),
    readAt: toISOString(row.read_at),
    readBy: row.read_by,
    repliedAt: toISOString(row.replied_at),
    repliedBy: row.replied_by,
    replyMessage: row.reply_message || null,
    replyNote: row.reply_message || null,
    createdAt: toISOString(row.created_at),
  };
}

function mapPickupLocation(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    isActive: Boolean(row.is_active),
    sortOrder: Number(row.sort_order || 0),
    createdAt: toISOString(row.created_at || new Date()),
    updatedAt: toISOString(row.updated_at || new Date()),
  };
}

function mapAddon(row) {
  if (!row) return null;
  const price = Number(row.price_per_day);
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    price,
    pricePerDay: price,
    description: '',
    isActive: Boolean(row.is_active),
    createdAt: toISOString(row.created_at || new Date()),
    updatedAt: toISOString(row.updated_at || new Date()),
  };
}

function mapHandover(row) {
  if (!row) return null;
  return {
    id: row.booking_id,
    bookingId: row.booking_id,
    odometerStart: row.odometer_start,
    startOdometer: row.odometer_start,
    fuelStart: row.fuel_start,
    initialFuel: row.fuel_start,
    notes: row.notes || '',
    conditionNotes: row.notes || '',
    documentsChecked: Boolean(row.documents_checked),
    originalDocsChecked: Boolean(row.documents_checked),
    depositReceived: Boolean(row.deposit_received),
    handedOverAt: toISOString(row.handed_over_at),
    handedAt: toISOString(row.handed_over_at),
    handedOverBy: row.handed_over_by,
    handedBy: row.handed_by_name || (row.handed_over_by ? String(row.handed_over_by) : 'Staf'),
    createdAt: toISOString(row.handed_over_at),
  };
}

function mapReturn(row) {
  if (!row) return null;
  const lateMinutes = Number(row.late_minutes || 0);
  const lateFee = Number(row.late_fee || 0);
  const damageFee = Number(row.damage_fee || 0);
  const otherFee = Number(row.other_fee || 0);
  const depositSnapshot = Number(row.deposit_snapshot || 200000);
  const depositRefund = Number(row.deposit_refund || 0);
  const amountDue = Number(row.amount_due || 0);

  return {
    id: row.booking_id,
    bookingId: row.booking_id,
    returnedAt: toISOString(row.returned_at),
    actualReturn: toISOString(row.returned_at),
    odometerEnd: Number(row.odometer_end || 0),
    endOdometer: Number(row.odometer_end || 0),
    fuelEnd: row.fuel_end,
    finalFuel: row.fuel_end,
    notes: row.notes || '',
    lateMinutes,
    lateHours: Math.ceil(lateMinutes / 60),
    lateFee,
    damageFee,
    otherFee,
    totalDeduction: lateFee + damageFee + otherFee,
    depositSnapshot,
    deposit: depositSnapshot,
    depositRefund,
    amountDue,
    depositRefundedAt: toISOString(row.deposit_refunded_at),
    depositRefundedBy: row.deposit_refunded_by,
    receivedBy: row.received_by_name || (row.received_by ? String(row.received_by) : 'Staf'),
    receivedById: row.received_by,
    createdAt: toISOString(row.returned_at),
  };
}

function mapBookingNote(row) {
  if (!row) return null;
  return {
    id: row.id,
    bookingId: row.booking_id,
    authorId: row.author_id,
    authorName: row.author_name || (row.author_id ? String(row.author_id) : 'Staf'),
    authorRole: row.author_role || 'staff',
    note: row.note,
    createdAt: toISOString(row.created_at),
  };
}

function mapAuditLog(row) {
  if (!row) return null;
  return {
    id: row.id,
    actorId: row.actor_id,
    actorName: row.actor_name || (row.actor_id ? `User #${row.actor_id}` : 'Sistem'),
    actorRole: row.actor_role,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    before: row.before,
    after: row.after,
    ip: row.ip,
    userAgent: row.user_agent,
    details: row.action,
    at: toISOString(row.at),
    timestamp: toISOString(row.at),
  };
}

function mapRenterProfile(row) {
  if (!row) return null;
  return {
    userId: row.user_id,
    fullNameKtp: row.full_name_ktp,
    birthDate: toISODate(row.birth_date),
    nikHash: row.nik_hash,
    nikLast4: row.nik_last4,
    addressKtp: row.address_ktp,
    phoneE164: row.phone_e164,
    stayAddress: row.stay_address,
    emergencyName: row.emergency_name,
    emergencyRelation: row.emergency_relation,
    emergencyPhone: row.emergency_phone,
    emergencyContact: {
      name: row.emergency_name,
      relation: row.emergency_relation,
      phone: row.emergency_phone,
    },
    termsVersionAccepted: row.terms_version_accepted,
    privacyVersionAccepted: row.privacy_version_accepted,
    gpsConsentAt: toISOString(row.gps_consent_at),
    completedAt: toISOString(row.completed_at),
    createdAt: toISOString(row.created_at),
    updatedAt: toISOString(row.updated_at),
  };
}

module.exports = {
  toISODate,
  toISOString,
  computeDocsStatus,
  mapUser,
  mapDocument,
  mapMotorcycle,
  mapMotor: mapMotorcycle,
  mapMaintenanceBlock,
  mapServiceBlock: mapMaintenanceBlock,
  mapBooking,
  mapPayment,
  mapReview,
  mapPromo,
  mapFavorite,
  mapContact,
  mapPickupLocation,
  mapAddon,
  mapHandover,
  mapReturn,
  mapBookingNote,
  mapAuditLog,
  mapRenterProfile,
};

