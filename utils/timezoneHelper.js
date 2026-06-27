const moment = require('moment-timezone');

const formatDateTimeByTimezone = (date, timeZone) => {
  if (!date || !timeZone || !moment.tz.zone(timeZone)) return date;
  const m = moment(date);
  if (!m.isValid()) return date;
  return m.tz(timeZone).format('YYYY-MM-DDTHH:mm:ss.SSS');
};

const adjustEventDateTime = (dateVal, timeVal, timeZone) => {
  if (!dateVal || !timeZone || !moment.tz.zone(timeZone)) {
    return { date: dateVal, time: timeVal };
  }
  try {
    // Treat dateVal as a local date originally, combined with timeVal
    const formattedDate = new Date(dateVal).toISOString().split("T")[0];
    const timeString = timeVal || "00:00";
    
    // Original combined datetime in UTC (this is how it is treated in the DB logic)
    // Wait, Bondy combines them as new Date(`${formattedStartDate}T${newStartTime}Z`)? 
    // Usually new Date(`2024-01-01T14:30`) creates a local time date in the server's timezone.
    // If the server stores it as UTC, we just parse it as UTC.
    const m = moment.utc(`${formattedDate}T${timeString}`);
    if (!m.isValid()) return { date: dateVal, time: timeVal };

    const tzMoment = m.tz(timeZone);
    return {
      date: tzMoment.format('YYYY-MM-DDTHH:mm:ss.SSS'), // or just tzMoment.startOf('day').toISOString()
      time: tzMoment.format('HH:mm')
    };
  } catch(e) {
    return { date: dateVal, time: timeVal };
  }
};

module.exports = {
  formatDateTimeByTimezone,
  adjustEventDateTime
};
