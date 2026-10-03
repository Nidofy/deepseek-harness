import type {Repository} from './change-review.mjs'
export function environmentRepository(path: string): Promise<unknown>
export function compareEnvironmentBranch(path: string, branch: string): Promise<unknown>
export function createEnvironmentOperations(execute: (repo: Repository,args: string[], fullAccess: boolean)=>Promise<unknown>): {
  preview(path: string, input: Record<string,unknown>): Promise<unknown>
  apply(path: string, token: string): Promise<unknown>
}
