const Joi = require("joi");

const createEventSchema = Joi.object({
    eventTitle: Joi.string().required(),
    eventCategory: Joi.string().required(), // ObjectId as string
    posterImage: Joi.array().items(Joi.string()).optional(),
    shortdesc: Joi.string().optional(),
    longdesc: Joi.string().optional(),
    tags: Joi.array().items(Joi.string()).optional(),
    venueName: Joi.string().optional(),
    venueAddress: Joi.object({
        latitude: Joi.number().required(),
        longitude: Joi.number().required(),
        city: Joi.string().required(),
        country: Joi.string().required(),
        address: Joi.string().required(),
    }).required(),
    startDate: Joi.date().required(),
    endDate: Joi.date().required(),
    startTime: Joi.string().optional(),
    endTime: Joi.string().optional(),
    ticketName: Joi.string().optional(),
    ticketQtyAvailable: Joi.number().optional(),
    ticketSelesStartDate: Joi.date().optional(),
    ticketSelesEndDate: Joi.date().optional(),
    ticketPrice: Joi.number().optional(),
    totalTickets: Joi.number().optional(),
    refundPolicy: Joi.string().optional(),
    addOns: Joi.string().optional(),
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
    isDraft: Joi.boolean().optional(),
});

const getEventsSchema = Joi.object({
    filter: Joi.string()
        .valid("all", "nearYou", "upcoming", "thisWeek", "thisWeekend", "thisYear", "recommended")
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
    categoryId: Joi.string().hex().length(24).optional(),
    search: Joi.string().optional(),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
});

module.exports = {
    createEventSchema,
    getEventsSchema,
};
