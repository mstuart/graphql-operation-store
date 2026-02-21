export interface OperationRecord {
  hash: string;
  name?: string;
  document: string;
}

export interface OperationManifest {
  version: 1;
  operations: OperationRecord[];
}

export interface Storage {
  get(hash: string): Promise<string | null>;
  set(hash: string, document: string): Promise<void>;
  has(hash: string): Promise<boolean>;
}
