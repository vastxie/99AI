"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.importDynamic = exports.isNotEmptyString = void 0;
function isNotEmptyString(value) {
    return typeof value === 'string' && value.length > 0;
}
exports.isNotEmptyString = isNotEmptyString;
exports.importDynamic = new Function('modulePath', 'return import(modulePath)');
