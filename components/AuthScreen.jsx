'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, authReady, db } from '../lib/firebase';
import styles from './AuthScreen.module.css';

const ROLES = [
  'citizen',
  'medical intern',
  'doctor',
  'ambulance driver',
  'ride accompany',
];

const AUTH_ERRORS = {
  'auth/configuration-not-found':
    'Email/Password sign-in is not enabled — turn it on in Firebase console → Authentication → Sign-in method',
  'auth/operation-not-allowed':
    'Email/Password sign-in is not enabled — turn it on in Firebase console → Authentication → Sign-in method',
  'auth/email-already-in-use': 'this email is already registered — try logging in',
  'auth/weak-password': 'password must be at least 6 characters',
  'auth/invalid-email': 'that email address looks invalid',
  'auth/invalid-credential': 'incorrect email or password',
  'auth/wrong-password': 'incorrect email or password',
  'auth/user-not-found': 'no account with this email — register first',
  'auth/too-many-requests': 'too many attempts — wait a bit and retry',
  'auth/network-request-failed': 'network error — check your connection',
  'permission-denied': 'Firestore rules blocked saving the user — enable test mode',
};

function friendlyAuthError(code) {
  if (!code) return 'something went wrong, try again';
  const key = code.startsWith('firestore/') ? 'permission-denied' : code;
  return AUTH_ERRORS[key] ?? `${key} — try again`;
}

export default function AuthScreen() {
  const router = useRouter();
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const switchMode = (next) => {
    setMode(next);
    setError(null);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setError(null);

    if (mode === 'register') {
      if (!role) {
        setError('select a role to register');
        return;
      }
      if (phone.replace(/\D/g, '').length < 10) {
        setError('enter a valid phone number');
        return;
      }
    }

    setBusy(true);
    try {
      await authReady;
      if (mode === 'register') {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await setDoc(doc(db, 'users', cred.user.uid), {
          email,
          role,
          phone,
          createdAt: new Date().toISOString(),
        });
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      router.push('/dashboard');
    } catch (err) {
      setError(friendlyAuthError(err.code));
      setBusy(false);
    }
  };

  return (
    <div className={styles.screen}>
      <Image
        src="/logo.png"
        alt="Life Line logo"
        width={72}
        height={72}
        className={styles.logo}
        priority
      />
      <div className={styles.brand}>
        <span className={styles.title}>Life Line</span>
        <span className={styles.pill}>demo</span>
      </div>

      <div className={styles.card}>
        <div className={styles.tabs}>
          <button
            type="button"
            className={`${styles.tab} ${mode === 'login' ? styles.tabActive : ''}`}
            onClick={() => switchMode('login')}
          >
            Login
          </button>
          <button
            type="button"
            className={`${styles.tab} ${mode === 'register' ? styles.tabActive : ''}`}
            onClick={() => switchMode('register')}
          >
            Register
          </button>
        </div>

        <form className={styles.form} onSubmit={handleSubmit}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Password</span>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="min 6 characters"
            />
          </label>

          {mode === 'register' && (
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Phone</span>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98765 43210"
              />
            </label>
          )}

          {mode === 'register' && (
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Role</span>
              <div className={styles.roles}>
                {ROLES.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={`${styles.role} ${role === option ? styles.roleActive : ''}`}
                    onClick={() => setRole(option)}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && <p className={styles.error}>{error}</p>}

          <button type="submit" className={styles.submit} disabled={busy}>
            {busy
              ? 'Please wait…'
              : mode === 'login'
                ? 'Login'
                : `Register as ${role ?? '…'}`}
          </button>
        </form>
      </div>
    </div>
  );
}
