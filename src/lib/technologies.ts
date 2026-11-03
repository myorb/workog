import type { Job } from "./schema.ts";

export interface Technology {
  slug: string;
  name: string;
  /** Matched against the title, and against the description of engineering and data roles */
  pattern: RegExp;
  /** Matched against the title of engineering and data roles only; for words too loose elsewhere ("AI Sales") */
  titlePattern?: RegExp;
}

// "Go" is also an English verb, so in descriptions it only counts next to another language
const langs = "Python|Java|Rust|Ruby|Kotlin|Scala|C\\+\\+|TypeScript|Node(?:\\.js)?|Elixir";
const goPattern = new RegExp(`\\bGolang\\b|\\bGo\\b(?=\\s*[,/]\\s*(?:and |or )?(?:${langs})\\b)|(?<=\\b(?:${langs})\\s*[,/]?\\s*(?:and |or )?)Go\\b`);

export const technologies: Technology[] = [
  {
    slug: "javascript",
    name: "JavaScript",
    pattern: /\b([Jj]ava[Ss]cript|JAVASCRIPT|[Nn]ode\.?js|React|Vue(\.?js)?|Angular|Next\.?js)\b/,
    titlePattern: /\b(node|front[\s-]?end|full[\s-]?stack)\b/i,
  },
  { slug: "typescript", name: "TypeScript", pattern: /\btype\s?script\b/i },
  { slug: "react", name: "React", pattern: /\bReact(\.?js)?\b(?! Native)/ },
  { slug: "react-native", name: "React Native", pattern: /\breact native\b/i },
  { slug: "vue", name: "Vue.js", pattern: /\bvue(\.?js)?\b/i },
  { slug: "angular", name: "Angular", pattern: /\bAngular(JS)?\b/ },
  { slug: "nodejs", name: "Node.js", pattern: /\bnode\.?js\b/i, titlePattern: /\bnode\b/i },
  { slug: "python", name: "Python", pattern: /\bpython\b/i },
  { slug: "java", name: "Java", pattern: /\bjava\b(?!\s?script)/i },
  { slug: "kotlin", name: "Kotlin", pattern: /\bkotlin\b/i },
  { slug: "go", name: "Go (Golang)", pattern: goPattern, titlePattern: /\b(go|golang)\b(?![- ]to\b)/i },
  { slug: "rust", name: "Rust", pattern: /\bRust\b/ },
  { slug: "ruby", name: "Ruby", pattern: /\bRuby\b|\bRails\b/ },
  { slug: "php", name: "PHP", pattern: /\bphp\b/i },
  { slug: "scala", name: "Scala", pattern: /\bscala\b/i },
  { slug: "elixir", name: "Elixir", pattern: /\belixir\b/i },
  { slug: "cpp", name: "C++", pattern: /(^|[^\w])c\+\+(?!\w)/i },
  { slug: "csharp", name: "C# / .NET", pattern: /(^|[^\w])(c#|\.net)(?!\w)/i },
  { slug: "swift", name: "Swift", pattern: /\bSwift(UI)?\b/ },
  { slug: "ios", name: "iOS", pattern: /\bios\b/i },
  { slug: "android", name: "Android", pattern: /\bandroid\b/i },
  { slug: "sql", name: "SQL", pattern: /\b(sql|postgres(ql)?|mysql)\b/i },
  { slug: "aws", name: "AWS", pattern: /\b(aws|amazon web services)\b/i },
  { slug: "kubernetes", name: "Kubernetes", pattern: /\b(kubernetes|k8s)\b/i },
  { slug: "terraform", name: "Terraform", pattern: /\bterraform\b/i },
  { slug: "machine-learning", name: "Machine Learning", pattern: /\b(machine learning|pytorch|tensorflow)\b/i, titlePattern: /\b(ml|ai)\b/i },
];

const descriptionCategories = new Set(["engineering", "data"]);

/** Slugs of the technologies a job asks for. */
export function technologiesOf(job: Job): Set<string> {
  const technical = descriptionCategories.has(job.category ?? "");
  const text = technical ? job.descriptionHtml.replace(/<[^>]+>/g, " ") : "";
  const found = new Set<string>();
  for (const t of technologies) {
    if (t.pattern.test(job.title) || (technical && (t.titlePattern?.test(job.title) || t.pattern.test(text)))) found.add(t.slug);
  }
  return found;
}

export const getTechnology = (slug: string) => technologies.find((t) => t.slug === slug);
