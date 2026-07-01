import { NextResponse } from "next/server";
import { dexaiQuery } from "@/lib/dexaidb";

export async function PUT(req, { params }) {
  try {
    const { clientName } = await req.json();

    if (!clientName || !clientName.trim()) {
      return NextResponse.json(
        { error: "Client name is required" },
        { status: 400 }
      );
    }

    const result = await dexaiQuery(
      `UPDATE clients
       SET client_name = $1, updated_at = NOW()
       WHERE client_id = $2
       RETURNING client_id, client_name`,
      [clientName.trim(), params.clientId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "Client not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error("PUT /api/dexai/clients error:", error);
    return NextResponse.json(
      { error: "Failed to update client" },
      { status: 500 }
    );
  }
}
