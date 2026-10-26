import dayjs from 'dayjs';

/** 账户明细 / 套餐记录的创建、更新时间格式化 */
export function formatCreateOrUpdateDate(input: unknown, format = 'YYYY-MM-DD HH:mm:ss'): any[] {
  if (Array.isArray(input)) {
    return input.map((t: any) => {
      t.createdAt = t?.createdAt ? dayjs(t.createdAt).format(format) : dayjs().format(format);
      t.updatedAt = t?.updatedAt ? dayjs(t.updatedAt).format(format) : dayjs().format(format);
      return t;
    });
  } else {
    let obj: any = {};
    try {
      obj = JSON.parse(JSON.stringify(input));
    } catch (error) {}
    obj?.createdAt && (obj.createdAt = dayjs(obj.createdAt).format(format));
    obj?.updatedAt && (obj.updatedAt = dayjs(obj.updatedAt).format(format));
    return obj;
  }
}
