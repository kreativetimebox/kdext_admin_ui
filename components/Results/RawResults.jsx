"use client";

import { memo } from "react";
import JsonPanel from "./JsonPanel";

function RawResults({ textractRaw, ocrRaw }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <JsonPanel title="Textract Raw Results" data={textractRaw} variant="blue" />
      <JsonPanel title="OCR Raw Results" data={ocrRaw} variant="purple" />
    </div>
  );
}

export default memo(RawResults);

