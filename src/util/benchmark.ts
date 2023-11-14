let count = 0;
let average = 0;
let averageSum = 0;
let changes: number[] = [];
let t0: [number, number];
let _blockNumber = 0;
let resetTimer = false;

/**
 * reset
 */
export function resetBenchmark() {
  changes = [];
}
/**
 * @description Average the benchmarking data of a number of subsequent requests by ID,
 * logging 'info' benchmark data every time the ID changes.
 * @param {number} blockNumber The id by which a group of benchmarks will be averaged.
 * @param {Function} fn<T>
 * @return {T}
 */
export async function benchmarkGroupAverage(blockNumber: number, fn: Function) {
  // For every case after the base-case we will need to trust the `resetTimer` flag before resetting.
  if (changes.length === 1 && resetTimer) {
    t0 = process.hrtime();
    resetTimer = false;
  }

  // This block happens every time a NEW id is passed (i.e.:differing from the previous.)
  if (_blockNumber !== blockNumber) {
    _blockNumber = blockNumber;
    changes.push(blockNumber);

    // The base-case happens here, when the method is called for the first time.
    // Every subsequent call will have a changes.length of 2, but the first call will have a length of 1.
    if (changes.length === 1) {
      t0 = process.hrtime();
      await fn(true, 0, 0);
      return { average: 0, blockNumber, ms: 0 };
    }
  }

  // When the `changes` array reaches a length of 2, we know we are done processing for the previous ID.
  // This is where we calculate the totals.
  if (changes.length === 2) {
    const t1 = process.hrtime(t0);
    const ms = (t1[0] * 1000000000 + t1[1]) / 1000000;
    averageSum += ms;
    count += 1; // Don't divide by 0! :P
    average = averageSum / count;
    changes.shift();
    resetTimer = true;
    await fn(true, average, ms);
    return { average, blockNumber, ms };
  } else {
    const t1 = process.hrtime(t0);
    const ms = (t1[0] * 1000000000 + t1[1]) / 1000000;
    await fn(false);
    return { average, blockNumber, ms };
  }
}
