"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.compileNetwork = void 0;
const axios_1 = require("axios");
function formatSearchData(searchData, question) {
    const formatStr = searchData.map(({ title, body, href }) => `'${title}' : ${body} ;`).join('\n\n');
    const instructions = 'Instructions: Reply to me in the language of my request or question above. Give a comprehensive answer to the question or request I have made above. Below are some results from a web search. Use the following results to summarize the answers \n\n';
    return `${question}\n\n${instructions}\n${formatStr}`;
}
async function compileNetwork(question, limit = 7) {
    let searchData = [];
    try {
        const responseData = await axios_1.default.get(`https://s0.awsl.app/search?q=${question}&max_results=${limit}`);
        searchData = responseData.data;
    }
    catch (error) {
        console.log('error: ', error);
        searchData = [];
    }
    if (searchData.length === 0) {
        return question;
    }
    else {
        return formatSearchData(searchData, question);
    }
}
exports.compileNetwork = compileNetwork;
