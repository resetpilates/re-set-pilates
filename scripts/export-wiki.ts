// Writes the Studio wiki as plain Markdown notes, ready to drop into an Obsidian vault: `bun run wiki:export`.
// The notes are made from the same text the dashboard shows (src/content/studio.ts) and the studio terms on the
// website (src/content/en.ts, he.ts), so the vault never drifts from the site. Output: wiki/he and wiki/en.
// Only the studio's own procedures and rules are exported. Receipts, invoices and private papers stay in the Studio page's storage.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { studioCopy, type WikiArticle } from "../src/content/studio";
import { en } from "../src/content/en";
import { he } from "../src/content/he";

const OUT = join(import.meta.dir, "..", "wiki");
const site = { en, he };
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());
const fileName = (s: string) => s.replace(/[\\/:*?"<>|#^[\]]/g, "").replace(/\s+/g, " ").replace(/[.…]+$/, "").trim();
const body = (a: WikiArticle) => a.a.map((p) => (p.startsWith("• ") ? `- ${p.slice(2)}` : `\n${p}\n`)).join("\n").replace(/\n{3,}/g, "\n\n").trim();

rmSync(OUT, { recursive: true, force: true });
let count = 0;
for (const lang of ["he", "en"] as const) {
  const c = studioCopy[lang];
  const t = site[lang];
  const root = join(OUT, lang);
  const note = (folder: string, title: string, text: string, tags: string[]) => {
    mkdirSync(join(root, folder), { recursive: true });
    writeFileSync(join(root, folder, `${fileName(title)}.md`), `---\ntags: [${["reset-pilates", ...tags].join(", ")}]\nupdated: ${today}\nsource: resetpilates.org/${lang}/studio/help\n---\n\n# ${title}\n\n${text}\n`);
    count++;
    return `[[${fileName(title)}]]`;
  };
  const s = c.help.sections;
  const routines = c.help.routines.map((a) => note(s.routines, a.q, body(a), ["routine"]));
  const howto = c.help.wiki.map((a) => note(fileName(s.howto), a.q, body(a), ["how-to"]));
  const rules = note("", s.rules, `${c.help.rulesNote}\n\n${t.terms.sections.map((x) => `## ${x.h}\n\n${x.items.map((i) => `- ${i}`).join("\n")}`).join("\n\n")}`, ["rules"]);
  const list = (links: string[]) => links.map((l) => `- ${l}`).join("\n");
  note("", c.help.title, `${c.help.lede}\n\n## ${s.routines}\n\n${list(routines)}\n\n## ${s.rules}\n\n- ${rules}\n\n## ${s.howto}\n\n${list(howto)}\n\n## ${s.docs}\n\n${c.help.docs.addInfo}`, ["home"]);
}
console.log(`wiki: ${count} notes written to ${OUT}`);
