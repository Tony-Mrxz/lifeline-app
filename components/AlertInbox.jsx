'use client';

import { useEffect, useRef, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
} from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import styles from './AlertInbox.module.css';

const RESPONDER_ROLES = ['doctor', 'medical intern', 'ambulance driver'];

export default function AlertInbox() {
  const [me, setMe] = useState(null);
  const [role, setRole] = useState(null);
  const [alerts, setAlerts] = useState([]);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setMe(null);
        setRole(null);
        return;
      }
      setMe({ uid: user.uid, email: user.email });
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        const resolved = snap.exists() ? snap.data().role : null;
        console.log(
          `[alert] logged in as ${user.email}, role: ${resolved ?? 'NONE (users doc missing)'}`
        );
        setRole(resolved);
      } catch (err) {
        console.log('[alert] role lookup failed:', err.message);
        setRole(null);
      }
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (!role || !RESPONDER_ROLES.includes(role)) return;
    const q = query(
      collection(db, 'sos_alerts'),
      orderBy('createdAt', 'desc'),
      limit(25)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setAlerts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      (err) => console.log('[alert] snapshot error:', err.message)
    );
    return () => unsub();
  }, [role]);

  const visible =
    me && role && RESPONDER_ROLES.includes(role)
      ? alerts.filter(
          (a) =>
            (a.targetRoles ?? []).includes(role) &&
            !(a.declinedBy ?? []).includes(me.uid) &&
            (a.status === 'open' || a.status === 'accepted')
        )
      : [];
  const current = visible[0] ?? null;

  const lastSeenIdRef = useRef(null);

  useEffect(() => {
    const id = current?.id ?? null;
    if (id === lastSeenIdRef.current) return;
    if (id) {
      console.log(
        `[alert] received SOS from ${current.senderEmail ?? 'unknown'} (${current.senderRole}) — ${current.durationSeconds ?? '?'}s audio, transcript: ${current.transcriptionStatus ?? 'n/a'}`
      );
    } else if (lastSeenIdRef.current) {
      console.log('[alert] alert cleared — cancelled, handled, or declined');
    }
    lastSeenIdRef.current = id;
  }, [current]);

  if (!me || !role || !RESPONDER_ROLES.includes(role)) return null;

  if (!current) return null;

  const acceptedByMe =
    current.status === 'accepted' && current.acceptedBy?.uid === me.uid;
  const acceptedByOther =
    current.status === 'accepted' && current.acceptedBy?.uid !== me.uid;

  const accept = async () => {
    console.log(`[alert] accepted SOS from ${current.senderEmail}`);
    await updateDoc(doc(db, 'sos_alerts', current.id), {
      status: 'accepted',
      acceptedBy: { uid: me.uid, name: me.email },
      acceptedAt: new Date().toISOString(),
    });
  };

  const decline = async () => {
    console.log(`[alert] declined SOS from ${current.senderEmail}`);
    await updateDoc(doc(db, 'sos_alerts', current.id), {
      declinedBy: arrayUnion(me.uid),
    });
  };

  return (
    <div className={styles.sheet}>
      <div className={styles.header}>
        <span className={styles.badge}>INCOMING SOS</span>
        <span className={styles.from}>
          {current.senderEmail ?? 'unknown'} · {current.senderRole}
        </span>
      </div>

      <audio controls src={current.audioBase64} className={styles.audio} />

      <p className={styles.transcript}>
        {current.transcript
          ? `"${current.transcript}"`
          : current.transcriptionStatus === 'pending'
            ? 'Transcribing…'
            : 'No transcription available'}
      </p>

      {current.lat != null && current.lng != null && (
        <p className={styles.coords}>
          {current.lat.toFixed(5)}, {current.lng.toFixed(5)}
        </p>
      )}

      {acceptedByOther ? (
        <p className={styles.handled}>
          Handled by {current.acceptedBy?.name ?? 'responder'}
        </p>
      ) : acceptedByMe ? (
        <p className={styles.handledMe}>You accepted this alert</p>
      ) : (
        <div className={styles.actions}>
          <button type="button" className={styles.acceptBtn} onClick={accept}>
            Accept
          </button>
          <button type="button" className={styles.declineBtn} onClick={decline}>
            Decline
          </button>
        </div>
      )}
    </div>
  );
}
