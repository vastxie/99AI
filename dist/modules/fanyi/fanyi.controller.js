"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FanyiController = void 0;
const common_1 = require("@nestjs/common");
const fanyi_service_1 = require("./fanyi.service");
let FanyiController = class FanyiController {
    constructor(fanyiService) {
        this.fanyiService = fanyiService;
    }
    convertToEnglish(text) {
        return this.fanyiService.convertToEnglish(text);
    }
};
__decorate([
    (0, common_1.Get)('translate'),
    __param(0, (0, common_1.Query)('text')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], FanyiController.prototype, "convertToEnglish", null);
FanyiController = __decorate([
    (0, common_1.Controller)('fanyi'),
    __metadata("design:paramtypes", [fanyi_service_1.FanyiService])
], FanyiController);
exports.FanyiController = FanyiController;
