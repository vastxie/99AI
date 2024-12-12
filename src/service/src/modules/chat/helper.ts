/**
 * @desc 处理不同模型返回的最后一次汇总内容 输出为相同格式  方便后面使用
 * @param keyType 模型key类型
 * @param response 模型返回的整体内容
 */
export function unifiedFormattingResponse(keyType, response, others) {
  let formatRes = {
    keyType, // 模型类型
    parentMessageId: '', // 父级对话id
    text: '', //本次回复内容
    usage: {
      prompt_tokens: 0, //提问token
      completion_tokens: 0, // 回答token
      total_tokens: 0, // 总消耗token
    }
  }
  /* openai */
  // if([1].includes(Number(keyType))){
  const { parentMessageId } = response?.detail
  let { usage } = response?.detail
  if (!usage) {
    usage = {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0
    }
  }
  const { prompt_tokens, completion_tokens, total_tokens } = usage
  formatRes = {
    keyType,
    parentMessageId,
    text: response.text,
    usage: {
      prompt_tokens,
      completion_tokens,
      total_tokens
    }
  }
  // }

  /* 百度 */
  // if([2, 3].includes(Number(keyType))) {
  //   const { usage, text } = response
  //   const { prompt_tokens, completion_tokens, total_tokens } = usage
  //   const { model, parentMessageId } = others
  //   formatRes = {
  //     keyType,
  //     model,
  //     parentMessageId,
  //     text,
  //     usage: {
  //       prompt_tokens,
  //       completion_tokens,
  //       total_tokens
  //     }
  //   }
  // }

  return formatRes;
}

/*百度的模型不允许传入偶数的message数组  让round为奇数的时候 加一 */
export function addOneIfOdd(num) {
  if (num % 2 !== 0) {
    return num + 1;
  } else {
    return num;
  }
}
