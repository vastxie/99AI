"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.compileNetwork = void 0;
const axios_1 = require("axios");
function formatSearchData(searchData, question) {
    const formatStr = searchData.results.map(({ title, body, href }) => `'${title}' : ${body} ; (${href})`).join('\n\n');
    const currentDate = new Date().toISOString().split('T')[0];
    const instructions = '你的任务是优先利用网络搜索结果来回答问题，并使用提问时的语言风格进行回复。你应该提供一个全面而有条理的回答，在每条答案后面明确指出来源于哪个链接，使用 [[数字](链接)] 格式进行标注。以下是搜索结果：';
    return `${instructions}\n今天是${currentDate}\n${formatStr}`;
}
async function compileNetwork(question) {
    const currentDate = new Date().toISOString().split('T')[0];
    console.log(`Current date: ${currentDate}`);
    console.log(`开始对问题“${question}”进行网络编译`);
    const datedQuestion = `${currentDate} ${question}`;
    let searchData = { results: [] };
    try {
        const url = ``;
        console.log(`正在向搜索API发送请求，URL为：${url}`);
        const responseData = await axios_1.default.get(url);
        searchData = responseData.data;
        console.log(`已成功接收问题“${question}”的搜索结果，结果数量：${searchData.results.length}`);
        searchData.results.forEach((result, index) => {
            console.log(`结果 ${index + 1}: 标题: ${result.title}, 链接: ${result.href}, 摘要: ${result.body.substring(0, 100)}...`);
        });
    }
    catch (error) {
        console.log(`在对问题“${question}”进行网络编译时出错：`, error);
    }
    let formattedData = "";
    if (searchData.results.length === 0) {
        console.log(`未找到问题“${question}”的搜索结果，将返回原问题`);
        return question;
    }
    else {
        formattedData = formatSearchData(searchData, question);
        console.log(`格式化后的搜索结果为：\n${formattedData}`);
        return formattedData;
    }
}
exports.compileNetwork = compileNetwork;
