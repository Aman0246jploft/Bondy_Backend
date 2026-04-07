const Joi = require("joi");

const scheduleSchema = Joi.object({
    startDate: Joi.date().min('now').required().messages({
        'date.min': 'Start date cannot be in the past'
    }),
    endDate: Joi.date().min(Joi.ref('startDate')).required().messages({
        'date.min': 'End date must be after or equal to start date'
    }),
    startTime: Joi.string().required(),
    endTime: Joi.string().required(),
});

const createCourseSchema = Joi.object({
    courseTitle: Joi.string().required(),
    courseCategory: Joi.string().required(),
    posterImage: Joi.array().items(Joi.string()).optional(),
    galleryImages: Joi.array().items(Joi.string()).optional(),
    whatYouWillLearn: Joi.string().optional(),
    isFeatured: Joi.boolean().default(false),
    venueAddress: Joi.object({
        latitude: Joi.number().required(),
        longitude: Joi.number().required(),
        city: Joi.string().required(),
        country: Joi.string().required(),
        address: Joi.string().required(),
        state: Joi.string().optional(),
        zipcode: Joi.string().optional(),
    }).required(),
    shortdesc: Joi.string().optional(),
    totalSeats: Joi.number().min(1).max(99999999).required().messages({
        'number.base': 'Total seats must be a valid number',
        'number.min': 'Total seats must be at least 1',
        'number.max': 'Total seats cannot exceed 99,999,999',
        'any.required': 'Total seats is required',
    }),
    price: Joi.number().min(0).max(99999999).required().messages({
        'number.base': 'Price must be a valid number',
        'number.min': 'Price cannot be negative',
        'number.max': 'Price cannot exceed 99,999,999',
        'any.required': 'Price is required',
    }),
    enrollmentType: Joi.string()
        .valid("Ongoing", "fixedStart")
        .default("Ongoing"),
    schedules: Joi.array().items(scheduleSchema).min(1).required()
        .when('enrollmentType', {
            is: 'fixedStart',
            then: Joi.array().length(1).messages({
                'array.length': 'Fixed start courses must have exactly one schedule'
            })
        }),
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
            "recommended",
            "today",
            "nextWeek",
            "past"
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
    categoryId: Joi.string().optional().allow('', null),
    userId: Joi.string().optional(),
    search: Joi.string().optional().allow('', null),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
});

const updateCourseParamsSchema = Joi.object({
    courseId: Joi.string().required(),
});

const updateScheduleSchema = Joi.object({
    startDate: Joi.date().required(),
    endDate: Joi.date().min(Joi.ref('startDate')).required().messages({
        'date.min': 'End date must be after or equal to start date'
    }),
    startTime: Joi.string().required(),
    endTime: Joi.string().required(),
    presentCount: Joi.number().min(0).optional(),
});

const updateCourseSchema = Joi.object({
    courseTitle: Joi.string().optional(),
    courseCategory: Joi.string().optional(),
    posterImage: Joi.array().items(Joi.string()).optional(),
    galleryImages: Joi.array().items(Joi.string()).optional(),
    whatYouWillLearn: Joi.string().optional(),
    isFeatured: Joi.boolean().optional(),
    venueAddress: Joi.object({
        latitude: Joi.number().required(),
        longitude: Joi.number().required(),
        city: Joi.string().required(),
        country: Joi.string().required(),
        address: Joi.string().required(),
        state: Joi.string().optional(),
        zipcode: Joi.string().optional(),
    }).optional(),
    shortdesc: Joi.string().optional(),
    price: Joi.number().min(0).max(99999999).optional().messages({
        'number.base': 'Price must be a valid number',
        'number.min': 'Price cannot be negative',
        'number.max': 'Price cannot exceed 99,999,999',
    }),
    totalSeats: Joi.number().min(1).max(99999999).optional().messages({
        'number.base': 'Total seats must be a valid number',
        'number.min': 'Total seats must be at least 1',
        'number.max': 'Total seats cannot exceed 99,999,999',
    }),
    enrollmentType: Joi.string().valid("Ongoing", "fixedStart").optional(),
    schedules: Joi.array().items(updateScheduleSchema).min(1).optional(),
}).min(1); // At least one field must be provided

module.exports = {
    createCourseSchema,
    getCoursesSchema,
    updateCourseParamsSchema,
    updateCourseSchema,
};
