const moment = require('moment-timezone');

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

const getMappedTimeZone = (tz) => {
  if (!tz) return tz;
  return tzMapping[tz] || tz;
};

const formatDateTimeByTimezone = (date, timeZone) => {
  const mappedTz = getMappedTimeZone(timeZone);
  if (!date || !mappedTz || !moment.tz.zone(mappedTz)) return date;
  const m = moment(date);
  if (!m.isValid()) return date;
  return m.tz(mappedTz).format('YYYY-MM-DDTHH:mm:ss.SSS');
};

const adjustEventDateTime = (dateVal, timeVal, timeZone) => {
  const mappedTz = getMappedTimeZone(timeZone);
  if (!dateVal || !mappedTz || !moment.tz.zone(mappedTz)) {
    return { date: dateVal, time: timeVal };
  }
  try {
    let m;
    if (timeVal && typeof timeVal === 'string') {
      const datePart = moment.utc(dateVal).format('YYYY-MM-DD');
      m = moment.utc(`${datePart}T${timeVal}`);
    } else {
      m = moment.utc(dateVal);
    }

    if (!m.isValid()) return { date: dateVal, time: timeVal };

    const tzMoment = m.tz(mappedTz);
    return {
      date: tzMoment.format('YYYY-MM-DDTHH:mm:ss.SSS') + 'Z',
      time: tzMoment.format('HH:mm')
    };
  } catch(e) {
    return { date: dateVal, time: timeVal };
  }
};

module.exports = {
  formatDateTimeByTimezone,
  adjustEventDateTime,
  getMappedTimeZone
};
