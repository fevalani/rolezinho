import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '@/lib/AuthContext';
import { LoginPage } from '@/pages/LoginPage';

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <BrowserRouter>
      <AuthProvider>{ui}</AuthProvider>
    </BrowserRouter>
  );
}

describe('LoginPage', () => {
  it('renders the login form', async () => {
    renderWithProviders(<LoginPage />);
    expect(await screen.findByText('Taverna dos Amigos')).toBeInTheDocument();
  });

  it('shows email input', async () => {
    renderWithProviders(<LoginPage />);
    expect(await screen.findByPlaceholderText('Email')).toBeInTheDocument();
  });

  it('shows password input', async () => {
    renderWithProviders(<LoginPage />);
    expect(await screen.findByPlaceholderText('Senha (mínimo 6 caracteres)')).toBeInTheDocument();
  });

  it('shows submit button', async () => {
    renderWithProviders(<LoginPage />);
    expect(await screen.findByTestId('submit-btn')).toBeInTheDocument();
    expect(await screen.findByText('Entrar')).toBeInTheDocument();
  });

  it('has toggle between login and signup', async () => {
    renderWithProviders(<LoginPage />);
    expect(await screen.findByText('Não tem conta? Criar agora')).toBeInTheDocument();
  });
});

describe('Types', () => {
  it('DICE_CONFIG has all types', async () => {
    const { DICE_CONFIG, DICE_TYPES } = await import('@/lib/types');
    DICE_TYPES.forEach((t) => {
      expect(DICE_CONFIG[t]).toBeDefined();
      expect(DICE_CONFIG[t].sides).toBeGreaterThan(0);
    });
  });

  it('APP_FEATURES has taverna enabled', async () => {
    const { APP_FEATURES } = await import('@/lib/types');
    const taverna = APP_FEATURES.find((f) => f.id === 'taverna');
    expect(taverna).toBeDefined();
    expect(taverna!.enabled).toBe(true);
  });
});
