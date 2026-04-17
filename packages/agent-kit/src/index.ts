// Sandbox — isolated copy-on-write forks for parallel agent work
export { createSandbox, teardownSandbox } from './sandbox';
export type {
  CreateSandboxOptions,
  Sandbox,
  SandboxFork,
  TeardownSandboxOptions,
} from './sandbox';

// Workspace — single-agent working area with optional TTL and credentials
export { createWorkspace, teardownWorkspace } from './workspace';
export type {
  CreateWorkspaceOptions,
  Workspace,
  TeardownWorkspaceOptions,
} from './workspace';

// Checkpoint — snapshot-based state management and restore via forks
export { checkpoint, restore, listCheckpoints } from './checkpoint';
export type {
  CheckpointOptions,
  Checkpoint,
  RestoreOptions,
  RestoreResult,
  ListCheckpointsOptions,
  ListCheckpointsResponse,
} from './checkpoint';

// Coordination — event-driven multi-agent pipelines via bucket notifications
export { setupCoordination, teardownCoordination } from './coordination';
export type {
  SetupCoordinationOptions,
  TeardownCoordinationOptions,
} from './coordination';

// Config
export type { TigrisAgentKitConfig } from './config';
