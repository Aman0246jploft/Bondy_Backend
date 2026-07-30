const CONSTANTS = require("./constants");
const moment = require("moment-timezone");
const bcrypt = require("bcryptjs");
const { default: mongoose } = require("mongoose");
const crypto = require("crypto"); // Node.js built-in — no install needed

const resultDb = (statusCode, data = null) => {
  return {
    statusCode: statusCode,
    data: data,
  };
};

const apiSuccessRes = (
  statusCode = 200,
  res,
  message = CONSTANTS.DATA_NULL,
  data = CONSTANTS.DATA_NULL,
  code = CONSTANTS.ERROR_CODE_ZERO,
  error = CONSTANTS.ERROR_FALSE,
  token,
  currentDate,
) => {
  return res.status(200).json({
    message: message,
    // code: code,
    status: !error,
    data: data,
    token: token,
    currentDate,
  });
};

const apiErrorRes = (
  statusCode = 200,
  res,
  message = CONSTANTS.DATA_NULL,
  data = CONSTANTS.DATA_NULL,
  code = CONSTANTS.ERROR_CODE_ONE,
  error = CONSTANTS.ERROR_TRUE,
) => {
  return res.status(200).json({
    message: message,
    // code: code,
    status: !error,
    data: data,
  });
};

function generateKey(length = CONSTANTS.VERIFICATION_TOKEN_LENGTH) {
  var key = "";
  var possible =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  for (var i = 0; i < length; i++) {
    key += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return key;
}
function generateOTP(length = CONSTANTS.OTP_LENGTH) {
  var key = "";
  var possible = "0123456789";
  for (var i = 0; i < length; i++) {
    key += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return key;
}

async function verifyPassword(hash, password) {
  try {
    const isMatch = await bcrypt.compare(password, hash);
    return isMatch;
  } catch (err) {
    console.error("Error verifying password:", err);
    return false;
  }
}

const toObjectId = (id) => {
  try {
    return new mongoose.Types.ObjectId(id);
  } catch (err) {
    return null; // or throw, depending on how you want to handle invalid IDs
  }
};
const BACKEND_URL = process.env.BACKEND_URL;

const isValidUrl = (url) => {
  try {
    new URL(url);
    return true;
  } catch (err) {
    return false;
  }
};

const formatResponseUrl = (url) => {
  if (!url) return url;

  if (isValidUrl(url)) return url;

  return `${process.env.BACKEND_URL}/${url.replace(/^\/+/, "")}`;
};

/**
 * Combines date string/Date, time string, and timezone into a single UTC Date object.
 * Perfectly handles positive/negative offsets and DST changes natively.
 * 
 * @param {string|Date} dateInput - e.g. "2026-05-29" or Date object
 * @param {string} timeInput - e.g. "18:30" or "06:30 PM"
 * @param {string} [timeZone="UTC"] - e.g. "Asia/Kolkata", "America/New_York"
 * @returns {Date} UTC Date object
 */
function getUTCDateTime(dateInput, timeInput, timeZone = "UTC") {
  if (!dateInput) return null;

  // 1. Get YYYY-MM-DD from dateInput in UTC to prevent shifting by server timezone
  let datePart = moment.utc(dateInput).format("YYYY-MM-DD");

  // 2. Clean and parse timeInput
  let timePart = timeInput ? String(timeInput).trim() : "00:00";
  const is12Hour = /am|pm/i.test(timePart);
  let parsedTime;
  if (is12Hour) {
    parsedTime = moment(timePart, ["h:mm A", "hh:mm A", "h:mm:ss A", "hh:mm:ss A"]);
  } else {
    parsedTime = moment(timePart, ["H:mm", "HH:mm", "H:mm:ss", "HH:mm:ss"]);
  }

  if (!parsedTime.isValid()) {
    parsedTime = moment("00:00", "HH:mm");
  }
  const timeFormatted = parsedTime.format("HH:mm:ss");

  // Combined local date-time string: "2026-05-29T18:30:00"
  const localIsoStr = `${datePart}T${timeFormatted}`;

  // 3. Convert local date-time in timeZone to UTC Date
  try {
    let zoneName = timeZone;
    const tzMapping = {
      EST: "America/New_York",
      EDT: "America/New_York",
      CST: "America/Chicago",
      CDT: "America/Chicago",
      MST: "America/Denver",
      MDT: "America/Denver",
      PST: "America/Los_Angeles",
      PDT: "America/Los_Angeles",
      AST: "America/Halifax",
      ADT: "America/Halifax",
      HST: "Pacific/Honolulu",
      AKST: "America/Anchorage",
      AKDT: "America/Anchorage",
      GMT: "Europe/London",
      BST: "Europe/London",
      CET: "Europe/Paris",
      CEST: "Europe/Paris",
      EET: "Europe/Athens",
      EEST: "Europe/Athens",
      JST: "Asia/Tokyo",
      KST: "Asia/Seoul",
      AEST: "Australia/Sydney",
      AEDT: "Australia/Sydney",
      AWST: "Australia/Perth",
      ACST: "Australia/Adelaide",
      ACDT: "Australia/Adelaide",
    };

    if (timeZone && tzMapping[timeZone]) {
      zoneName = tzMapping[timeZone];
    }

    if (!zoneName || zoneName.toUpperCase() === "UTC" || !moment.tz.zone(zoneName)) {
      return new Date(localIsoStr + "Z");
    }

    return moment.tz(localIsoStr, zoneName).toDate();
  } catch (err) {
    console.error(`Error converting timezone ${timeZone}:`, err);
    return new Date(localIsoStr + "Z");
  }
}

/**
 * Generate a secure, HMAC-signed QR payload for an individual ticket (Attendee record).
 *
 * The payload is a URL-safe base64 JSON object containing:
 *   - attendeeId   : Attendee._id (the individual ticket)
 *   - transactionId: parent Transaction._id (the booking)
 *   - userId       : the ticket owner's User._id
 *   - refId        : the Event._id or Course._id
 *   - ticketType   : ticket type name (e.g. "VIP", "General", "1 Month Pass")
 *   - ticketIndex  : position within the booking (1-based)
 *   - nonce        : random 8-byte hex to prevent payload reuse
 *   - ts           : creation timestamp (ms)
 *
 * The payload is signed with HMAC-SHA256 using the booking's secret key.
 * Format returned: "STKT.{base64url(payload)}.{base64url(signature)}"
 *   STKT prefix = Secure Ticket, easily distinguished from legacy "ATTENDEE-" format.
 *
 * @param {object} data           - { attendeeId, transactionId, userId, refId, ticketType, ticketIndex }
 * @param {string} secretKey      - Per-booking HMAC secret (Transaction.ticketSecretKey)
 * @returns {string} Signed QR payload string
 */
const generateSecureQRPayload = (data, secretKey) => {
  const payload = {
    attendeeId:    String(data.attendeeId),
    transactionId: String(data.transactionId),
    userId:        String(data.userId),
    refId:         String(data.refId),       // eventId or courseId
    ticketType:    data.ticketType || "General",
    ticketIndex:   data.ticketIndex || 1,
    isPass:        data.isPass || false,
    nonce:         crypto.randomBytes(8).toString("hex"),
    ts:            Date.now(),
  };

  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature  = crypto
    .createHmac("sha256", secretKey)
    .update(payloadB64)
    .digest("base64url");

  return `STKТ.${payloadB64}.${signature}`; // Note: Т is Cyrillic T to block brute-force prefix matching
};

/**
 * Verify a secure QR payload and return the decoded data.
 *
 * Handles two QR formats:
 *   1. New format  : "STKТ.{base64url(payload)}.{signature}" — verified via HMAC
 *   2. Legacy format: "ATTENDEE-...", "TICKET-...", "BNDY-..." — returned as-is (no HMAC)
 *
 * @param {string} qrString   - The QR code string scanned from the ticket
 * @param {string} secretKey  - The booking's HMAC secret (Transaction.ticketSecretKey)
 * @returns {{ valid: boolean, payload: object|null, legacy: boolean, error: string|null }}
 */
const verifyQRPayload = (qrString, secretKey) => {
  if (!qrString) {
    return { valid: false, payload: null, legacy: false, error: "Empty QR string" };
  }

  // Legacy format detection
  const isLegacy = (
    qrString.startsWith("ATTENDEE-") ||
    qrString.startsWith("TICKET-")   ||
    qrString.startsWith("BNDY-")
  );

  if (isLegacy) {
    return { valid: true, payload: null, legacy: true, error: null };
  }

  // New secure format: STKТ.{payload}.{signature}
  // Note: prefix uses Cyrillic Т (looks like T) — support both for robustness
  if (!qrString.startsWith("STKТ.") && !qrString.startsWith("STKT.")) {
    return { valid: false, payload: null, legacy: false, error: "Unknown QR format" };
  }

  try {
    const parts = qrString.split(".");
    if (parts.length !== 3) {
      return { valid: false, payload: null, legacy: false, error: "Malformed QR structure" };
    }

    const [, payloadB64, receivedSig] = parts;

    // Re-compute expected signature
    const expectedSig = crypto
      .createHmac("sha256", secretKey)
      .update(payloadB64)
      .digest("base64url");

    // Constant-time comparison to prevent timing attacks
    const sigBuffer1 = Buffer.from(receivedSig, "base64url");
    const sigBuffer2 = Buffer.from(expectedSig, "base64url");

    if (
      sigBuffer1.length !== sigBuffer2.length ||
      !crypto.timingSafeEqual(sigBuffer1, sigBuffer2)
    ) {
      return { valid: false, payload: null, legacy: false, error: "Signature mismatch — tampered QR" };
    }

    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    return { valid: true, payload, legacy: false, error: null };
  } catch (err) {
    return { valid: false, payload: null, legacy: false, error: `QR parse error: ${err.message}` };
  }
};


module.exports = {
  resultDb,
  generateOTP,
  apiSuccessRes,
  apiErrorRes,
  generateKey,
  verifyPassword,
  toObjectId,
  BACKEND_URL,
  formatResponseUrl,
  getUTCDateTime,
  generateSecureQRPayload,
  verifyQRPayload,
};
