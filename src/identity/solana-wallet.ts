/**
 * Solana Wallet Management
 *
 * Creates and manages a Solana keypair for the automaton's Solana identity.
 * The secret key is stored alongside the EVM wallet in ~/.automaton/.
 * Parallels the EVM wallet in wallet.ts.
 */

import { Keypair } from "@solana/web3.js";
import fs from "fs";
import path from "path";
import { getAutomatonDir } from "./wallet.js";
import type { SolanaWalletData } from "../types.js";

const SOLANA_WALLET_FILENAME = "solana-wallet.json";

export function getSolanaWalletPath(): string {
  return path.join(getAutomatonDir(), SOLANA_WALLET_FILENAME);
}

/**
 * Get or create the automaton's Solana wallet.
 * Generates a fresh keypair on first run; loads it on subsequent runs.
 */
export async function getSolanaWallet(): Promise<{
  keypair: Keypair;
  isNew: boolean;
}> {
  const automatonDir = getAutomatonDir();
  if (!fs.existsSync(automatonDir)) {
    fs.mkdirSync(automatonDir, { recursive: true, mode: 0o700 });
  }

  const walletFile = getSolanaWalletPath();
  if (fs.existsSync(walletFile)) {
    const data: SolanaWalletData = JSON.parse(
      fs.readFileSync(walletFile, "utf-8"),
    );
    const secretKey = Buffer.from(data.secretKey, "base64");
    const keypair = Keypair.fromSecretKey(secretKey);
    return { keypair, isNew: false };
  } else {
    const keypair = Keypair.generate();
    const data: SolanaWalletData = {
      secretKey: Buffer.from(keypair.secretKey).toString("base64"),
      publicKey: keypair.publicKey.toBase58(),
      createdAt: new Date().toISOString(),
    };

    fs.writeFileSync(walletFile, JSON.stringify(data, null, 2), {
      mode: 0o600,
    });

    return { keypair, isNew: true };
  }
}

/**
 * Get the Solana public key (base58 address) without loading the full keypair.
 */
export function getSolanaWalletAddress(): string | null {
  const walletFile = getSolanaWalletPath();
  if (!fs.existsSync(walletFile)) {
    return null;
  }

  const data: SolanaWalletData = JSON.parse(
    fs.readFileSync(walletFile, "utf-8"),
  );
  return data.publicKey;
}

/**
 * Load the full Solana keypair (needed for signing transactions).
 */
export function loadSolanaKeypair(): Keypair | null {
  const walletFile = getSolanaWalletPath();
  if (!fs.existsSync(walletFile)) {
    return null;
  }

  const data: SolanaWalletData = JSON.parse(
    fs.readFileSync(walletFile, "utf-8"),
  );
  const secretKey = Buffer.from(data.secretKey, "base64");
  return Keypair.fromSecretKey(secretKey);
}

export function solanaWalletExists(): boolean {
  return fs.existsSync(getSolanaWalletPath());
}
