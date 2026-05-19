const roleId = {
    SUPER_ADMIN: 1,
    ORGANIZER: 2,
    CUSTOMER: 3,
    GUEST: 4
}


const userRole = {
    1: "SUPER_ADMIN",
    2: "ORGANIZER",
    3: "CUSTOMER",
    4: "GUEST"
}

const visibility = {
    PUBLIC: "PUBLIC",
    PRIVATE: "PRIVATE",
}

// const ageRestriction = {
//     ALL: "All Ages",
//     MIN_18: "18+",
// }

const ageOptions = [
    { label: "All_Ages", value: "All Ages" },
    { label: "18P", value: "18+" },
    { label: "21P", value: "21+" },
]
const refundPolicyType = {
    EVENT: "event",
    COURSE: "course",
    BOTH: "both",
}

module.exports = {
    roleId,
    userRole,
    visibility,
    refundPolicyType,
    ageOptions
}