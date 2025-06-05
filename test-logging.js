// Simple test script to verify the logging system
const { createComponentLogger } = require("./src/shared/services/Logger.ts");

console.log("Testing logging system...");

// Test main process logger
const testLogger = createComponentLogger("TestComponent");

console.log("Testing different log levels:");
testLogger.debug("This is a debug message", { data: "test" });
testLogger.info("This is an info message", { user: "test-user" });
testLogger.warn("This is a warning message", { reason: "test" });
testLogger.error(
  "This is an error message",
  { error: "test-error" },
  new Error("Test error")
);
testLogger.fatal(
  "This is a fatal message",
  { critical: true },
  new Error("Critical error")
);

console.log("Logging test completed. Check log files in the logs directory.");
