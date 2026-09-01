// R22J.1 - reading a module as text, without reading its prose.
//
// This project asserts on source text a great deal - 1174 assertions across the suite - and most of
// it is load-bearing. The boundaries that keep authority where it belongs ("free movement holds no
// defence authority", "the camera module never imports Three.js") cannot be shown from outside a
// module: you cannot prove absence by calling something. Those assertions are the design.
//
// But every one of them shares a defect, and it is not theoretical - R22I.1 hit it. An assertion
// that forbids a string cannot tell a USE from an EXPLANATION. A test saying "this module must not
// mention createFixedStepFrameClock" went red because the module's header explained why that name
// was rejected. The comment was the right thing to write and the test punished it, which in a
// repository whose comments are its documentation is a rule that pays people to explain less - the
// same failure R20Z.1 found in the entry's line budget and fixed the same way.
//
// So: strip the prose, then assert. What is left is what the module DOES.
//
// Deliberately NOT a parser. It removes block comments, line comments and string bodies with a
// small scanner that tracks which of those it is inside. That is enough for JavaScript source in
// this repository and it fails safe: anything it cannot classify stays in the code it returns, so a
// mistake here can only make an absence assertion stricter, never blinder.
export function codeOnly(source) {
  const text = String(source ?? '');
  let out = '';
  let i = 0;
  let state = 'code';
  let quote = '';
  while (i < text.length) {
    const c = text[i];
    const next = text[i + 1];
    if (state === 'code') {
      if (c === '/' && next === '*') { state = 'block'; i += 2; continue; }
      if (c === '/' && next === '/') { state = 'line'; i += 2; continue; }
      if (c === '"' || c === "'" || c === '`') { state = 'string'; quote = c; out += c; i += 1; continue; }
      out += c; i += 1; continue;
    }
    if (state === 'block') {
      if (c === '*' && next === '/') { state = 'code'; i += 2; continue; }
      // Keep newlines so line numbers in a failure message still mean something.
      if (c === '\n') out += '\n';
      i += 1; continue;
    }
    if (state === 'line') {
      if (c === '\n') { state = 'code'; out += '\n'; }
      i += 1; continue;
    }
    // state === 'string': keep the quotes, drop the body, so `foo('bar')` stays a call to foo but
    // stops being a mention of bar. Escapes are skipped so a quote inside a string cannot end it.
    if (c === '\\') { i += 2; continue; }
    if (c === quote) { state = 'code'; out += c; i += 1; continue; }
    if (c === '\n') out += '\n';
    i += 1;
  }
  return out;
}
