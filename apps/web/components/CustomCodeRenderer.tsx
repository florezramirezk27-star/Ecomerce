"use client";

import { useMemo } from "react";
import DOMPurify from "dompurify";

export default function CustomCodeRenderer({ html }: { html: string }) {
  const sanitized = useMemo(() => {
    const cleaned = html
      .replace(/<!DOCTYPE[^>]*>/gi, "")
      .replace(/<html[^>]*>/gi, "")
      .replace(/<\/html>/gi, "")
      .replace(/<\/?head[^>]*>/gi, "")
      .replace(/<body[^>]*>/gi, "")
      .replace(/<\/body>/gi, "");

    return DOMPurify.sanitize(cleaned, {
      ADD_TAGS: ["style", "script"],
      ADD_ATTR: ["style", "target"],
      FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "onfocus", "onblur", "onchange", "onsubmit", "onreset"],
    });
  }, [html]);

  return (
    <div
      className="w-full"
      style={{ contain: "content", isolation: "isolate" }}
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  );
}
