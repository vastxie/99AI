"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRandomItem = void 0;
function getRandomItem(array) {
    const randomIndex = Math.floor(Math.random() * array.length);
    return array[randomIndex];
}
exports.getRandomItem = getRandomItem;
