import { cleanup, render, screen, within } from '@testing-library/react';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../../app/App.js';
import { useSessionStore } from '../auth/session.js';
import { AboutPage } from './AboutPage.js';

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
    expect(screen.getByText('Bỏ qua điều hướng')).toHaveAttribute('href', '#main-content');
  }, 15_000);

  it('uses exactly one shared banner with the complete five-link product navigation', async () => {
    window.history.replaceState({}, '', '/about');
    render(<App />);

    await screen.findByRole('banner');
    expect(screen.getAllByRole('banner')).toHaveLength(1);
    const header = screen.getByRole('banner');
    expect(within(header).getByRole('link', { name: 'MarxMatrix' })).toHaveAttribute('href', '/');
    const productNavigation = screen
      .getAllByRole('navigation')
      .find((navigation) => navigation.classList.contains('app-navigation'));
    expect(productNavigation).toBeDefined();
    const productLinks = within(productNavigation as HTMLElement).getAllByRole('link');
    expect(productLinks).toHaveLength(5);
    expect(productLinks.map((link) => link.getAttribute('href'))).toEqual([
      '/dashboard',
      '/scanner',
      '/copilot',
      '/arena',
      '/chat'
    ]);
  }, 15_000);

  it('renders no local banner when used directly', () => {
    render(
      <MemoryRouter initialEntries={['/about']}>
        <AboutPage />
      </MemoryRouter>
    );

    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
  });

  it('keeps the exact project team', async () => {
    window.history.replaceState({}, '', '/about');
    render(<App />);

    await screen.findByRole('main');
    for (const identifier of [
      'HE186491',
      'HE186135',
      'HE182094',
      'HE180437',
      'HE190405',
      'HE190690',
      'HE190486',
      'HE186034'
    ]) expect(screen.getByText(new RegExp(identifier))).toBeInTheDocument();
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

  it('links every real workspace and labels future work as not current capability', async () => {
    window.history.replaceState({}, '', '/about');
    render(<App />);

    await screen.findByRole('heading', {
      name: 'Chúng tôi không bắt đầu bằng một sản phẩm. Chúng tôi bắt đầu bằng một câu hỏi.'
    });
    const toolsSection = screen
      .getByRole('heading', { name: 'Ba nơi kết nối để làm công việc này.' })
      .closest('section');
    expect(toolsSection).not.toBeNull();
    expect(
      within(toolsSection as HTMLElement).getByRole('link', { name: 'Mở Scanner' })
    ).toHaveAttribute('href', '/scanner/new');
    expect(
      within(toolsSection as HTMLElement).getByRole('link', { name: 'Mở Copilot' })
    ).toHaveAttribute('href', '/copilot');
    expect(
      within(toolsSection as HTMLElement).getByRole('link', { name: 'Vào Capital Arena' })
    ).toHaveAttribute('href', '/arena');
    expect(
      screen.getByRole('heading', { name: 'Hướng phát triển (không phải khả năng hiện tại)' })
    ).toBeInTheDocument();
  }, 15_000);

  it('keeps final conclusions with human judgement and review', async () => {
    window.history.replaceState({}, '', '/about');
    render(<App />);

    expect(
      await screen.findByText(
        /Kết luận cuối cùng thuộc về con người và phải qua đánh giá của con người/i
      )
    ).toBeInTheDocument();
  }, 15_000);

  it('renders shared banner, main and full Product/Resources/Legal footer as sibling landmarks', async () => {
    window.history.replaceState({}, '', '/about');
    render(<App />);

    const header = await screen.findByRole('banner');
    const main = screen.getByRole('main');
    const footer = screen.getByRole('contentinfo');
    expect(main.parentElement).toBe(footer.parentElement);
    expect(header.parentElement).not.toBe(main.parentElement);
    expect(main).toHaveAttribute('id', 'main-content');
    expect(main).toHaveAttribute('tabindex', '-1');
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
    expect(css).not.toContain('.about__header');
    expect(css).not.toContain('.about__nav');
    expect(css).not.toContain('.about__menu-button');
    expect(css).toContain('@media (max-width: 69.99rem)');
    expect(css).toContain('padding-bottom: calc(3.5rem + env(safe-area-inset-bottom))');
    const footerBrandRule = css.match(/\.about__footer \.brand-mark \{([^}]*)\}/)?.[1] ?? '';
    expect(footerBrandRule).toContain('display: inline-flex');
    expect(footerBrandRule).toContain('min-width: 44px');
    expect(footerBrandRule).toContain('min-height: 44px');
    expect(footerBrandRule).toContain('align-items: center');
    expect(css).not.toContain('min-height: 40px');
  });
});
