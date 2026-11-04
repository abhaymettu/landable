/** A repository at one commit: every file path, plus the text of the files the items read. */
export type Snapshot = {
  readonly files: readonly string[];
  readonly fileSet: ReadonlySet<string>;
  readonly dirSet: ReadonlySet<string>;
  readonly lowerIndex: ReadonlyMap<string, string>;
  readonly texts: ReadonlyMap<string, string>;
};

export function makeSnapshot({ files, texts }: { files: readonly string[]; texts: ReadonlyMap<string, string> }): Snapshot {
  const sorted = [...new Set(files)].sort();
  const dirSet = new Set<string>();
  const lowerIndex = new Map<string, string>();
  for (const file of sorted) {
    const parts = file.split("/");
    for (let i = 1; i < parts.length; i++) {
      const dir = parts.slice(0, i).join("/");
      if (!dirSet.has(dir)) {
        dirSet.add(dir);
        if (!lowerIndex.has(dir.toLowerCase())) lowerIndex.set(dir.toLowerCase(), dir);
      }
    }
    if (!lowerIndex.has(file.toLowerCase())) lowerIndex.set(file.toLowerCase(), file);
  }
  return { files: sorted, fileSet: new Set(sorted), dirSet, lowerIndex, texts };
}

export const isFile = (s: Snapshot, path: string): boolean => s.fileSet.has(path);
export const isDir = (s: Snapshot, path: string): boolean => s.dirSet.has(path);
export const exists = (s: Snapshot, path: string): boolean => isFile(s, path) || isDir(s, path);
export const realPathI = (s: Snapshot, path: string): string | undefined => s.lowerIndex.get(path.toLowerCase());
export const isFileI = (s: Snapshot, path: string): boolean => {
  const real = realPathI(s, path);
  return real !== undefined && s.fileSet.has(real);
};
export const isDirI = (s: Snapshot, path: string): boolean => {
  const real = realPathI(s, path);
  return real !== undefined && s.dirSet.has(real);
};
export const read = (s: Snapshot, path: string): string | undefined => s.texts.get(path);
export const readI = (s: Snapshot, path: string): string | undefined => {
  const real = realPathI(s, path);
  return real === undefined ? undefined : s.texts.get(real);
};
export const rootFiles = (s: Snapshot): string[] => s.files.filter((f) => !f.includes("/"));
export const filesMatching = (s: Snapshot, re: RegExp): string[] => s.files.filter((f) => re.test(f));
export const firstExisting = (s: Snapshot, paths: readonly string[]): string | undefined => paths.find((p) => exists(s, p));

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseJson(text: string | undefined): unknown {
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Removes // and /* comments outside strings, and trailing commas, so tsconfig-style JSON parses. */
export function stripJsonComments(text: string): string {
  let out = "";
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];
    if (inString) {
      out += c;
      if (c === "\\") {
        out += next ?? "";
        i++;
      } else if (c === '"') inString = false;
    } else if (c === '"') {
      inString = true;
      out += c;
    } else if (c === "/" && next === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      out += "\n";
    } else if (c === "/" && next === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++;
      i++;
    } else out += c;
  }
  return out.replace(/,(\s*[}\]])/g, "$1");
}

export function packageJson(s: Snapshot): Record<string, unknown> | undefined {
  const parsed = parseJson(read(s, "package.json"));
  return isRecord(parsed) ? parsed : undefined;
}

export function field(obj: Record<string, unknown> | undefined, key: string): Record<string, unknown> | undefined {
  const value = obj?.[key];
  return isRecord(value) ? value : undefined;
}
