/**
 * Cria prisma/empty.db — um banco SQLite limpo (sem dados) com o schema
 * completo do Atlas. Esse arquivo é empacotado no instalador como seed
 * inicial para novos usuários, garantindo que nenhum dado pessoal do
 * desenvolvedor vaze para a máquina de quem instala o app.
 *
 * Executado automaticamente por `npm run electron:build` antes do empacotamento.
 */

import { execSync } from "child_process";
import { existsSync, copyFileSync, rmSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const emptyDb = join(root, "prisma", "empty.db");

// Remove versão anterior para garantir que sai zerado
if (existsSync(emptyDb)) rmSync(emptyDb);

// Aplica o schema num banco novo em prisma/empty.db
execSync("npx prisma db push --skip-generate", {
  cwd: root,
  env: {
    ...process.env,
    DATABASE_URL: `file:${emptyDb}`,
  },
  stdio: "inherit",
});

console.log(`✔ prisma/empty.db criado em ${emptyDb}`);
