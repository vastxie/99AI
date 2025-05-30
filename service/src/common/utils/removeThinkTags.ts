/**
 * 删除以 <think> 开头到 </think> 之间的内容
 * @param content - 需要处理的内容
 * @returns 处理后的内容
 */
export function removeThinkTags(content: any) {
  // 如果 content 为 null 或 undefined，直接返回原值
  if (content === null || content === undefined) {
    return content;
  }

  if (Array.isArray(content)) {
    // 如果是数组，遍历其中的每个元素，处理其中的文本内容
    return content.map(item => {
      if (item && item.type === 'text' && typeof item.text === 'string') {
        // 对文本内容进行<think>标签处理
        item.text = item.text.replace(/<think>[\s\S]*?<\/think>/g, '');
      }
      return item;
    });
  }

  // 如果是普通文本，直接删除<think>标签
  if (typeof content === 'string') {
    return content.replace(/<think>[\s\S]*?<\/think>/g, '');
  }

  // 如果既不是数组也不是字符串，原样返回
  return content;
}
