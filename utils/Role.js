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

const REFUND_POLICY_TRANSLATIONS = {
    Mongolian: {
        "No Refund": "Буцаан олголтгүй",
        "1 Day Before": "1 хоногийн өмнө",
        "7 Days Before": "7 хоногийн өмнө",
    },
    English: {
        "No Refund": "No Refund",
        "1 Day Before": "1 Day Before",
        "7 Days Before": "7 Days Before",
    },
};

const CANCELLATION_REASONS_TRANSLATIONS = {
    Mongolian: {
        "Schedule conflict": "Цагийн хуваарь давхацсан",
        "Event no longer relevant": "Үйл ажиллагаа шаардлагагүй болсон",
        "Found a better alternative": "Илүү дээр сонголт олсон",
        "Booked by mistake": "Санамсаргүй захиалсан",
        "Financial reasons": "Санхүүгийн шалтгаан",
        "Other": "Бусад"
    }
};

const REFUND_POLICY_TO_ENGLISH = {
    "no refund": "No Refund",
    "1 day before": "1 Day Before",
    "7 days before": "7 Days Before",
    "буцаан олголтгүй": "No Refund",
    "1 хоногийн өмнө": "1 Day Before",
    "7 хоногийн өмнө": "7 Days Before",
    "буцаалтгүй": "No Refund",
    "буцаалт байхгүй": "No Refund",
    "буцаан олголт байхгүй": "No Refund",
    "1 өдрийн өмнө": "1 Day Before",
    "7 өдрийн өмнө": "7 Days Before",
};

/**
 * Get all allowed refund policy string values (English + Mongolian + common aliases)
 * Useful for Joi validation schemas.
 */
const getAllAllowedRefundPolicies = () => {
    return [
        ...Object.values(refundPolicy),
        ...Object.values(REFUND_POLICY_TRANSLATIONS.Mongolian),
        "буцаалтгүй",
        "буцаалт байхгүй",
        "буцаан олголт байхгүй",
        "1 өдрийн өмнө",
        "7 өдрийн өмнө",
    ];
};

/**
 * Translates a given refund policy string to the specified language ("Mongolian" or "English")
 */
const translateRefundPolicy = (policy, language = "English") => {
    if (!policy) return policy;
    const normalized = REFUND_POLICY_TO_ENGLISH[policy.toString().trim().toLowerCase()] || policy;
    if (language === "Mongolian") {
        return REFUND_POLICY_TRANSLATIONS.Mongolian[normalized] || normalized;
    }
    return REFUND_POLICY_TRANSLATIONS.English[normalized] || normalized;
};

/**
 * Normalizes any valid English or Mongolian refund policy string back to the canonical English enum
 */
const normalizeRefundPolicyToEnglish = (policy) => {
    if (!policy) return null;
    const trimmed = policy.toString().trim();
    if (!trimmed) return null;
    return REFUND_POLICY_TO_ENGLISH[trimmed.toLowerCase()] || trimmed;
};

/**
 * Returns all refund policy options for a given language
 */
const getAllRefundPoliciesForLang = (language = "English") => {
    if (language === "Mongolian") {
        return Object.values(REFUND_POLICY_TRANSLATIONS.Mongolian);
    }
    return Object.values(REFUND_POLICY_TRANSLATIONS.English);
};

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

// Wallet Transaction Types & Translations
const walletTransactionType = {
    TICKET_SALE: "TICKET_SALE",
    COURSE_SALE: "COURSE_SALE",
    PURCHASE: "PURCHASE",
    PAYOUT_REQUEST: "PAYOUT_REQUEST",
    PAYOUT_REJECTED: "PAYOUT_REJECTED",
    REFUND: "REFUND",
    CANCELLATION_DEDUCTION: "CANCELLATION_DEDUCTION",
    ADJUSTMENT: "ADJUSTMENT",
    REFERRAL: "REFERRAL",
};

const WALLET_TYPE_TRANSLATIONS = {
    Mongolian: {
        "TICKET_SALE": "Тасалбар борлуулалт",
        "COURSE_SALE": "Сургалт борлуулалт",
        "PURCHASE": "Худалдан авалт",
        "PAYOUT_REQUEST": "Төлбөрийн хүсэлт",
        "PAYOUT_REJECTED": "Төлбөр буцаагдсан",
        "REFUND": "Буцаан олголт",
        "CANCELLATION_DEDUCTION": "Цуцлалтын суутгал",
        "ADJUSTMENT": "Зохицуулалт",
        "REFERRAL": "Урилгын шагнал",
        "Ticket Sale": "Тасалбар борлуулалт",
        "Course Sale": "Сургалт борлуулалт",
        "Purchase": "Худалдан авалт",
        "Payout Request": "Төлбөрийн хүсэлт",
        "Payout Refunded": "Төлбөр буцаагдсан",
        "Payout Rejected": "Төлбөр буцаагдсан",
        "Refund": "Буцаан олголт",
        "Cancellation Deduction": "Цуцлалтын суутгал",
        "Adjustment": "Зохицуулалт",
        "Referral": "Урилгын шагнал",
        "Referral Reward": "Урилгын шагнал",
    },
    English: {
        "TICKET_SALE": "Ticket Sale",
        "COURSE_SALE": "Course Sale",
        "PURCHASE": "Purchase",
        "PAYOUT_REQUEST": "Payout Request",
        "PAYOUT_REJECTED": "Payout Refunded",
        "REFUND": "Refund",
        "CANCELLATION_DEDUCTION": "Cancellation Deduction",
        "ADJUSTMENT": "Adjustment",
        "REFERRAL": "Referral Reward",
        "Ticket Sale": "Ticket Sale",
        "Course Sale": "Course Sale",
        "Purchase": "Purchase",
        "Payout Request": "Payout Request",
        "Payout Refunded": "Payout Refunded",
        "Payout Rejected": "Payout Rejected",
        "Refund": "Refund",
        "Cancellation Deduction": "Cancellation Deduction",
        "Adjustment": "Adjustment",
        "Referral": "Referral Reward",
        "Referral Reward": "Referral Reward",
    },
};

/**
 * Translates a given wallet transaction type to the specified language ("Mongolian" or "English")
 */
const translateWalletType = (type, language = "English") => {
    if (!type) return type;
    const lang = (language && typeof language === "string" && (language.toLowerCase().includes("mongolian") || language.toLowerCase().startsWith("mn")))
        ? "Mongolian"
        : "English";
    const dict = WALLET_TYPE_TRANSLATIONS[lang] || WALLET_TYPE_TRANSLATIONS.English;
    return dict[type] || dict[type.toUpperCase()] || type;
};

module.exports = {
    roleId,
    userRole,
    refundPolicy,
    REFUND_POLICY_TRANSLATIONS,
    REFUND_POLICY_TO_ENGLISH,
    CANCELLATION_REASONS_TRANSLATIONS,
    getAllAllowedRefundPolicies,
    translateRefundPolicy,
    normalizeRefundPolicyToEnglish,
    getAllRefundPoliciesForLang,
    visibility,
    ageRestriction,
    eventStatus,
    daysOfWeek,
    walletTransactionType,
    WALLET_TYPE_TRANSLATIONS,
    translateWalletType
}