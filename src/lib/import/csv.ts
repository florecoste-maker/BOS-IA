/**
 * Lecture des fichiers CSV exportés par Excel, LibreOffice ou Google Sheets.
 * Excel en français enregistre en Windows-1252 avec « ; » comme séparateur :
 * l'encodage et le séparateur sont détectés automatiquement.
 */

/**
 * Octets 0x80–0x9F de Windows-1252 (€, ’, œ, «…»). Node décode ce label comme du
 * Latin-1 et rend ces octets en caractères de contrôle : on applique la table.
 * Les positions vides (0x81, 0x8D, 0x8F, 0x90, 0x9D) restent inchangées.
 */
const CP1252_HIGH =
  "€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008DŽ\u008F\u0090‘’“”•–—˜™š›œ\u009DžŸ";

function decodeWindows1252(bytes: Uint8Array) {
  let out = "";
  for (const byte of bytes) {
    out += byte >= 0x80 && byte <= 0x9f ? CP1252_HIGH[byte - 0x80] : String.fromCharCode(byte);
  }
  return out;
}

/** UTF-8 (avec ou sans BOM), sinon Windows-1252. */
export function decodeText(bytes: Uint8Array): string {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    text = decodeWindows1252(bytes);
  }
  return text.replace(/^﻿/, "");
}

/** Séparateur le plus fréquent hors guillemets sur la première ligne. */
export function detectDelimiter(text: string): string {
  const counts: Record<string, number> = { ";": 0, ",": 0, "\t": 0 };
  let quoted = false;
  for (const ch of text) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && (ch === "\n" || ch === "\r")) break;
    else if (!quoted && ch in counts) counts[ch] += 1;
  }
  const [best, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return n > 0 ? best : ";";
}

/** Analyse RFC 4180 : guillemets doublés, retours à la ligne dans les cellules. */
export function parseCsv(text: string, delimiter = detectDelimiter(text)): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"' && cell === "") {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}
