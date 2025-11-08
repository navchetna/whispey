// Stub supabase client for legacy components
// TODO: Refactor components to use API routes instead

const createStubQueryBuilder = () => {
  const methods = {
    from: (table: string) => methods,
    select: (columns?: string) => methods,
    eq: (column: string, value: any) => methods,
    gte: (column: string, value: any) => methods,
    lte: (column: string, value: any) => methods,
    not: (column: string, op: string, value: any) => methods,
    limit: (count: number) => methods,
    single: () => methods,
    order: (column: string, options?: any) => methods,
    then: (resolve: any) => {
      // Return empty result
      resolve({ data: [], error: new Error('Legacy Supabase queries not supported. Please use API routes.') })
    }
  }
  return methods
}

export const supabase = {
  from: (table: string) => createStubQueryBuilder().from(table),
  rpc: (func: string, params?: any) => {
    return Promise.resolve({ data: null, error: new Error('RPC calls not supported. Please use API routes.') })
  }
}
