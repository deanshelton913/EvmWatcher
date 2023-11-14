import { S3 } from "../data-access/s3";
import { Disk } from "../data-access/disk";
import { HistoryObject } from "../util/stream";
import { State } from "../data-access";

/**
 *
 */
let STATE: State;

/**
 *
 * @param {string} address
 * @param {string} newHistory
 * @return {whocares}
 */
async function appendHistory(address: string, newHistory: HistoryObject[]) {
  const newLines = newHistory
    .map((h) => `${h.mode};${h.tx};${h.amount};${h.address}`)
    .join("\n");
  await STATE.appendObject(`history/${address}`, newLines + "\n");
}

/**
 *
 * @param {whocares} address
 * @param {whocares} history
 * @return {whocares}
 */
async function writeHistory(address: string, history: any) {
  return await STATE.putObject(
    `history/${address}`,
    JSON.stringify(history, null, 2)
  );
}

/**
 *
 * @param {string} key
 * @return {HistoryObject}
 */
async function getHistory(key: string) {
  try {
    const str = await STATE.getObject(`history/${key}`);
    return JSON.parse(str) as HistoryObject[];
  } catch (e) {
    // TODO, json parse err should fail diff.
    console.log("NO history yet, defaulting to empty array.");
    return [];
  }
}

/**
 *
 */
async function getLatestBlock() {
  try {
    const str = await STATE.getObject("LAST_BLOCK");
    return Number(str);
  } catch (e) {
    return 0;
  }
}

/**
 *
 * @param {string} block
 * @return  {void}
 */
async function setLastBlock(block: string) {
  try {
    await STATE.putObject("LAST_BLOCK", block);
  } catch (e) {
    console.error("There was a problem setting last block");
    throw new Error("Unable to set block.");
  }
}
/**
 *
 * @param {string} bucket
 * @return {string}
 */
export function getS3Client({ bucket }: { bucket?: string } = {}) {
  if (!bucket) throw Error("PARAM ERROR. Missing bucket name.");
  STATE = new S3({ Bucket: bucket });
  return {
    appendHistory,
    writeHistory,
    getHistory,
    getLatestBlock,
    setLastBlock,
  };
}

/**
 *
 * @param {string} basePath
 * @return {string}
 */
export function getDiskClient({ basePath }: { basePath: string }) {
  STATE = new Disk({ basePath });
  return {
    appendHistory,
    writeHistory,
    getHistory,
    getLatestBlock,
    setLastBlock,
  };
}
