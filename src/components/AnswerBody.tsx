import type { AnswerBodyProps } from "@/components/types";

/**
 * AnswerBody — renders `answer_markdown` (the direct, bottom-line-first answer).
 *
 * Markdown is rendered as pre-formatted text preserving newlines. Full markdown
 * parsing (bold, links, lists, etc.) is deferred to the `frontend-design` skill.
 * Always present in the answer card.
 */
export default function AnswerBody({ markdown }: AnswerBodyProps) {
  return (
    <div className="answer-body" data-testid="answer-body">
      <div className="answer-body__content" style={{ whiteSpace: "pre-wrap" }}>
        {markdown}
      </div>
    </div>
  );
}
