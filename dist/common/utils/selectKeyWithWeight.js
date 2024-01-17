"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.selectKeyWithWeight = void 0;
function selectKeyWithWeight(data) {
    if (data.length === 0)
        return undefined;
    const totalWeight = data.reduce((sum, item) => sum + item.weight, 0);
    let randomWeight = Math.random() * totalWeight;
    for (const item of data) {
        randomWeight -= item.weight;
        if (randomWeight < 0) {
            return item;
        }
    }
    return data[data.length - 1];
}
exports.selectKeyWithWeight = selectKeyWithWeight;
