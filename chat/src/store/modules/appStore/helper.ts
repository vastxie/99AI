export interface MineApp {
  userId: number
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
  backgroundImg?: string
  prompt?: string
}

export interface AppStoreState {
  catId: number
  mineApps: MineApp[]
}
