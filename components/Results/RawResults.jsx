"use client";

import { memo } from "react";
import JsonPanel from "./JsonPanel";

function RawResults({ ocrRaw }) {
  return <JsonPanel title="Processing Raw Results" data={ocrRaw} variant="purple" />;
}

export default memo(RawResults);
