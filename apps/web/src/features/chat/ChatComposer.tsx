import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { CHAT_MAX_IMAGE_BYTES, CHAT_MAX_IMAGES } from '@marxmatrix/contracts';
import type { ChatMessageInput } from './chat.types.js';

const acceptedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function ChatComposer({
  busy,
  onCancel,
  onSend
}: {
  busy: boolean;
  onCancel: () => void;
  onSend: (input: ChatMessageInput) => Promise<boolean>;
}) {
  const [text, setText] = useState('');
  const [images, setImages] = useState<File[]>([]);
  const [error, setError] = useState<string>();
  const fileInput = useRef<HTMLInputElement>(null);
  const previews = useMemo(
    () => images.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [images]
  );

  useEffect(() => () => previews.forEach(({ url }) => URL.revokeObjectURL(url)), [previews]);

  const selectImages = (files: FileList | null) => {
    if (files === null) return;
    const selected = Array.from(files);
    if (selected.some((file) => !acceptedTypes.has(file.type))) {
      setError('Chỉ hỗ trợ ảnh JPEG, PNG hoặc WebP.');
      return;
    }
    if (selected.some((file) => file.size > CHAT_MAX_IMAGE_BYTES)) {
      setError('Mỗi ảnh tối đa 5 MiB.');
      return;
    }
    if (images.length + selected.length > CHAT_MAX_IMAGES) {
      setError('Mỗi câu hỏi tối đa 4 ảnh.');
      return;
    }
    setError(undefined);
    setImages((current) => [...current, ...selected]);
    if (fileInput.current !== null) fileInput.current.value = '';
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = text.trim();
    if (busy || (trimmed.length === 0 && images.length === 0)) return;
    if (await onSend({ text: trimmed, images })) {
      setText('');
      setImages([]);
      setError(undefined);
    }
  };

  return (
    <form className="chat-composer" onSubmit={(event) => void submit(event)}>
      {images.length > 0 && (
        <ul className="chat-composer__previews" aria-label="Ảnh sắp gửi">
          {previews.map(({ file, url }, index) => (
            <li key={`${file.name}-${index}`}>
              <img alt={`Ảnh đính kèm: ${file.name}`} src={url} />
              <button
                type="button"
                aria-label={`Xóa ${file.name}`}
                onClick={() =>
                  setImages((items) => items.filter((_, itemIndex) => itemIndex !== index))
                }
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p role="alert">{error}</p>}
      <div className="chat-composer__input">
        <input
          ref={fileInput}
          aria-label="Đính kèm ảnh"
          accept="image/jpeg,image/png,image/webp"
          hidden
          multiple
          type="file"
          onChange={(event) => selectImages(event.target.files)}
        />
        <button
          type="button"
          className="chat-composer__attach"
          onClick={() => fileInput.current?.click()}
          aria-label="Mở trình chọn ảnh"
        >
          Kèm ảnh
        </button>
        <textarea
          aria-label="Yêu cầu cho AI"
          placeholder="Nhập yêu cầu phân tích..."
          rows={1}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />
        {busy ? (
          <button
            type="button"
            className="chat-composer__stop"
            onClick={onCancel}
            aria-label="Dừng phản hồi"
          >
            Dừng
          </button>
        ) : (
          <button type="submit" aria-label="Gửi câu hỏi">
            Gửi
          </button>
        )}
      </div>
      <p className="chat-composer__hint">Tối đa 4 ảnh (JPEG, PNG, WebP), 5 MiB/mỗi ảnh.</p>
    </form>
  );
}
