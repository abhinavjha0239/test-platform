// Example Jest + React Testing Library tests for a Counter component
// These tests import the candidate component directly (mode: 'jest')

import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Counter from '../src/Counter';

// --- Public tests (shown to candidates) ---

describe('Counter - Public Tests', () => {
  test('renders with initial count of 0', () => {
    render(<Counter />);
    expect(screen.getByText(/0/)).toBeInTheDocument();
  });

  test('has an increment button', () => {
    render(<Counter />);
    expect(screen.getByRole('button', { name: /increment/i })).toBeInTheDocument();
  });

  test('increments count when button is clicked', async () => {
    const user = userEvent.setup();
    render(<Counter />);

    await user.click(screen.getByRole('button', { name: /increment/i }));

    expect(screen.getByText(/1/)).toBeInTheDocument();
  });

  test('has a decrement button', () => {
    render(<Counter />);
    expect(screen.getByRole('button', { name: /decrement/i })).toBeInTheDocument();
  });

  test('decrements count when button is clicked', async () => {
    const user = userEvent.setup();
    render(<Counter />);

    // First increment to 1
    await user.click(screen.getByRole('button', { name: /increment/i }));
    expect(screen.getByText(/1/)).toBeInTheDocument();

    // Then decrement back to 0
    await user.click(screen.getByRole('button', { name: /decrement/i }));
    expect(screen.getByText(/0/)).toBeInTheDocument();
  });
});

// --- Hidden tests (NOT shown to candidates) ---
// These would go in the hiddenTests field

describe('Counter - Hidden Tests', () => {
  test('can increment multiple times', async () => {
    const user = userEvent.setup();
    render(<Counter />);

    const btn = screen.getByRole('button', { name: /increment/i });
    
    await user.click(btn);
    await user.click(btn);
    await user.click(btn);

    expect(screen.getByText(/3/)).toBeInTheDocument();
  });

  test('can go negative', async () => {
    const user = userEvent.setup();
    render(<Counter />);

    const btn = screen.getByRole('button', { name: /decrement/i });
    await user.click(btn);

    expect(screen.getByText(/-1/)).toBeInTheDocument();
  });

  test('has a reset button that resets to 0', async () => {
    const user = userEvent.setup();
    render(<Counter />);

    // Increment a few times
    const incBtn = screen.getByRole('button', { name: /increment/i });
    await user.click(incBtn);
    await user.click(incBtn);
    await user.click(incBtn);

    expect(screen.getByText(/3/)).toBeInTheDocument();

    // Reset
    const resetBtn = screen.getByRole('button', { name: /reset/i });
    await user.click(resetBtn);

    expect(screen.getByText(/0/)).toBeInTheDocument();
  });

  test('anti-hardcoding: works with many clicks', async () => {
    const user = userEvent.setup();
    render(<Counter />);

    const btn = screen.getByRole('button', { name: /increment/i });
    
    // Click a random-ish number of times
    const clicks = 7;
    for (let i = 0; i < clicks; i++) {
      await user.click(btn);
    }

    expect(screen.getByText(new RegExp(`${clicks}`))).toBeInTheDocument();
  });

  test('displays count in accessible element', () => {
    render(<Counter />);
    
    // The count should be in an element with proper semantics
    const countDisplay = screen.getByRole('status') || screen.getByLabelText(/count/i);
    expect(countDisplay).toBeInTheDocument();
  });

  test('buttons are properly labeled for accessibility', () => {
    render(<Counter />);
    
    const incBtn = screen.getByRole('button', { name: /increment/i });
    const decBtn = screen.getByRole('button', { name: /decrement/i });
    
    expect(incBtn).toBeEnabled();
    expect(decBtn).toBeEnabled();
  });

  test('component can accept initial value prop', () => {
    render(<Counter initialValue={10} />);
    expect(screen.getByText(/10/)).toBeInTheDocument();
  });
});

