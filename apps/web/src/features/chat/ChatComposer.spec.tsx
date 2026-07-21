import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatComposer } from './ChatComposer.js';

describe('ChatComposer', () => {
  it('sends a text prompt and keeps the terminal input accessible', () => {
    const onSend = vi.fn().mockResolvedValue(true);
    render(<ChatComposer busy={false} onCancel={() => undefined} onSend={onSend} />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Yêu cầu cho AI' }), {
      target: { value: 'Giải thích NPV' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi câu hỏi' }));

    expect(onSend).toHaveBeenCalledWith({ images: [], text: 'Giải thích NPV' });
  });

  it('rejects an unsupported image before upload', () => {
    render(
      <ChatComposer busy={false} onCancel={() => undefined} onSend={() => Promise.resolve(true)} />
    );

    const input = screen.getByLabelText('Đính kèm ảnh');
    fireEvent.change(input, {
      target: { files: [new File(['not image'], 'notes.pdf', { type: 'application/pdf' })] }
    });

    expect(screen.getByRole('alert')).toHaveTextContent('Chỉ hỗ trợ ảnh JPEG, PNG hoặc WebP.');
  });

  it('shows a stop control while streaming', () => {
    render(<ChatComposer busy onCancel={() => undefined} onSend={() => Promise.resolve(true)} />);

    expect(screen.getByRole('button', { name: 'Dừng phản hồi' })).toBeInTheDocument();
  });

  it('keeps a draft available when sending fails before it is accepted', async () => {
    render(
      <ChatComposer busy={false} onCancel={() => undefined} onSend={() => Promise.resolve(false)} />
    );

    fireEvent.change(screen.getByRole('textbox', { name: 'Yêu cầu cho AI' }), {
      target: { value: 'Phân tích dòng tiền' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi câu hỏi' }));

    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Yêu cầu cho AI' })).toHaveValue(
        'Phân tích dòng tiền'
      )
    );
  });

  it('keeps Enter for new lines and sends with Ctrl+Enter', () => {
    const onSend = vi.fn().mockResolvedValue(true);
    render(<ChatComposer busy={false} onCancel={() => undefined} onSend={onSend} />);
    const input = screen.getByRole('textbox', { name: 'Yêu cầu cho AI' });
    fireEvent.change(input, { target: { value: 'Giải thích IRR' } });

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSend).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true });
    expect(onSend).toHaveBeenCalledWith({ images: [], text: 'Giải thích IRR' });
  });
});

afterEach(cleanup);
