export interface WorkerState {
  startBlock?: number;
  endBlock?: number;
  maxLogBatchSize?: number;
  lastBlockProcessed?: number;
}

export interface DataAccessObject {
  /**
   *
   * @param {number} param.startBlock (inclusive) The block number at which to start traversal.
   * @param {number} param.endBlock (optional) (inclusive) The block number at which to stop traversal. If undefined, it will run forever.
   * @returns {Promise<WorkerState>} The worker state
   */
  getWorkerState({
    startBlock,
    endBlock,
  }: {
    startBlock: number;
    endBlock?: number;
  }): Promise<WorkerState>;
  /**
   *
   * @param blockNumber The last successfully processed block.
   */
  setLastBlockProcessed(blockNumber: number): Promise<void | undefined>;
}
