import { ethers, providers } from 'ethers';
import { benchmarkGroupAverage, resetBenchmark } from './util/benchmark';
import winston from 'winston';
import logger from './util/logger';
import { DataAccessObject, WorkerState } from './interfaces';

/**
 *
 * @param {SupportedNetworks} network
 * @param {boolean} useWebsocket
 * @return {providers.WebSocketProvider|providers.JsonRpcProvider}
 */
export const getProvider = (url: string, useWebsocket: boolean): providers.WebSocketProvider | providers.JsonRpcProvider => {
  logger.info(`NETWORK: ${url}`);

  if (useWebsocket) {
    return new providers.WebSocketProvider(url);
  }
  return new providers.JsonRpcProvider(url);
};
/**
 * EvmWatcher
 * Great for when you need to hunt thru the blockchain for a specific event,
 * Eth Watcher is a class which can be used to track an EVM blockchain's log events in a failsafe and serial way.
 * It's a "bring your own state" sort of module, where you can just pass in an object which implements a common interface to update
 * lastBlock, and other data.
 *
 * Check out the detailed documentation for examples, and deeper explanations. Happy hacking.
 */
export class EvmWatcher {
  private dao: DataAccessObject;
  public initialParams?: WorkerState;
  private logger: winston.Logger;
  private lastBlockProcessed = 0;
  private sleepTime: number;
  private nextStartBlock?: number;
  private provider: ethers.providers.WebSocketProvider | ethers.providers.JsonRpcProvider;
  private timer?: NodeJS.Timeout;
  private useWebSockets: boolean;
  private onError: (err: Error) => any;
  private onComplete: () => any;
  private buffer: number;

  /**
   *
   * @param {DataAccessObject} param.dao (required) The data access object used for state management.
   * @param {WorkerState} param.initialParams (required) Initial params for this process.
   * @param {winston.Logger} param.customLogger (optional) default logger. Initial params for this process.
   * @param {number} param.sleepTime Optional. Default = 30000 (30 seconds). Number of Ms to sleep after we catch up to the latest block.
   * @param {SupportedNetwork} param.network Optional. Default = 1. aka: ETHEREUM_MAINNET.
   */
  constructor({
    dao,
    initialParams,
    customLogger,
    sleepTime = 30000,
    onError = () => {},
    onComplete = () => {},
    url,
    useWebSockets = false,
    buffer = 0,
  }: {
    initialParams?: WorkerState;
    customLogger?: winston.Logger;
    dao: DataAccessObject;
    onError?: (Err: Error) => any;
    onComplete?: () => any;
    sleepTime?: number;
    url: string;
    useWebSockets?: boolean;
    buffer?: number;
  }) {
    if (this.initialParams?.maxLogBatchSize && this.initialParams?.maxLogBatchSize < 1) throw new Error('ParameterError: maxLogBatchSize must be greater than 0.');
    this.dao = dao;
    this.initialParams = initialParams;
    this.logger = customLogger || logger;
    this.sleepTime = sleepTime;
    this.nextStartBlock = undefined;
    this.provider = getProvider(url, useWebSockets);
    this.onError = onError;
    this.onComplete = onComplete;
    this.useWebSockets = useWebSockets;
    if (buffer < 0) throw new Error('ParameterError: Buffer must be greater than 0.');
    this.buffer = buffer;
    if (useWebSockets) {
      keepAlive({
        provider: this.provider as ethers.providers.WebSocketProvider,
        onDisconnect: async (err) => {
          this.logger.error('The ws connection was closed', JSON.stringify(err, null, 2));
          (this.provider as ethers.providers.WebSocketProvider).destroy();
          process.exit(2);
        },
      });
    }
  }

  /**
   * @param {number} ms ms to sleep.
   * @return {void} void
   */
  private async sleep(ms: number) {
    return new Promise((res) => {
      this.logger.info(`Reached latestBlock. Sleeping for ${ms}ms.`);
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(res, ms);
    });
  }

  /**
   *
   * @param {ethers.EventFilter} eventFilter
   * @param {Function} logProcessingFunction
   * @return {void} void
   */
  public async onLogEvent(eventFilter: ethers.EventFilter, logProcessingFunction: (log: ethers.providers.Log, isNewBlock: Boolean) => Promise<void>) {
    try {
      while (true) {
        if (this.timer) clearTimeout(this.timer);
        await this.loop(eventFilter, logProcessingFunction);
        if (this.initialParams?.endBlock) {
          if (this.useWebSockets) await (this.provider as ethers.providers.WebSocketProvider).destroy();
          this.logger.info('DONE');
          await this.onComplete();
          return;
        }
        await this.sleep(this.sleepTime);
      }
    } catch (e) {
      this.logger.error(`ERROR: ${e.message}`);
      if (this.useWebSockets) await (this.provider as ethers.providers.WebSocketProvider).destroy();
      return await this.onError(e);
    }
  }

  /**
   *
   * @param {ethers.EventFilter} eventFilter
   * @param {Function} logProcessingFunction
   * @return {void} void
   */
  public async loop(eventFilter: ethers.EventFilter, logProcessingFunction: (log: ethers.providers.Log, isNewBlock: Boolean) => Promise<void>) {
    logger.verbose('--- new loop ---');
    const evmLastBlock = await this.provider.getBlockNumber();
    const evmLastBlockWithBuffer = evmLastBlock - this.buffer;
    this.logger.info(`Latest EVM Block: ${evmLastBlock}`);
    if (this.buffer) this.logger.info(`Latest EVM Block with buffer=${this.buffer}: ${evmLastBlockWithBuffer}`);
    let startBlock = Number(this.nextStartBlock || (this.initialParams?.startBlock === 0 ? '0' : this.initialParams?.startBlock) || evmLastBlockWithBuffer);
    const workerState = await this.dao.getWorkerState({ startBlock: startBlock, endBlock: this.initialParams?.endBlock });
    const endBlock = this.initialParams?.endBlock !== undefined ? this.initialParams?.endBlock : evmLastBlockWithBuffer;

    if (!this.nextStartBlock && workerState && workerState.lastBlockProcessed && workerState.lastBlockProcessed !== startBlock) {
      this.logger.info(`Fast-forwarding to last processed block: ${workerState.lastBlockProcessed}.`);
      startBlock = workerState.lastBlockProcessed + 1;
    }

    let logSpanEnd;
    if (this.lastBlockProcessed === evmLastBlockWithBuffer) {
      this.logger.info(`No new blocks.`);
      return; // Exit the loop if we are at the head of the blockchain.
    }

    while (startBlock <= endBlock) {
      // Calculating the end of the log-span is more complex than you might think.
      // Firstly, they are 0 based. So a log-span of 0 is possible, (aka: a log-span
      // of only 1 block.)  Additionally, regardless of a log-span request, we may have
      // fewer than "block-span" blocks left to process. We need then to take the min
      // value between the zero-based `maxLogBatchSize` and `blocksLeft`.
      // To further complicate it, we need to ensure we never select a span larger
      // than the endBlock. So we need to take the min of `endBlock` and that previous
      // calculation.
      const numOfBlocksLeftOnTheBlockchain = evmLastBlockWithBuffer - startBlock;
      const zeroBasedLastBlockInitialParam = (this.initialParams?.maxLogBatchSize || 10) - 1;
      const maxRequestedBoundedByAvailableBlocks = Math.min(zeroBasedLastBlockInitialParam, numOfBlocksLeftOnTheBlockchain);
      logSpanEnd = startBlock + Math.min(maxRequestedBoundedByAvailableBlocks, zeroBasedLastBlockInitialParam);
      const zeroBasedLogSpanEnd = Math.max(startBlock, logSpanEnd);
      this.logger.info(`Requesting log span: ${startBlock}-${zeroBasedLogSpanEnd}. Span: ${zeroBasedLogSpanEnd - startBlock + 1}`);
      // removing until ethers supports a list of addresses for the address arg
      // const logs = await this.provider.getLogs({
      //   fromBlock: startBlock,
      //   toBlock: zeroBasedLogSpanEnd,
      //   ...eventFilter,
      // });

      // we need to use send('eth_getLogs', ...) because we want to filter by a list of contract addresses which is allowed in the RPC method,
      // however, ethers.js does not support a list of addresses.
      // eth_getLogs RPC method: https://www.quicknode.com/docs/ethereum/eth_getLogs
      // associated GitHub issue: https://github.com/ethers-io/ethers.js/issues/473
      const logs = await this.provider.send('eth_getLogs', [{
        fromBlock: ethers.BigNumber.from(startBlock).toHexString(),
        toBlock: ethers.BigNumber.from(zeroBasedLogSpanEnd).toHexString(),
        ...eventFilter,
      }]);
      this.nextStartBlock = logSpanEnd + 1;
      this.logger.info(`Log count: ${logs.length}.`);
      for (let i = 0; i < logs.length; i += 1) {
        const log = logs[i];
        log.blockNumber = ethers.BigNumber.from(log.blockNumber).toNumber();
        log.logIndex = ethers.BigNumber.from(log.logIndex).toNumber();
        log.transactionIndex = ethers.BigNumber.from(log.transactionIndex).toNumber();
        await benchmarkGroupAverage(log.blockNumber, async (isNewBlock: boolean, averageBlockTime: number, ms: number) => {
          if (isNewBlock) {
            if (ms) this.logger.info(`Benchmark: ${ms}. Average: ${averageBlockTime}.`);
            const lastBlockProcessed = log.blockNumber - 1;
            await this.dao.setLastBlockProcessed(lastBlockProcessed); // tell the caller.
            this.lastBlockProcessed = lastBlockProcessed; // local state.
          }
          await logProcessingFunction(log, isNewBlock);
        });
      }
      // This additional complete block is unfortunately the way to log/track the last block of the for loop.
      await this.dao.setLastBlockProcessed(zeroBasedLogSpanEnd); // tell the caller
      this.lastBlockProcessed = zeroBasedLogSpanEnd; // local state.
      startBlock += zeroBasedLogSpanEnd - startBlock + 1;
      resetBenchmark();
    }
  }
}

type KeepAliveParams = {
  provider: ethers.providers.WebSocketProvider;
  onDisconnect: (err: any) => void;
  expectedPongBack?: number;
  checkInterval?: number;
};

/**
 * This function is meant to address any intermittent socket closure events caused by
 * evil sexy saboteur clown ghosts that roam the internet. To ensure the websocket remains active,
 * we ping every 15 seconds, If we don't get a response, we let the caller re-connect, or
 * (in our case) choose to explode.
 */
export const keepAlive = ({ provider, onDisconnect, expectedPongBack = 15000, checkInterval = 7500 }: KeepAliveParams) => {
  let pingTimeout: NodeJS.Timeout | null = null;
  let keepAliveInterval: NodeJS.Timeout | null = null;

  provider._websocket.on('open', () => {
    keepAliveInterval = setInterval(() => {
      logger.verbose('Websocket PING sent.');
      provider._websocket.ping();

      // Use `WebSocket#terminate()`, which immediately destroys the connection,
      // instead of `WebSocket#close()`, which waits for the close timer.
      // Delay should be equal to the interval at which your server
      // sends out pings plus a conservative assumption of the latency.
      pingTimeout = setTimeout(() => {
        provider._websocket.terminate();
      }, expectedPongBack);
    }, checkInterval);
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  provider._websocket.on('close', (err: any) => {
    if (keepAliveInterval) clearInterval(keepAliveInterval);
    if (pingTimeout) clearTimeout(pingTimeout);
    onDisconnect(err);
  });

  provider._websocket.on('pong', () => {
    logger.verbose('Websocket PONG received.');
    if (pingTimeout) clearInterval(pingTimeout);
  });
};
