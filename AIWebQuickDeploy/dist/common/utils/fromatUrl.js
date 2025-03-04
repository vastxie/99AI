"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatUrl = void 0;
function formatUrl(url) {
    let formattedUrl = url.replace(/\s+/g, '');
    if (formattedUrl.endsWith('/')) {
        formattedUrl = formattedUrl.slice(0, -1);
    }
    return formattedUrl;
}
exports.formatUrl = formatUrl;
