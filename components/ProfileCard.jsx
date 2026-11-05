'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, updateEmail } from 'firebase/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import styles from './ProfileCard.module.css';

export default function ProfileCard() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState(null);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace('/');
        return;
      }
      setEmail(user.email ?? '');
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (snap.exists()) {
          setProfile(snap.data());
          setPhone(snap.data().phone ?? '');
        } else {
          setProfile({ email: user.email, role: 'unknown', phone: '' });
        }
      } catch {
        setProfile({ email: user.email, role: 'unknown', phone: '' });
      }
      setReady(true);
    });
    return () => unsub();
  }, [router]);

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setMsg(null);
    const user = auth.currentUser;
    try {
      if (user && email !== user.email) {
        await updateEmail(user, email);
      }
      if (user) {
        await updateDoc(
          doc(db, 'users', user.uid),
          { email, phone },
          { merge: true }
        );
      }
      setProfile((prev) => ({ ...prev, email, phone }));
      setMsg('saved ✓');
    } catch (err) {
      setError(
        err.code === 'auth/requires-recent-login'
          ? 'email change needs a fresh login — log out and back in, then retry'
          : err.message
      );
    } finally {
      setBusy(false);
    }
  };

  if (!ready) return null;

  return (
    <div className={styles.card}>
      <h1 className={styles.heading}>Profile</h1>

      <div className={styles.staticRow}>
        <span className={styles.label}>Role</span>
        <span className={styles.value}>{profile?.role}</span>
      </div>

      <label className={styles.field}>
        <span className={styles.label}>Email</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Phone</span>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+91 98765 43210"
        />
      </label>

      {error && <p className={styles.error}>{error}</p>}
      {msg && <p className={styles.success}>{msg}</p>}

      <button type="button" className={styles.saveBtn} onClick={save} disabled={busy}>
        {busy ? 'Saving…' : 'Save changes'}
      </button>
    </div>
  );
}
