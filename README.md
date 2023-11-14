# EVM Watcher

This NPM Module is a thin wrapper around ethersjs module.

This is only used to talk to ethereum nodes, and follow along in the blockchain watching for specific events.


Then install it into your project

```sh
npm install evm-watcher
```

Then import it with it's types and everything.

```typescript
import { EvmWatcher } from "evm-watcher";
```

## Examples

See the `src/example.ts` file for a working example.
Try it out by cloning this repo locally, and running:

```sh
npm install

ts-node ./src/example.ts
```

## How It Works

IMPORTANT: This module requires that you bring your own state. If you run a stateless application, it will not be able to persist important data between subsequent invocations (page-refresh, restarts, etc.) You will **need** a place for this module to keep track of the "last block processed", but should not need to worry about the minutia of using/refreshing this state.

Create some initial params to bound our ethereum "worker".

```typescript
const initialParams = {
  // startBlock (required) must be an integer > -1. No decimals, or abstract numerical values (e.g.: Infinity).
  startBlock: 12508210,
  // endBlock (optional) default = undefined, meaning: run forever.
  endBlock: undefined,
  // network (optional) default = ETHERUM_MAINNET
  network: SupportedNetwork.ETHERUM_MAINNET,
  // maxLogBatchSize (optional) default = 10
  maxLogBatchSize: 100,
};
```

Create a Data Access Object matching the expected interface, capable of reading/writing to state.

```typescript
const dao = {
  getWorkerState: async ({
    startBlock,
    endBlock,
  }: {
    startBlock: number;
    endBlock: number;
  }) => {
    // ... Do anything! :D
    // ... e.g.: query postgres, or read form S3, call your grandmother...
    // This just needs to return an object matching the interface of the WorkerState.
    return testState; // < -- replace with your data
  },
  setLastBlockProcessed: async (lastBlock: number) => {
    // Again, do whatever you need to do here, but this must write lastBlock to state, such that it is retrieved when `getWorkerState` is called.
    testState.lastBlockProcessed = lastBlock;
    return undefined;
  },
};
```

Choose an event filter.

```typescript
// This is an example of an event filter that the Aggregator uses.
const TOPIC_TRANSFER_721_OR_20 =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const TOPIC_TRANSFER_1155 =
  "0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62";
const TOPIC_TRANSFER_BATCH_1155 =
  "0x4a39dc06d4c0dbc64b70af90fd698a233a518aa5d07e595d983b8c0526c8f7fb";

const eventFilter = {
  topics: [
    [TOPIC_TRANSFER_BATCH_1155, TOPIC_TRANSFER_1155, TOPIC_TRANSFER_721_OR_20],
    null,
    null,
    null,
  ],
};
```

```typescript
// This is an example of an event filter looking for events around a single address.
const eventFilter = { address: "0xD5525D397898e5502075Ea5E830d8914f6F0affe" };
```

"Subscribe" to a stateful event stream, which will ensure you fully process a block. This is not truly pub/sub, as it's operating on promises, not Nodejs Events... but it does give you that pubby-subby feel you love so much.

```typescript
const watcher = new EvmWatcher({ dao, initialParams });

watcher.onLogEvent(eventFilter, async (log, isNewBlock) => {
  if (isNewBlock)
    console.log(
      "I should now delete transactional data for block " +
        log.blockNumber +
        "incase this is a restart."
    );
  console.log(log.transactionHash); // ... do stuff.
  return undefined;
});
```

## What if there is a failure!?

If/when your log processing function, or anything within this module fails for any reason in the middle of processing logs for a block, Errors will bubble-up, and that block will be considered "unprocessed." This means that in the event of a restart of your failed process, your onLogEvent handler may be invoked with logs from a block it has already partially processed. To ensure that you don't double-record, it's encouraged that you delete any transfer events you have recorded before recording anything for a new block (Note the second param in your callback function).
