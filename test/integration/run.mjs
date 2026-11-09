// Runs the integration suite (suite.cjs) inside a real VS Code, downloaded once into .vscode-test/, with this folder as the
// extension under development. `npm run test:vscode` (on Linux without a display, under xvfb-run).
import { runTests } from "@vscode/test-electron";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
await runTests({
  extensionDevelopmentPath: root,
  extensionTestsPath: join(root, "test", "integration", "suite.cjs"),
  launchArgs: [join(root, "test", "integration", "workspace"), "--disable-extensions", "--disable-gpu", "--no-sandbox"],
});
