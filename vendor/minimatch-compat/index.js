/**
 * minimatch 3.x n'a plus de version corrigée (CVE-2026-118764 : corrigé à partir de 11.0.1).
 * Les outils ESLint (eslint, @eslint/*, eslint-plugin-import, -jsx-a11y, -react) l'appellent
 * encore comme une fonction (`require("minimatch")(…)`) ou via `.default` : ce module expose
 * minimatch 11.0.4 avec cette interface. Aucune logique propre : tout est délégué à minimatch 11.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- module CommonJS chargé par les outils ESLint */
"use strict";
const mm = require("minimatch-v11");

function minimatch(path, pattern, options) {
  return mm.minimatch(path, pattern, options);
}
Object.assign(minimatch, mm);
minimatch.minimatch = minimatch;
minimatch.default = minimatch;

module.exports = minimatch;
