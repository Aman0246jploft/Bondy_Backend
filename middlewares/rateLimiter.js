const rateLimit = require('express-rate-limit');
const { apiErrorRes } = require('../utils/globalFunction');


// Function that returns a limiter middleware
// const perApiLimiter = (maxRequests = 30) =>
//     rateLimit({
//         windowMs: 60 * 1000, 
//         max: maxRequests,   
//         standardHeaders: true,
//         legacyHeaders: false,
//         handler: (req, res) => {
//             return apiErrorRes(
//                 429,
//                 res,
//                 'Too many requests on this API, please try again after a minute.'
//             );
//         },
//     });


const perApiLimiter = () => (req, res, next) => next();
module.exports = perApiLimiter;
