/**
 * 扩展包开关：读取 `VITE_<包名>_ENABLED`。只有显式写成 false（不区分大小写、忽略首尾空白）才关闭，
 * 未配置 / 空串 / 其他任何取值都视为开启。
 *
 * 调用处必须把 `import.meta.env.VITE_XXX` 的静态字面引用直接传进来（Vite 只替换静态引用），
 * 不要把变量名当字符串传进来再动态读取。
 */
export function packEnabled(flag: string | boolean | undefined): boolean {
  return (
    String(flag ?? 'true')
      .trim()
      .toLowerCase() !== 'false'
  );
}
