import { ensureMockModel } from './api'

export default async function globalSetup() {
  await ensureMockModel()
}
