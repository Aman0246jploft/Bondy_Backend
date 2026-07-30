/**
 * legacyTicket.js
 *
 * Backward-compatibility helper for bookings that pre-date the individual
 * ticket system (i.e., Transactions that have no ticketSecretKey).
 *
 * Used ONLY as a last-resort fallback when:
 *   - A PAID transaction has no associated Attendee records
 *   - The transaction also has no ticketSecretKey (very old booking)
 *
 * New bookings always go through createTicketsForBooking() in controllerBooking.js
 * which uses the secure HMAC-signed QR format.
 */

const { Attendee } = require("../db");

/**
 * Generate a legacy QR data string (old format, no HMAC signing).
 * @param {string} ticketNumber
 * @param {string} attendeeId
 * @returns {string}
 */
const generateLegacyQRData = (ticketNumber, attendeeId) =>
  `ATTENDEE-${ticketNumber}-${attendeeId}-${Date.now()}`;

/**
 * Generate a legacy ticket number.
 * @param {string|ObjectId} entityId
 * @param {number} index
 * @returns {string}
 */
const generateLegacyTicketNumber = (entityId, index) => {
  const ts = Date.now().toString().slice(-6);
  const prefix = entityId.toString().slice(-4).toUpperCase();
  return `TKT-${prefix}-${ts}-${index}`;
};

/**
 * Ensure individual Attendee records exist for a PAID transaction.
 * Uses the legacy non-HMAC QR format.
 *
 * This is intentionally kept simple — it is a backward-compat stub only.
 * It should NOT be used for new bookings.
 *
 * @param {Transaction} transaction  - Mongoose Transaction document (populated userId, eventId/courseId)
 * @returns {Promise<Attendee[]>}
 */
const ensureAttendeesExist = async (transaction) => {
  const currentAttendees = await Attendee.find({ transactionId: transaction._id });
  if (currentAttendees.length > 0) {
    return currentAttendees;
  }

  const isEvent = transaction.bookingType === "EVENT" || !transaction.bookingType;
  const refId = isEvent
    ? (transaction.eventId?._id || transaction.eventId)
    : (transaction.courseId?._id || transaction.courseId);

  // Build flat ticket list
  const ticketQueue = [];
  if (transaction.tickets && transaction.tickets.length > 0) {
    for (const t of transaction.tickets) {
      for (let j = 0; j < t.qty; j++) {
        ticketQueue.push({ ticketId: t.ticketId, ticketName: t.ticketName });
      }
    }
  } else {
    for (let j = 0; j < transaction.qty; j++) {
      ticketQueue.push({ ticketId: transaction.ticketId, ticketName: transaction.ticketName });
    }
  }

  const userId = transaction.userId?._id || transaction.userId;
  const firstName = transaction.userId?.firstName || "Guest";
  const lastName  = transaction.userId?.lastName  || "";
  const email     = transaction.userId?.email     || "guest@example.com";

  const attendeeDocs = [];
  for (let i = 0; i < transaction.qty; i++) {
    const ticketInfo = ticketQueue[i] || { ticketId: transaction.ticketId, ticketName: transaction.ticketName };
    attendeeDocs.push({
      transactionId: transaction._id,
      eventId:  isEvent ? refId : null,
      courseId: !isEvent ? refId : null,
      batchId:  transaction.batchId || null,
      userId,
      firstName,
      lastName,
      email,
      ticketNumber: generateLegacyTicketNumber(refId, i + 1),
      qrCodeData:   "",   // set after insertion
      ticketId:     ticketInfo.ticketId,
      ticketName:   ticketInfo.ticketName,
      status:       "ACTIVE",
      ticketIndex:  i + 1,
      isPass:       !!transaction.passType && i === 0,
      isCheckedIn:  false,
      checkInHistory: [],
      scanHistory:    [],
    });
  }

  const created = await Attendee.insertMany(attendeeDocs);
  for (const doc of created) {
    doc.qrCodeData = generateLegacyQRData(doc.ticketNumber, doc._id);
    await doc.save();
  }
  return created;
};

module.exports = { ensureAttendeesExist };
