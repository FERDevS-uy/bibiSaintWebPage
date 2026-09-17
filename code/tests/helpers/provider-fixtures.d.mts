export interface MemoryClient {
  rows: Map<string, any>;
  writes: Array<{ type: string; changes: Record<string, any> }>;
  ranges: number[][];
  from(table: string): any;
}

export const fixtures: {
  transport: (url: string, ...args: unknown[]) => Promise<any>;
  client: MemoryClient;
  otherProducts: any[];
  invalidations: number;
};

export function memoryClient(initial?: any[]): MemoryClient;
