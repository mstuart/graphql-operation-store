export interface OperationRecord {
  document: string;
  hash: string;
  name?: string;
}

export interface OperationManifest {
  operations: OperationRecord[];
  version: 1;
}

export interface Storage {
  get: (hash: string) => Promise<string | null>;
  has: (hash: string) => Promise<boolean>;
  set: (hash: string, document: string) => Promise<void>;
}
