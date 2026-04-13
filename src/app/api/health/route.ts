import { NextResponse } from "next/server";
import pool from "@/lib/db";

export async function GET() {
  try {
    await pool.query("SELECT 1");
    return NextResponse.json({
      status: "ok",
      db: "ok",
      version: "0.1.0",
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[/api/health] db ping failed:", err);
    return NextResponse.json(
      { status: "error", db: "down", timestamp: new Date().toISOString() },
      { status: 503 }
    );
  }
}
