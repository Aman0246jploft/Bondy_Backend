const Joi = require("joi");

const scheduleSchema = Joi.object({
    startDate: Joi.date().required(),
    endDate: Joi.date().required(),
    startTime: Joi.string().required(),
    endTime: Joi.string().required(),
    totalSeats: Joi.number().min(1).required(),
    price: Joi.number().min(0).required(),
});

const createCourseSchema = Joi.object({
    courseTitle: Joi.string().required(),
    courseCategory: Joi.string().required(),
    posterImage: Joi.array().items(Joi.string()).optional(),
    venueAddress: Joi.object({
        latitude: Joi.number().required(),
        longitude: Joi.number().required(),
        city: Joi.string().required(),
        country: Joi.string().required(),
        address: Joi.string().required(),
    }).required(),
    shortdesc: Joi.string().optional(),
    schedules: Joi.array().items(scheduleSchema).min(1).required(),
});

const getCoursesSchema = Joi.object({
    filter: Joi.string()
        .valid(
            "all",
            "nearYou",
            "upcoming",
            "thisWeek",
            "thisWeekend",
            "thisYear",
            "recommended"
        )
        .default("all"),
    latitude: Joi.number().when("filter", {
        is: "nearYou",
        then: Joi.required().messages({
            "any.required": "Latitude is required for 'Near You' filter",
        }),
        otherwise: Joi.optional(),
    }),
    longitude: Joi.number().when("filter", {
        is: "nearYou",
        then: Joi.required().messages({
            "any.required": "Longitude is required for 'Near You' filter",
        }),
        otherwise: Joi.optional(),
    }),
    radius: Joi.number().min(1).max(500).default(50), // in kilometers
    categoryId: Joi.string().hex().length(24).optional(),
    search: Joi.string().optional(),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
});

module.exports = {
    createCourseSchema,
    getCoursesSchema,
};
