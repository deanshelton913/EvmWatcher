/**
 *
 * @param  {any} stream
 * @return {whaotever}
 */
export const streamToString = (stream: any): Promise<string> =>
  new Promise((resolve, reject) => {
    const chunks: any = [];
    stream.on('data', (chunk: any) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });

export interface Histories {
  [key: string]: HistoryObject[];
}

export interface HistoryObject {
  amount: string;
  mode: 'IN' | 'OUT';
  address: string;
  tx: string;
}
