declare module '*.yaml' {
  const content: string;
  export default content;
}

// Global JSON mode flag set by CLI core when --json or --format=json is used
// eslint-disable-next-line no-var
declare var __TIGRIS_JSON_MODE: boolean | undefined;
