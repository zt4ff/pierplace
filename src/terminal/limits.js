export const HOME = "/home/learner";
export const HARD_TIMEOUT_MS = 5_000;
export const OUTPUT_LIMIT_BYTES = 32_000;
export const COMMAND_LIMIT_BYTES = 32_000;

// Engine budgets are cooperative; the controller's worker deadline is authoritative.
export const EXECUTION_LIMITS = Object.freeze({
  maxSourceBytes: COMMAND_LIMIT_BYTES + 128, // Reserve space for the internal help function.
  maxOutputSize: OUTPUT_LIMIT_BYTES,
  maxExecutionTimeMs: 4_500,
  maxCommandCount: 2_000,
  maxLoopIterations: 2_000,
  maxAwkIterations: 10_000,
  maxSedIterations: 10_000,
  maxJqIterations: 10_000,
  maxWorkUnits: 100_000,
  maxCallDepth: 32,
  maxExecDepth: 16,
  maxSourceDepth: 16,
  maxSubstitutionDepth: 16,
  maxStringLength: 256_000,
  maxHeredocSize: COMMAND_LIMIT_BYTES,
  maxArrayElements: 10_000,
  maxBraceExpansionResults: 1_000,
  maxGlobOperations: 10_000,
  maxTraversalEntries: 10_000,
  maxTraversalDepth: 64,
  maxTraversalWork: 20_000,
  maxFileSystemBytes: 4_000_000,
  maxInputBytes: 1_000_000,
  maxLiveBytes: 8_000_000,
  maxFileDescriptors: 64,
});
