const { pool } = require('../../../db/pool');
const { mapPayment } = require('./mappers');
const { handlePgError } = require('./errors');

const paymentRepo = {
  async findById(id, client = null) {
    const db = client || pool;
    try {
      const res = await db.query('SELECT * FROM payments WHERE id = $1', [Number(id)]);
      return res.rows.length > 0 ? mapPayment(res.rows[0]) : null;
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async findByBookingId(bookingId, client = null) {
    const db = client || pool;
    try {
      const res = await db.query(
        'SELECT * FROM payments WHERE booking_id = $1 ORDER BY id DESC LIMIT 1',
        [Number(bookingId)],
      );
      if (res.rows.length > 0) {
        return mapPayment(res.rows[0]);
      }

      // Fallback: periksa tabel bookings
      const bookingRes = await db.query(
        'SELECT id, booking_code, grand_total, status, created_at, paid_at FROM bookings WHERE id = $1',
        [Number(bookingId)],
      );
      if (bookingRes.rows.length === 0) return null;
      const b = bookingRes.rows[0];
      const isPaid = ['confirmed', 'active', 'completed'].includes(b.status);
      const isCancelled = b.status === 'cancelled';

      return {
        id: null,
        bookingId: b.id,
        code: b.booking_code,
        method: b.payment_method || 'bank_transfer',
        amount: Number(b.grand_total),
        deposit: 0,
        status: isPaid ? 'paid' : (isCancelled ? 'cancelled' : 'pending'),
        provider: 'simulation',
        transactionId: null,
        gatewayRef: null,
        paymentDetails: {},
        paidAt: b.paid_at ? new Date(b.paid_at).toISOString() : null,
        createdAt: new Date(b.created_at).toISOString(),
      };
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async create(paymentData, client = null) {
    const db = client || pool;
    try {
      const {
        bookingId,
        amount,
        deposit = 0,
        method = 'bank_transfer',
        status = 'pending',
        provider = 'simulation',
        transactionId = null,
        gatewayRef = null,
        instructions = {},
        paymentDetails = {},
        paidAt = null,
      } = paymentData;

      const allowedMethods = ['bank_transfer', 'ewallet', 'qris', 'cash'];
      const finalMethod = method === 'transfer' ? 'bank_transfer' : (allowedMethods.includes(method) ? method : 'bank_transfer');
      const finalProvider = ['simulation', 'midtrans'].includes(provider) ? provider : 'simulation';
      const finalStatus = status === 'unpaid' ? 'pending' : status;
      const finalGatewayRef = gatewayRef || transactionId || null;
      const finalInstructions = {
        ...(instructions || {}),
        ...(paymentDetails || {}),
        deposit: Number(deposit || 0),
      };

      const res = await db.query(
        `INSERT INTO payments (
           booking_id, amount, method, provider, status, gateway_ref, instructions, paid_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          Number(bookingId),
          Number(amount),
          finalMethod,
          finalProvider,
          finalStatus,
          finalGatewayRef,
          JSON.stringify(finalInstructions),
          paidAt,
        ],
      );
      return mapPayment(res.rows[0]);
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async update(id, patch, client = null) {
    const db = client || pool;
    try {
      const setClauses = [];
      const params = [Number(id)];

      if (patch.status !== undefined) {
        const finalStatus = patch.status === 'unpaid' ? 'pending' : patch.status;
        params.push(finalStatus);
        setClauses.push(`status = $${params.length}`);
      }
      if (patch.gatewayRef !== undefined || patch.transactionId !== undefined) {
        params.push(patch.gatewayRef || patch.transactionId || null);
        setClauses.push(`gateway_ref = $${params.length}`);
      }
      if (patch.instructions !== undefined || patch.paymentDetails !== undefined) {
        params.push(JSON.stringify(patch.instructions || patch.paymentDetails || {}));
        setClauses.push(`instructions = $${params.length}`);
      }
      if (patch.paidAt !== undefined) {
        params.push(patch.paidAt);
        setClauses.push(`paid_at = $${params.length}`);
      }
      if (patch.proofPath !== undefined) {
        params.push(patch.proofPath);
        setClauses.push(`proof_path = $${params.length}`);
      }
      if (patch.proofUploadedAt !== undefined) {
        params.push(patch.proofUploadedAt);
        setClauses.push(`proof_uploaded_at = $${params.length}`);
      }
      if (patch.proofVerifiedAt !== undefined) {
        params.push(patch.proofVerifiedAt);
        setClauses.push(`proof_verified_at = $${params.length}`);
      }
      if (patch.proofVerifiedBy !== undefined) {
        params.push(patch.proofVerifiedBy);
        setClauses.push(`proof_verified_by = $${params.length}`);
      }
      if (patch.proofRejectionReason !== undefined) {
        params.push(patch.proofRejectionReason);
        setClauses.push(`proof_rejection_reason = $${params.length}`);
      }

      if (setClauses.length === 0) {
        return this.findById(id, db);
      }

      const res = await db.query(
        `UPDATE payments SET ${setClauses.join(', ')} WHERE id = $1 RETURNING *`,
        params,
      );
      return res.rows.length > 0 ? mapPayment(res.rows[0]) : null;
    } catch (err) {
      throw handlePgError(err);
    }
  },
};

module.exports = paymentRepo;
