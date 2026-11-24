import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import App from './App';

const mocks = vi.hoisted(() => {
  const createTable = () => ({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn(),
    upsert: vi.fn(),
  });

  return {
    emailLink: null as { tokenHash: string; type: 'email' | 'recovery' } | null,
    auth: {
      onAuthStateChange: vi.fn(),
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
      resetPasswordForEmail: vi.fn(),
      updateUser: vi.fn(),
      verifyOtp: vi.fn(),
    },
    unsubscribe: vi.fn(),
    from: vi.fn(),
    entries: createTable(),
    history: createTable(),
    fetch: vi.fn<typeof fetch>(),
    alert: vi.fn(),
  };
});

vi.mock('./supabaseClient', () => ({
  supabase: { auth: mocks.auth, from: mocks.from },
  get emailLink() { return mocks.emailLink; },
  authRedirectParams: new URLSearchParams(),
}));

const email = 'collector@example.com';
const password = 'Secret123!';
const imageUrl = 'https://example.com/jordan-1.jpg';
const authenticatedSession: Session = {
  access_token: 'test-access-token',
  refresh_token: 'test-refresh-token',
  expires_in: 3600,
  token_type: 'bearer',
  user: {
    id: 'test-user-id',
    email,
    aud: 'authenticated',
    app_metadata: {},
    user_metadata: {},
    created_at: '2026-01-01T00:00:00Z',
  },
};

type SavedEntryRow = {
  user_id: string;
  id: string;
  shoe_name: string;
  size: string;
  purchase_date: string;
  purchase_price: number;
  image_url: string;
};

let initialSession: Session | null;
let initialEvent: AuthChangeEvent;
let authListener: (event: AuthChangeEvent, session: Session | null) => void;
let savedRows: SavedEntryRow[];
let savedHistoryRows: (SavedEntryRow & { deleted_at: string })[];

beforeEach(() => {
  vi.resetAllMocks();
  mocks.emailLink = null;
  initialSession = null;
  initialEvent = 'INITIAL_SESSION';
  savedRows = [];
  savedHistoryRows = [];
  authListener = () => {};

  mocks.auth.onAuthStateChange.mockImplementation((callback: typeof authListener) => {
    authListener = callback;
    callback(initialEvent, initialSession);
    return { data: { subscription: { unsubscribe: mocks.unsubscribe } } };
  });
  mocks.auth.signInWithPassword.mockImplementation(async () => {
    authListener('SIGNED_IN', authenticatedSession);
    return { data: { session: authenticatedSession }, error: null };
  });
  mocks.auth.signUp.mockResolvedValue({ data: { session: null }, error: null });
  mocks.auth.signOut.mockImplementation(async () => {
    authListener('SIGNED_OUT', null);
    return { error: null };
  });
  mocks.auth.resetPasswordForEmail.mockResolvedValue({ error: null });
  mocks.auth.updateUser.mockResolvedValue({ error: null });
  mocks.auth.verifyOtp.mockResolvedValue({ error: null });

  for (const table of [mocks.entries, mocks.history]) {
    table.select.mockReturnThis();
    table.eq.mockReturnThis();
    table.order.mockResolvedValue({ data: [], error: null });
    table.upsert.mockResolvedValue({ error: null });
  }
  mocks.entries.order.mockImplementation(async () => ({
    data: savedRows.map((row) => ({ ...row })),
    error: null,
  }));
  mocks.entries.upsert.mockImplementation(async (rows: SavedEntryRow[]) => {
    savedRows = rows.map((row) => ({ ...row }));
    return { error: null };
  });
  mocks.history.order.mockImplementation(async () => ({
    data: savedHistoryRows.map((row) => ({ ...row })),
    error: null,
  }));
  mocks.history.upsert.mockImplementation(async (rows: typeof savedHistoryRows) => {
    savedHistoryRows = rows.map((row) => ({ ...row }));
    return { error: null };
  });
  mocks.from.mockImplementation((table: string) => {
    if (table === 'entries') return mocks.entries;
    if (table === 'deleted_entries') return mocks.history;
    throw new Error(`Unexpected table: ${table}`);
  });

  mocks.fetch.mockImplementation(async () => new Response(
    JSON.stringify({ results: [], imageUrl }),
    { headers: { 'Content-Type': 'application/json' } },
  ));
  vi.spyOn(globalThis, 'fetch').mockImplementation(mocks.fetch);
  vi.spyOn(window, 'alert').mockImplementation(mocks.alert);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const fillCredentials = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.type(screen.getByLabelText('Email'), email);
  await user.type(screen.getByLabelText('Password'), password);
};

const renderPortfolio = async () => {
  initialSession = authenticatedSession;
  const view = render(<App />);
  await screen.findByRole('heading', { name: 'No Shoes Yet' });
  return view;
};

const openEntryForm = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: 'Add Sneaker' }));
  return screen.getByRole('dialog', { name: 'Add sneaker entry panel' });
};

const fillEntryForm = async (
  user: ReturnType<typeof userEvent.setup>,
  dialog: HTMLElement,
  price = '180.50',
) => {
  await user.type(within(dialog).getByPlaceholderText('Shoe name (e.g. Jordan 1 Chicago)'), '  Jordan 1 Chicago  ');
  await user.selectOptions(dialog.querySelector('select')!, '11');
  fireEvent.change(dialog.querySelector('input[type="date"]')!, {
    target: { value: '2026-10-15' },
  });
  await user.type(within(dialog).getByPlaceholderText('Purchase price'), price);
};

test('renders the portfolio heading', async () => {
  render(<App />);
  expect(
    await screen.findByRole('heading', { name: 'Sneaker Portfolio' }),
  ).toBeInTheDocument();
});

describe('user authentication', () => {
  test('keeps signed-out users away from the portfolio', async () => {
    render(<App />);
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Add Sneaker' })).not.toBeInTheDocument();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  test('signs in and loads the collection for the authenticated user', async () => {
    const user = userEvent.setup();
    render(<App />);
    await fillCredentials(user);
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('heading', { name: 'No Shoes Yet' })).toBeInTheDocument();
    expect(screen.getByText(email)).toBeInTheDocument();
    expect(mocks.auth.signInWithPassword).toHaveBeenCalledExactlyOnceWith({ email, password });
    expect(mocks.entries.eq).toHaveBeenCalledWith('user_id', authenticatedSession.user.id);
    expect(mocks.history.eq).toHaveBeenCalledWith('user_id', authenticatedSession.user.id);
  });

  test('shows invalid-credential errors without opening the portfolio', async () => {
    mocks.auth.signInWithPassword.mockResolvedValueOnce({
      data: { session: null },
      error: { message: 'Invalid login credentials' },
    });
    const user = userEvent.setup();
    render(<App />);
    await fillCredentials(user);
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Invalid login credentials');
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  test('creates an account and asks the user to confirm their email', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'New here? Create an account' }));
    await fillCredentials(user);
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Account created. Confirm your email, then sign in.');
    expect(mocks.auth.signUp).toHaveBeenCalledExactlyOnceWith({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}${window.location.pathname}` },
    });
    expect(screen.getByLabelText('Password')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });

  test('requests a password reset and returns to sign-in', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Forgot password?' }));
    await user.type(screen.getByLabelText('Email'), email);
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));

    expect(await screen.findByRole('status')).toHaveTextContent(`If an account exists for ${email}, a password reset link is on its way.`);
    expect(mocks.auth.resetPasswordForEmail).toHaveBeenCalledExactlyOnceWith(email, {
      redirectTo: `${window.location.origin}${window.location.pathname}`,
    });
    await user.click(screen.getByRole('button', { name: 'Back to sign in' }));
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
  });

  test('rejects mismatched recovery passwords, then updates matching passwords', async () => {
    initialSession = authenticatedSession;
    initialEvent = 'PASSWORD_RECOVERY';
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByLabelText('New password', { exact: true }), password);
    await user.type(screen.getByLabelText('Confirm new password'), 'Different123!');
    await user.click(screen.getByRole('button', { name: 'Update password' }));

    expect(screen.getByRole('status')).toHaveTextContent('Passwords do not match.');
    expect(mocks.auth.updateUser).not.toHaveBeenCalled();
    await user.clear(screen.getByLabelText('Confirm new password'));
    await user.type(screen.getByLabelText('Confirm new password'), password);
    await user.click(screen.getByRole('button', { name: 'Update password' }));

    await screen.findByRole('button', { name: 'Sign out' });
    expect(mocks.auth.updateUser).toHaveBeenCalledExactlyOnceWith({ password });
    expect(mocks.alert).toHaveBeenCalledWith('Your password has been updated.');
  });

  test('signs out, closes the entry form, and returns to authentication', async () => {
    const user = userEvent.setup();
    await renderPortfolio();
    await openEntryForm(user);
    await user.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(mocks.auth.signOut).toHaveBeenCalledOnce();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText(email)).not.toBeInTheDocument();
  });
});

describe('adding sneaker entries', () => {
  test('saves a sneaker for the signed-in user and loads it again after remounting', async () => {
    const user = userEvent.setup();
    const view = await renderPortfolio();
    const dialog = await openEntryForm(user);
    await fillEntryForm(user, dialog);
    await user.click(within(dialog).getByRole('button', { name: 'Add to Portfolio' }));

    expect(await screen.findByRole('heading', { name: 'Jordan 1 Chicago' })).toBeInTheDocument();
    await waitFor(() => expect(mocks.entries.upsert).toHaveBeenCalledExactlyOnceWith([
      {
        user_id: authenticatedSession.user.id,
        id: expect.any(String),
        shoe_name: 'Jordan 1 Chicago',
        size: '11',
        purchase_date: '2026-10-15',
        purchase_price: 180.50,
        image_url: imageUrl,
      },
    ], { onConflict: 'user_id,id' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Jordan 1 Chicago' })).toHaveAttribute('src', imageUrl);
    const summary = screen.getByRole('region', { name: 'Sneaker portfolio summary' });
    expect(within(summary).getByText('Total Pairs').parentElement).toHaveTextContent('1');
    expect(within(summary).getByText('Invested').parentElement).toHaveTextContent('$180.50');

    view.unmount();
    expect(mocks.unsubscribe).toHaveBeenCalledOnce();
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Jordan 1 Chicago' })).toBeInTheDocument();
    expect(screen.getByText('2026-10-15')).toBeInTheDocument();
    expect(screen.getByText('11', { selector: 'dd' })).toBeInTheDocument();
    expect(mocks.entries.upsert).toHaveBeenCalledOnce();
  });

  test('swaps a broken entry image for the fallback image only once', async () => {
    const user = userEvent.setup();
    await renderPortfolio();
    const dialog = await openEntryForm(user);
    await fillEntryForm(user, dialog);
    await user.click(within(dialog).getByRole('button', { name: 'Add to Portfolio' }));

    const image = await screen.findByRole('img', { name: 'Jordan 1 Chicago' });
    fireEvent.error(image);
    const fallbackSrc = image.getAttribute('src');
    expect(fallbackSrc).not.toBe(imageUrl);
    expect(fallbackSrc).toMatch(/^https:\/\/images\.unsplash\.com\//);

    image.setAttribute('src', 'https://example.com/also-broken.jpg');
    fireEvent.error(image);
    expect(image).toHaveAttribute('src', 'https://example.com/also-broken.jpg');
  });

  test('does not save an entry with missing required fields', async () => {
    const user = userEvent.setup();
    await renderPortfolio();
    const dialog = await openEntryForm(user);
    await user.click(within(dialog).getByRole('button', { name: 'Add to Portfolio' }));

    expect(mocks.alert).toHaveBeenCalledWith('Please fill in shoe, size, purchase date, and purchase price.');
    expect(mocks.entries.upsert).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(dialog).toBeInTheDocument();
  });

  test.each(['0', '-10', 'not-a-price'])('rejects the invalid purchase price %s', async (price) => {
    const user = userEvent.setup();
    await renderPortfolio();
    const dialog = await openEntryForm(user);
    await fillEntryForm(user, dialog, price);
    await user.click(within(dialog).getByRole('button', { name: 'Add to Portfolio' }));

    expect(mocks.alert).toHaveBeenCalledWith('Purchase price must be a positive number.');
    expect(mocks.entries.upsert).not.toHaveBeenCalled();
    expect(dialog).toBeInTheDocument();
  });

  test('reloads the last saved collection when the cloud write fails', async () => {
    mocks.entries.upsert.mockResolvedValueOnce({ error: { message: 'Network error' } });
    const user = userEvent.setup();
    await renderPortfolio();
    const dialog = await openEntryForm(user);
    await fillEntryForm(user, dialog);
    await user.click(within(dialog).getByRole('button', { name: 'Add to Portfolio' }));

    await waitFor(() => expect(mocks.alert).toHaveBeenCalledWith('Could not save your changes to the cloud. Reloading your last saved data.'));
    expect(await screen.findByRole('heading', { name: 'No Shoes Yet' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Jordan 1 Chicago' })).not.toBeInTheDocument();
    expect(mocks.entries.order).toHaveBeenCalledTimes(2);
  });
});

describe('editing sneaker entries', () => {
  const deletedAt = '2026-11-01T12:00:00Z';
  const originalRow: SavedEntryRow = {
    user_id: authenticatedSession.user.id,
    id: 'shared-entry-id',
    shoe_name: 'Jordan 1 Chicago',
    size: '11',
    purchase_date: '2026-10-15',
    purchase_price: 180.50,
    image_url: imageUrl,
  };

  beforeEach(() => {
    initialSession = authenticatedSession;
    savedRows = [{ ...originalRow }];
    savedHistoryRows = [{ ...originalRow, deleted_at: deletedAt }];
  });

  const openEditForm = async (user: ReturnType<typeof userEvent.setup>, tab = 'History') => {
    await screen.findByRole('heading', { name: originalRow.shoe_name });
    await user.click(screen.getByRole('tab', { name: new RegExp(`^${tab}`) }));
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    return screen.getByRole('dialog', { name: 'Edit sneaker entry panel' });
  };

  test.each(['Portfolio', 'History'])('saves edits only to %s and reloads them after remounting', async (tab) => {
    const user = userEvent.setup();
    const view = render(<App />);
    const dialog = await openEditForm(user, tab);
    expect(within(dialog).getByRole('combobox', { expanded: false })).toHaveValue(originalRow.shoe_name);
    expect(dialog.querySelector('select')).toHaveValue('11');
    expect(dialog.querySelector('input[type="date"]')).toHaveValue('2026-10-15');
    const price = within(dialog).getByPlaceholderText('Purchase price');
    expect(price).toHaveValue('180.50');
    await user.clear(price);
    await user.type(price, '220');
    await user.selectOptions(dialog.querySelector('select')!, '12');
    fireEvent.change(dialog.querySelector('input[type="date"]')!, {
      target: { value: '2026-10-20' },
    });
    await user.click(within(dialog).getByRole('button', { name: 'Save Changes' }));

    const targetTable = tab === 'History' ? mocks.history : mocks.entries;
    const otherTable = tab === 'History' ? mocks.entries : mocks.history;
    const updatedRow = {
      ...originalRow,
      size: '12',
      purchase_date: '2026-10-20',
      purchase_price: 220,
      ...(tab === 'History' ? { deleted_at: deletedAt } : {}),
    };
    await waitFor(() => expect(targetTable.upsert).toHaveBeenCalledExactlyOnceWith(
      [updatedRow], { onConflict: 'user_id,id' },
    ));
    expect(otherTable.upsert).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('12', { selector: 'dd' })).toBeInTheDocument();
    expect(mocks.fetch.mock.calls.some(([url]) => String(url).includes('/search-image'))).toBe(false);

    view.unmount();
    render(<App />);
    await screen.findByRole('heading', { name: originalRow.shoe_name });
    await user.click(screen.getByRole('tab', { name: new RegExp(`^${tab}`) }));
    expect(screen.getByText('12', { selector: 'dd' })).toBeInTheDocument();
    expect(screen.getByText('2026-10-20', { selector: 'dd' })).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: tab === 'History' ? /^Portfolio/ : /^History/ }));
    expect(screen.getByText('11', { selector: 'dd' })).toBeInTheDocument();
  });

  test('refreshes the image when renaming a history entry', async () => {
    const updatedImageUrl = 'https://example.com/jordan-4.jpg';
    mocks.fetch.mockImplementation(async () => new Response(
      JSON.stringify({ results: [], imageUrl: updatedImageUrl }),
      { headers: { 'Content-Type': 'application/json' } },
    ));
    const user = userEvent.setup();
    render(<App />);
    const dialog = await openEditForm(user);
    const name = within(dialog).getByPlaceholderText('Shoe name (e.g. Jordan 1 Chicago)');
    await user.clear(name);
    await user.type(name, 'Jordan 4');
    await user.click(within(dialog).getByRole('button', { name: 'Save Changes' }));

    expect(await screen.findByRole('img', { name: 'Jordan 4' })).toHaveAttribute('src', updatedImageUrl);
    await waitFor(() => expect(mocks.history.upsert).toHaveBeenCalledWith(
      [{ ...originalRow, shoe_name: 'Jordan 4', image_url: updatedImageUrl, deleted_at: deletedAt }],
      { onConflict: 'user_id,id' },
    ));
    expect(mocks.entries.upsert).not.toHaveBeenCalled();
  });

  test.each(['close', 'Escape'])('discards history edits on %s', async (dismissal) => {
    const user = userEvent.setup();
    render(<App />);
    const dialog = await openEditForm(user);
    await user.type(within(dialog).getByPlaceholderText('Purchase price'), '9');
    if (dismissal === 'close') {
      await user.click(within(dialog).getByRole('button', { name: 'Close sneaker form panel' }));
    } else {
      await user.keyboard('{Escape}');
    }

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mocks.history.upsert).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByPlaceholderText('Purchase price')).toHaveValue('180.50');
  });

  test('rejects invalid history edits without saving', async () => {
    const user = userEvent.setup();
    render(<App />);
    const dialog = await openEditForm(user);
    const price = within(dialog).getByPlaceholderText('Purchase price');
    await user.clear(price);
    await user.type(price, '-1');
    await user.click(within(dialog).getByRole('button', { name: 'Save Changes' }));

    expect(mocks.alert).toHaveBeenCalledWith('Purchase price must be a positive number.');
    expect(mocks.history.upsert).not.toHaveBeenCalled();
    expect(dialog).toBeInTheDocument();
  });

  test('reloads saved history when a cloud edit fails', async () => {
    mocks.history.upsert.mockResolvedValueOnce({ error: { message: 'Network error' } });
    const user = userEvent.setup();
    render(<App />);
    const dialog = await openEditForm(user);
    const name = within(dialog).getByPlaceholderText('Shoe name (e.g. Jordan 1 Chicago)');
    await user.clear(name);
    await user.type(name, 'Unsaved name');
    await user.click(within(dialog).getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(mocks.alert).toHaveBeenCalledWith(
      'Could not save your changes to the cloud. Reloading your last saved data.',
    ));
    expect(await screen.findByRole('heading', { name: originalRow.shoe_name })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Unsaved name' })).not.toBeInTheDocument();
    expect(mocks.history.order).toHaveBeenCalledTimes(2);
  });
});

describe('security boundaries', () => {
  test.each(['Expired email link', 'Already used email link'])(
    'keeps the user signed out when Auth rejects a link: %s',
    async (message) => {
      mocks.emailLink = { tokenHash: 'test-invalid-token', type: 'recovery' };
      mocks.auth.verifyOtp.mockResolvedValueOnce({ error: { message } });
      render(<App />);

      expect(await screen.findByRole('status')).toHaveTextContent(
        `This link is invalid or has expired. ${message}`,
      );
      expect(mocks.auth.verifyOtp).toHaveBeenCalledExactlyOnceWith({
        token_hash: 'test-invalid-token', type: 'recovery',
      });
      expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Update password' })).not.toBeInTheDocument();
      expect(mocks.from).not.toHaveBeenCalled();
    },
  );

  test('removes private collection data when the session is lost', async () => {
    savedRows = [{
      user_id: authenticatedSession.user.id,
      id: 'private-entry',
      shoe_name: 'Private collection sneaker',
      size: '11',
      purchase_date: '2026-10-15',
      purchase_price: 180,
      image_url: imageUrl,
    }];
    initialSession = authenticatedSession;
    render(<App />);
    await screen.findByRole('heading', { name: 'Private collection sneaker' });

    await act(async () => authListener('SIGNED_OUT', null));

    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.queryByText('Private collection sneaker')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open sneaker entry form' })).not.toBeInTheDocument();
  });

  test.each(['User not found', 'Email delivery failed'])(
    'does not reveal account existence for reset error: %s',
    async (message) => {
      mocks.auth.resetPasswordForEmail.mockResolvedValueOnce({ error: { message, status: 400 } });
      const user = userEvent.setup();
      render(<App />);
      await user.click(screen.getByRole('button', { name: 'Forgot password?' }));
      await user.type(screen.getByLabelText('Email'), email);
      await user.click(screen.getByRole('button', { name: 'Send reset link' }));

      expect(await screen.findByRole('status')).toHaveTextContent(
        `If an account exists for ${email}, a password reset link is on its way.`,
      );
      expect(screen.queryByText(message)).not.toBeInTheDocument();
    },
  );

  test('renders stored sneaker markup as text, not executable HTML', async () => {
    const shoeName = '<img src=x onerror="window.__xss = true">';
    savedRows = [{
      user_id: authenticatedSession.user.id,
      id: 'markup-entry',
      shoe_name: shoeName,
      size: '11',
      purchase_date: '2026-10-15',
      purchase_price: 180,
      image_url: imageUrl,
    }];
    initialSession = authenticatedSession;
    const { container } = render(<App />);

    const heading = await screen.findByRole('heading', { name: shoeName });
    expect(heading).toHaveTextContent(shoeName);
    expect(heading.querySelector('img')).toBeNull();
    expect(container.querySelector('[onerror]')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
  });

  test.each(['javascript:alert(1)', 'data:text/html,test'])(
    'does not use the unsafe image lookup URL %s',
    async (unsafeUrl) => {
      mocks.fetch.mockImplementation(async () => new Response(
        JSON.stringify({ results: [], imageUrl: unsafeUrl }),
        { headers: { 'Content-Type': 'application/json' } },
      ));
      const user = userEvent.setup();
      await renderPortfolio();
      const dialog = await openEntryForm(user);
      await fillEntryForm(user, dialog);
      await user.click(within(dialog).getByRole('button', { name: 'Add to Portfolio' }));

      const image = await screen.findByRole('img', { name: 'Jordan 1 Chicago' });
      expect(image).not.toHaveAttribute('src', unsafeUrl);
      expect(image.getAttribute('src')).toMatch(/^https:\/\//);
      expect(mocks.entries.upsert).toHaveBeenCalledWith(
        [expect.objectContaining({ image_url: image.getAttribute('src') })],
        { onConflict: 'user_id,id' },
      );
    },
  );
});