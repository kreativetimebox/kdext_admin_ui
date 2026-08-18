import { NextResponse } from "next/server";
import { getFilterOptions } from "@/lib/queries";
import { getRequesterClientScope } from "@/lib/clientAccess";

export async function GET(req) {
  try {
    // CLIENT-role users (CLIENT_ADMIN / CLIENT_USER / CLIENT) must only see
    // their own company in the client/business dropdowns, not every other
    // client in the system.
    const { isClientRole, clientId } = getRequesterClientScope(req);
    const options = await getFilterOptions(isClientRole && clientId ? { clientId } : {});
    console.log(
      `[filter-options] clients=${options.clients.length} businesses=${options.businesses.length} docTypes=${options.docTypes.length} keyEnvironments=${options.keyEnvironments.length}`
    );
    return NextResponse.json(options, { status: 200 });
  } catch (error) {
    console.error("GET /api/filter-options error:", error);
    return NextResponse.json({ clients: [], businesses: [], docTypes: [], keyEnvironments: [] }, { status: 200 });
  }
}

