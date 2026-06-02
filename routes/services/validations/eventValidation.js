const Joi = require("joi");
const { refundPolicy, visibility, ageRestriction } = require("../../../utils/Role");

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
    shortdesc: Joi.string().optional().allow(null, ""),
    longdesc: Joi.string().optional().allow(null, ""),
    venueName: Joi.string().optional().allow(null, ""),
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
        address: Joi.string().when(Joi.object({ isDraft: true, id: Joi.not().exist() }).unknown(), {
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
    tickets: Joi.array().items(Joi.object({
        ticketName: Joi.string().when(Joi.object({ isDraft: true, id: Joi.not().exist() }).unknown(), {
            then: Joi.optional(),
            otherwise: Joi.required(),
        }),
        ticketShortDesc: Joi.string().optional().allow(null, ""),
        price: Joi.number().min(0).when(Joi.object({ isDraft: true, id: Joi.not().exist() }).unknown(), {
            then: Joi.optional(),
            otherwise: Joi.required(),
        }),
        qty: Joi.number().integer().min(1).when(Joi.object({ isDraft: true, id: Joi.not().exist() }).unknown(), {
            then: Joi.optional(),
            otherwise: Joi.required(),
        }),
        salesStart: Joi.date().optional(),
        salesEnd: Joi.date().optional(),
    })).when(Joi.object({ isDraft: true, id: Joi.not().exist() }).unknown(), {
        then: Joi.optional(),
        otherwise: Joi.required(),
    }),
    refundPolicy: Joi.string().valid(...Object.values(refundPolicy)).allow('', null).optional(),
    addOns: Joi.string().allow('', null).optional(),
    mediaLinks: Joi.array().items(Joi.string()).optional(),
    shortTeaserVideo: Joi.array().items(Joi.string()).optional(),
    visibility: Joi.string().valid(...Object.values(visibility)).optional(),
    ageRestriction: Joi.string().valid(...Object.values(ageRestriction)).optional(),
    showAttendees: Joi.boolean().optional(),
    notes: Joi.string().optional().allow('', null),
    dressCode: Joi.string().optional().allow(null, ""),
    fetcherEvent: Joi.boolean().optional(),
    timeZone: Joi.string().optional().allow(null, ""),
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
    shortdesc: Joi.string().optional().allow(null, ""),
    longdesc: Joi.string().optional().allow(null, ""),
    venueName: Joi.string().optional().allow(null, ""),
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
        address: Joi.string().optional().allow(null, ""),
        state: Joi.string().optional().allow(null, ""),
        zipcode: Joi.string().optional().allow(null, ""),
    }).optional(),
    startDate: Joi.date().optional(),
    endDate: Joi.date().optional(),
    startTime: Joi.string().optional().allow(null, ""),
    endTime: Joi.string().optional().allow(null, ""),
    tickets: Joi.array().items(Joi.object({
        ticketName: Joi.string().required(),
        ticketShortDesc: Joi.string().optional().allow(null, ""),
        price: Joi.number().min(0).required(),
        qty: Joi.number().integer().min(1).required(),
        salesStart: Joi.date().optional(),
        salesEnd: Joi.date().optional(),
    })).optional(),
    refundPolicy: Joi.string().valid(...Object.values(refundPolicy)).allow('', null).optional(),
    addOns: Joi.string().allow('', null).optional(),
    mediaLinks: Joi.array().items(Joi.string()).optional(),
    shortTeaserVideo: Joi.array().items(Joi.string()).optional(),
    visibility: Joi.string().valid(...Object.values(visibility)).optional(),
    ageRestriction: Joi.string().valid(...Object.values(ageRestriction)).optional(),
    showAttendees: Joi.boolean().optional(),
    notes: Joi.string().optional().allow('', null),
    dressCode: Joi.string().optional().allow(null, ""),
    fetcherEvent: Joi.boolean().optional(),
    isDraft: Joi.boolean().optional(),
    timeZone: Joi.string().optional().allow(null, ""),
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
};
