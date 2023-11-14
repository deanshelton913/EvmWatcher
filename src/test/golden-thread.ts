import { expect } from 'chai';
import { createSandbox } from 'sinon';
import { WorkerState } from '../interfaces';
import * as EVMWatcher from '../EthWatcher';

const TOPIC_TRANSFER_721_OR_20 = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const TOPIC_TRANSFER_1155 = '0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62';
const TOPIC_TRANSFER_BATCH_1155 = '0x4a39dc06d4c0dbc64b70af90fd698a233a518aa5d07e595d983b8c0526c8f7fb';

const topics = [[TOPIC_TRANSFER_BATCH_1155, TOPIC_TRANSFER_1155, TOPIC_TRANSFER_721_OR_20]];
const eventFilter = { topics };

const testState: WorkerState = { startBlock: 0 };
const dao = {
  getWorkerState: async ({ startBlock, endBlock }: { startBlock: number; endBlock: number }) => {
    return testState;
  },
  setLastBlockProcessed: async (lastBlock: number) => {
    testState.lastBlockProcessed = lastBlock;
  },
};

const sandbox = createSandbox();

const provider = {
  getBlockNumber: sandbox.stub(),
  getLogs: sandbox.stub(),
  send: sandbox.stub()
};

describe('EVM Watcher', () => {
  beforeEach(() => {
    sandbox.stub(EVMWatcher, 'getProvider').returns(provider as any);
  });
  afterEach(() => {
    sandbox.restore();
  });
  describe('When start/end initial params are used', () => {
    it('counts correctly', async () => {
      provider.getBlockNumber.resolves(100);
      provider.send.resolves([
        {
          transactionIndex: 0,
          blockNumber: 352721,
          transactionHash: '0xe769162ab7e94cbe99ee3a8d8178039452af06428a9d54153d302c9809bb22a5',
          address: '0x8aB5919faD5C55FAf73342F52C5BAa4dfe1be760',
          topics: [
            '0x4a39dc06d4c0dbc64b70af90fd698a233a518aa5d07e595d983b8c0526c8f7fb',
            '0x0000000000000000000000001b75a72a65622d60472fec1b11ae522be6631771',
            '0x0000000000000000000000000000000000000000000000000000000000000000',
            '0x0000000000000000000000001b75a72a65622d60472fec1b11ae522be6631771',
          ],
          // eslint-disable-next-line max-len
          data: '0x000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000001a0000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000050000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000700000000000000000000000000000000000000000000000000000000000000080000000000000000000000000000000000000000000000000000000000000009000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000050000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000700000000000000000000000000000000000000000000000000000000000000080000000000000000000000000000000000000000000000000000000000000009000000000000000000000000000000000000000000000000000000000000000a',
          logIndex: 0,
          blockHash: '0xef55141a07546593a912b4f46e61b0b0b5b55f309110b1bd1a713348ff731ffb',
        },
      ]);
      const maxLogBatchSize = Math.floor(Math.random() * 100) + 1; // rand between 1-100
      const watcher = new EVMWatcher.EvmWatcher({
        dao,
        initialParams: { startBlock: 0, endBlock: 100, maxLogBatchSize },
        sleepTime: 5000,
        url: '<RPC_URL>',
        useWebSockets: false,
        onComplete: () => {},
      });
      await watcher.onLogEvent(eventFilter, async (log: any, isNewBlock: any) => {
        if (isNewBlock) console.log('NEW BLOCK!');
        return undefined;
      });
      expect(testState.lastBlockProcessed).equal(100);
      const getLogsCalls = provider.getLogs.getCalls();
      getLogsCalls.forEach((_, index) => {
        expect(getLogsCalls[index].args[0]).to.deep.equals({
          fromBlock: index * maxLogBatchSize,
          toBlock: Math.min((index + 1) * maxLogBatchSize - 1, 100),
          topics: [
            [
              '0x4a39dc06d4c0dbc64b70af90fd698a233a518aa5d07e595d983b8c0526c8f7fb',
              '0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62',
              '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
            ],
          ],
        });
      });
    });
  });
});
