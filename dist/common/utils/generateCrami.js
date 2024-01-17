"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateCramiCode = void 0;
const uuid_1 = require("uuid");
function generateCramiCode() {
    const code = (0, uuid_1.v4)().replace(/-/g, '').slice(0, 16);
    return code;
}
exports.generateCramiCode = generateCramiCode;
