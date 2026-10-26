/** 下拉 / 筛选用的选项：value 是数字或字符串枚举值 */
export interface Option<V extends string | number = string | number> {
  value: V;
  label: string;
}

type Widen<V> = V extends number ? number : V extends string ? string : never;

/** 由选项数组派生的 value → label 映射类型：保留字面量键，keyof 仍是具体取值 */
export type OptionMap<T extends readonly Option[]> = { [O in T[number] as O['value']]: string };

/** 由选项数组派生 value → label 映射 */
export function toOptionMap<const T extends readonly Option[]>(options: T): OptionMap<T> {
  const map: Record<string | number, string> = {};
  for (const option of options) map[option.value] = option.label;
  return map as OptionMap<T>;
}

/**
 * 选项单源：一次声明，同时得到下拉用的 options（可变数组，value 放宽为 number / string）
 * 与展示用的 map（字面量键），不再把同一组数据手写成数组和映射两份。
 */
export function defineOptions<const T extends readonly Option[]>(options: T) {
  return {
    options: [...options] as Option<Widen<T[number]['value']>>[],
    map: toOptionMap(options),
  };
}
