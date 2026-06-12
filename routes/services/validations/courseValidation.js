const Joi = require("joi");
const { refundPolicy, daysOfWeek } = require("../../../utils/Role");

const batchSchema = Joi.object({
    _id: Joi.string().hex().length(24).optional(),
    batchName: Joi.string().optional(),
    startTime: Joi.string().optional(),
    endTime: Joi.string().optional(),
    days: Joi.array().items(Joi.string().valid(...Object.values(daysOfWeek))).optional(),
    seats: Joi.number().integer().min(1).optional(),
    ReservedExternally: Joi.number().integer().min(0).optional(),
});

const createCourseSchema = Joi.object({
    isDraft: Joi.boolean().optional(),
    courseTitle: Joi.string().when('isDraft', {
        is: true,
        then: Joi.optional(),
        otherwise: Joi.required(),
    }),
    shortdesc: Joi.string().optional().allow(null, ""),
    longdesc: Joi.string().optional().allow(null, ""),
    whatYouWillLearn: Joi.string().optional().allow(null, ""),
    courseCategory: Joi.string().hex().length(24).when('isDraft', {
        is: true,
        then: Joi.optional(),
        otherwise: Joi.required(),
    }),
    posterImage: Joi.array().items(Joi.string().allow('', null)).optional(),
    mediaLinks: Joi.array().items(Joi.string().allow('', null)).optional(),
    shortTeaserVideo: Joi.array().items(Joi.string().allow('', null)).optional(),
    startDate: Joi.date().when('isDraft', {
        is: true,
        then: Joi.optional(),
        otherwise: Joi.required(),
    }),
    endDate: Joi.date().when('isDraft', {
        is: true,
        then: Joi.optional(),
        otherwise: Joi.when('enrollmentType', {
            is: 'fixedStart',
            then: Joi.required(),
            otherwise: Joi.optional(),
        }),
    }),
    totalSessions: Joi.number().integer().min(1).when('isDraft', {
        is: true,
        then: Joi.optional(),
        otherwise: Joi.required(),
    }),
    timeZone: Joi.string().optional().allow(null, ""),
    venueName: Joi.string().optional().allow(null, ""),
    venueAddress: Joi.object({
        latitude: Joi.number().when('isDraft', {
            is: true,
            then: Joi.optional(),
            otherwise: Joi.required().messages({
                'number.base': 'Latitude must be a valid number',
                'any.required': 'Latitude is required',
            }),
        }),
        longitude: Joi.number().when('isDraft', {
            is: true,
            then: Joi.optional(),
            otherwise: Joi.required().messages({
                'number.base': 'Longitude must be a valid number',
                'any.required': 'Longitude is required',
            }),
        }),
        city: Joi.string().optional().allow(null, ""),
        country: Joi.string().optional().allow(null, ""),
        address: Joi.string().optional().allow(null, ""),
        state: Joi.string().optional().allow(null, ""),
        zipcode: Joi.string().optional().allow(null, ""),
    }).when('isDraft', {
        is: true,
        then: Joi.optional(),
        otherwise: Joi.required().allow(null, ""),
    }),
    batches: Joi.array().items(batchSchema).when('isDraft', {
        is: true,
        then: Joi.optional(),
        otherwise: Joi.array().min(1).required().messages({
            'any.required': 'At least one batch is required for a published course',
            'array.min': 'At least one batch is required for a published course',
        }),
    }),
    price: Joi.number().min(0).when('isDraft', {
        is: true,
        then: Joi.optional(),
        otherwise: Joi.required(),
    }),
    refundPolicy: Joi.string().valid(...Object.values(refundPolicy)).optional().allow(null, ""),
    oneMonthPassPrice: Joi.number().min(0).optional(),
    oneMonthPassEnabled: Joi.boolean().optional(),
    threeMonthPassPrice: Joi.number().min(0).optional(),
    threeMonthPassEnabled: Joi.boolean().optional(),
    enrollmentType: Joi.string().valid("Ongoing", "fixedStart").when('isDraft', {
        is: true,
        then: Joi.optional(),
        otherwise: Joi.required(),
    }),
    isFeatured: Joi.boolean().optional(),
    featuredExpiry: Joi.date().optional().allow(null),
    activePromotionPackage: Joi.string().hex().length(24).optional().allow(null),
    bookingCutOff: Joi.string().optional().allow(null, ""),
});

const getCoursesSchema = Joi.object({
    filter: Joi.string().default("all"),
    latitude: Joi.number().optional(),
    longitude: Joi.number().optional(),
    radius: Joi.number().min(1).max(500).default(100),
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
    excludeMyCourses: Joi.any().optional(),
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
    enrollmentType: Joi.string().valid("Ongoing", "fixedStart").optional(),
});

const updateCourseParamsSchema = Joi.object({
    courseId: Joi.string().hex().length(24).required(),
});

const updateCourseSchema = Joi.object({
    isDraft: Joi.boolean().optional(),
    courseTitle: Joi.string().optional(),
    shortdesc: Joi.string().optional().allow(null, ""),
    longdesc: Joi.string().optional().allow(null, ""),
    whatYouWillLearn: Joi.string().optional().allow(null, ""),
    courseCategory: Joi.string().hex().length(24).optional(),
    posterImage: Joi.array().items(Joi.string().allow('', null)).optional(),
    mediaLinks: Joi.array().items(Joi.string().allow('', null)).optional(),
    shortTeaserVideo: Joi.array().items(Joi.string().allow('', null)).optional(),
    startDate: Joi.date().optional(),
    endDate: Joi.date().optional(),
    totalSessions: Joi.number().integer().min(1).optional(),
    timeZone: Joi.string().optional().allow(null, ""),
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
    batches: Joi.array().items(batchSchema).optional(),
    price: Joi.number().min(0).optional(),
    refundPolicy: Joi.string().valid(...Object.values(refundPolicy)).optional().allow(null, ""),
    oneMonthPassPrice: Joi.number().min(0).optional(),
    oneMonthPassEnabled: Joi.boolean().optional(),
    threeMonthPassPrice: Joi.number().min(0).optional(),
    threeMonthPassEnabled: Joi.boolean().optional(),
    enrollmentType: Joi.string().valid("Ongoing", "fixedStart").optional(),
    isFeatured: Joi.boolean().optional(),
    featuredExpiry: Joi.date().optional().allow(null),
    activePromotionPackage: Joi.string().hex().length(24).optional().allow(null),
    bookingCutOff: Joi.string().optional().allow(null, ""),
}).min(1);

module.exports = {
    createCourseSchema,
    getCoursesSchema,
    updateCourseParamsSchema,
    updateCourseSchema,
};
