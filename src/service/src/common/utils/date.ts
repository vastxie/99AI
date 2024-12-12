import * as dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import * as a from 'dayjs/plugin/utc';
import * as b from 'dayjs/plugin/timezone';

dayjs.locale('zh-cn');
dayjs.extend(a);
dayjs.extend(b);
dayjs.tz.setDefault('Asia/Shanghai');

export function formatDate(date: string | number | Date, format = 'YYYY-MM-DD HH:mm:ss'): string {
  return dayjs(date).format(format);
}

export function formatCreateOrUpdateDate(input, format = 'YYYY-MM-DD HH:mm:ss'): any[] {
  if (Array.isArray(input)) {
    return input.map((t: any) => {
      t.createdAt = t?.createdAt ? dayjs(t.createdAt).format(format) : dayjs().format(format);
      t.updatedAt = t?.updatedAt ? dayjs(t.updatedAt).format(format) : dayjs().format(format);
      return t;
    });
  } else {
    let obj: any = {}
   try {
    obj = JSON.parse(JSON.stringify(input));
   } catch (error) {
    
   }
    obj?.createdAt && (obj.createdAt = dayjs(obj.createdAt).format(format));
    obj?.updatedAt && (obj.updatedAt = dayjs(obj.updatedAt).format(format));
    return obj;
  }
}

export function isExpired(createdAt: Date, days: number): boolean {
  const expireDate = new Date(createdAt.getTime() + days * 24 * 60 * 60 * 1000);
  const now = new Date();
  return now > expireDate;
}

export default dayjs;
