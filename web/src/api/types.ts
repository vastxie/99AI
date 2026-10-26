export interface ResData<T = any> {
  success: boolean
  message: string | null
  data: T
}
