"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRandomItemFromArray = void 0;
function getRandomItemFromArray(array) {
    if (array.length === 0) {
        return null;
    }
    const randomIndex = Math.floor(Math.random() * array.length);
    return array[randomIndex];
}
exports.getRandomItemFromArray = getRandomItemFromArray;
