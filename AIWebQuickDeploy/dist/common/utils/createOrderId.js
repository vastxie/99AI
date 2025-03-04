"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createOrderId = void 0;
const uuid_1 = require("uuid");
function createOrderId() {
    return (0, uuid_1.v1)().toString().replace(/-/g, '');
}
exports.createOrderId = createOrderId;
