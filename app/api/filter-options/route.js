import { NextResponse } from "next/server";
import { getFilterOptions } from "@/lib/queries";

export async function GET() {
  try {
    const options = await getFilterOptions();
    console.log(
      `[filter-options] clients=${options.clients.length} businesses=${options.businesses.length} docTypes=${options.docTypes.length} keyEnvironments=${options.keyEnvironments.length}`
    );
    return NextResponse.json(options, { status: 200 });
  } catch (error) {
    console.error("GET /api/filter-options error:", error);
    return NextResponse.json({ clients: [], businesses: [], docTypes: [], keyEnvironments: [] }, { status: 200 });
  }
}
