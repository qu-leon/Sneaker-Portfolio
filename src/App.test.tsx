import { render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import App from './App';

vi.mock('./supabaseClient', () => ({
  supabase: null,
  emailLink: null,
  authRedirectParams: new URLSearchParams(),
}));

test('renders the portfolio heading', async () => {
  render(<App />);
  expect(
    await screen.findByRole('heading', { name: 'Sneaker Portfolio' }),
  ).toBeInTheDocument();
});