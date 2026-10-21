// The `spec2skill` command (built to dist-cli/spec2skill.mjs by `pnpm build:cli`, D24).
import { run } from './main';

run(process.argv.slice(2), {
  fetch: (input, init) => fetch(input, init),
  cwd: process.cwd(),
  out: (line) => console.log(line),
  err: (line) => console.error(line),
}).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(`spec2skill: unexpected error: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 3;
  },
);
