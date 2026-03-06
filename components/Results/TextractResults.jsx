"use client";

import { memo } from "react";
import JsonPanel from "./JsonPanel";

function TextractResults({ data }) {
  return <JsonPanel title="Textract Results" data={data} variant="blue" />;
}

export default memo(TextractResults);

