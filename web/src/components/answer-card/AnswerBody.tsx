import type { AnswerBodyProps, Citation } from "@/components/types";
import Markdown from "@/components/Markdown";
import CitationHighlight from "@/components/answer-card/CitationHighlight";

/**
 * AnswerBody — renders `answer_markdown` (the direct, bottom-line-first answer).
 *
 * When citations carry span anchors, {@link CitationHighlight} wraps the marked
 * claims so a source tap can highlight them (CIT-US-1).
 */
export default function AnswerBody({
  markdown,
  citations,
  highlighted,
}: AnswerBodyProps & {
  citations?: Citation[];
  highlighted?: { target: "answer_span" | "fact_row"; id: string } | null;
}) {
  const hasSpans = /<!--\s*span:[A-Za-z0-9_-]+\s*-->/.test(markdown);

  return (
    <div className="answer-body" data-testid="answer-body">
      {hasSpans || highlighted ? (
        <CitationHighlight
          markdown={markdown}
          citations={citations ?? []}
          highlighted={highlighted ?? null}
          hideActivators
        />
      ) : (
        <Markdown markdown={markdown} className="answer-body__content" />
      )}
    </div>
  );
}
