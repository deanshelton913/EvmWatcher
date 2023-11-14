import { EventFilter } from 'ethers';
import { WorkerState } from './interfaces';
import { EvmWatcher } from './EthWatcher';

const TOPIC_TRANSFER_1155 = '0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62';
const SOME_ETH_CONTRACT_I_CARE_ABOUT = '0xd233cd3258bb148dff63895609296d16beca9e8b';

const eventFilter = { address: SOME_ETH_CONTRACT_I_CARE_ABOUT, topics: [TOPIC_TRANSFER_1155, null, null] } as EventFilter;

// This is an example of state for your system.
// In this example, we are using an in memory state
const localStateObject: WorkerState = {};

// To make sure your traversal thru the blockchain is fault tolerant, you must save the last we processed.
// This little object is all you need. It can get and set the lastBlockProcessed however you like, postgres, redis, disk... etc
const dao = {
  // DAO stands for Data Access Object.
  getWorkerState: async ({ startBlock, endBlock }: { startBlock: number; endBlock: number }) => {
    // ... query postgres, read form disk, whatever...
    // As an example, we will just return the in-memory state.
    return localStateObject;
  },
  setLastBlockProcessed: async (lastBlock: number) => {
    // This method will write to state.
    localStateObject.lastBlockProcessed = lastBlock;
    return undefined;
  },
};
if(!process.env.RPC_ENDPOINT) throw new Error('Missing RPC_ENDPOINT')
const watcher = new EvmWatcher({
  dao,
  initialParams: { startBlock: 2239115, endBlock: 6909379, maxLogBatchSize: 10000 },
  sleepTime: 5000,
  url: process.env.RPC_ENDPOINT,
  useWebSockets: false,
  buffer: 1,
  onError:(e: Error) => {
    console.log('ERROR!', e);
  },
});

watcher.onLogEvent(eventFilter, async (log, isNewBlock) => {
  if (isNewBlock) {
    console.log('NEW BLOCK!'), log.blockNumber;
  }
  console.log('EVENT FOUND', log);
});
