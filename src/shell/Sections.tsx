// The page below the result frame (docs/redesign/DESIGN.md 4.4-4.7): Command line, How it works,
// Made by GeekPlux and the footer. Copy as in docs/redesign/target/V2Home.
import { useAnnounce } from '../a11y/Announcer';
import { COPY_ICON, checkIcon } from '../design/icons';
import { Swap } from '../design/motion';
import { Wordmark } from '../design/Logo';
import { useFlash } from '../result/useFlash';
import { REPO, onInPage } from './Header';

export const CLI_COMMANDS = [
  'git clone https://github.com/geekplux/spec2skill',
  'cd spec2skill && pnpm install',
  'pnpm cli openapi.yaml --out .claude/skills',
];


const STEPS = [
  ['Parse', 'OpenAPI 3.0 and 3.1, Swagger 2.0 and MCP tool lists become one model, in your browser.'],
  ['Relate', 'Outputs that match inputs, nested paths and shared schemas become links, each exact or inferred.'],
  ['Write and audit', 'SKILL.md, a tested kit, references, examples, evals and CI, audited before you download.'],
  ['Check', 'The map shows every operation and link, so you can see what the skill teaches your agent.'],
] as const;

const PROJECTS = [
  ['Vert', 'https://vert.geekplux.com', 'Turn a GPX track into a terrain poster'],
  ['Explorable', 'https://explorable.geekplux.com', 'Turn a paper into an interactive essay'],
  ['Reasontrail', 'https://reasontrail.geekplux.com', 'See how your coding agent got there'],
  ['markvis', 'https://github.com/geekplux/markvis', 'Charts written in Markdown'],
] as const;

export function CommandLine() {
  const announce = useAnnounce();
  const [copied, flashCopied] = useFlash();
  const copy = () => navigator.clipboard.writeText(CLI_COMMANDS.join('\n'))
    .then(() => (flashCopied(), announce('Commands copied.')), () => announce('Copy failed: select the commands and copy them.'));
  return (
    <section className="block" id="cli" tabIndex={-1} aria-labelledby="cli-title">
      <div className="wrap two">
        <div>
          <h2 id="cli-title">Run it from the command line</h2>
          <p className="muted">Writes the skill to disk and ends with its audit. Works offline, with no key.</p>
        </div>
        <div className="cli">
          <pre><code>{CLI_COMMANDS.map((c) => <span key={c} className="cli-line"><span className="cli-p" aria-hidden="true">$ </span>{c}</span>)}</code></pre>
          {/* Copied: a check for 2 s, fading in (DESIGN.md 7), as the preview's copy button. */}
          <button type="button" className="icon-btn" aria-label={copied ? 'Commands copied' : 'Copy commands'} onClick={copy}>
            <Swap id={String(copied)}>{copied ? checkIcon(16) : COPY_ICON}</Swap>
          </button>
        </div>
      </div>
    </section>
  );
}

export function HowItWorks() {
  return (
    <section className="block" id="how" tabIndex={-1} aria-labelledby="how-title">
      <div className="wrap">
        <h2 id="how-title">How it works</h2>
        <ol className="how">
          {STEPS.map(([title, text]) => <li key={title}><b>{title}</b><p>{text}</p></li>)}
        </ol>
      </div>
    </section>
  );
}

export function MadeBy() {
  return (
    <section className="made" aria-labelledby="made-title">
      <div className="wrap">
        <div className="made-in two">
          <div>
            <h2 id="made-title">Made by GeekPlux</h2>
            <p className="muted">Writing, projects and data visualization</p>
            <a className="mono ul" href="https://geekplux.com">geekplux.com</a>
          </div>
          <ul className="projects">
            {PROJECTS.map(([name, href, text]) => (
              <li key={name}>
                <a href={href}>
                  <b>{name}</b>
                  <span className="project-text">{text}</span>
                  <code>{href.replace(/^https:\/\//, '')}</code>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

export function Footer({ onShortcuts }: { onShortcuts: () => void }) {
  return (
    <footer className="foot">
      <div className="wrap">
        <div className="foot-in">
          <a href="/" className="brand"><Wordmark /></a>
          <nav className="nav foot-nav" aria-label="Footer">
            <a href="#how" onClick={onInPage}>How it works</a>
            <a href={REPO}>GitHub</a>
            <button type="button" onClick={onShortcuts}>Keyboard shortcuts</button>
            <a href={`${REPO}/blob/main/LICENSE`}>MIT licence</a>
          </nav>
        </div>
        {/* Matches DAILY_AI_CAP and the rate limits in wrangler.jsonc: they keep the free demo's bill bounded. */}
        <p className="foot-note muted">AI names are capped per day site-wide, and fetching is rate-limited; samples and the deterministic skill always work.</p>
      </div>
    </footer>
  );
}
