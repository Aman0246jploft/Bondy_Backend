const fs = require("fs");
const path = require("path");
const QPayLog = require("../db/models/QPayLog");

const LOG_DIR = path.join(process.cwd(), "logs");
const MAIN_LOG_FILE = path.join(LOG_DIR, "qpay-payment.log");

// Ensure logs directory exists
if (!fs.existsSync(LOG_DIR)) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  } catch (err) {
    console.error("[qpayLogger] Failed to create log directory:", err.message);
  }
}

/**
 * Clean data for logging:
 * - Truncates huge base64 images so logs remain clean and readable
 * - Masks sensitive authorization credentials
 */
const sanitizeForLog = (obj) => {
  if (!obj || typeof obj !== "object") return obj;

  try {
    const cloned = JSON.parse(JSON.stringify(obj));

    const sanitizeRecursive = (target) => {
      if (!target || typeof target !== "object") return;

      for (const key of Object.keys(target)) {
        if (typeof target[key] === "string") {
          // Truncate Base64 QR code image
          if (target[key].startsWith("data:image/") || (key.toLowerCase().includes("qr_image") && target[key].length > 100)) {
            target[key] = `[BASE64_IMAGE_DATA (length: ${target[key].length} bytes)]`;
          }
          // Mask sensitive passwords/tokens
          if (["password", "client_secret", "authorization"].includes(key.toLowerCase())) {
            target[key] = "********";
          }
        } else if (typeof target[key] === "object" && target[key] !== null) {
          sanitizeRecursive(target[key]);
        }
      }
    };

    sanitizeRecursive(cloned);
    return cloned;
  } catch (e) {
    return obj;
  }
};

/**
 * Writes an event to the local log file in a clean, human-readable format
 */
const appendToFile = (entry) => {
  try {
    const timestamp = new Date().toISOString();
    const dateStr = timestamp.split("T")[0];
    const dailyLogFile = path.join(LOG_DIR, `qpay-${dateStr}.log`);

    const sanitizedReq = sanitizeForLog(entry.request);
    const sanitizedRes = sanitizeForLog(entry.response);
    const sanitizedErr = sanitizeForLog(entry.error);
    const sanitizedMeta = sanitizeForLog(entry.metadata);

    const divider = "═".repeat(85);
    const subDivider = "─".repeat(85);

    let logText = `\n${divider}\n`;
    logText += `[${timestamp}] EVENT: ${entry.eventType} | STATUS: ${entry.status || "INFO"}`;
    if (entry.durationMs !== undefined && entry.durationMs !== null) {
      logText += ` | DURATION: ${entry.durationMs}ms`;
    }
    logText += "\n";

    if (entry.bookingId || entry.invoiceId || entry.paymentId || entry.transactionId) {
      logText += `BOOKING_ID:     ${entry.bookingId || "N/A"}\n`;
      logText += `TRANSACTION_ID: ${entry.transactionId || "N/A"}\n`;
      logText += `QPAY_INVOICE:   ${entry.invoiceId || "N/A"}\n`;
      logText += `QPAY_PAYMENT:   ${entry.paymentId || "N/A"}\n`;
    }

    if (entry.ip) {
      logText += `CLIENT_IP:      ${entry.ip}\n`;
    }

    if (sanitizedReq) {
      logText += `${subDivider}\n[REQUEST]\n${JSON.stringify(sanitizedReq, null, 2)}\n`;
    }

    if (sanitizedRes) {
      logText += `${subDivider}\n[RESPONSE]\n${JSON.stringify(sanitizedRes, null, 2)}\n`;
    }

    if (sanitizedErr) {
      logText += `${subDivider}\n[ERROR]\n${JSON.stringify(sanitizedErr, null, 2)}\n`;
    }

    if (sanitizedMeta) {
      logText += `${subDivider}\n[METADATA]\n${JSON.stringify(sanitizedMeta, null, 2)}\n`;
    }

    logText += `${divider}\n`;

    // Append to main log file and daily rotating file
    fs.appendFileSync(MAIN_LOG_FILE, logText, "utf8");
    fs.appendFileSync(dailyLogFile, logText, "utf8");
  } catch (fileErr) {
    console.error("[qpayLogger] File Write Error:", fileErr.message);
  }
};

/**
 * Saves event to MongoDB QPayLog collection
 */
const saveToDb = async (entry) => {
  try {
    await QPayLog.create({
      eventType: entry.eventType,
      bookingId: entry.bookingId || null,
      transactionId: entry.transactionId || null,
      invoiceId: entry.invoiceId || null,
      paymentId: entry.paymentId || null,
      status: entry.status || "INFO",
      ip: entry.ip || null,
      request: sanitizeForLog(entry.request),
      response: sanitizeForLog(entry.response),
      error: entry.error ? sanitizeForLog(entry.error) : null,
      metadata: entry.metadata ? sanitizeForLog(entry.metadata) : null,
      durationMs: entry.durationMs || null,
    });
  } catch (dbErr) {
    // Non-fatal, do not throw
    console.warn("[qpayLogger] MongoDB Save Warning:", dbErr.message);
  }
};

/**
 * Core logging method
 * @param {Object} options
 * @param {String} options.eventType - TOKEN_AUTH, INVOICE_CREATE, PAYMENT_CHECK, CALLBACK_RECEIVED, CONFIRMATION_SUCCESS, PAYMENT_ERROR, AUTO_RECONCILE
 * @param {String} [options.bookingId] - e.g. BNDY-XXXX
 * @param {String} [options.transactionId] - MongoDB Transaction ID
 * @param {String} [options.invoiceId] - QPay invoice UUID
 * @param {String} [options.paymentId] - QPay payment ID
 * @param {String} [options.status] - SUCCESS, FAILED, PENDING, WARNING, INFO
 * @param {String} [options.ip] - IP address of request
 * @param {Object} [options.request] - Request details { method, url, payload, headers }
 * @param {Object} [options.response] - Response details { statusCode, body }
 * @param {Object|Error} [options.error] - Error object or details
 * @param {Object} [options.metadata] - Extra contextual information
 * @param {Number} [options.durationMs] - Execution duration in ms
 */
const logQPayEvent = (options = {}) => {
  // Format error if passed as native Error
  let formattedError = options.error;
  if (options.error instanceof Error) {
    formattedError = {
      message: options.error.message,
      stack: options.error.stack,
      qpayData: options.error.response?.data || null,
      qpayStatus: options.error.response?.status || null,
    };
  } else if (options.error && options.error.response) {
    formattedError = {
      message: options.error.message,
      qpayData: options.error.response.data,
      qpayStatus: options.error.response.status,
    };
  }

  const logPayload = {
    ...options,
    error: formattedError,
  };

  // 1. Console log (immediate visibility in dev terminal)
  const statusIcon = logPayload.status === "SUCCESS" ? "✅" : logPayload.status === "FAILED" ? "❌" : "ℹ️";
  console.log(`[QPay Audit] ${statusIcon} [${logPayload.eventType}] Booking: ${logPayload.bookingId || "N/A"} | Status: ${logPayload.status || "INFO"}`);

  // 2. Append to local log file
  appendToFile(logPayload);

  // 3. Save to MongoDB (async background)
  saveToDb(logPayload).catch(() => {});
};

/**
 * Retrieves recent logs from MongoDB
 */
const getRecentLogs = async ({ limit = 50, bookingId = null, invoiceId = null } = {}) => {
  const query = {};
  if (bookingId) query.bookingId = bookingId;
  if (invoiceId) query.invoiceId = invoiceId;

  return await QPayLog.find(query)
    .sort({ createdAt: -1 })
    .limit(Math.min(Number(limit) || 50, 200))
    .lean();
};

/**
 * Reads the last N lines of the main log file
 */
const readRawLogFile = (maxLines = 200) => {
  if (!fs.existsSync(MAIN_LOG_FILE)) {
    return "No QPay logs recorded yet.";
  }

  try {
    const content = fs.readFileSync(MAIN_LOG_FILE, "utf8");
    const lines = content.split("\n");
    return lines.slice(-maxLines).join("\n");
  } catch (err) {
    return `Error reading log file: ${err.message}`;
  }
};

module.exports = {
  logQPayEvent,
  getRecentLogs,
  readRawLogFile,
  MAIN_LOG_FILE,
};
