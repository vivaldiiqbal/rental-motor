const { bookingRepo } = require('../repositories');

/**
 * Resolves a booking by either its numeric database ID or its unique booking code.
 * Works seamlessly across both PostgreSQL and in-memory repository drivers.
 *
 * @param {string|number} identifier - Numeric ID (e.g. 1036 or "1036") or booking code (e.g. "RM-261023-9ZN4")
 * @param {object|null} tx - Optional transaction context with bound repository
 * @returns {Promise<object|null>} The booking object or null if not found
 */
async function resolveBooking(identifier, tx = null) {
  if (identifier === null || identifier === undefined) return null;
  const repo = tx ? tx.bookingRepo : bookingRepo;
  if (!repo) return null;

  const str = String(identifier).trim();
  if (!str) return null;

  const numId = Number(str);
  let booking = null;

  // 1. If it looks like a clean positive integer, try finding by numeric ID first
  if (!isNaN(numId) && numId > 0 && String(numId) === str) {
    booking = await repo.findById(numId);
  }

  // 2. If not found or if not a pure integer string, try finding by booking code
  if (!booking) {
    booking = await repo.findByCode(str);
  }

  // 3. Fallback: if still not found and numId is valid number, try findById
  if (!booking && !isNaN(numId) && numId > 0) {
    booking = await repo.findById(numId);
  }

  return booking;
}

module.exports = { resolveBooking };
