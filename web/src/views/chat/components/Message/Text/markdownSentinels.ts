// 渲染管线为 html:false，标记只能以哨兵字符传递，再由 MarkdownVNodeRenderer 还原成真实节点。
// 使用 Unicode 私有区字符，正常内容不会出现。
export const MARKDOWN_SENTINEL = {
  strongOpen: '\uE000',
  strongClose: '\uE001',
  reference: '\uE002',
  pendingMathOpen: '\uE003',
  pendingMathClose: '\uE004',
} as const
