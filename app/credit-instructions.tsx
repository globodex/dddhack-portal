import {
  parseInstructions,
  instructionInline,
} from "../lib/instruction-markdown";
function Inline({ text }: { text: string }) {
  return (
    <>
      {instructionInline(text).map((part, i) =>
        part.type === "link" ? (
          <a key={i} href={part.href} target="_blank" rel="noopener noreferrer">
            {part.text}
          </a>
        ) : part.type === "strong" ? (
          <strong key={i}>{part.text}</strong>
        ) : part.type === "code" ? (
          <code key={i}>{part.text}</code>
        ) : (
          part.text
        ),
      )}
    </>
  );
}
export default function CreditInstructions({ markdown }: { markdown: string }) {
  return (
    <div className="credit-instructions">
      {parseInstructions(markdown).map((block, i) =>
        block.type === "code" ? (
          <pre key={i}>
            <code>{block.lines.join("\n")}</code>
          </pre>
        ) : block.type === "heading" ? (
          <h4 key={i}>
            <Inline text={block.lines[0]} />
          </h4>
        ) : block.type === "ordered" ? (
          <ol key={i}>
            {block.lines.map((text, j) => (
              <li key={j}>
                <Inline text={text} />
              </li>
            ))}
          </ol>
        ) : block.type === "unordered" ? (
          <ul key={i}>
            {block.lines.map((text, j) => (
              <li key={j}>
                <Inline text={text} />
              </li>
            ))}
          </ul>
        ) : (
          <p key={i}>
            <Inline text={block.lines[0]} />
          </p>
        ),
      )}
    </div>
  );
}
