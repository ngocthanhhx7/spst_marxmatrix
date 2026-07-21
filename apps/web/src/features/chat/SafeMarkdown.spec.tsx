import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SafeMarkdown } from './SafeMarkdown.js';

describe('SafeMarkdown', () => {
  it('renders assistant markdown without permitting raw HTML', () => {
    render(<SafeMarkdown markdown={'## Kế hoạch\n\n**Năm 1**\n\n<script>alert(1)</script>'} />);

    expect(screen.getByRole('heading', { name: 'Kế hoạch' })).toBeInTheDocument();
    expect(screen.getByText('Năm 1').tagName).toBe('STRONG');
    expect(screen.queryByRole('script')).not.toBeInTheDocument();
    expect(screen.getByText(/<script>alert\(1\)<\/script>/)).toBeInTheDocument();
  });
});
