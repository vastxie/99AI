/**
 * 筛选栏只管自己声明的字段：草稿、应用、重置与移除标签发出的值都只含字段键。
 * 页面用 Object.assign 合并，关键词、页码与页面自管的键（如钻取带入的 userId、fileId）不会被旧值写回或清掉。
 */
interface FieldLike {
  key: string;
  type?: string;
}

/** 字段的空值：日期范围是 null，其余是空串 */
export function emptyFieldValue(type?: string): '' | null {
  return type === 'date-range' ? null : '';
}

/** 全部字段的重置值 */
export function resetFieldValues(fields: FieldLike[]): Record<string, '' | null> {
  const values: Record<string, '' | null> = {};
  for (const field of fields) values[field.key] = emptyFieldValue(field.type);
  return values;
}

/** 从页面的筛选对象里取出字段键（打开面板时的草稿） */
export function pickFieldValues(
  fields: FieldLike[],
  source: Record<string, unknown>,
): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const field of fields) values[field.key] = source[field.key];
  return values;
}

/** 有没有选值（空串、null、undefined、空数组都算没选） */
export function isActiveFilterValue(value: unknown) {
  return (
    value !== '' &&
    value !== null &&
    value !== undefined &&
    !(Array.isArray(value) && !value.length)
  );
}
