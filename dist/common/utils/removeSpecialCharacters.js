"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.removeSpecialCharacters = void 0;
function removeSpecialCharacters(inputString) {
    return inputString.replace(/[^\w\s-]/g, '');
}
exports.removeSpecialCharacters = removeSpecialCharacters;
