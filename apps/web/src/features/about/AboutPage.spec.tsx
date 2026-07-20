import { cleanup, render, screen, within } from '@testing-library/react';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../../app/App.js';
import { useSessionStore } from '../auth/session.js';

afterEach(() => {
  cleanup();
  useSessionStore.getState().clearSession();
  window.history.replaceState({}, '', '/');
});

describe('AboutPage', () => {
  it('renders the Vietnamese thesis and mantra from the approved story', async () => {
    window.history.replaceState({}, '', '/about');
    render(<App />);

    expect(
      await screen.findByRole(
        'heading',
        { name: 'Chúng tôi không bắt đầu bằng một sản phẩm. Chúng tôi bắt đầu bằng một câu hỏi.' },
        { timeout: 10_000 }
      )
    ).toBeInTheDocument();
    expect(screen.getByText('Không có bằng chứng, không có kết luận.')).toBeInTheDocument();
  }, 15_000);

  it('keeps the public header routes, active About state and guest actions', async () => {
    window.history.replaceState({}, '', '/about');
    render(<App />);

    await screen.findByRole('banner');
    const header = screen.getByRole('banner');
    expect(within(header).getByRole('link', { name: 'Phương pháp' })).toHaveAttribute(
      'href',
      '/#method'
    );
    expect(within(header).getByRole('link', { name: 'Công cụ' })).toHaveAttribute(
      'href',
      '/#tools'
    );
    expect(within(header).getByRole('link', { name: 'Capital Arena' })).toHaveAttribute(
      'href',
      '/arena'
    );
    expect(within(header).getByRole('link', { name: 'Tài liệu' })).toHaveAttribute(
      'href',
      '/#resources'
    );
    const aboutLink = within(header).getByRole('link', { name: 'Giới thiệu' });
    expect(aboutLink).toHaveAttribute('href', '/about');
    expect(aboutLink).toHaveAttribute('aria-current', 'page');
    expect(within(header).getByRole('link', { name: 'Login' })).toHaveAttribute('href', '/login');
    expect(within(header).getByRole('link', { name: /Bắt đầu phân tích/i })).toHaveAttribute(
      'href',
      '/scanner/new'
    );
  }, 15_000);

  it('shows the signed-in account actions and the exact project team', async () => {
    useSessionStore.getState().setSession({
      accessToken: 'test-access-token',
      user: {
        id: 'learner-01',
        displayName: 'Nguyễn An',
        email: 'an@example.test',
        role: 'student'
      }
    });
    window.history.replaceState({}, '', '/about');
    render(<App />);

    const header = await screen.findByRole('banner');
    expect(within(header).getByRole('link', { name: 'Nguyễn An' })).toHaveAttribute(
      'href',
      '/settings'
    );
    expect(within(header).getByRole('link', { name: /Vào workspace/i })).toHaveAttribute(
      'href',
      '/dashboard'
    );
    expect(screen.getByText('Nguyễn Ngọc Thành HE186491')).toBeInTheDocument();
    for (const member of [
      'Vương Giang Trường HE186135',
      'Vũ Kim Kỳ HE182094',
      'Dương Tuấn Anh HE180437',
      'Nguyễn Xuân Dương HE190405',
      'Trần Đức Minh HE190690',
      'Phạm Hải Trung HE190486',
      'Nguyễn Khắc Tráng HE186034',
      'Các thành viên và cộng tác viên khác'
    ])
      expect(screen.getByText(member)).toBeInTheDocument();
  }, 15_000);

  it('documents the three history milestones and five-step evidence protocol', async () => {
    window.history.replaceState({}, '', '/about');
    render(<App />);

    await screen.findByRole('heading', {
      name: 'Chúng tôi không bắt đầu bằng một sản phẩm. Chúng tôi bắt đầu bằng một câu hỏi.'
    });
    for (const milestone of ['Lý thuyết / Thực tiễn', 'Evidence Matrix', 'Capital Arena'])
      expect(screen.getByRole('heading', { name: milestone })).toBeInTheDocument();
    const protocolSection = screen
      .getByRole('heading', { name: 'Một nhận định chỉ hữu ích khi có đường dẫn đi cùng.' })
      .closest('section');
    expect(protocolSection).not.toBeNull();
    for (const step of ['Nguồn', 'Trích xuất', 'Đối chiếu', 'Luận giải', 'Phản biện'])
      expect(within(protocolSection as HTMLElement).getByText(step)).toBeInTheDocument();
  }, 15_000);

  it('renders header, main and full Product/Resources/Legal footer as sibling landmarks', async () => {
    window.history.replaceState({}, '', '/about');
    render(<App />);

    const header = await screen.findByRole('banner');
    const main = screen.getByRole('main');
    const footer = screen.getByRole('contentinfo');
    expect(header.parentElement).toBe(main.parentElement);
    expect(main.parentElement).toBe(footer.parentElement);
    for (const label of ['Product', 'Resources', 'Legal'])
      expect(within(footer).getByRole('navigation', { name: label })).toBeInTheDocument();
  }, 15_000);

  it('keeps the desktop grid, accessible touch targets, mobile layout and motion fallback in CSS', () => {
    const path = resolve(process.cwd(), 'src/features/about/AboutPage.css');
    const css = existsSync(path) ? readFileSync(path, 'utf8') : '';

    expect(css).toContain('grid-template-columns: repeat(12, minmax(0, 1fr))');
    expect(css).toContain('min-height: 44px');
    expect(css).toContain('@media (max-width: 48rem)');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain(':focus-visible');
  });
});
