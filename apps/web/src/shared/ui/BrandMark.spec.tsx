import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { BrandMark } from './BrandMark.js';

afterEach(cleanup);

describe('BrandMark', () => {
  it('renders an accessible home link with a decorative matrix mark', () => {
    const { container } = render(
      <MemoryRouter>
        <BrandMark />
      </MemoryRouter>
    );

    expect(screen.getByRole('link', { name: 'MarxMatrix' })).toHaveAttribute('href', '/');
    expect(screen.getByText('MarxMatrix')).toBeVisible();
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
});
