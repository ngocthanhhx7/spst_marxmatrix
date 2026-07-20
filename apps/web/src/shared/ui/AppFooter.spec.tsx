import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { AppFooter } from './AppFooter.js';

afterEach(cleanup);

describe('AppFooter', () => {
  it('exposes product status, method and policy navigation', () => {
    render(
      <MemoryRouter>
        <AppFooter />
      </MemoryRouter>
    );

    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/sẵn sàng/i);
    expect(screen.getByText('SYSTEM / LEARNING WORKSPACE')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Phương pháp' })).toHaveAttribute('href', '/#method');
    expect(screen.getByRole('link', { name: 'Quyền riêng tư' })).toHaveAttribute(
      'href',
      '/#privacy'
    );
  });
});
