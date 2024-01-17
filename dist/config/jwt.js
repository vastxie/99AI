"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config = {
    secret: process.env.JWT_SECRET,
    signOptions: {
        expiresIn: process.env.JWT_EXPIRESIN || '7d',
    },
};
exports.default = config;
