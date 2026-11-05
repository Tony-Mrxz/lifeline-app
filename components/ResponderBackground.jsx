'use client';

import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

const RESPONDER_ROLES = ['doctor', 'medical intern', 'ambulance driver', 'ride accompany'];
const ALERT_TTL_MS = 5 * 60 * 1000;

function laneField(responderRole) {
  if (responderRole === 'ambulance driver') return 'ambulanceAcceptedBy';
  if (responderRole === 'ride accompany') return 'riderAcceptedBy';
  return 'medicalAcceptedBy';
}

export default function ResponderBackground() {
  const [activeCount, setActiveCount] = useState(0);

  useEffect(() => {
    let unsubAlerts = null;

    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      unsubAlerts?.();
      unsubAlerts = null;
      setActiveCount(0);
      if (!user) return;

      let role = null;
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        role = snap.exists() ? snap.data().role : null;
      } catch {
        role = null;
      }
      if (!role || !RESPONDER_ROLES.includes(role)) return;

      const lane = laneField(role);
      const q = query(
        collection(db, 'sos_alerts'),
        orderBy('createdAt', 'desc'),
        limit(25)
      );
      // mirror AlertInbox visibility: red only while a popup can appear
      unsubAlerts = onSnapshot(q, (snap) => {
        const count = snap.docs.filter((d) => {
          const a = d.data();
          return (
            (a.targetRoles ?? []).includes(role) &&
            !(a.declinedBy ?? []).includes(user.uid) &&
            (a.status === 'open' || a.status === 'accepted') &&
            (a[lane] == null || a[lane].uid === user.uid) &&
            Date.now() - new Date(a.createdAt).getTime() < ALERT_TTL_MS
          );
        }).length;
        setActiveCount(count);
      });
    });

    return () => {
      unsubAuth();
      unsubAlerts?.();
    };
  }, []);

  useEffect(() => {
    document.body.style.background = activeCount > 0 ? '#dc2626' : '';
    return () => {
      document.body.style.background = '';
    };
  }, [activeCount]);

  return null;
}
