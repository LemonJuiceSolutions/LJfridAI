// No-op shim. The real `server-only` package throws unconditionally so that
// importing it from a client component fails the build. Scheduler-service is
// a pure Node process (never bundled into a client), so we remap the import
// to this empty module via tsconfig paths.
export {};
