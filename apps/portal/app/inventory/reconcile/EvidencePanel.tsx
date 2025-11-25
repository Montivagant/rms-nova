"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import type {
  InventoryCountAttachment,
  InventoryCountSession
} from "@lib/data-sources";

type EvidencePanelProps = {
  sessions: InventoryCountSession[];
  initialSessionId?: string;
  initialAttachments: InventoryCountAttachment[];
};

export function EvidencePanel({
  sessions,
  initialSessionId,
  initialAttachments
}: EvidencePanelProps) {
  const sessionOptions = useMemo(() => sessions.map((session) => ({
    id: session.id,
    name: session.name
  })), [sessions]);
  const defaultSessionId = initialSessionId ?? sessionOptions[0]?.id ?? "";
  const [selectedSessionId, setSelectedSessionId] = useState(defaultSessionId);
  const [attachments, setAttachments] = useState<InventoryCountAttachment[]>(
    initialSessionId ? initialAttachments : []
  );
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!selectedSessionId || (initialSessionId && selectedSessionId === initialSessionId)) {
      return;
    }
    startTransition(async () => {
      try {
        const response = await fetch(`/v1/portal/inventory/counts/${selectedSessionId}`, {
          credentials: "include"
        });
        if (!response.ok) {
          setAttachments([]);
          return;
        }
        const payload = await response.json();
        setAttachments(payload.data.attachments ?? []);
      } catch {
        setAttachments([]);
      }
    });
  }, [initialSessionId, selectedSessionId]);

  if (!sessionOptions.length) {
    return (
      <p className="text-muted" style={{ margin: 0 }}>
        Record an inventory count before adding evidence attachments.
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
        Select session
        <select
          value={selectedSessionId}
          onChange={(event) => setSelectedSessionId(event.target.value)}
        >
          {sessionOptions.map((session) => (
            <option key={session.id} value={session.id}>
              {session.name}
            </option>
          ))}
        </select>
      </label>

      {isPending ? (
        <p className="text-muted" style={{ margin: 0 }}>
          Loading attachments…
        </p>
      ) : attachments.length === 0 ? (
        <p className="text-muted" style={{ margin: 0 }}>
          No attachments yet for this session.
        </p>
      ) : (
        <ul className="list-reset" style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {attachments.map((attachment) => (
            <li key={attachment.id}>
              <a
                className="text-link"
                href={attachment.url}
                rel="noreferrer noopener"
                target="_blank"
              >
                {attachment.label ?? attachment.url}
              </a>
              <div className="text-muted" style={{ fontSize: "0.85rem" }}>
                {attachment.createdByName ? `${attachment.createdByName} · ` : null}
                {new Date(attachment.createdAt).toLocaleString()}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
