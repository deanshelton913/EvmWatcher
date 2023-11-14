export interface State {
  objExists: (path: string) => Promise<boolean>;
  getObject: (path: string) => Promise<string>;
  putObject: (path: string, body: string) => Promise<void>;
  appendObject: (path: string, body: string) => Promise<void>;
}
