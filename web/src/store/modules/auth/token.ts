/**
 * 登录令牌的读写：委托身份模块（services/identity.ts，内存为准、存储只做持久化、变化时同步文件访问 cookie
 * 并递增身份代次）。保留这几个函数名，调用方与用例不必改动。
 */
export {
  currentUserToken as readUserToken,
  setUserToken as writeUserToken,
  clearUserToken,
} from '@/services/identity'
