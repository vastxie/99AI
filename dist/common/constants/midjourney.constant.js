"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MidjourneyActionEnum = exports.MidjourneyStatusEnum = void 0;
var MidjourneyStatusEnum;
(function (MidjourneyStatusEnum) {
    MidjourneyStatusEnum[MidjourneyStatusEnum["WAITING"] = 1] = "WAITING";
    MidjourneyStatusEnum[MidjourneyStatusEnum["DRAWING"] = 2] = "DRAWING";
    MidjourneyStatusEnum[MidjourneyStatusEnum["DRAWED"] = 3] = "DRAWED";
    MidjourneyStatusEnum[MidjourneyStatusEnum["DRAWFAIL"] = 4] = "DRAWFAIL";
    MidjourneyStatusEnum[MidjourneyStatusEnum["DRAWTIMEOUT"] = 5] = "DRAWTIMEOUT";
})(MidjourneyStatusEnum = exports.MidjourneyStatusEnum || (exports.MidjourneyStatusEnum = {}));
var MidjourneyActionEnum;
(function (MidjourneyActionEnum) {
    MidjourneyActionEnum[MidjourneyActionEnum["DRAW"] = 1] = "DRAW";
    MidjourneyActionEnum[MidjourneyActionEnum["UPSCALE"] = 2] = "UPSCALE";
    MidjourneyActionEnum[MidjourneyActionEnum["VARIATION"] = 3] = "VARIATION";
    MidjourneyActionEnum[MidjourneyActionEnum["GENERATE"] = 4] = "GENERATE";
    MidjourneyActionEnum[MidjourneyActionEnum["REGENERATE"] = 5] = "REGENERATE";
    MidjourneyActionEnum[MidjourneyActionEnum["VARY"] = 6] = "VARY";
    MidjourneyActionEnum[MidjourneyActionEnum["ZOOM"] = 7] = "ZOOM";
})(MidjourneyActionEnum = exports.MidjourneyActionEnum || (exports.MidjourneyActionEnum = {}));
