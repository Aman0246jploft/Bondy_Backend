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

module.exports = {
    createCourseSchema,
};
