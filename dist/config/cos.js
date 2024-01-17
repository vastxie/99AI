"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Dotenv = require("dotenv");
Dotenv.config({ path: '.env' });
const config = {
    SecretId: process.env.TENTCENT_SECRET_ID,
    SecretKey: process.env.TENTCENT_SECRET_KEY,
    Bucket: process.env.COS_BUCKET_PUBLIC,
    Region: process.env.COS_REGION,
};
exports.default = config;
