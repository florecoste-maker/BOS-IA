/**
 * Mots de passe des comptes : scrypt (inclus dans Node), sel aléatoire, paramètres
 * enregistrés dans le hash pour pouvoir les durcir plus tard sans casser l'existant.
 */
import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";

const scrypt = (password: string, salt: Buffer, keylen: number, options: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) =>
    scryptCb(password, salt, keylen, options, (error, key) => (error ? reject(error) : resolve(key))),
  );

const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 32;

export const MIN_PASSWORD_LENGTH = 12;

export function passwordProblem(password: string) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Mot de passe trop court (${MIN_PASSWORD_LENGTH} caractères minimum)`;
  }
  if (password.length > 200) return "Mot de passe trop long (200 caractères maximum)";
  return null;
}

/** « scrypt$N$r$p$sel$hash » (base64url). */
export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEYLEN, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [algo, n, r, p, salt, hash] = stored.split("$");
  if (algo !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  try {
    const key = await scrypt(password, Buffer.from(salt, "base64url"), expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    });
    return timingSafeEqual(key, expected);
  } catch {
    return false;
  }
}
