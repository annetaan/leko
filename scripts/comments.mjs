/*
 * A file split into its comments and its code, by the parser that owns the
 * grammar.
 *
 * Telling a comment from code needs the whole of the grammar, not a scan for
 * `//`. A hand-written scanner stood here first and got two things wrong that
 * are in this repository already: `alwaysBundle: [/^@annetaan\//]` in
 * `packages/leko/tsdown.config.ts`, where the `//` inside a regex literal cut
 * the line short, and every multi-line template literal, where the state was
 * dropped at the newline and an unclosed `/*` inside one swallowed the rest of
 * the file. Both made `code-identity.mjs` answer *code identical* to a change
 * that moved code. TypeScript is a devDependency of this repository, so the
 * grammar is already here.
 *
 * Ranges come back rather than a rewritten file: the code is then the original
 * text with the comment ranges cut out of it, so nothing but a comment can
 * differ.
 */
import ts from 'typescript'

const KINDS = {
  ts: ts.ScriptKind.TS,
  mts: ts.ScriptKind.TS,
  cts: ts.ScriptKind.TS,
  tsx: ts.ScriptKind.TSX,
  js: ts.ScriptKind.JS,
  mjs: ts.ScriptKind.JS,
  cjs: ts.ScriptKind.JS,
  jsx: ts.ScriptKind.JSX,
}

/** The tokens whose text a newline belongs to rather than to the layout. */
const HELD = new Set([
  ts.SyntaxKind.NoSubstitutionTemplateLiteral,
  ts.SyntaxKind.TemplateHead,
  ts.SyntaxKind.TemplateMiddle,
  ts.SyntaxKind.TemplateTail,
  ts.SyntaxKind.StringLiteral,
  ts.SyntaxKind.JsxText,
])

/**
 * One parse, two answers: where the comments are, and where a line break is
 * somebody's string rather than the shape of the file.
 */
function read(source, fileName) {
  const kind = KINDS[fileName.split('.').at(-1)] ?? ts.ScriptKind.TS
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, kind)
  const comments = new Map()
  const held = []
  const walk = (node) => {
    // Both ends of every token. A comment sitting after code on the same line
    // is trailing trivia of the token before it and leading trivia of nothing:
    // `getLeadingCommentRanges` starts collecting at the first newline, so
    // asking only there loses every `const a = 1 // …`. JSX text has no
    // trivia — what looks like a comment there is content.
    if (node.kind !== ts.SyntaxKind.JsxText) {
      const around = [
        ...(ts.getLeadingCommentRanges(source, node.getFullStart()) ?? []),
        ...(ts.getTrailingCommentRanges(source, node.getEnd()) ?? []),
      ]
      for (const range of around) comments.set(range.pos, range)
    }
    const span = { pos: node.getStart(file), end: node.getEnd() }
    if (HELD.has(node.kind) && source.slice(span.pos, span.end).includes('\n')) held.push(span)
    for (const child of node.getChildren(file)) walk(child)
  }
  walk(file)
  return {
    comments: [...comments.values()].toSorted((a, b) => a.pos - b.pos),
    held,
  }
}

/** Every comment in the file, in source order, as `{ pos, end }`. */
export function ranges(source, fileName = 'file.ts') {
  return read(source, fileName).comments
}

/**
 * The code of a file, with every comment taken out.
 *
 * Trimming comments must not touch code, and reading the diff to check that is
 * the work the trim exists to avoid. This makes it a machine's question
 * instead: strip both sides and compare. Blank lines and trailing spaces go
 * with the comments, because a comment that was a line of its own leaves one
 * behind and deleting it is part of deleting the comment.
 *
 * Not inside a multi-line template literal, or a string a backslash carried
 * over a newline. A blank line there is a character of a value, and dropping
 * it made this answer *code identical* to 25 real edits across five tracked
 * files — the sandbox cases, which write their CSS in one.
 */
export function strip(source, fileName = 'file.ts') {
  const { comments, held } = read(source, fileName)
  const out = []
  let start = 0
  for (const line of source.split('\n')) {
    const end = start + line.length
    let text = line
    const cuts = comments.filter((range) => range.pos < end && range.end > start)
    for (const range of cuts.toReversed()) {
      text =
        text.slice(0, Math.max(range.pos, start) - start) +
        text.slice(Math.min(range.end, end) - start)
    }
    if (held.some((span) => span.pos < end && span.end > start)) out.push(text)
    else if (text.trim() !== '') out.push(text.trimEnd())
    start = end + 1
  }
  return out.join('\n')
}

/**
 * The comments of a file, one string per run of them, with the shape taken
 * out. A citation that wrapped over three `//` lines is one string; two
 * comments with code between them are two, because a sentence cannot run from
 * one to the other.
 */
export function passages(source, fileName = 'file.ts') {
  const runs = []
  let previous = null
  for (const { pos, end } of ranges(source, fileName)) {
    const adjacent = previous !== null && source.slice(previous, pos).trim() === ''
    if (adjacent) runs[runs.length - 1] += `\n${source.slice(pos, end)}`
    else runs.push(source.slice(pos, end))
    previous = end
  }
  return runs.map((run) =>
    run
      .replaceAll(/^\s*(?:\/\*+|\/\/|\*\/|\*)/gm, ' ')
      .replaceAll(/\*\/\s*$/gm, ' ')
      .replaceAll(/\s+/g, ' ')
      .trim(),
  )
}

/** Every comment in the file as one string, with the shape taken out of it. */
export function prose(source, fileName) {
  return passages(source, fileName).join(' ')
}
