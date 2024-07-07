"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleError = void 0;
const axios_1 = require("axios");
function handleError(error) {
    let message = '发生未知错误，请稍后再试';
    if (axios_1.default.isAxiosError(error) && error.response) {
        switch (error.response.status) {
            case 400:
                message =
                    '发生错误：400 Bad Request - 请求因格式错误无法被服务器处理。';
                break;
            case 401:
                message = '发生错误：401 Unauthorized - 请求要求进行身份验证。';
                break;
            case 403:
                message = '发生错误：403 Forbidden - 服务器拒绝执行请求。';
                break;
            case 404:
                message = '发生错误：404 Not Found - 请求的资源无法在服务器上找到。';
                break;
            case 500:
                message =
                    '发生错误：500 Internal Server Error - 服务器内部错误，无法完成请求。';
                break;
            case 502:
                message =
                    '发生错误：502 Bad Gateway - 作为网关或代理工作的服务器从上游服务器收到无效响应。';
                break;
            case 503:
                message =
                    '发生错误：503 Service Unavailable - 服务器暂时处于超负载或维护状态，无法处理请求。';
                break;
            default:
                break;
        }
    }
    else {
        message = error.message || message;
    }
    return message;
}
exports.handleError = handleError;
