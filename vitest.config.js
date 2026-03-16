import { defineConfig } from "vitest/config";
import { getClarinetVitestsArgv, vitestSetupFilePath } from "@stacks/clarinet-sdk/vitest";

export default defineConfig({
  test: {
    environment: "clarinet",
    environmentOptions: {
      clarinet: getClarinetVitestsArgv(),
    },
    include: ["tests/**/*.test.ts"],
    setupFiles: [vitestSetupFilePath],
  },
});
