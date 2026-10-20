const Joi = require("joi");
const { refundPolicy, getAllAllowedRefundPolicies, visibility, ageRestriction } = require("../../../utils/Role");

const MAX_DIGITS = 9999999999;

function digitsOf(value) {
    if (value === null || value === undefined || value === "") return null;
    const raw = String(value).trim();
    if (!/^\d+$/.test(raw)) return null;
    return raw.replace(/^0+/, "") || "0";
}

function eventFieldLengthError(body) {
    if (!body || typeof body !== "object") return null;
    if (body.venueName !== undefined && body.venueName !== null) {
        const venue = String(body.venueName).trim();
        if (venue && (venue.length < 2 || venue.length > 150)) {
            return "Venue name must be 2 to 150 characters.";
        }
    }
    const notes = String(
        body.notes !== undefined && body.notes !== null
            ? body.notes
            : (Array.isArray(body.tags) ? body.tags.join(", ") : "")
    ).trim();
    if (notes.length > 500) return "Entry requirements must be at most 500 characters.";
    if (body.dressCode !== undefined && body.dressCode !== null && String(body.dressCode).trim().length > 300) {
        return "Dress code must be at most 300 characters.";
    }
    const tickets = Array.isArray(body.tickets) ? body.tickets : [];
    for (const ticket of tickets) {
        if (!ticket) continue;
        const name = String(ticket.ticketName || "").trim();
        if (name && (name.length < 2 || name.length > 150)) {
            return "Ticket name must be 2 to 150 characters.";
        }
        if (String(ticket.ticketShortDesc || "").trim().length > 200) {
            return "Short description must be at most 200 characters.";
        }
        const isFree = ticket.isFreeTicket === true ||
            ticket.isFreeTicket === "true" ||
            Number(ticket.price) === 0 ||
            body.isFreeEvent === true ||
            body.isFreeEvent === "true" ||
            body.ticketPrice === "0" ||
            Number(body.ticketPrice) === 0;
        if (!isFree && ticket.price !== undefined && ticket.price !== null && ticket.price !== "") {
            const priceDigits = digitsOf(ticket.price);
            if (!priceDigits || priceDigits === "0" || priceDigits.length > 10) {
                return "Price must be 1 to 10 digits.";
            }
        }
        if (ticket.qty !== undefined && ticket.qty !== null && ticket.qty !== "") {
            const qtyDigits = digitsOf(ticket.qty);
            if (!qtyDigits || qtyDigits === "0" || qtyDigits.length > 10) {
                return "Quantity must be 1 to 10 digits.";
            }
        }
    }
    return null;
}

const ticketSchema = Joi.object({
    ticketName: Joi.string().trim().min(2).max(150).allow("", null).optional(),
    ticketShortDesc: Joi.string().trim().max(200).allow("", null).optional(),
    price: Joi.number().min(0).max(MAX_DIGITS).when("isFreeTicket", {
        is: true,
        then: Joi.number().valid(0).optional(),
        otherwise: Joi.number().min(0).max(MAX_DIGITS).optional(),
    }),
    qty: Joi.number().integer().min(1).max(MAX_DIGITS).optional(),
    isFreeTicket: Joi.boolean().optional(),
    salesStart: Joi.date().optional(),
    salesEnd: Joi.date().optional(),
});

const createEventSchema = Joi.object({
    id: Joi.string().hex().length(24).optional(),
    isDraft: Joi.boolean().optional(),
    eventTitle: Joi.string().trim().min(3).when(Joi.object({ isDraft: true, id: Joi.not().exist() }).unknown(), {
        then: Joi.optional().allow("", null),
        otherwise: Joi.required(),
    }).messages({
        'string.min': 'The field must contain a minimum of 3 characters.',
        'string.empty': 'Event title is required',
        'any.required': 'Event title is required',
    }),
    eventCategory: Joi.string().when(Joi.object({ isDraft: true, id: Joi.not().exist() }).unknown(), {
        then: Joi.optional(),
        otherwise: Joi.required(),
    }), // ObjectId as string
    posterImage: Joi.array().items(Joi.string().allow('', null)).optional(),
    shortdesc: Joi.string().optional().allow(null, ""),
    longdesc: Joi.string().optional().allow(null, ""),
    venueName: Joi.string().trim().min(2).max(150).allow("", null).optional(),
    venueAddress: Joi.object({
        latitude: Joi.number().when(Joi.object({ isDraft: true, id: Joi.not().exist() }).unknown(), {
            then: Joi.optional(),
            otherwise: Joi.required(),
        }).messages({
            'number.base': 'Latitude must be a valid number',
            'any.required': 'Event latitude is required',
        }),
        longitude: Joi.number().when(Joi.object({ isDraft: true, id: Joi.not().exist() }).unknown(), {
            then: Joi.optional(),
            otherwise: Joi.required(),
        }).messages({
            'number.base': 'Longitude must be a valid number',
            'any.required': 'Event longitude is required',
        }),
        city: Joi.string().when(Joi.object({ isDraft: true, id: Joi.not().exist() }).unknown(), {
            then: Joi.optional(),
            otherwise: Joi.allow(null, ""),
        }),
        country: Joi.string().when(Joi.object({ isDraft: true, id: Joi.not().exist() }).unknown(), {
            then: Joi.optional(),
            otherwise: Joi.allow(null, ""),
        }),
        address: Joi.string().trim().max(180).when(Joi.object({ isDraft: true, id: Joi.not().exist() }).unknown(), {
            then: Joi.optional(),
            otherwise: Joi.allow(null, ""),
        }),
        state: Joi.string().optional().allow(null, ""),
        zipcode: Joi.string().optional().allow(null, ""),
    }).when(Joi.object({ isDraft: true, id: Joi.not().exist() }).unknown(), {
        then: Joi.optional(),
        otherwise: Joi.allow(null, ""),
    }),
    startDate: Joi.date().when(Joi.object({ isDraft: true, id: Joi.not().exist() }).unknown(), {
        then: Joi.optional(),
        otherwise: Joi.required(),
    }),
    endDate: Joi.date().when(Joi.object({ isDraft: true, id: Joi.not().exist() }).unknown(), {
        then: Joi.optional(),
        otherwise: Joi.required(),
    }),
    startTime: Joi.string().optional().allow(null, ""),
    endTime: Joi.string().optional().allow(null, ""),
    tickets: Joi.array().items(ticketSchema).optional(),
    refundPolicy: Joi.string().valid(...getAllAllowedRefundPolicies()).allow('', null).optional(),
    addOns: Joi.string().allow('', null).optional(),
    mediaLinks: Joi.array().items(Joi.string().allow('', null)).max(5).optional(),
    shortTeaserVideo: Joi.array().items(Joi.string().allow('', null)).optional(),
    visibility: Joi.string().valid(...Object.values(visibility), "public", "private", "PUBLIC", "PRIVATE").optional(),
    ageRestriction: Joi.string().valid(...Object.values(ageRestriction)).optional(),
    showAttendees: Joi.boolean().optional(),
    notes: Joi.string().trim().max(500).allow("", null).optional(),
    dressCode: Joi.string().trim().max(300).allow("", null).optional(),
    fetcherEvent: Joi.boolean().optional(),
    timeZone: Joi.string().optional().allow(null, ""),
    isFreeEvent: Joi.boolean().optional(),
    ReservedExternally: Joi.number().integer().min(0).optional(),
    ticketName: Joi.string().optional().allow("", null),
    ticketPrice: Joi.alternatives().try(Joi.number(), Joi.string()).optional().allow("", null),
    ticketQtyAvailable: Joi.alternatives().try(Joi.number(), Joi.string()).optional().allow("", null),
    ticketSelesStartDate: Joi.alternatives().try(Joi.date(), Joi.string()).optional().allow("", null),
    ticketSelesEndDate: Joi.alternatives().try(Joi.date(), Joi.string()).optional().allow("", null),
    totalTickets: Joi.alternatives().try(Joi.number(), Joi.string()).optional().allow("", null),
    accessAndPrivacy: Joi.boolean().optional(),
});

const getEventsSchema = Joi.object({
    filter: Joi.string().default("all"),
    latitude: Joi.number().optional(),
    longitude: Joi.number().optional(),
    radius: Joi.number().min(1).max(500).default(50), // in kilometers
    categoryId: Joi.string().optional().allow('', null),
    category: Joi.string().optional().allow('', null),
    search: Joi.string().optional().allow('', null),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    userId: Joi.string().hex().length(24).optional(),
    placement: Joi.string().valid("homePage", "explorePage").optional(),
    startDate: Joi.string().optional(),
    endDate: Joi.string().optional(),
    fromDate: Joi.string().optional(),
    toDate: Joi.string().optional(),
    isDraft: Joi.any().optional(),
    excludeMyEvents: Joi.any().optional(),
    timeOfDay: Joi.string().optional(),
    city: Joi.string().optional().allow('', null),
    country: Joi.string().optional().allow('', null),
    status: Joi.string().optional().allow('', null),
    north: Joi.number().optional(),
    south: Joi.number().optional(),
    east: Joi.number().optional(),
    west: Joi.number().optional(),
    northEastLat: Joi.number().optional(),
    northEastLng: Joi.number().optional(),
    southWestLat: Joi.number().optional(),
    southWestLng: Joi.number().optional(),
});

const getEventDetailsSchema = Joi.object({
    eventId: Joi.string().hex().length(24).required(),
});

const updateEventSchema = Joi.object({
    eventTitle: Joi.string().trim().min(3).optional().messages({
        'string.min': 'The field must contain a minimum of 3 characters.',
    }),
    eventCategory: Joi.string().hex().length(24).optional(),
    posterImage: Joi.array().items(Joi.string().allow('', null)).optional(),
    shortdesc: Joi.string().optional().allow(null, ""),
    longdesc: Joi.string().optional().allow(null, ""),
    venueName: Joi.string().trim().min(2).max(150).allow("", null).optional(),
    venueAddress: Joi.object({
        latitude: Joi.number().required().messages({
            'number.base': 'Latitude must be a valid number',
            'any.required': 'Latitude is required',
        }),
        longitude: Joi.number().required().messages({
            'number.base': 'Longitude must be a valid number',
            'any.required': 'Longitude is required',
        }),
        city: Joi.string().optional().allow(null, ""),
        country: Joi.string().optional().allow(null, ""),
        address: Joi.string().trim().max(180).optional().allow(null, ""),
        state: Joi.string().optional().allow(null, ""),
        zipcode: Joi.string().optional().allow(null, ""),
    }).optional(),
    startDate: Joi.date().optional(),
    endDate: Joi.date().optional(),
    startTime: Joi.string().optional().allow(null, ""),
    endTime: Joi.string().optional().allow(null, ""),
    tickets: Joi.array().items(ticketSchema).optional(),
    refundPolicy: Joi.string().valid(...getAllAllowedRefundPolicies()).allow('', null).optional(),
    addOns: Joi.string().allow('', null).optional(),
    mediaLinks: Joi.array().items(Joi.string().allow('', null)).max(5).optional(),
    shortTeaserVideo: Joi.array().items(Joi.string().allow('', null)).optional(),
    visibility: Joi.string().valid(...Object.values(visibility), "public", "private", "PUBLIC", "PRIVATE").optional(),
    ageRestriction: Joi.string().valid(...Object.values(ageRestriction)).optional(),
    showAttendees: Joi.boolean().optional(),
    notes: Joi.string().trim().max(500).allow("", null).optional(),
    dressCode: Joi.string().trim().max(300).allow("", null).optional(),
    fetcherEvent: Joi.boolean().optional(),
    isDraft: Joi.boolean().optional(),
    timeZone: Joi.string().optional().allow(null, ""),
    isFreeEvent: Joi.boolean().optional(),
    ReservedExternally: Joi.number().integer().min(0).optional(),
    ticketName: Joi.string().optional().allow("", null),
    ticketPrice: Joi.alternatives().try(Joi.number(), Joi.string()).optional().allow("", null),
    ticketQtyAvailable: Joi.alternatives().try(Joi.number(), Joi.string()).optional().allow("", null),
    ticketSelesStartDate: Joi.alternatives().try(Joi.date(), Joi.string()).optional().allow("", null),
    ticketSelesEndDate: Joi.alternatives().try(Joi.date(), Joi.string()).optional().allow("", null),
    totalTickets: Joi.alternatives().try(Joi.number(), Joi.string()).optional().allow("", null),
    accessAndPrivacy: Joi.boolean().optional(),
});

const updateEventParamsSchema = Joi.object({
    eventId: Joi.string().hex().length(24).required(),
});

const toggleEventSliderSchema = Joi.object({
    eventId: Joi.string().hex().length(24).required(),
    addToSlider: Joi.boolean().required(),
});

module.exports = {
    createEventSchema,
    getEventsSchema,
    getEventDetailsSchema,
    updateEventSchema,
    updateEventParamsSchema,
    toggleEventSliderSchema,
    eventFieldLengthError,
};
