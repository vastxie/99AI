"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.APIPREFIX = exports.SWAGGERPREFIX = exports.PORT = void 0;
const PORT = process.env.PORT || 3000;
exports.PORT = PORT;
const SWAGGERPREFIX = process.env.SWAGGERPREFIX || '/docs';
exports.SWAGGERPREFIX = SWAGGERPREFIX;
const APIPREFIX = process.env.APIPREFIX || '/api';
exports.APIPREFIX = APIPREFIX;
