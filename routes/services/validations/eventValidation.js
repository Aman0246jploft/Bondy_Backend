const Joi = require("joi");

const createEventSchema = Joi.object({
    id: Joi.string().hex().length(24).optional(),
    isDraft: Joi.boolean().optional(),
    eventTitle: Joi.string().when(Joi.object({ isDraft: true, id: Joi.not().exist() }).unknown(), {
        then: Joi.optional(),
        otherwise: Joi.required(),
    }),
    eventCategory: Joi.string().when(Joi.object({ isDraft: true, id: Joi.not().exist() }).unknown(), {
        then: Joi.optional(),
        otherwise: Joi.required(),
    }), // ObjectId as string
    posterImage: Joi.array().items(Joi.string()).optional(),
    shortdesc: Joi.string().optional(),
    longdesc: Joi.string().optional(),
    tags: Joi.array().items(Joi.string()).optional(),
    venueName: Joi.string().optional(),
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
            otherwise: Joi.required(),
        }),
        country: Joi.string().when(Joi.object({ isDraft: true, id: Joi.not().exist() }).unknown(), {
            then: Joi.optional(),
            otherwise: Joi.required(),
        }),
        address: Joi.string().when(Joi.object({ isDraft: true, id: Joi.not().exist() }).unknown(), {
            then: Joi.optional(),
            otherwise: Joi.required(),
        }),
    }).when(Joi.object({ isDraft: true, id: Joi.not().exist() }).unknown(), {
        then: Joi.optional(),
        otherwise: Joi.required(),
    }),
    startDate: Joi.date().when(Joi.object({ isDraft: true, id: Joi.not().exist() }).unknown(), {
        then: Joi.optional(),
        otherwise: Joi.required(),
    }),
    endDate: Joi.date().when(Joi.object({ isDraft: true, id: Joi.not().exist() }).unknown(), {
        then: Joi.optional(),
        otherwise: Joi.required(),
    }),
    startTime: Joi.string().optional(),
    endTime: Joi.string().optional(),
    ticketName: Joi.string().optional(),
    ticketQtyAvailable: Joi.number().min(0).max(99999999).optional().messages({
        'number.base': 'Ticket quantity available must be a valid number',
        'number.min': 'Ticket quantity cannot be negative',
        'number.max': 'Ticket quantity cannot exceed 99,999,999',
    }),
    ticketSelesStartDate: Joi.date().optional(),
    ticketSelesEndDate: Joi.date().optional(),
    ticketPrice: Joi.number().min(0).max(99999999).optional().messages({
        'number.base': 'Ticket price must be a valid number',
        'number.min': 'Ticket price cannot be negative',
        'number.max': 'Ticket price cannot exceed 99,999,999',
    }),
    totalTickets: Joi.number().min(1).max(99999999).optional().messages({
        'number.base': 'Total tickets must be a valid number',
        'number.min': 'Total tickets must be at least 1',
        'number.max': 'Total tickets cannot exceed 99,999,999',
    }),
    refundPolicy: Joi.string().allow('', null).optional(),
    addOns: Joi.string().allow('', null).optional(),
    mediaLinks: Joi.array().items(Joi.string()).optional(),
    shortTeaserVideo: Joi.array().items(Joi.string()).optional(),
    accessAndPrivacy: Joi.boolean().optional(),
    ageRestriction: Joi.object({
        type: Joi.string().valid("ALL", "MIN_AGE", "RANGE").required(),
        minAge: Joi.number().optional(),
        maxAge: Joi.number().optional(),
    }).optional(),
    dressCode: Joi.string().optional(),
    fetcherEvent: Joi.boolean().optional(),
});

const getEventsSchema = Joi.object({
    filter: Joi.string()
        .valid("all", "nearYou", "upcoming", "today", "tomorrow", "thisWeek", "thisWeekend", "thisYear", "nextWeek", "recommended")
        .default("all"),
    latitude: Joi.number().when("filter", {
        is: "nearYou",
        then: Joi.required(),
        otherwise: Joi.optional(),
    }),
    longitude: Joi.number().when("filter", {
        is: "nearYou",
        then: Joi.required(),
        otherwise: Joi.optional(),
    }),
    radius: Joi.number().min(1).max(500).default(50), // in kilometers
    categoryId: Joi.string().hex().length(24).optional().allow("", null),
    search: Joi.string().optional().allow('', null),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    date: Joi.string().optional(),
    userId: Joi.string().hex().length(24).optional(),
    placement: Joi.string().valid("homePage", "explorePage").optional(),
    timeOfDay: Joi.string().optional(),
});

const getEventDetailsSchema = Joi.object({
    eventId: Joi.string().hex().length(24).required(),
});

const updateEventSchema = Joi.object({
    eventTitle: Joi.string().optional(),
    eventCategory: Joi.string().hex().length(24).optional(),
    posterImage: Joi.array().items(Joi.string()).optional(),
    shortdesc: Joi.string().optional(),
    longdesc: Joi.string().optional(),
    tags: Joi.array().items(Joi.string()).optional(),
    venueName: Joi.string().optional(),
    venueAddress: Joi.object({
        latitude: Joi.number().required().messages({
            'number.base': 'Latitude must be a valid number',
            'any.required': 'Latitude is required',
        }),
        longitude: Joi.number().required().messages({
            'number.base': 'Longitude must be a valid number',
            'any.required': 'Longitude is required',
        }),
        city: Joi.string().required().messages({
            'any.required': 'City is required',
        }),
        country: Joi.string().required().messages({
            'any.required': 'Country is required',
        }),
        address: Joi.string().required().messages({
            'any.required': 'Address is required',
        }),
    }).optional(),
    startDate: Joi.date().optional(),
    endDate: Joi.date().optional(),
    startTime: Joi.string().optional(),
    endTime: Joi.string().optional(),
    ticketName: Joi.string().optional(),
    ticketQtyAvailable: Joi.number().min(0).max(99999999).optional().messages({
        'number.base': 'Ticket quantity must be a valid number',
        'number.min': 'Ticket quantity cannot be negative',
        'number.max': 'Ticket quantity cannot exceed 99,999,999',
    }),
    ticketSelesStartDate: Joi.date().optional(),
    ticketSelesEndDate: Joi.date().optional(),
    ticketPrice: Joi.number().min(0).max(99999999).optional().messages({
        'number.base': 'Ticket price must be a valid number',
        'number.min': 'Ticket price cannot be negative',
        'number.max': 'Ticket price cannot exceed 99,999,999',
    }),
    totalTickets: Joi.number().min(1).max(99999999).optional().messages({
        'number.base': 'Total tickets must be a valid number',
        'number.min': 'Total tickets must be at least 1',
        'number.max': 'Total tickets cannot exceed 99,999,999',
    }),
    refundPolicy: Joi.string().allow('', null).optional(),
    addOns: Joi.string().allow('', null).optional(),
    mediaLinks: Joi.array().items(Joi.string()).optional(),
    shortTeaserVideo: Joi.array().items(Joi.string()).optional(),
    accessAndPrivacy: Joi.boolean().optional(),
    ageRestriction: Joi.object({
        type: Joi.string().valid("ALL", "MIN_AGE", "RANGE").required(),
        minAge: Joi.number().min(0).optional(),
        maxAge: Joi.number().min(0).optional(),
    }).optional(),
    dressCode: Joi.string().optional(),
    fetcherEvent: Joi.boolean().optional(),
    isDraft: Joi.boolean().optional(),
});

const updateEventParamsSchema = Joi.object({
    eventId: Joi.string().hex().length(24).required(),
});

module.exports = {
    createEventSchema,
    getEventsSchema,
    getEventDetailsSchema,
    updateEventSchema,
    updateEventParamsSchema
};
