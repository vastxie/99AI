export interface MineApp {
  userId: number
  catId: number
  appId: number
  public: boolean
  status: number
  demoData: string
  order: number
  appDes: string
  preset: string
  appRole: string
  coverImg: string
  appName: string
  loading?: boolean
}

export interface AppStoreState {
  catId: number
  mineApps: MineApp[]
}
