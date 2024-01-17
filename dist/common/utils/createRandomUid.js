"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRandomUid = void 0;
const guid_typescript_1 = require("guid-typescript");
function createRandomUid() {
    const uuid = guid_typescript_1.Guid.create();
    return uuid.toString().substr(0, 10).replace('-', '');
}
exports.createRandomUid = createRandomUid;
