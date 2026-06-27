const CONSTANTS = require("./constants");
const moment = require("moment-timezone");
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
};
