/**
 * Solana Utilities
 *
 * Balance checking and token transfer utilities for the Solana network.
 * Supports native SOL and USDC (SPL token) on mainnet-beta and devnet.
 */

import {
  Connection,
  PublicKey,
  LAMPORTS_PER_SOL,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  type Keypair,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  getAccount,
  createTransferInstruction,
  getOrCreateAssociatedTokenAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

// Solana RPC endpoints
const SOLANA_RPC: Record<string, string> = {
  "mainnet-beta": "https://api.mainnet-beta.solana.com",
  devnet: "https://api.devnet.solana.com",
};

// USDC SPL token mint addresses
const SOLANA_USDC_MINT: Record<string, string> = {
  "mainnet-beta": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  devnet: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
};

export interface SolanaBalanceResult {
  solBalance: number;
  usdcBalance: number;
  network: string;
  ok: boolean;
  error?: string;
}

export interface SolanaTxResult {
  txHash: string;
  ok: boolean;
  error?: string;
}

/**
 * Get SOL and USDC balances for a Solana address.
 */
export async function getSolanaBalances(
  address: string,
  network: string = "mainnet-beta",
): Promise<SolanaBalanceResult> {
  const rpcUrl = SOLANA_RPC[network];
  const usdcMintAddress = SOLANA_USDC_MINT[network];

  if (!rpcUrl || !usdcMintAddress) {
    return {
      solBalance: 0,
      usdcBalance: 0,
      network,
      ok: false,
      error: `Unsupported Solana network: ${network}`,
    };
  }

  let pubkey: PublicKey;
  try {
    pubkey = new PublicKey(address);
  } catch {
    return {
      solBalance: 0,
      usdcBalance: 0,
      network,
      ok: false,
      error: `Invalid Solana address: ${address}`,
    };
  }

  const connection = new Connection(rpcUrl, "confirmed");

  // SOL balance
  let solBalance = 0;
  try {
    const lamports = await connection.getBalance(pubkey);
    solBalance = lamports / LAMPORTS_PER_SOL;
  } catch (err: any) {
    return {
      solBalance: 0,
      usdcBalance: 0,
      network,
      ok: false,
      error: err?.message || String(err),
    };
  }

  // USDC SPL token balance — token account may not exist if balance is zero
  let usdcBalance = 0;
  try {
    const usdcMint = new PublicKey(usdcMintAddress);
    const ata = await getAssociatedTokenAddress(usdcMint, pubkey);
    const tokenAccount = await getAccount(connection, ata);
    usdcBalance = Number(tokenAccount.amount) / 1_000_000; // USDC has 6 decimals
  } catch {
    // No token account = zero USDC balance
    usdcBalance = 0;
  }

  return { solBalance, usdcBalance, network, ok: true };
}

/**
 * Get native SOL balance for an address.
 */
export async function getSolBalance(
  address: string,
  network: string = "mainnet-beta",
): Promise<number> {
  const result = await getSolanaBalances(address, network);
  return result.solBalance;
}

/**
 * Get USDC (SPL token) balance for an address on Solana.
 */
export async function getSolanaUsdcBalance(
  address: string,
  network: string = "mainnet-beta",
): Promise<number> {
  const result = await getSolanaBalances(address, network);
  return result.usdcBalance;
}

/**
 * Send native SOL to an address.
 */
export async function sendSol(
  fromKeypair: Keypair,
  toAddress: string,
  amountSol: number,
  network: string = "mainnet-beta",
): Promise<SolanaTxResult> {
  const rpcUrl = SOLANA_RPC[network];
  if (!rpcUrl) {
    return { txHash: "", ok: false, error: `Unsupported network: ${network}` };
  }

  const connection = new Connection(rpcUrl, "confirmed");
  const toPubkey = new PublicKey(toAddress);
  const lamports = Math.floor(amountSol * LAMPORTS_PER_SOL);

  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: fromKeypair.publicKey,
      toPubkey,
      lamports,
    }),
  );

  try {
    const txHash = await sendAndConfirmTransaction(connection, tx, [fromKeypair]);
    return { txHash, ok: true };
  } catch (err: any) {
    return { txHash: "", ok: false, error: err?.message || String(err) };
  }
}

/**
 * Send USDC (SPL token) to an address on Solana.
 * Automatically creates the recipient's associated token account if needed.
 */
export async function sendSolanaUsdc(
  fromKeypair: Keypair,
  toAddress: string,
  amountUsdc: number,
  network: string = "mainnet-beta",
): Promise<SolanaTxResult> {
  const rpcUrl = SOLANA_RPC[network];
  const usdcMintAddress = SOLANA_USDC_MINT[network];

  if (!rpcUrl || !usdcMintAddress) {
    return { txHash: "", ok: false, error: `Unsupported network: ${network}` };
  }

  const connection = new Connection(rpcUrl, "confirmed");
  const usdcMint = new PublicKey(usdcMintAddress);
  const toPubkey = new PublicKey(toAddress);
  const amountRaw = BigInt(Math.floor(amountUsdc * 1_000_000));

  try {
    const fromATA = await getOrCreateAssociatedTokenAccount(
      connection,
      fromKeypair,
      usdcMint,
      fromKeypair.publicKey,
    );

    const toATA = await getOrCreateAssociatedTokenAccount(
      connection,
      fromKeypair, // payer for account creation
      usdcMint,
      toPubkey,
    );

    const tx = new Transaction().add(
      createTransferInstruction(
        fromATA.address,
        toATA.address,
        fromKeypair.publicKey,
        amountRaw,
        [],
        TOKEN_PROGRAM_ID,
      ),
    );

    const txHash = await sendAndConfirmTransaction(connection, tx, [fromKeypair]);
    return { txHash, ok: true };
  } catch (err: any) {
    return { txHash: "", ok: false, error: err?.message || String(err) };
  }
}
