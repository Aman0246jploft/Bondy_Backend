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
    posterImage: Joi.array().items(Joi.string().allow('', null)).optional(),
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
        ticketName: Joi.string().optional().allow(null, ""),
        ticketShortDesc: Joi.string().optional().allow(null, ""),
        price: Joi.number().min(0).optional(),
        qty: Joi.number().integer().min(1).optional(),
        isFreeTicket: Joi.boolean().optional(),
        salesStart: Joi.date().optional(),
        salesEnd: Joi.date().optional(),
    })).optional(),
    refundPolicy: Joi.string().valid(...Object.values(refundPolicy)).allow('', null).optional(),
    addOns: Joi.string().allow('', null).optional(),
    mediaLinks: Joi.array().items(Joi.string().allow('', null)).optional(),
    shortTeaserVideo: Joi.array().items(Joi.string().allow('', null)).optional(),
    visibility: Joi.string().valid(...Object.values(visibility)).optional(),
    ageRestriction: Joi.string().valid(...Object.values(ageRestriction)).optional(),
    showAttendees: Joi.boolean().optional(),
    notes: Joi.string().optional().allow('', null),
    dressCode: Joi.string().optional().allow(null, ""),
    fetcherEvent: Joi.boolean().optional(),
    timeZone: Joi.string().optional().allow(null, ""),
    isFreeEvent: Joi.boolean().optional(),
    ReservedExternally: Joi.number().integer().min(0).optional(),
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
    eventTitle: Joi.string().optional(),
    eventCategory: Joi.string().hex().length(24).optional(),
    posterImage: Joi.array().items(Joi.string().allow('', null)).optional(),
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
        ticketName: Joi.string().optional().allow(null, ""),
        ticketShortDesc: Joi.string().optional().allow(null, ""),
        price: Joi.number().min(0).optional(),
        qty: Joi.number().integer().min(1).optional(),
        isFreeTicket: Joi.boolean().optional(),
        salesStart: Joi.date().optional(),
        salesEnd: Joi.date().optional(),
    })).optional(),
    refundPolicy: Joi.string().valid(...Object.values(refundPolicy)).allow('', null).optional(),
    addOns: Joi.string().allow('', null).optional(),
    mediaLinks: Joi.array().items(Joi.string().allow('', null)).optional(),
    shortTeaserVideo: Joi.array().items(Joi.string().allow('', null)).optional(),
    visibility: Joi.string().valid(...Object.values(visibility)).optional(),
    ageRestriction: Joi.string().valid(...Object.values(ageRestriction)).optional(),
    showAttendees: Joi.boolean().optional(),
    notes: Joi.string().optional().allow('', null),
    dressCode: Joi.string().optional().allow(null, ""),
    fetcherEvent: Joi.boolean().optional(),
    isDraft: Joi.boolean().optional(),
    timeZone: Joi.string().optional().allow(null, ""),
    isFreeEvent: Joi.boolean().optional(),
    ReservedExternally: Joi.number().integer().min(0).optional(),
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
