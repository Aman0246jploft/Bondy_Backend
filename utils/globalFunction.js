const CONSTANTS = require("./constants");
const moment = require("moment");
const bcrypt = require("bcryptjs");
const { default: mongoose } = require("mongoose");

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
 * Combines a date input (Date object or ISO date string) and a time input (24-hour "HH:MM" format string)
 * into a single unified JavaScript Date object in standard UTC format. This ensures absolute precision
 * and timezone-agnostic dates globally.
 *
 * @param {Date|string} dateInput - The date portion (e.g. a Date object, "2026-05-19" or "2026-05-19T00:00:00.000Z")
 * @param {string} timeInput - The time portion in 24-hour format (e.g. "18:30" or "09:00")
 * @returns {Date|null} A standard JavaScript Date object containing both date and time in UTC, or null if the date is invalid.
 *
 * @example
 * // Input: Date("2026-05-19"), Time("18:30")
 * // Output: Date("2026-05-19T18:30:00.000Z")
 */
const combineDateAndTime = (dateInput, timeInput) => {
  if (!dateInput) return null;

  // Convert incoming date input to standard Date object
  const dateObj = new Date(dateInput);
  if (isNaN(dateObj.getTime())) return null;

  let hours = 0;
  let minutes = 0;

  // Extract hours and minutes from "HH:MM" format
  if (timeInput && typeof timeInput === "string") {
    const timeMatch = timeInput.trim().match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
    if (timeMatch) {
      hours = parseInt(timeMatch[1], 10);
      minutes = parseInt(timeMatch[2], 10);
    }
  }

  // Retrieve Year, Month, and Date in UTC to avoid local server timezone offsets
  const utcYear = dateObj.getUTCFullYear();
  const utcMonth = dateObj.getUTCMonth();
  const utcDate = dateObj.getUTCDate();

  // Return a new combined Date object fully resolved in UTC
  return new Date(Date.UTC(utcYear, utcMonth, utcDate, hours, minutes, 0, 0));
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
  combineDateAndTime,
};

