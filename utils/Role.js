const roleId = {
    SUPER_ADMIN: 1,
    ORGANIZER: 2,
    CUSTOMER: 3,
    GUEST: 4,
    STAFF: 5
}


const userRole = {
    1: "SUPER_ADMIN",
    2: "ORGANIZER",
    3: "CUSTOMER",
    4: "GUEST",
    5: "STAFF"
}

// Global Enums managed in one central place (Object format)
const refundPolicy = {
    NO_REFUND: "No Refund",
    ONE_DAY_BEFORE: "1 Day Before",
    SEVEN_DAYS_BEFORE: "7 Days Before"
}

const visibility = {
    PUBLIC: "PUBLIC",
    PRIVATE: "PRIVATE"
}

const ageRestriction = {
    ALL: "ALL",
    EIGHTEEN_PLUS: "18+",
    TWENTY_ONE_PLUS: "21+"
}

const eventStatus = {
    UPCOMING: "Upcoming",
    LIVE: "Live",
    PAST: "Past",
    CANCELLED: "Cancelled"
}

const daysOfWeek = {
    MON: "Mon",
    TUE: "Tue",
    WED: "Wed",
    THU: "Thu",
    FRI: "Fri",
    SAT: "Sat",
    SUN: "Sun"
}

module.exports = {
    roleId,
    userRole,
    refundPolicy,
    visibility,
    ageRestriction,
    eventStatus,
    daysOfWeek
}