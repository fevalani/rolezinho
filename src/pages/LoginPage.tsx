import { useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import styles from './LoginPage.module.css';

export function LoginPage() {
  const { signIn, signUp, loading } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const clearMessages = () => { setError(''); setSuccess(''); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();

    const trimEmail = email.trim().toLowerCase();
    const trimName = name.trim();

    if (!trimEmail || !password) {
      setError('Preencha todos os campos');
      return;
    }
    if (mode === 'signup' && !trimName) {
      setError('Insira seu nome de aventureiro');
      return;
    }
    if (mode === 'signup' && trimName.length < 2) {
      setError('Nome deve ter pelo menos 2 caracteres');
      return;
    }
    if (password.length < 6) {
      setError('Senha deve ter pelo menos 6 caracteres');
      return;
    }

    setSubmitting(true);

    if (mode === 'login') {
      const { error: err } = await signIn(trimEmail, password);
      if (err) setError(err);
    } else {
      const { error: err } = await signUp(trimEmail, password, trimName);
      if (err) {
        setError(err);
      } else {
        setSuccess('Conta criada! Verifique seu email para confirmar e depois faça login.');
        setMode('login');
        setPassword('');
        setName('');
      }
    }

    setSubmitting(false);
  };

  if (loading) {
    return (
      <div className={`page ${styles.page}`}>
        <div className={styles.center}>
          <div className="spinner" />
        </div>
      </div>
    );
  }

  return (
    <div className={`page ${styles.page}`}>
      <div className={styles.center}>
        {/* Logo */}
        <div className={`${styles.logoWrap} anim-bounce`}>
          <svg viewBox="0 0 100 100" width={88} height={88} className={styles.logoSvg}>
            <defs>
              <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#e8c86e" />
                <stop offset="100%" stopColor="#8b7a3e" />
              </linearGradient>
            </defs>
            <polygon
              points="50,3 97,28 97,72 50,97 3,72 3,28"
              fill="none"
              stroke="url(#logoGrad)"
              strokeWidth="2.5"
            />
            <polygon
              points="50,16 84,34 84,66 50,84 16,66 16,34"
              fill="none"
              stroke="#c9a55a"
              strokeWidth="1"
              opacity="0.25"
            />
            <text
              x="50"
              y="59"
              textAnchor="middle"
              fill="#c9a55a"
              fontFamily="serif"
              fontSize="26"
              fontWeight="bold"
            >
              20
            </text>
          </svg>
        </div>

        <h1 className={`${styles.title} anim-fade d1`}>Taverna dos Amigos</h1>
        <p className={`${styles.subtitle} anim-fade d2`}>
          {mode === 'login'
            ? 'Entre na sua conta para acessar a taverna'
            : 'Crie sua conta de aventureiro'}
        </p>

        {/* Form */}
        <form onSubmit={handleSubmit} className={`${styles.form} anim-slideUp d3`}>
          {mode === 'signup' && (
            <input
              className="input"
              type="text"
              placeholder="Nome de aventureiro"
              value={name}
              onChange={(e) => { setName(e.target.value); clearMessages(); }}
              autoComplete="name"
              maxLength={40}
              data-testid="name-input"
            />
          )}
          <input
            className="input"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); clearMessages(); }}
            autoComplete="email"
            data-testid="email-input"
          />
          <input
            className="input"
            type="password"
            placeholder="Senha (mínimo 6 caracteres)"
            value={password}
            onChange={(e) => { setPassword(e.target.value); clearMessages(); }}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            data-testid="password-input"
          />

          {error && <p className={styles.error} data-testid="auth-error">{error}</p>}
          {success && <p className={styles.success} data-testid="auth-success">{success}</p>}

          <button
            type="submit"
            className="btn btn-gold btn-full btn-lg"
            disabled={submitting}
            data-testid="submit-btn"
          >
            {submitting
              ? 'Carregando...'
              : mode === 'login'
                ? 'Entrar'
                : 'Criar conta'}
          </button>
        </form>

        {/* Toggle */}
        <button
          className={`${styles.toggleMode} anim-fade d4`}
          onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); clearMessages(); }}
          data-testid="toggle-mode"
        >
          {mode === 'login'
            ? 'Não tem conta? Criar agora'
            : 'Já tem conta? Fazer login'}
        </button>
      </div>
    </div>
  );
}
