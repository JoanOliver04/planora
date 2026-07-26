import { NextResponse } from "next/server";
import { siteConfig } from "@/config/site";

export function GET() {
  return NextResponse.json(
    { status: "ok", version: siteConfig.version },
    { headers: { "Cache-Control": "no-store" } },
  );
}
