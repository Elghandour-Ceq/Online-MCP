import { UserContent } from "./types"

export function recursivelyMakeClineRequests(
    this: any, 
    userContent: UserContent, 
    includeFileDetails?: boolean
): Promise<boolean>

export function attemptApiRequest(
    this: any, 
    previousApiReqIndex: number
): AsyncGenerator<any, void, unknown>
