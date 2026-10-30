import { Client } from "@src/shared/utils/crossContextCommunication/client";
import { ResponseBody } from '@src/shared/utils/types'

const client = new Client(process.env.CONTENT_SCRIPT_URL)
let localTransport: (method: string, data?: any) => Promise<any>

// Generic forms run in the isolated extension context: no answer data crosses
// page-visible CustomEvents. The existing ATS adapters retain their bridge.
export function setLocalTransport(transport: typeof localTransport) {
  localTransport = transport
}

export const contentScriptAPI = {
  async send<T = any>(method: string, data?: any): Promise<ResponseBody<T>> {
    if (!localTransport) return client.send<T>(method, data)
    try { return { ok: true, data: await localTransport(method, data) } }
    catch { return { ok: false } }
  },
}
