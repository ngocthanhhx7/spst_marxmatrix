import Markdown from 'react-markdown';

export function SafeMarkdown({ markdown }: { markdown: string }) {
  return (
    <div className="chat-markdown">
      <Markdown>{markdown}</Markdown>
    </div>
  );
}
