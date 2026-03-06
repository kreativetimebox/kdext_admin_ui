"use client";

import { memo } from "react";
import JsonPanel from "./JsonPanel";

function OCRResults({ data }) {
  return <JsonPanel title="OCR Results" data={data} variant="purple" />;
}

export default memo(OCRResults);

