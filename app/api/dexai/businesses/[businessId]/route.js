import { NextResponse } from "next/server";
import { dexaiQuery } from "@/lib/dexaidb";

export async function PUT(req, { params }) {
  try {
    const { businessName } = await req.json();

    if (!businessName || !businessName.trim()) {
      return NextResponse.json(
        { error: "Business name is required" },
        { status: 400 }
      );
    }

    const result = await dexaiQuery(
      `UPDATE businesses
       SET business_name = $1, updated_at = NOW()
       WHERE business_id = $2
       RETURNING business_id, business_name`,
      [businessName.trim(), params.businessId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "Business not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error("PUT /api/dexai/businesses error:", error);
    return NextResponse.json(
      { error: "Failed to update business" },
      { status: 500 }
    );
  }
}
