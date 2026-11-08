"use client";
import { Button, Card } from "./ui";
import { VoiceMode } from "./VoiceMode";

/** Voice entry point on the advisor page. */
export function VoiceSlot(props: { sessionId: string; language: string; open: boolean; onToggle: (v: boolean) => void; onUpdate?: () => void }) {
  if (props.open)
    return (
      <div className="mb-3">
        <VoiceMode sessionId={props.sessionId} language={props.language} onUpdate={props.onUpdate} />
        <button className="text-xs text-muted underline mt-1" onClick={() => props.onToggle(false)}>Switch to typing</button>
      </div>
    );
  return (
    <Card className="mb-3 flex items-center gap-3 py-3">
      <span className="text-2xl"></span>
      <div className="text-sm">
        <div className="font-medium">Talk instead of typing</div>
        <div className="text-muted">Talk like a phone call — English or any supported Indian language</div>
      </div>
      <Button className="ml-auto" variant="outline" onClick={() => props.onToggle(true)}>Start voice</Button>
    </Card>
  );
}
